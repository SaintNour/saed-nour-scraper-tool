/**
 * Rule-based trend scoring (full replacement).
 *
 * Trend intent:
 * "Content is impactful either because it comes from a strong account OR because it significantly outperforms its audience."
 *
 * @module contentTrendService
 */

'use strict';

/**
 * @typedef {'viral_candidate' | 'trending' | 'rising' | 'normal'} TrendLevel
 */

/**
 * @param {unknown} v
 * @param {number} [d]
 */
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

const HOT_BASELINE = 70;
const NORMAL_BASELINE = 40;
const RULE_A_FOLLOWERS_MIN = 15000;
const RULE_A_VIEWS_MIN = 3000;
const RULE_B_RATIO_MIN = 3;

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
 * @param {string | undefined} publishedAtIso
 * @param {Date} now
 */
function ageDaysFromPublishedAt(publishedAtIso, now) {
  if (!publishedAtIso || typeof publishedAtIso !== 'string') return null;
  const t = Date.parse(publishedAtIso);
  if (!Number.isFinite(t)) return null;
  const d = (now.getTime() - t) / 86400000;
  return Math.max(0, d);
}

/**
 * @param {number} x
 */
function clampScore(x) {
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * @param {number} engagement
 * @param {number} views
 */
function engagementRateFromMetrics(engagement, views) {
  if (views > 0) return engagement / views;
  // Fallback when views are missing: coarse proxy using engagement only.
  if (engagement >= 400) return 0.08;
  if (engagement >= 180) return 0.05;
  if (engagement >= 60) return 0.02;
  return 0;
}

/**
 * @param {number|null} ageDays
 */
function ageBoost(ageDays) {
  if (ageDays == null) return 0;
  if (ageDays <= 3) return 10;
  if (ageDays <= 10) return 5;
  if (ageDays <= 30) return 0;
  return -15;
}

/**
 * @param {number} engagementRate
 */
function engagementBoost(engagementRate) {
  if (engagementRate >= 0.08) return 15;
  if (engagementRate >= 0.05) return 10;
  if (engagementRate >= 0.02) return 5;
  return 0;
}

/**
 * @param {number} views
 */
function extraViewBoost(views) {
  if (views >= 50000) return 10;
  if (views >= 10000) return 5;
  return 0;
}

/**
 * @param {number} score
 * @returns {TrendLevel}
 */
function levelFromTrendScore(score) {
  if (score >= 85) return 'viral_candidate';
  if (score >= 70) return 'trending';
  if (score >= 50) return 'rising';
  return 'normal';
}

/**
 * @param {TrendLevel} level
 * @param {'rule_a' | 'rule_b' | 'normal'} baseReason
 * @param {number} engagementRate
 * @param {number|null} ageDays
 * @param {number} views
 */
function buildTrendReason(level, baseReason, engagementRate, ageDays, views) {
  const base =
    baseReason === 'rule_a'
      ? 'Trending baseline from large-account reach.'
      : baseReason === 'rule_b'
        ? 'Trending baseline from strong over-performance vs audience size.'
        : 'Normal baseline; no hot trigger met.';

  if (level === 'viral_candidate') {
    return `${base} High engagement and/or recency lifted this into viral-candidate territory.`.slice(
      0,
      200,
    );
  }

  if (level === 'trending') {
    return `${base} Boosted by engagement and freshness signals.`.slice(0, 200);
  }

  if (level === 'rising') {
    return `${base} Moderate momentum from engagement or view strength.`.slice(0, 200);
  }

  if (ageDays != null && ageDays > 30) {
    return `${base} Older than 30 days, so momentum is discounted.`.slice(0, 200);
  }

  if (views <= 0 && engagementRate > 0) {
    return `${base} Views are missing; score used engagement-only fallback.`.slice(0, 200);
  }

  return `${base} Limited momentum lift from engagement and recency.`.slice(0, 200);
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 * @returns {{
 *   trendScore: number,
 *   trendLevel: TrendLevel,
 *   trendReason: string,
 * }}
 */
function computeContentTrend(row, opts = {}) {
  if (!row || typeof row !== 'object') {
    return {
      trendScore: 0,
      trendLevel: 'normal',
      trendReason: 'No trend data: insufficient row.',
    };
  }

  const now = opts.now instanceof Date ? opts.now : new Date();
  const metrics = readMetrics(row);
  const publishedAt = row.published_at ?? row.publishedAt;
  const publishedAtStr = typeof publishedAt === 'string' ? publishedAt : undefined;
  const followers = Math.max(0, metrics.creatorFollowerCount);
  const views = Math.max(0, metrics.viewCount);
  const likes = Math.max(0, metrics.likeCount);
  const comments = Math.max(0, metrics.commentCount);
  const engagement = likes + comments;
  const viewToFollowerRatio = views / Math.max(followers, 1);
  const engagementRate = engagementRateFromMetrics(engagement, views);
  const ageDays = ageDaysFromPublishedAt(publishedAtStr, now);

  const ruleAHit = followers >= RULE_A_FOLLOWERS_MIN && views >= RULE_A_VIEWS_MIN;
  const ruleBHit = views > 0 && viewToFollowerRatio >= RULE_B_RATIO_MIN;

  const baseTrendScore = ruleAHit || ruleBHit ? HOT_BASELINE : NORMAL_BASELINE;
  const reasonTag = ruleAHit ? 'rule_a' : ruleBHit ? 'rule_b' : 'normal';

  const scoreRaw =
    baseTrendScore + engagementBoost(engagementRate) + ageBoost(ageDays) + extraViewBoost(views);
  const trendScore = clampScore(scoreRaw);
  const trendLevel = levelFromTrendScore(trendScore);
  let trendReason = buildTrendReason(trendLevel, reasonTag, engagementRate, ageDays, views);
  trendReason = trendReason.slice(0, 200);

  // Required debug logging for validation.
  console.log(
    `[trend] followers=${followers} views=${views} viewToFollowerRatio=${viewToFollowerRatio.toFixed(
      2,
    )} engagementRate=${engagementRate.toFixed(4)} ageDays=${
      ageDays == null ? 'na' : ageDays.toFixed(1)
    } baseTrendScore=${baseTrendScore} finalTrendScore=${trendScore} ruleA=${ruleAHit} ruleB=${ruleBHit}`,
  );

  return {
    trendScore,
    trendLevel,
    trendReason,
    _debug: {
      followers,
      views,
      viewToFollowerRatio,
      engagementRate,
      ageDays,
      baseTrendScore,
      ruleAHit,
      ruleBHit,
      reasonTag,
    },
  };
}

/**
 * Mutates row with snake_case trend fields for API payloads.
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 */
function applyTrendToContentRow(row, opts) {
  const r = computeContentTrend(row, opts);
  row.trend_score = r.trendScore;
  row.trend_level = r.trendLevel;
  row.trend_reason = r.trendReason;
  return row;
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} rows
 * @param {{ now?: Date }} [opts]
 */
function applyTrendToContentRows(rows, opts) {
  if (!Array.isArray(rows)) return rows;
  for (const row of rows) {
    if (row && typeof row === 'object') applyTrendToContentRow(/** @type {Record<string, unknown>} */ (row), opts);
  }
  return rows;
}

module.exports = {
  computeContentTrend,
  applyTrendToContentRow,
  applyTrendToContentRows,
};
