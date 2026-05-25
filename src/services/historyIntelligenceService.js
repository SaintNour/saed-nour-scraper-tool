/**
 * Aggregates saved search history for one keyword into a dashboard-shaped intelligence object
 * for the assistant (history-aware chat mode).
 *
 * @module historyIntelligenceService
 */

'use strict';

const { getHistoryGroupDetail } = require('./searchHistoryService');
const { generateAlertsForResults } = require('./contentAlertService');
const { overallSentimentFromBreakdown } = require('./dashboardIntelligenceService');

/**
 * @param {string | null | undefined} k
 */
function normalizeGroupKey(k) {
  return String(k || '').trim().toLowerCase();
}

/**
 * @param {Array<Record<string, unknown>>} runs
 */
function aggregateSentimentBreakdownFromRuns(runs) {
  const mix = { positive: 0, neutral: 0, negative: 0, mixed: 0, unknown: 0 };
  for (const r of runs) {
    const s = String(r.sentiment ?? '').toLowerCase();
    if (s === 'positive') mix.positive++;
    else if (s === 'negative') mix.negative++;
    else if (s === 'neutral') mix.neutral++;
    else if (s === 'mixed') mix.mixed++;
    else mix.unknown++;
  }
  const n = runs.length || 1;
  const base = {
    positive: Math.round((mix.positive / n) * 100),
    neutral: Math.round((mix.neutral / n) * 100),
    negative: Math.round((mix.negative / n) * 100),
  };
  const extra = mix.mixed + mix.unknown;
  if (extra > 0) {
    base.neutral = Math.min(100, base.neutral + Math.round((extra / n) * 100));
  }
  return {
    positive: base.positive,
    neutral: base.neutral,
    negative: base.negative,
    _note:
      'Shares of saved runs by overall sentiment label (not per-comment counts). Use for directional patterns only.',
    _mixedRuns: mix.mixed,
    _unknownRuns: mix.unknown,
  };
}

/**
 * Very light recurring token signal from run summaries (no stored top_* lists on history rows).
 * @param {Array<Record<string, unknown>>} runs
 * @param {number} max
 */
function recurringTokensFromSummaries(runs, max = 8) {
  const texts = runs.map((r) => String(r.summary || '')).filter(Boolean);
  const counts = new Map();
  for (const t of texts) {
    for (const w of t.toLowerCase().split(/\W+/)) {
      if (w.length < 4) continue;
      if (/^(this|that|with|from|have|been|were|your|their|there|these|those)$/i.test(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

/**
 * @param {Record<string, unknown>} nr
 * @param {string} platform
 */
function normalizedSnapshotToContentRow(nr, platform) {
  const subs = Array.isArray(nr.matched_sub_keywords) ? nr.matched_sub_keywords : [];
  return {
    id: nr.id,
    title: nr.title,
    url: nr.url,
    canonical_url: nr.canonical_url,
    platform,
    content_sentiment_label: nr.content_sentiment_label ?? 'neutral',
    result_classification: nr.result_classification ?? 'seen',
    metrics: nr.metrics && typeof nr.metrics === 'object' ? nr.metrics : {},
    priority_score: nr.priority_score,
    priority_level: nr.priority_level,
    priority_reason: nr.priority_reason,
    trend_score: nr.trend_score,
    trend_level: nr.trend_level,
    trend_reason: nr.trend_reason,
    match_meta: {
      mainMatched: true,
      matchedSubKeywords: subs.filter((x) => typeof x === 'string'),
      isRelevant: true,
    },
    audience_sentiment: { positive: 34, neutral: 33, negative: 33 },
  };
}

/**
 * @param {string} groupKeyRaw — normalized main keyword (case-insensitive)
 * @returns {Record<string, unknown> | null}
 */
function buildKeywordIntelligence(groupKeyRaw) {
  const groupKey = normalizeGroupKey(groupKeyRaw);
  if (!groupKey) return null;

  const detail = getHistoryGroupDetail(groupKey);
  if (!detail || !Array.isArray(detail.runs) || detail.runs.length === 0) return null;

  const runs = detail.runs;
  const displayLabel = detail.displayLabel || groupKey;
  const platform = String(runs[0].platform ?? 'youtube').toLowerCase();

  const sentimentBreakdownRaw = aggregateSentimentBreakdownFromRuns(runs);
  const overallSentiment = overallSentimentFromBreakdown({
    positive: sentimentBreakdownRaw.positive,
    neutral: sentimentBreakdownRaw.neutral,
    negative: sentimentBreakdownRaw.negative,
  });
  const sentimentBreakdown = {
    positive: sentimentBreakdownRaw.positive,
    neutral: sentimentBreakdownRaw.neutral,
    negative: sentimentBreakdownRaw.negative,
    _note: sentimentBreakdownRaw._note,
  };

  const posRuns = runs.filter((r) => String(r.sentiment ?? '').toLowerCase() === 'positive');
  const negRuns = runs.filter((r) => String(r.sentiment ?? '').toLowerCase() === 'negative');
  let topStrengths = recurringTokensFromSummaries(posRuns, 6);
  let topWeaknesses = recurringTokensFromSummaries(negRuns, 6);
  const globalTokens = recurringTokensFromSummaries(runs, 10);
  if (topStrengths.length === 0) topStrengths = globalTokens.slice(0, 4);
  if (topWeaknesses.length === 0) topWeaknesses = globalTokens.slice(4, 8);

  const trendingTopics = [...new Set([...globalTokens, ...topStrengths, ...topWeaknesses])].slice(0, 8);

  const latestRunsSummary = runs.slice(0, 5).map((r) => ({
    runId: r.id,
    createdAt: r.createdAt,
    overallSentiment: r.sentiment ?? null,
    resultCount: r.resultCount ?? 0,
    summarySnippet:
      typeof r.summary === 'string' && r.summary.trim()
        ? r.summary.trim().slice(0, 320)
        : null,
    analysisSource: r.analysisSource,
  }));

  const latest = runs[0];
  const normalized = Array.isArray(latest.normalizedResults) ? latest.normalizedResults : [];
  const rows = normalized.map((nr) => normalizedSnapshotToContentRow(nr, platform));
  rows.sort((a, b) => (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0));

  const priorityContent = rows.slice(0, 5).map((r) => ({
    title: r.title,
    platform: r.platform,
    url: r.url || null,
    sentiment: 'neutral',
    whyItMatters:
      typeof r.priority_reason === 'string' && r.priority_reason.trim()
        ? r.priority_reason
        : 'From the latest saved run for this keyword.',
    matchedSubKeywords: r.match_meta?.matchedSubKeywords ?? [],
    priorityScore: Number(r.priority_score) || 0,
    priorityLevel: r.priority_level,
    priorityReason: typeof r.priority_reason === 'string' ? r.priority_reason : undefined,
    trendScore: Number(r.trend_score) || 0,
    trendLevel: r.trend_level,
    trendReason: typeof r.trend_reason === 'string' ? r.trend_reason : undefined,
  }));

  let latestAlerts = [];
  try {
    latestAlerts = generateAlertsForResults(rows, { maxAlerts: 6 });
  } catch {
    latestAlerts = [];
  }

  const summary = `Historical view across ${runs.length} saved analysis run(s) for “${displayLabel}”. This aggregates past snapshots — not a live or real-time feed.`;

  return {
    keyword: displayLabel,
    mainKeyword: displayLabel,
    subKeywords: Array.isArray(latest.subKeywords) ? latest.subKeywords : [],
    displayLabel,
    groupKey,
    summary,
    overallSentiment,
    sentimentBreakdown,
    topStrengths,
    topWeaknesses,
    trendingTopics,
    topSignals: [],
    topRecommendations: [],
    latestRunsSummary,
    priorityContent,
    latestAlerts,
    analysisSourceSummary: {
      label: 'history_aggregate',
      counts: {},
      localSentimentNote: null,
    },
    counts: {
      contentItems: rows.length,
      totalContentItemsReported: rows.length,
      commentsAnalyzed: latest.totalCommentsAnalyzed ?? null,
      totalRuns: runs.length,
    },
    _meta: {
      platform,
      cached: false,
      contextMode: 'history_keyword',
      isHistorical: true,
      historyHint: `Based on ${runs.length} saved run(s). Not real-time.`,
      watchlistHint: null,
    },
  };
}

module.exports = {
  buildKeywordIntelligence,
  normalizeGroupKey,
  aggregateSentimentBreakdownFromRuns,
  normalizedSnapshotToContentRow,
};
