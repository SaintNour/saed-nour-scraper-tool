/**
 * Phase 2: compact "dashboard intelligence" for future chatbot context.
 * Derives only from supplied analysis + optional hints — no unsupported claims.
 *
 * Options: dateRange, historySummary, watchlistNote, localRowHints (per-row local layer hints).
 *
 * @module dashboardIntelligenceService
 */

const { analyzeLocalSentiment, combineItemText } = require('./localSentimentService');
const { computeContentPriority } = require('./contentPriorityService');
const { computeContentTrend } = require('./contentTrendService');

/**
 * @param {unknown} v
 * @returns {string[]}
 */
function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).map((s) => s.trim());
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
/**
 * @param {Record<string, unknown> | null | undefined} metrics
 * @param {Record<string, unknown>} o
 */
function readEngagementMetrics(metrics, o) {
  const m = metrics && typeof metrics === 'object' ? metrics : {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    viewCount: num(m.view_count) || num(m.viewCount) || num(o.view_count) || 0,
    likeCount: num(m.like_count) || num(m.likeCount) || num(o.like_count) || 0,
    commentCount:
      num(m.comment_count) ||
      num(m.commentCount) ||
      num(o.comments_analyzed) ||
      num(o.commentsAnalyzed) ||
      0,
    shareCount: num(m.share_count) || num(m.shareCount) || 0,
    creatorFollowerCount:
      num(m.creator_follower_count) || num(m.creatorFollowerCount) || num(o.subscriber_count) || 0,
  };
}

function normalizeContentRow(row, defaultPlatform) {
  if (!row || typeof row !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  const id = o.id ?? o.video_id ?? o.content_id;
  if (!id) return null;
  const title = String(o.title ?? '').trim() || '(untitled)';
  const url =
    typeof o.canonical_url === 'string'
      ? o.canonical_url.trim()
      : typeof o.url === 'string'
        ? o.url.trim()
        : undefined;
  const platform = String(o.platform ?? defaultPlatform ?? 'unknown').toLowerCase();
  const mm = o.match_meta || o.matchMeta;
  const matchedSubKeywords =
    mm && typeof mm === 'object' && Array.isArray(mm.matchedSubKeywords)
      ? mm.matchedSubKeywords.filter((x) => typeof x === 'string')
      : [];
  const metricsRaw = o.metrics && typeof o.metrics === 'object' ? o.metrics : {};
  const engagement = readEngagementMetrics(metricsRaw, o);
  const comments =
    engagement.commentCount ||
    Number(o.comments_analyzed ?? o.commentsAnalyzed ?? 0) ||
    0;
  const aud = o.audience_sentiment ?? o.audienceSentiment ?? o.sentiment;
  const pos = aud && typeof aud === 'object' ? Number(aud.positive) || 0 : 0;
  const neu = aud && typeof aud === 'object' ? Number(aud.neutral) || 0 : 0;
  const neg = aud && typeof aud === 'object' ? Number(aud.negative) || 0 : 0;
  const contentLabel = String(o.content_sentiment_label ?? o.contentSentimentLabel ?? 'neutral').toLowerCase();
  const base = {
    id: String(id),
    title,
    url,
    platform,
    commentsAnalyzed: comments,
    metrics: engagement,
    audienceSentiment: { positive: pos, neutral: neu, negative: neg },
    contentSentimentLabel: contentLabel === 'positive' || contentLabel === 'negative' ? contentLabel : 'neutral',
    matchedSubKeywords,
    resultClassification: o.result_classification ?? o.resultClassification,
    contentSummary: typeof o.content_summary === 'string' ? o.content_summary : o.contentSummary,
  };
  const pr = o.priority_score ?? o.priorityScore;
  const pl = o.priority_level ?? o.priorityLevel;
  const preason = o.priority_reason ?? o.priorityReason;
  if (pr != null && Number.isFinite(Number(pr))) {
    base.priorityScore = Math.round(Number(pr));
  }
  if (typeof pl === 'string' && /^(critical|high|medium|low)$/.test(pl)) {
    base.priorityLevel = pl;
  }
  if (typeof preason === 'string' && preason.trim()) {
    base.priorityReason = preason.trim();
  }
  if (
    base.priorityScore == null ||
    base.priorityLevel == null ||
    base.priorityReason == null
  ) {
    const p = computeContentPriority(/** @type {Record<string, unknown>} */ (o));
    if (base.priorityScore == null) base.priorityScore = p.priorityScore;
    if (base.priorityLevel == null) base.priorityLevel = p.priorityLevel;
    if (base.priorityReason == null) base.priorityReason = p.priorityReason;
  }

  const tr = o.trend_score ?? o.trendScore;
  const tl = o.trend_level ?? o.trendLevel;
  const treason = o.trend_reason ?? o.trendReason;
  if (tr != null && Number.isFinite(Number(tr))) {
    base.trendScore = Math.round(Number(tr));
  }
  if (
    typeof tl === 'string' &&
    /^(viral_candidate|trending|rising|normal)$/.test(tl)
  ) {
    base.trendLevel = tl;
  }
  if (typeof treason === 'string' && treason.trim()) {
    base.trendReason = treason.trim();
  }
  if (
    base.trendScore == null ||
    base.trendLevel == null ||
    base.trendReason == null
  ) {
    const t = computeContentTrend(/** @type {Record<string, unknown>} */ (o));
    if (base.trendScore == null) base.trendScore = t.trendScore;
    if (base.trendLevel == null) base.trendLevel = t.trendLevel;
    if (base.trendReason == null) base.trendReason = t.trendReason;
  }

  return base;
}

/**
 * @param {Record<string, unknown>} analysis
 */
function contentRowsFromAnalysis(analysis) {
  const plat = String(analysis.platform ?? 'youtube');
  const raw = analysis.content_items ?? analysis.videos ?? analysis.contentItems ?? [];
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    const n = normalizeContentRow(r, plat);
    if (n) out.push(n);
  }
  return out;
}

/**
 * @param {{ positive: number, neutral: number, negative: number }} s
 * @returns {'positive' | 'negative' | 'neutral' | 'mixed'}
 */
function overallSentimentFromBreakdown(s) {
  const p = Number(s.positive) || 0;
  const neu = Number(s.neutral) || 0;
  const neg = Number(s.negative) || 0;
  const max = Math.max(p, neu, neg);
  const second = [p, neu, neg].sort((a, b) => b - a)[1];
  if (max - second < 12) return 'mixed';
  if (p === max) return 'positive';
  if (neg === max) return 'negative';
  return 'neutral';
}

/**
 * @param {Record<string, unknown>} analysis
 */
function sentimentBreakdownFromAnalysis(analysis) {
  const s = analysis.sentiment;
  if (s && typeof s === 'object') {
    return {
      positive: Number(s.positive) || 0,
      neutral: Number(s.neutral) || 0,
      negative: Number(s.negative) || 0,
    };
  }
  return { positive: 0, neutral: 0, negative: 0 };
}

/**
 * @param {string[]} strengths
 * @param {string[]} weaknesses
 */
function trendingTopicsFromLists(strengths, weaknesses) {
  const m = new Map();
  for (const t of [...strengths, ...weaknesses]) {
    const k = t.toLowerCase().slice(0, 80);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
}

/**
 * @param {Record<string, unknown>} analysis
 */
function topSignalsFromAnalysis(analysis) {
  const id = analysis.insight_drivers || analysis.insightDrivers;
  const whyN = id && typeof id === 'object' ? asStringArray(id.why_negative ?? id.whyNegative) : [];
  const whyP = id && typeof id === 'object' ? asStringArray(id.why_positive ?? id.whyPositive) : [];
  const out = [];
  for (const x of whyP.slice(0, 2)) out.push({ kind: 'positive_driver', text: x.slice(0, 280) });
  for (const x of whyN.slice(0, 2)) out.push({ kind: 'negative_driver', text: x.slice(0, 280) });
  if (out.length === 0) {
    const tp = asStringArray(analysis.top_positive_mentions ?? analysis.topPositiveMentions).slice(0, 1);
    const tc = asStringArray(analysis.top_complaints ?? analysis.topComplaints).slice(0, 1);
    if (tp[0]) out.push({ kind: 'praise_theme', text: tp[0].slice(0, 280) });
    if (tc[0]) out.push({ kind: 'complaint_theme', text: tc[0].slice(0, 280) });
  }
  return out.slice(0, 5);
}

/**
 * @param {Record<string, unknown>} analysis
 * @param {IntelligenceOptions} [options]
 */
function buildRecommendations(analysis, options) {
  const existing = asStringArray(analysis.recommended_actions ?? analysis.recommendedActions).slice(0, 6);
  const out = [...existing];
  const br = sentimentBreakdownFromAnalysis(analysis);
  const overall = overallSentimentFromBreakdown(br);

  if (out.length >= 2) return out.slice(0, 4);

  if (overall === 'negative' || br.negative > br.positive + 8) {
    out.push('Prioritize responses to themes in top weaknesses before the next campaign or launch.');
  }
  if (overall === 'positive' || br.positive > br.negative + 8) {
    out.push('Amplify strengths called out in audience feedback in product pages and creative.');
  }
  if (options?.watchlistNote) {
    out.push('Align messaging with watchlist-tracked shifts when those topics spike.');
  }
  if (out.length < 2) {
    out.push('Clarify onboarding or support content if installation or setup themes appear in comments.');
  }

  return [...new Set(out)].slice(0, 4);
}

/**
 * Build a short executive summary (no hallucination — uses existing summary + breakdown).
 * @param {Record<string, unknown>} analysis
 * @param {IntelligenceOptions} [options]
 */
function buildExecutiveSummary(analysis, options) {
  const base = String(analysis.summary ?? '').trim();
  const br = sentimentBreakdownFromAnalysis(analysis);
  const overall = overallSentimentFromBreakdown(br);
  const n = contentRowsFromAnalysis(analysis).length;
  const parts = [];
  if (base) parts.push(base.slice(0, 600));
  else {
    parts.push(
      `Analysis covers ${n} content item(s); overall tone is ${overall} (${br.positive}% positive / ${br.neutral}% neutral / ${br.negative}% negative).`,
    );
  }
  if (options?.historySummary) {
    parts.push(`History context: ${String(options.historySummary).slice(0, 200)}`);
  }
  return parts.join(' ').slice(0, 1200);
}

/**
 * @param {Record<string, unknown>} analysis
 */
function analysisSourceSummaryFrom(analysis) {
  const src = analysis.analysis_source ?? analysis.analysisSource;
  const mode = analysis._analysis_mode;
  const counts = {
    openai: 0,
    local_sentiment: 0,
    heuristic: 0,
    partial_neutral: 0,
    unknown: 0,
  };
  const key = String(src || mode || 'unknown').toLowerCase();
  if (key.includes('openai') || mode === 'openai') counts.openai += 1;
  else if (key.includes('local') || mode === 'local_sentiment') counts.local_sentiment += 1;
  else if (key.includes('heuristic') || mode === 'heuristic') counts.heuristic += 1;
  else if (key.includes('partial')) counts.partial_neutral += 1;
  else counts.unknown += 1;

  const label = [...new Set([src, mode].filter(Boolean))].join(' · ') || 'unknown';
  return { counts, label };
}

/**
 * Optional local layer summary string for chatbot context.
 * @param {Record<string, unknown>} analysis
 * @param {ReturnType<contentRowsFromAnalysis>} rows
 * @param {IntelligenceOptions} [options]
 */
function localSentimentSummaryFor(analysis, rows, options) {
  const hints = analysis._local_sentiment;
  if (Array.isArray(hints) && hints.length > 0) {
    const clear = hints.filter((h) => h && !h.fallbackNeeded).length;
    return `Local sentiment layer: ${clear}/${hints.length} item(s) high-confidence lexicon pass.`;
  }
  if (options?.localRowHints?.length) {
    const ok = options.localRowHints.filter((h) => h && !h.fallbackNeeded).length;
    return `Local sentiment hints: ${ok}/${options.localRowHints.length} row(s) high-confidence.`;
  }
  if (rows.length === 0) return null;
  const sample = rows.slice(0, 3).map((r) => analyzeLocalSentiment(combineItemText({ title: r.title, comments: [] })));
  const any = sample.some((s) => !s.fallbackNeeded);
  return any
    ? 'Local sentiment spot-check on titles: at least one clear lexicon signal (see per-item expansion if needed).'
    : null;
}

/**
 * Main API: build compact intelligence for chatbot context.
 *
 * @param {Record<string, unknown> | null | undefined} analysisRaw — analyzer/API payload (snake or camel)
 * @param {IntelligenceOptions} [options]
 * @returns {Record<string, unknown>}
 */
function buildDashboardIntelligence(analysisRaw, options = {}) {
  const analysis = analysisRaw && typeof analysisRaw === 'object' ? { ...analysisRaw } : {};
  const rows = contentRowsFromAnalysis(analysis);
  const keyword = String(
    analysis.display_query ?? analysis.displayQuery ?? analysis.query ?? analysis.main_keyword ?? analysis.mainKeyword ?? '',
  ).trim();
  const mainKeyword = String(analysis.main_keyword ?? analysis.mainKeyword ?? keyword).trim();
  const subKeywords = asStringArray(analysis.sub_keywords ?? analysis.subKeywords);

  const br = sentimentBreakdownFromAnalysis(analysis);
  const overallSentiment = overallSentimentFromBreakdown(br);

  const topComplaints = asStringArray(analysis.top_complaints ?? analysis.topComplaints);
  const topPraise = asStringArray(analysis.top_positive_mentions ?? analysis.topPositiveMentions);

  const topWeaknesses = topComplaints
    .filter((t) => !/^limited\b/i.test(t))
    .slice(0, 6);
  const topStrengths = topPraise
    .filter((t) => !/^limited\b/i.test(t))
    .slice(0, 6);

  const trendingTopics = trendingTopicsFromLists(topStrengths, topWeaknesses);

  const topSignals = topSignalsFromAnalysis(analysis);
  const topRecommendations = buildRecommendations(analysis, options);

  const sorted = [...rows].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  const priorityContent = sorted.slice(0, 5).map((r) => {
    const why =
      r.audienceSentiment.negative > r.audienceSentiment.positive + 10
        ? 'Audience skews negative; worth monitoring.'
        : r.audienceSentiment.positive > r.audienceSentiment.negative + 10
          ? 'Audience skews positive; strong candidate to highlight.'
          : 'Balanced or mixed audience reaction; useful reference point.';
    return {
      title: r.title,
      platform: r.platform,
      url: r.url || null,
      sentiment:
        r.audienceSentiment.negative > r.audienceSentiment.positive
          ? 'negative'
          : r.audienceSentiment.positive > r.audienceSentiment.negative
            ? 'positive'
            : 'neutral',
      whyItMatters: r.priorityReason || why,
      matchedSubKeywords: r.matchedSubKeywords,
      priorityScore: r.priorityScore ?? 0,
      priorityLevel: r.priorityLevel,
      priorityReason: r.priorityReason,
      trendScore: r.trendScore ?? 0,
      trendLevel: r.trendLevel,
      trendReason: r.trendReason,
    };
  });

  const ai = analysis.ai_comment_stats ?? analysis.aiCommentStats;
  const counts = {
    contentItems: rows.length,
    totalContentItemsReported: Number(
      analysis.total_content_items ?? analysis.totalContentItems ?? analysis.total_videos ?? rows.length,
    ),
    commentsAnalyzed: Number(analysis.total_comments_analyzed ?? analysis.totalCommentsAnalyzed ?? 0),
    commentsRaw: ai && typeof ai === 'object' ? Number(ai.raw) || 0 : undefined,
    commentsSentToModel: ai && typeof ai === 'object' ? Number(ai.sent_to_model ?? ai.sentToModel) || 0 : undefined,
  };

  const analysisSourceSummary = analysisSourceSummaryFrom(analysis);
  const localNote = localSentimentSummaryFor(analysis, rows, options);

  return {
    keyword: keyword || mainKeyword,
    mainKeyword: mainKeyword || keyword,
    subKeywords,
    dateRange: options.dateRange ?? null,
    summary: buildExecutiveSummary(analysis, options),
    overallSentiment,
    sentimentBreakdown: br,
    topStrengths,
    topWeaknesses,
    trendingTopics,
    topSignals,
    topRecommendations,
    priorityContent,
    analysisSourceSummary: {
      ...analysisSourceSummary,
      localSentimentNote: localNote,
    },
    counts,
    /** Optional passthrough for debugging (not for end-user copy) */
    _meta: {
      platform: String(analysis.platform ?? 'unknown'),
      cached: Boolean(analysis.cached),
      historyHint: options.historySummary ?? null,
      watchlistHint: options.watchlistNote ?? null,
    },
  };
}

module.exports = {
  buildDashboardIntelligence,
  /** Exposed for tests */
  overallSentimentFromBreakdown,
  contentRowsFromAnalysis,
  computeContentPriority,
  computeContentTrend,
};
