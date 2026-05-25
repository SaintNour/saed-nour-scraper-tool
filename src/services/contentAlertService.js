/**
 * Phase C: analysis-run alerts from priority, trend, and history classification.
 * Not push notifications — generation + payload only.
 *
 * @module contentAlertService
 */

'use strict';

const { computeContentPriority } = require('./contentPriorityService');
const { computeContentTrend } = require('./contentTrendService');

/**
 * @typedef {'high_risk_negative' | 'trending' | 'new_high_priority' | 'updated_momentum'} AlertType
 * @typedef {'low' | 'medium' | 'high' | 'critical'} AlertSeverity
 */

const DEFAULT_MAX_ALERTS = 8;

/**
 * @param {unknown} v
 */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/**
 * @param {Record<string, unknown>} row
 */
function contentIdOf(row) {
  const id = row.id ?? row.content_id ?? row.video_id;
  return id != null ? String(id) : 'unknown';
}

/**
 * @param {Record<string, unknown>} row
 */
function matchMeta(row) {
  const mm = row.match_meta ?? row.matchMeta;
  if (!mm || typeof mm !== 'object') {
    return { mainMatched: true, matchedSubKeywords: [], isRelevant: true };
  }
  const o = /** @type {Record<string, unknown>} */ (mm);
  return {
    mainMatched: o.mainMatched !== false,
    matchedSubKeywords: Array.isArray(o.matchedSubKeywords) ? o.matchedSubKeywords.filter((x) => typeof x === 'string') : [],
    isRelevant: o.isRelevant !== false,
  };
}

/**
 * Strong keyword relevance (aligned with trend gate, thresholded for alerts).
 * @param {ReturnType<matchMeta>} meta
 */
function relevanceStrong(meta) {
  let r = 0;
  if (meta.mainMatched) r += 0.58;
  r += Math.min(0.42, meta.matchedSubKeywords.length * 0.11);
  if (meta.isRelevant === false) r *= 0.28;
  return Math.max(0, Math.min(1, r)) >= 0.55;
}

/**
 * @param {Record<string, unknown>} row
 */
function isNegativeSentiment(row) {
  const lab = str(row.content_sentiment_label ?? row.contentSentimentLabel).toLowerCase();
  if (lab === 'negative') return true;
  const aud = row.audience_sentiment ?? row.audienceSentiment ?? row.sentiment;
  if (!aud || typeof aud !== 'object') return false;
  const a = /** @type {Record<string, unknown>} */ (aud);
  const neg = Number(a.negative) || 0;
  const pos = Number(a.positive) || 0;
  return neg >= 38 && neg > pos + 4;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ priorityLevel: string, priorityScore: number, trendLevel: string, trendScore: number }}
 */
function resolveScores(row) {
  let priorityLevel = str(row.priority_level ?? row.priorityLevel).toLowerCase();
  let priorityScore = Number(row.priority_score ?? row.priorityScore);
  const explicitPL =
    priorityLevel === 'critical' ||
    priorityLevel === 'high' ||
    priorityLevel === 'medium' ||
    priorityLevel === 'low';

  if (!explicitPL && (!Number.isFinite(priorityScore) || priorityLevel === '')) {
    const p = computeContentPriority(row);
    priorityLevel = p.priorityLevel;
    priorityScore = p.priorityScore;
  } else if (!Number.isFinite(priorityScore)) {
    const p = computeContentPriority(row);
    priorityScore = p.priorityScore;
  }

  let trendLevel = str(row.trend_level ?? row.trendLevel).toLowerCase();
  let trendScore = Number(row.trend_score ?? row.trendScore);
  const explicitTL =
    trendLevel === 'viral_candidate' ||
    trendLevel === 'trending' ||
    trendLevel === 'rising' ||
    trendLevel === 'normal';

  if (!explicitTL && (!Number.isFinite(trendScore) || trendLevel === '')) {
    const t = computeContentTrend(row);
    trendLevel = t.trendLevel;
    trendScore = t.trendScore;
  } else if (!Number.isFinite(trendScore)) {
    const t = computeContentTrend(row);
    trendScore = t.trendScore;
  }

  return { priorityLevel, priorityScore, trendLevel, trendScore };
}

/**
 * @param {string} pl
 * @param {string} tl
 * @param {number} ts
 * @param {AlertType} type
 * @returns {AlertSeverity}
 */
function severityFor(pl, tl, ts, type) {
  if (type === 'high_risk_negative') {
    if (pl === 'critical') return 'critical';
    return 'high';
  }
  if (type === 'new_high_priority') {
    if (pl === 'critical') return 'critical';
    return 'high';
  }
  if (type === 'trending') {
    if (tl === 'viral_candidate') return ts >= 92 ? 'high' : 'medium';
    return 'medium';
  }
  if (type === 'updated_momentum') {
    if (tl === 'viral_candidate' || tl === 'trending') return 'high';
    return 'medium';
  }
  return 'low';
}

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * @param {Record<string, unknown>} row
 * @param {AlertType} type
 * @param {string} createdAt
 * @param {string} alertId
 */
function buildOneAlert(row, type, createdAt, alertId) {
  const titleText = str(row.title).trim() || 'Untitled';
  const shortTitle = titleText.length > 72 ? `${titleText.slice(0, 69)}…` : titleText;
  const { priorityLevel, trendLevel, trendScore } = resolveScores(row);
  const cid = contentIdOf(row);
  const url = typeof row.url === 'string' ? row.url : typeof row.canonical_url === 'string' ? row.canonical_url : null;

  /** @type {Record<string, string>} */
  const messages = {
    high_risk_negative: `High or critical priority with negative tone: “${shortTitle}”.`,
    trending: `Strong momentum (${String(trendLevel).replace(/_/g, ' ')}) for your keywords: “${shortTitle}”.`,
    new_high_priority: `New result ranked high priority: “${shortTitle}”.`,
    updated_momentum: `Known item updated and gaining momentum: “${shortTitle}”.`,
  };

  const severity = severityFor(
    priorityLevel,
    trendLevel,
    Number.isFinite(trendScore) ? trendScore : 0,
    type,
  );

  const titles = {
    high_risk_negative: 'High-risk negative',
    trending: 'Trending / viral signal',
    new_high_priority: 'New high-priority match',
    updated_momentum: 'Updated momentum',
  };

  return {
    alert_id: alertId,
    type,
    severity,
    title: titles[type],
    message: messages[type],
    related_content_id: cid,
    priority_level: priorityLevel,
    trend_level: trendLevel,
    created_at: createdAt,
    ...(url ? { content_url: url } : {}),
  };
}

/**
 * Candidate alerts for a single row (one object per matching type).
 * @param {Record<string, unknown>} row
 * @param {{ createdAt?: string }} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
function buildAlertFromRow(row, opts = {}) {
  if (!row || typeof row !== 'object') return [];

  const createdAt = opts.createdAt || new Date().toISOString();
  const rc = row.result_classification ?? row.resultClassification;
  const classification = rc === 'new' || rc === 'updated' || rc === 'seen' ? rc : 'seen';

  const { priorityLevel, trendLevel, trendScore } = resolveScores(row);
  const rawTrendInput = str(row.trend_level ?? row.trendLevel).toLowerCase();
  const explicitTrendLabel =
    rawTrendInput === 'viral_candidate' || rawTrendInput === 'trending';
  const meta = matchMeta(row);
  const neg = isNegativeSentiment(row);

  const out = [];

  const pushType = (type) => {
    const alertId = `al_${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${contentIdOf(row)}_${type}`;
    out.push(buildOneAlert(row, type, createdAt, alertId));
  };

  if ((priorityLevel === 'high' || priorityLevel === 'critical') && neg) {
    pushType('high_risk_negative');
  }

  if (
    (trendLevel === 'trending' || trendLevel === 'viral_candidate') &&
    relevanceStrong(meta)
  ) {
    pushType('trending');
  }

  if (classification === 'new' && (priorityLevel === 'high' || priorityLevel === 'critical')) {
    pushType('new_high_priority');
  }

  if (
    classification === 'updated' &&
    (trendLevel === 'rising' || trendLevel === 'trending' || trendLevel === 'viral_candidate')
  ) {
    pushType('updated_momentum');
  }

  /** Spam guard: weak computed trend scores can drop “trending” unless the row already had a strong label */
  return out.filter((a) => {
    if (a.type !== 'trending') return true;
    if (explicitTrendLabel) return true;
    return Number.isFinite(trendScore) && trendScore >= 55;
  });
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} rows
 * @param {{ maxAlerts?: number, createdAt?: string }} [options]
 * @returns {Array<Record<string, unknown>>}
 */
function generateAlertsForResults(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const maxAlerts = Math.min(20, Math.max(1, options.maxAlerts ?? DEFAULT_MAX_ALERTS));
  const createdAt = options.createdAt || new Date().toISOString();

  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const candidates = buildAlertFromRow(/** @type {Record<string, unknown>} */ (row), { createdAt });
    for (const a of candidates) {
      const type = /** @type {string} */ (a.type);
      const cid = /** @type {string} */ (a.related_content_id);
      const key = `${cid}\0${type}`;
      const prev = byKey.get(key);
      const rank = SEVERITY_RANK[/** @type {keyof typeof SEVERITY_RANK} */ (a.severity)] || 0;
      const prevRank = prev ? SEVERITY_RANK[/** @type {keyof typeof SEVERITY_RANK} */ (prev.severity)] || 0 : -1;
      if (!prev || rank > prevRank) {
        byKey.set(key, a);
      }
    }
  }

  const list = [...byKey.values()].filter((a) => {
    const sev = /** @type {string} */ (a.severity);
    if (sev === 'low') return false;
    return true;
  });

  list.sort((a, b) => {
    const ra = SEVERITY_RANK[/** @type {keyof typeof SEVERITY_RANK} */ (a.severity)] || 0;
    const rb = SEVERITY_RANK[/** @type {keyof typeof SEVERITY_RANK} */ (b.severity)] || 0;
    if (rb !== ra) return rb - ra;
    const order = { high_risk_negative: 0, new_high_priority: 1, trending: 2, updated_momentum: 3 };
    const ta = order[/** @type {keyof typeof order} */ (a.type)] ?? 9;
    const tb = order[/** @type {keyof typeof order} */ (b.type)] ?? 9;
    return ta - tb;
  });

  return list.slice(0, maxAlerts);
}

module.exports = {
  generateAlertsForResults,
  buildAlertFromRow,
};
