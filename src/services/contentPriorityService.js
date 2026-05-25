/**
 * Phase A: platform-agnostic priority scoring for content rows.
 * Reusable for dashboard intelligence, future alerts, and viral/trend layers.
 *
 * @module contentPriorityService
 */

'use strict';

/**
 * @typedef {'critical' | 'high' | 'medium' | 'low'} PriorityLevel
 */

/**
 * @param {unknown} v
 * @param {number} [d]
 */
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/**
 * @param {number} x
 */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Generic engagement + authority from a normalized or wire row.
 * @param {Record<string, unknown>} row
 */
function readMetrics(row) {
  const m = row.metrics && typeof row.metrics === 'object' ? /** @type {Record<string, unknown>} */ (row.metrics) : {};
  const o = row;
  const comments =
    num(m.comment_count ?? m.commentCount ?? o.comments_analyzed ?? o.commentsAnalyzed) ||
    num(o.comments_analyzed ?? o.commentsAnalyzed);
  return {
    viewCount: num(m.view_count ?? m.viewCount ?? o.view_count),
    likeCount: num(m.like_count ?? m.likeCount ?? o.like_count),
    commentCount: comments,
    shareCount: num(m.share_count ?? m.shareCount),
    creatorFollowerCount: num(
      m.creator_follower_count ?? m.creatorFollowerCount ?? o.subscriber_count ?? o.subscriberCount,
    ),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function readAudience(row) {
  const aud = row.audience_sentiment ?? row.audienceSentiment ?? row.sentiment;
  if (!aud || typeof aud !== 'object') {
    return { positive: 0, neutral: 100, negative: 0 };
  }
  const a = /** @type {Record<string, unknown>} */ (aud);
  return {
    positive: num(a.positive),
    neutral: num(a.neutral),
    negative: num(a.negative),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function contentLabel(row) {
  const l = String(row.content_sentiment_label ?? row.contentSentimentLabel ?? 'neutral').toLowerCase();
  if (l === 'positive' || l === 'negative') return l;
  return 'neutral';
}

/**
 * @param {Record<string, unknown>} row
 */
function classificationOf(row) {
  const c = row.result_classification ?? row.resultClassification;
  if (c === 'new' || c === 'updated' || c === 'seen') return c;
  /** No classification yet (e.g. cold analysis): do not assume "new" — avoids a false history boost. */
  return 'seen';
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
 * @param {string | undefined} publishedAtIso
 * @param {Date} now
 */
function freshness01(publishedAtIso, now) {
  if (!publishedAtIso || typeof publishedAtIso !== 'string') return 0.55;
  const t = Date.parse(publishedAtIso);
  if (!Number.isFinite(t)) return 0.55;
  const ageMs = Math.max(0, now.getTime() - t);
  const ageDays = ageMs / 86400000;
  return clamp01(Math.exp(-ageDays / 48));
}

/**
 * @param {ReturnType<readMetrics>} metrics
 */
function engagement01(metrics) {
  const { viewCount, likeCount, commentCount, shareCount } = metrics;
  const raw =
    Math.log1p(viewCount) * 0.07 +
    Math.log1p(likeCount) * 0.06 +
    Math.log1p(commentCount) * 0.09 +
    Math.log1p(shareCount) * 0.08;
  return clamp01(raw / 2.85);
}

/**
 * @param {ReturnType<readMetrics>} metrics
 */
function authority01(metrics) {
  return clamp01(Math.log1p(metrics.creatorFollowerCount) / 18);
}

/**
 * @param {'new' | 'updated' | 'seen'} c
 */
function history01(c) {
  if (c === 'new') return 1;
  if (c === 'updated') return 0.94;
  return 0.36;
}

/**
 * Balanced brand significance: high-risk negative can score high, but so can high-impact positive.
 * Low engagement dampens both so noisy negatives do not dominate.
 * @param {ReturnType<readAudience>} audience
 * @param {'positive' | 'neutral' | 'negative'} contentLab
 * @param {number} engagementNorm
 */
function brand01(audience, contentLab, engagementNorm) {
  const neg = audience.negative / 100;
  const pos = audience.positive / 100;
  const neu = audience.neutral / 100;

  const cNeg = contentLab === 'negative' ? 1 : 0;
  const cPos = contentLab === 'positive' ? 1 : 0;

  const impact = 0.1 + 0.9 * engagementNorm;

  const riskBase = neg * 0.7 + cNeg * 0.24 + neg * cNeg * 0.2;
  const risk = clamp01(riskBase * impact);

  const oppBase = pos * 0.7 + cPos * 0.24 + pos * cPos * 0.14;
  const opp = clamp01(oppBase * impact);

  let b = Math.max(risk, opp);
  if (risk > 0.18 && opp > 0.18) {
    b += 0.07 * Math.min(risk, opp);
  }

  if (neu > 0.6 && Math.max(neg, pos) < 0.24) {
    b *= 0.48;
  }

  return clamp01(b);
}

/**
 * @param {ReturnType<matchMeta>} meta
 */
function relevance01(meta) {
  let r = 0;
  if (meta.mainMatched) r += 0.52;
  r += Math.min(0.48, meta.matchedSubKeywords.length * 0.11);
  if (meta.isRelevant === false) r *= 0.35;
  return clamp01(r);
}

/**
 * @param {number} score
 * @returns {PriorityLevel}
 */
function levelFromScore(score) {
  if (score >= 82) return 'critical';
  if (score >= 64) return 'high';
  if (score >= 42) return 'medium';
  return 'low';
}

/**
 * @param {PriorityLevel} level
 */
function levelLabel(level) {
  if (level === 'critical') return 'Critical';
  if (level === 'high') return 'High';
  if (level === 'medium') return 'Medium';
  return 'Low';
}

/**
 * @param {object} ctx
 */
function buildPriorityReason(ctx) {
  const {
    priorityLevel,
    rel,
    br,
    eng,
    fr,
    histClass,
    riskHigher,
    matchedSubCount,
  } = ctx;

  const label = levelLabel(priorityLevel);
  const parts = [];

  if (rel >= 0.78) parts.push('relevance is strong');
  else if (matchedSubCount > 0) parts.push('sub-keyword matches increase weight');

  if (br >= 0.58) {
    if (riskHigher) {
      parts.push('audience or content sentiment shows elevated risk');
    } else {
      parts.push('positive sentiment and impact potential are elevated');
    }
  }

  if (eng >= 0.56) parts.push('engagement volume is high');
  else if (eng < 0.28) parts.push('engagement is modest');

  if (fr >= 0.72) parts.push('the content is relatively fresh');

  if (histClass === 'new' || histClass === 'updated') {
    parts.push('marked new or updated in your history');
  }

  const detail = parts.slice(0, 3).join(', ');
  const sentence = detail
    ? `${label} priority because ${detail}.`
    : `${label} priority from blended relevance, sentiment, reach, and freshness.`;

  return sentence.slice(0, 280);
}

/**
 * Compute priority for one normalized or wire content row.
 *
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 * @returns {{
 *   priorityScore: number,
 *   priorityLevel: PriorityLevel,
 *   priorityReason: string,
 * }}
 */
function computeContentPriority(row, opts = {}) {
  if (!row || typeof row !== 'object') {
    return {
      priorityScore: 0,
      priorityLevel: 'low',
      priorityReason: 'Low priority: insufficient data.',
    };
  }

  const now = opts.now instanceof Date ? opts.now : new Date();
  const metrics = readMetrics(row);
  const audience = readAudience(row);
  const cLab = contentLabel(row);
  const meta = matchMeta(row);
  const hist = classificationOf(row);
  const publishedAt = row.published_at ?? row.publishedAt;
  const publishedAtStr = typeof publishedAt === 'string' ? publishedAt : undefined;

  const rel = relevance01(meta);
  const eng = engagement01(metrics);
  const auth = authority01(metrics);
  const fr = freshness01(publishedAtStr, now);
  const histW = history01(hist);

  let engUse = eng;
  const ss = num(row.signal_strength ?? row.signalStrength, NaN);
  if (Number.isFinite(ss)) {
    engUse = clamp01(eng + clamp01(ss) * 0.06);
  }

  const br = brand01(audience, cLab, engUse);
  const riskHigher =
    audience.negative >= audience.positive &&
    (cLab === 'negative' || audience.negative > 38);

  const blended =
    rel * 0.2 +
    br * 0.28 +
    auth * 0.1 +
    engUse * 0.22 +
    fr * 0.12 +
    histW * 0.08;

  const priorityScore = Math.round(Math.min(100, Math.max(0, 100 * clamp01(blended))));
  const priorityLevel = levelFromScore(priorityScore);

  const priorityReason = buildPriorityReason({
    priorityLevel,
    rel,
    br,
    eng: engUse,
    fr,
    histClass: hist,
    riskHigher,
    matchedSubCount: meta.matchedSubKeywords.length,
  });

  return {
    priorityScore,
    priorityLevel,
    priorityReason,
  };
}

/**
 * Mutates row with snake_case priority fields for API payloads.
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 */
function applyPriorityToContentRow(row, opts) {
  const r = computeContentPriority(row, opts);
  row.priority_score = r.priorityScore;
  row.priority_level = r.priorityLevel;
  row.priority_reason = r.priorityReason;
  return row;
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} rows
 * @param {{ now?: Date }} [opts]
 */
function applyPriorityToContentRows(rows, opts) {
  if (!Array.isArray(rows)) return rows;
  for (const row of rows) {
    if (row && typeof row === 'object') applyPriorityToContentRow(/** @type {Record<string, unknown>} */ (row), opts);
  }
  return rows;
}

module.exports = {
  computeContentPriority,
  applyPriorityToContentRow,
  applyPriorityToContentRows,
};
