/**
 * Structured "what changed?" intelligence for one keyword’s saved history (recent vs older window).
 * Backend-only Phase 1 — designed for future chat integration.
 *
 * @module historyComparisonService
 */

'use strict';

const { getHistoryGroupDetail } = require('./searchHistoryService');
const { generateAlertsForResults } = require('./contentAlertService');
const {
  aggregateSentimentBreakdownFromRuns,
  normalizedSnapshotToContentRow,
} = require('./historyIntelligenceService');

const STOP = new Set([
  'this',
  'that',
  'with',
  'from',
  'have',
  'been',
  'were',
  'your',
  'their',
  'there',
  'these',
  'those',
  'what',
  'when',
  'where',
  'which',
  'about',
  'after',
  'before',
  'customer',
  'customers',
  'comment',
  'comments',
  'video',
  'videos',
]);

/**
 * @param {string | null | undefined} k
 */
function normalizeGroupKey(k) {
  return String(k || '').trim().toLowerCase();
}

/**
 * @param {Array<Record<string, unknown>>} runs — newest first
 * @param {number} maxPer
 */
function pickComparisonWindows(runs, maxPer) {
  const n = runs.length;
  const m = Math.min(6, Math.max(1, maxPer));

  if (n === 0) {
    return {
      recentWindow: [],
      previousWindow: [],
      comparisonMode: 'empty',
      windowNote: 'No saved runs for this keyword.',
    };
  }
  if (n === 1) {
    return {
      recentWindow: runs.slice(0, 1),
      previousWindow: [],
      comparisonMode: 'single_run',
      windowNote:
        'Only one saved run exists; there is no older window to compare. Signals below describe that run only.',
    };
  }
  if (n === 2) {
    return {
      recentWindow: runs.slice(0, 1),
      previousWindow: runs.slice(1, 2),
      comparisonMode: 'latest_vs_previous',
      windowNote: 'Compared the latest run to the single prior run.',
    };
  }
  if (n < 6) {
    const split = Math.floor(n / 2);
    const recentWindow = runs.slice(0, split);
    const previousWindow = runs.slice(split);
    return {
      recentWindow,
      previousWindow,
      comparisonMode: 'split_half',
      windowNote: `Fewer than ${m * 2} total runs; split into newer ${recentWindow.length} run(s) vs older ${previousWindow.length} run(s).`,
    };
  }

  const recentWindow = runs.slice(0, m);
  const previousWindow = runs.slice(m, m + m);
  return {
    recentWindow,
    previousWindow,
    comparisonMode: 'default_recent_vs_prior',
    windowNote: `Latest ${m} runs (newer) vs prior ${m} runs (older).`,
  };
}

/**
 * @param {Array<Record<string, unknown>>} runs
 */
function tokenHistogram(runs) {
  const hist = new Map();
  let total = 0;
  for (const r of runs) {
    const text = String(r.summary || '').toLowerCase();
    for (const w of text.split(/\W+/)) {
      if (w.length < 4) continue;
      if (STOP.has(w)) continue;
      hist.set(w, (hist.get(w) || 0) + 1);
      total += 1;
    }
  }
  return { hist, total: Math.max(1, total) };
}

/**
 * @param {Map<string, number>} hist
 * @param {number} total
 */
function rate(hist, total, w) {
  return (hist.get(w) || 0) / total;
}

/**
 * @param {Array<Record<string, unknown>>} recentRuns
 * @param {Array<Record<string, unknown>>} previousRuns
 */
function topicDeltas(recentRuns, previousRuns) {
  const a = tokenHistogram(recentRuns);
  const b = tokenHistogram(previousRuns);
  const words = new Set([...a.hist.keys(), ...b.hist.keys()]);
  const deltas = [];
  for (const w of words) {
    const dr = rate(a.hist, a.total, w);
    const dp = rate(b.hist, b.total, w);
    deltas.push({ topic: w, delta: dr - dp, recentRate: dr, previousRate: dp });
  }
  deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  return deltas;
}

/**
 * @param {Record<string, unknown>} run
 */
function avgPriorityScore(run) {
  const nr = Array.isArray(run.normalizedResults) ? run.normalizedResults : [];
  const scores = nr.map((r) => Number(r.priority_score)).filter((x) => Number.isFinite(x));
  if (!scores.length) return null;
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}

/**
 * @param {Record<string, unknown>} run
 */
function avgTrendScore(run) {
  const nr = Array.isArray(run.normalizedResults) ? run.normalizedResults : [];
  const scores = nr.map((r) => Number(r.trend_score)).filter((x) => Number.isFinite(x));
  if (!scores.length) return null;
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}

/**
 * @param {Record<string, unknown>} run
 */
function topPrioritySnapshot(run) {
  const nr = Array.isArray(run.normalizedResults) ? [...run.normalizedResults] : [];
  nr.sort((a, b) => (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0));
  const top = nr[0];
  if (!top) return null;
  return {
    title: typeof top.title === 'string' ? top.title : null,
    priorityScore: Number(top.priority_score) || null,
    priorityLevel: typeof top.priority_level === 'string' ? top.priority_level : null,
    trendLevel: typeof top.trend_level === 'string' ? top.trend_level : null,
  };
}

/**
 * @param {Array<Record<string, unknown>>} runs — non-empty
 */
function negativeLabelShare(runs) {
  let neg = 0;
  for (const r of runs) {
    if (String(r.sentiment ?? '').toLowerCase() === 'negative') neg += 1;
  }
  return neg / runs.length;
}

/**
 * @param {{ positive: number, neutral: number, negative: number }} recentBr
 * @param {{ positive: number, neutral: number, negative: number }} prevBr
 */
function sentimentShiftDescription(recentBr, prevBr, hasPreviousWindow) {
  if (!hasPreviousWindow) {
    return {
      description:
        'No prior comparison window — only the recent snapshot is described by run-mix percentages.',
      deltaNegativePoints: null,
      deltaPositivePoints: null,
    };
  }
  const dPos = recentBr.positive - prevBr.positive;
  const dNeg = recentBr.negative - prevBr.negative;
  const dNeu = recentBr.neutral - prevBr.neutral;
  const parts = [];
  if (Math.abs(dNeg) >= 8 || Math.abs(dPos) >= 8) {
    parts.push(
      `Run-mix shift vs prior window: positive ~${dPos >= 0 ? '+' : ''}${dPos} pts, negative ~${dNeg >= 0 ? '+' : ''}${dNeg} pts, neutral ~${dNeu >= 0 ? '+' : ''}${dNeu} pts (approximate; based on overall labels per run).`,
    );
  } else {
    parts.push(
      'Run-level sentiment mix is similar between windows; any move is within a modest band.',
    );
  }
  return {
    description: parts.join(' '),
    deltaNegativePoints: dNeg,
    deltaPositivePoints: dPos,
  };
}

/**
 * @param {'improving' | 'worsening' | 'stable' | 'mixed'} direction
 * @param {Array<{ topic: string, delta: number }>} emerging
 * @param {Array<{ topic: string, delta: number }>} declining
 * @param {string} comparisonMode
 */
function buildRecommendedActions(direction, emerging, declining, comparisonMode) {
  const out = [];
  if (emerging[0]) {
    out.push(
      `Review whether “${emerging[0].topic}” in recent summaries needs a targeted response (support, product comms, or FAQ).`,
    );
  }
  if (direction === 'worsening' || direction === 'mixed') {
    out.push(
      'Compare the newest run’s executive summary to the prior window; confirm whether the shift is sustained before a major campaign change.',
    );
  }
  if (direction === 'improving' && declining[0]) {
    out.push(
      `Reinforce themes around “${declining[0].topic}” if that weakness is cooling while strengths grow.`,
    );
  }
  if (comparisonMode === 'single_run' || comparisonMode === 'split_half') {
    out.push(
      'Add more saved runs over time to tighten these comparisons; current basis is limited.',
    );
  }
  return out.slice(0, 4);
}

/**
 * @param {string} groupKeyRaw
 * @param {{
 *   maxRunsPerWindow?: number,
 *   comparisonMode?: string,
 * }} [options]
 * @returns {Record<string, unknown> | null}
 */
function buildKeywordComparisonIntelligence(groupKeyRaw, options = {}) {
  const groupKey = normalizeGroupKey(groupKeyRaw);
  if (!groupKey) return null;

  const maxRunsPerWindow = Math.min(8, Math.max(1, options.maxRunsPerWindow ?? 3));

  const detail = getHistoryGroupDetail(groupKey);
  if (!detail || !Array.isArray(detail.runs) || detail.runs.length === 0) return null;

  const runs = detail.runs;
  const displayLabel = detail.displayLabel || groupKey;

  const { recentWindow, previousWindow, comparisonMode, windowNote } = pickComparisonWindows(
    runs,
    maxRunsPerWindow,
  );

  const hasPreviousWindow = previousWindow.length > 0;
  const recentBr = aggregateSentimentBreakdownFromRuns(recentWindow);
  const prevBr = hasPreviousWindow
    ? aggregateSentimentBreakdownFromRuns(previousWindow)
    : aggregateSentimentBreakdownFromRuns([]);

  const negRecent = negativeLabelShare(recentWindow);
  const negPrev = hasPreviousWindow ? negativeLabelShare(previousWindow) : negRecent;

  const dNegPts = recentBr.negative - prevBr.negative;
  const dPosPts = recentBr.positive - prevBr.positive;
  const dNegShare = negRecent - negPrev;

  let overallDirection = /** @type {'improving' | 'worsening' | 'stable' | 'mixed'} */ ('stable');
  if (!hasPreviousWindow) {
    overallDirection = 'stable';
  } else {
    const strongNeg =
      dNegPts > 10 || dNegShare > 0.18 || (dPosPts < -8 && dNegPts > 5);
    const strongPos =
      dPosPts > 10 || dNegShare < -0.18 || (dNegPts < -8 && dPosPts > 5);

    if (strongNeg && strongPos) overallDirection = 'mixed';
    else if (strongNeg) overallDirection = 'worsening';
    else if (strongPos) overallDirection = 'improving';
    else if (Math.abs(dNegPts) < 6 && Math.abs(dPosPts) < 6) overallDirection = 'stable';
    else overallDirection = 'mixed';
  }

  const deltas = hasPreviousWindow ? topicDeltas(recentWindow, previousWindow) : [];
  const emerging = deltas.filter((x) => x.delta > 0.0015).slice(0, 8);
  const declining = deltas.filter((x) => x.delta < -0.0015).slice(0, 8);

  let strengthsGained = emerging.slice(0, 5).map((x) => x.topic);
  let strengthsDeclined = declining.slice(0, 5).map((x) => x.topic);

  const negBiasedRecent = recentWindow.filter(
    (r) => String(r.sentiment ?? '').toLowerCase() === 'negative',
  );
  const negBiasedPrev = previousWindow.filter(
    (r) => String(r.sentiment ?? '').toLowerCase() === 'negative',
  );
  let weaknessesEmerging =
    hasPreviousWindow && negBiasedRecent.length > negBiasedPrev.length
      ? emerging.slice(0, 3).map((x) => x.topic)
      : hasPreviousWindow
        ? emerging.filter((x) => x.delta > 0.002).slice(0, 3).map((x) => x.topic)
        : [];

  let weaknessesDeclining = hasPreviousWindow ? declining.slice(0, 3).map((x) => x.topic) : [];

  if (!hasPreviousWindow) {
    strengthsGained = [];
    strengthsDeclined = [];
    weaknessesEmerging = [];
    weaknessesDeclining = [];
  }

  const topicChanges = {
    increasing: emerging.slice(0, 6).map((x) => ({ topic: x.topic, delta: x.delta })),
    decreasing: declining.slice(0, 6).map((x) => ({ topic: x.topic, delta: x.delta })),
    _method: 'Relative word frequency in run summaries (heuristic; not semantic topics).',
    ...(hasPreviousWindow ? {} : { _note: 'No prior window — topic deltas not computed.' }),
  };

  const recentNewest = recentWindow[0];
  const previousNewest = previousWindow[0];
  const avgPRecent = recentNewest ? avgPriorityScore(recentNewest) : null;
  const avgPPrev = previousNewest ? avgPriorityScore(previousNewest) : null;
  const avgTRecent = recentNewest ? avgTrendScore(recentNewest) : null;
  const avgTPrev = previousNewest ? avgTrendScore(previousNewest) : null;

  const priorityChanges = {
    recentWindowAvgPriority: avgPRecent,
    previousWindowAvgPriority: avgPPrev,
    delta:
      avgPRecent != null && avgPPrev != null ? Math.round((avgPRecent - avgPPrev) * 10) / 10 : null,
    topRecent: recentNewest ? topPrioritySnapshot(recentNewest) : null,
    topPrevious: previousNewest ? topPrioritySnapshot(previousNewest) : null,
    _note: 'Averages are from each window’s newest run’s normalized result rows when scores exist.',
  };

  const trendChanges = {
    recentWindowAvgTrendScore: avgTRecent,
    previousWindowAvgTrendScore: avgTPrev,
    delta:
      avgTRecent != null && avgTPrev != null ? Math.round((avgTRecent - avgTPrev) * 10) / 10 : null,
  };

  let alertsDeltaNote = null;
  try {
    const platR = String(recentNewest?.platform ?? 'youtube').toLowerCase();
    const platP = String(previousNewest?.platform ?? 'youtube').toLowerCase();
    const rowsR = recentNewest
      ? (recentNewest.normalizedResults || []).map((nr) => normalizedSnapshotToContentRow(nr, platR))
      : [];
    const rowsP = previousNewest
      ? (previousNewest.normalizedResults || []).map((nr) => normalizedSnapshotToContentRow(nr, platP))
      : [];
    const ar = rowsR.length ? generateAlertsForResults(rowsR, { maxAlerts: 5 }) : [];
    const ap = rowsP.length ? generateAlertsForResults(rowsP, { maxAlerts: 5 }) : [];
    alertsDeltaNote = {
      recentRunAlertCount: ar.length,
      previousRunAlertCount: ap.length,
      _note: 'Counts from alert rules on each window’s newest run only; for triage, not proof of trend.',
    };
  } catch {
    alertsDeltaNote = { _note: 'Alert comparison unavailable for these snapshots.' };
  }

  const shiftMeta = sentimentShiftDescription(
    { positive: recentBr.positive, neutral: recentBr.neutral, negative: recentBr.negative },
    { positive: prevBr.positive, neutral: prevBr.neutral, negative: prevBr.negative },
    hasPreviousWindow,
  );

  const summaryParts = [];
  summaryParts.push(windowNote);
  if (hasPreviousWindow) {
    summaryParts.push(
      `Direction (heuristic): ${overallDirection}. Negative run-share in window: recent ${(negRecent * 100).toFixed(0)}% vs prior ${(negPrev * 100).toFixed(0)}%.`,
    );
    if (emerging[0]) {
      summaryParts.push(`Largest relative uptick in summary wording: “${emerging[0].topic}”.`);
    }
  } else {
    summaryParts.push(
      `Recent window only (${recentWindow.length} run(s)); no directional comparison to an older window.`,
    );
  }
  const summary = summaryParts.join(' ');

  const recommendedActions = buildRecommendedActions(
    overallDirection,
    emerging,
    declining,
    comparisonMode,
  );

  const limitedBasis =
    comparisonMode === 'single_run' ||
    runs.length < 4 ||
    !previousWindow.length;

  return {
    keyword: displayLabel,
    groupKey,
    comparisonMode,
    comparisonModeDetail: windowNote,
    recentWindow: {
      runIds: recentWindow.map((r) => r.id),
      runCount: recentWindow.length,
      dateRangeHint: null,
    },
    previousWindow: {
      runIds: previousWindow.map((r) => r.id),
      runCount: previousWindow.length,
      dateRangeHint: null,
    },
    summary,
    overallDirection,
    sentimentShift: {
      recentBreakdown: {
        positive: recentBr.positive,
        neutral: recentBr.neutral,
        negative: recentBr.negative,
      },
      previousBreakdown: {
        positive: prevBr.positive,
        neutral: prevBr.neutral,
        negative: prevBr.negative,
      },
      negativeRunShareRecent: negRecent,
      negativeRunSharePrevious: hasPreviousWindow ? negPrev : null,
      description: shiftMeta.description,
      deltaNegativeLabelPoints: shiftMeta.deltaNegativePoints,
      deltaPositiveLabelPoints: shiftMeta.deltaPositivePoints,
    },
    strengthsGained,
    strengthsDeclined,
    weaknessesEmerging,
    weaknessesDeclining,
    topicChanges,
    priorityChanges,
    trendChanges,
    alertsComparison: alertsDeltaNote,
    recommendedActions,
    counts: {
      totalRuns: runs.length,
      recentRuns: recentWindow.length,
      previousRuns: previousWindow.length,
      maxRunsPerWindow,
    },
    _meta: {
      contextKind: 'keyword_history_comparison',
      limitedBasis,
      basisNote: limitedBasis
        ? 'Sparse or uneven windows — treat directions as indicative, not definitive.'
        : 'Comparison uses saved run summaries and per-run overall labels; not live comment-level data.',
      heuristic: true,
    },
  };
}

module.exports = {
  buildKeywordComparisonIntelligence,
  pickComparisonWindows,
};
