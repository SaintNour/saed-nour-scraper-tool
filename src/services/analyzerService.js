const { searchVideos, fetchVideoComments } = require('./youtubeService');
const { analyzeReviewBatch } = require('./aiService');
const { decodeHtmlEntities } = require('../utils/htmlEntities');
const { filterBatchItemsForAi } = require('./commentFilter');
const analysisCache = require('./analysisCache');
const { recordHeuristicFallback } = require('./openaiFallbackLog');
const searchHistoryService = require('./searchHistoryService');
const { inferLegacyAnalysisSourceFromSummary } = searchHistoryService;
const searchMatch = require('./searchMatch');
const { scanProfile, safety } = require('../config/openaiEnv');
const {
  enrichAnalyzerContentRow,
  attachContentItemsMirror,
} = require('../utils/contentNormalization');
const {
  normalizeDateRangeInput,
  dateRangeCacheKeyPart,
  filterByPublishedAtBounds,
  toRfc3339,
  toPublishedBeforeExclusive,
} = require('../utils/dateRange');
const { applyPriorityToContentRow } = require('./contentPriorityService');
const { applyTrendToContentRow } = require('./contentTrendService');
const { generateAlertsForResults } = require('./contentAlertService');

const MAX_COMMENT_CHARS = 400;
const PLATFORM = 'youtube';
const HISTORY_LIMIT_PER_FLOW = 300;
const NEUTRAL_SENTIMENT = { positive: 0, neutral: 100, negative: 0 };
const SCAN_MODES = new Set(['all_relevant', 'recent_first', 'trend_catcher']);
/** Trend Catcher: minimum trend score (0–100), not priority. */
const TREND_CATCHER_MIN_TREND = 70;

function isAnalyzerSearchDebug() {
  const v = String(process.env.ANALYZER_SEARCH_DEBUG ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Pipeline counts for API transparency and ANALYZER_SEARCH_DEBUG logs.
 * `total_matching_count` here matches the selection input: relevant rows after analysis, before scan-mode filter.
 *
 * @param {Record<string, unknown>} base
 */
function buildCountBreakdown(base) {
  const b = base && typeof base === 'object' ? base : {};
  return {
    max_search_candidates: Number(b.maxSearchCandidates) || 0,
    max_matched_videos: Number(b.maxMatchedVideos) || 0,
    scan_mode: String(b.scanMode || 'all_relevant'),
    profile: b.profile === 'watchlist' ? 'watchlist' : 'manual',
    fetch_pool_unique: Number(b.fetchPoolUnique) || 0,
    after_raw_relevance: Number(b.afterRawRelevance) || 0,
    new_videos_analyzed: Number(b.newVideosAnalyzed) || 0,
    relevant_after_analysis: Number(b.relevantAfterAnalysis) || 0,
    total_matching_count: Number(b.totalMatchingCount) || 0,
    total_after_mode_filter: Number(b.totalAfterModeFilter) || 0,
    displayed_count: Number(b.displayedCount) || 0,
    response_from_cache: Boolean(b.responseFromCache),
    bypass_cache_request: Boolean(b.bypassCacheRequest),
  };
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} payload
 */
function logSearchDebug(label, payload) {
  if (!isAnalyzerSearchDebug()) return;
  console.log(`[analyzeSearch] ${label}`, payload);
}

/**
 * @param {Record<string, unknown>} row
 * @returns {number}
 */
function rowTrendScore(row) {
  const t = row.trend_score;
  if (typeof t === 'number' && Number.isFinite(t)) return t;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** @type {Map<string, Map<string, {
 *   id: string,
 *   query: string,
 *   title: string,
 *   url: string,
 *   platform: string,
 *   contentFormat: 'video' | 'short' | 'unknown',
 *   contentSentimentLabel: 'positive' | 'neutral' | 'negative',
 *   analyzedAt: string
 * }>>} */
const historyByFlow = new Map();

/**
 * Stable key for cache + in-memory flow history (query + platform + sub-keywords + date scope + scan mode).
 */
function buildAnalysisCacheKey({ query, platform, subKeywords, dateKey, scanMode }) {
  const subs = searchMatch.normalizeSubKeywordsList(subKeywords || []);
  const subPart = subs.map((s) => s.toLowerCase()).sort().join('|');
  const dk = dateKey && String(dateKey) !== 'all' ? String(dateKey) : 'all';
  const sm = normalizeScanMode(scanMode);
  return `${String(platform).toLowerCase()}:${String(query).trim().toLowerCase()}::${subPart}::${dk}::${sm}`;
}

/**
 * @param {unknown} raw
 * @returns {'all_relevant' | 'recent_first' | 'trend_catcher'}
 */
function normalizeScanMode(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (SCAN_MODES.has(s)) return /** @type {'all_relevant' | 'recent_first' | 'trend_catcher'} */ (s);
  if (s === 'all relevant') return 'all_relevant';
  if (s === 'recent first') return 'recent_first';
  if (s === 'trend catcher') return 'trend_catcher';
  return 'all_relevant';
}

/**
 * @param {Record<string, unknown>} row
 * @returns {number}
 */
function rowPublishedAtMs(row) {
  const raw = row.published_at || row.publishedAt;
  const ms = raw ? new Date(String(raw)).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {'all_relevant' | 'recent_first' | 'trend_catcher'} scanMode
 * @param {number} cap
 */
function selectRowsByScanMode(rows, scanMode, cap) {
  const totalMatchingCount = rows.length;
  let afterMode = rows;
  if (scanMode === 'recent_first') {
    afterMode = [...rows].sort((a, b) => rowPublishedAtMs(b) - rowPublishedAtMs(a));
  } else if (scanMode === 'trend_catcher') {
    afterMode = [...rows]
      .filter((r) => rowTrendScore(r) >= TREND_CATCHER_MIN_TREND)
      .sort((a, b) => {
        const diff = rowTrendScore(b) - rowTrendScore(a);
        if (diff !== 0) return diff;
        return String(b.id ?? '').localeCompare(String(a.id ?? ''));
      });
    const topSample = [...rows]
      .map((r) => rowTrendScore(r))
      .sort((x, y) => y - x)
      .slice(0, 5);
    console.log('[scanMode:trend_catcher]', {
      scanMode: 'trend_catcher',
      trendThreshold: TREND_CATCHER_MIN_TREND,
      totalMatchingRows: totalMatchingCount,
      rowsPassingTrendThreshold: afterMode.length,
      topTrendScoresSample: topSample,
    });
  }
  const totalAfterModeFilter = afterMode.length;
  const selected = afterMode.slice(0, cap);
  return {
    selected,
    totalMatchingCount,
    totalAfterModeFilter,
    displayedCount: selected.length,
  };
}

function cacheSubKey(subKeywords) {
  return searchMatch
    .normalizeSubKeywordsList(subKeywords || [])
    .map((s) => s.toLowerCase())
    .sort()
    .join('|');
}

/**
 * Merge YouTube search results from main query + limited main+sub combinations.
 */
/**
 * @param {Record<string, string | undefined>} [youtubeSearchOpts] publishedAfter / publishedBefore (RFC 3339)
 */
async function mergeYoutubeCandidates(mainKeyword, subKeywords, apiKey, maxPerQuery, youtubeSearchOpts) {
  const queries = searchMatch.buildYoutubeSearchQueries(mainKeyword, subKeywords);
  const seen = new Set();
  const merged = [];
  const vidOpts = youtubeSearchOpts && typeof youtubeSearchOpts === 'object' ? youtubeSearchOpts : {};
  for (const sq of queries) {
    const batch = await searchVideos(sq, apiKey, { maxResults: maxPerQuery, ...vidOpts });
    for (const v of batch) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      merged.push(v);
    }
  }
  return merged;
}

function trimComment(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return t.length > MAX_COMMENT_CHARS ? `${t.slice(0, MAX_COMMENT_CHARS)}…` : t;
}

function emptyResult(query, summary = 'No videos found for this search.', meta = {}) {
  const subs = searchMatch.normalizeSubKeywordsList(meta.subKeywords || []);
  const scanMode = normalizeScanMode(meta.scanMode);
  const totalMatchingCount = Number(meta.totalMatchingCount) || 0;
  const totalAfterModeFilter = Number(meta.totalAfterModeFilter) || 0;
  const displayedCount = Number(meta.displayedCount) || 0;
  return attachContentItemsMirror({
    query,
    main_keyword: meta.mainKeyword ?? query,
    sub_keywords: subs,
    display_query: meta.displayQuery ?? query,
    platform: PLATFORM,
    total_videos: 0,
    total_comments_analyzed: 0,
    sentiment: { positive: 0, neutral: 100, negative: 0 },
    overall_sentiment: 'neutral',
    summary,
    top_complaints: [],
    top_positive_mentions: [],
    insight_drivers: { why_negative: [], why_positive: [] },
    recommended_actions: [],
    videos: [],
    analysis_source: 'empty',
    alerts: [],
    scan_mode: scanMode,
    total_matching_count: totalMatchingCount,
    total_after_mode_filter: totalAfterModeFilter,
    displayed_count: displayedCount,
    trend_catcher_min_trend: TREND_CATCHER_MIN_TREND,
    ...(meta.dateRangeWire ? { date_range: meta.dateRangeWire } : {}),
    ...(meta.count_breakdown ? { count_breakdown: meta.count_breakdown } : {}),
  });
}

function readFlowHistory(flowKey) {
  if (!historyByFlow.has(flowKey)) {
    historyByFlow.set(flowKey, new Map());
  }
  return historyByFlow.get(flowKey);
}

function historyEntries(flowKey) {
  return [...readFlowHistory(flowKey).values()];
}

function addHistoryItems(flowKey, query, videos) {
  const flowHistory = readFlowHistory(flowKey);
  const now = new Date().toISOString();
  for (const v of videos) {
    flowHistory.set(v.id, {
      id: v.id,
      query,
      title: v.title,
      url: v.url || '',
      platform: PLATFORM,
      contentFormat: v.content_format || 'unknown',
      contentSentimentLabel: v.content_sentiment_label || 'neutral',
      analyzedAt: now,
    });
  }

  if (flowHistory.size <= HISTORY_LIMIT_PER_FLOW) return;
  const trimmed = [...flowHistory.entries()]
    .sort((a, b) => a[1].analyzedAt.localeCompare(b[1].analyzedAt))
    .slice(-HISTORY_LIMIT_PER_FLOW);
  historyByFlow.set(flowKey, new Map(trimmed));
}

function buildNeutralFallback(query, videos, items, totalCommentsAnalyzed, meta = {}) {
  const subs = searchMatch.normalizeSubKeywordsList(meta.subKeywords || []);
  const analyzedAt = new Date().toISOString();
  const mapped = videos.map((v, i) => {
    const row = {
      id: v.id,
      title: decodeHtmlEntities(v.title),
      description: v.description || '',
      url: v.url,
      published_at: v.published_at || v.publishedAt || null,
      publishedAt: v.published_at || v.publishedAt || null,
      view_count: typeof v.view_count === 'number' ? v.view_count : 0,
      like_count: typeof v.like_count === 'number' ? v.like_count : 0,
      comment_count: typeof v.comment_count === 'number' ? v.comment_count : 0,
      subscriber_count: typeof v.subscriber_count === 'number' ? v.subscriber_count : 0,
      content_format: v.content_format || 'unknown',
      contentFormat: v.content_format || 'unknown',
      comments_analyzed: items[i].comments.length,
      content_summary: '',
      contentSummary: '',
      content_sentiment_label: 'neutral',
      contentSentimentLabel: 'neutral',
      audience_sentiment: { ...NEUTRAL_SENTIMENT },
      audienceSentiment: { ...NEUTRAL_SENTIMENT },
      sentiment: { ...NEUTRAL_SENTIMENT },
      analyzed_at: analyzedAt,
      analyzedAt,
    };
    const m = searchMatch.evaluateVideoMatch(query, subs, row);
    const withMeta = {
      ...row,
      match_meta: {
        mainMatched: m.mainMatched,
        matchedSubKeywords: m.matchedSubKeywords,
        isRelevant: m.isRelevant,
        matchSummary: m.matchSummary,
      },
    };
    return enrichAnalyzerContentRow(PLATFORM, withMeta);
  });
  return attachContentItemsMirror({
    query,
    main_keyword: meta.mainKeyword ?? query,
    sub_keywords: subs,
    display_query: meta.displayQuery ?? query,
    platform: PLATFORM,
    total_videos: videos.length,
    total_comments_analyzed: totalCommentsAnalyzed,
    sentiment: { ...NEUTRAL_SENTIMENT },
    overall_sentiment: 'neutral',
    summary:
      'Automated sentiment analysis was unavailable. Showing collected comments only; sentiment defaults to neutral.',
    top_complaints: [],
    top_positive_mentions: [],
    insight_drivers: { why_negative: [], why_positive: [] },
    recommended_actions: [],
    analysis_source: 'partial_neutral',
    videos: mapped,
    ...(meta.dateRangeWire ? { date_range: meta.dateRangeWire } : {}),
  });
}

function allHistoryEntries() {
  return [...historyByFlow.values()]
    .flatMap((flowMap) => [...flowMap.values()])
    .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

/**
 * Persist search activity + per-result classification (disk). Does not block analysis on failure.
 * @param {Parameters<typeof searchHistoryService.recordSearchCompletion>[0]} opts
 */
function persistHistorySafe(opts) {
  try {
    searchHistoryService.recordSearchCompletion(opts);
  } catch (e) {
    console.error('[history] persist failed', e);
  }
}

/**
 * When history is skipped (e.g. watchlist probe), still attach priority + trend for API consumers.
 * @param {Array<Record<string, unknown>> | null | undefined} videos
 * @param {boolean} skipHistory
 */
function applyPriorityAndTrendWhenHistorySkipped(videos, skipHistory) {
  if (!skipHistory || !Array.isArray(videos)) return;
  const now = new Date();
  for (const v of videos) {
    if (v && typeof v === 'object') {
      applyPriorityToContentRow(/** @type {Record<string, unknown>} */ (v), { now });
      applyTrendToContentRow(/** @type {Record<string, unknown>} */ (v), { now });
    }
  }
}

function historyPayloadFields(q, subKeywords, displayQuery) {
  return {
    mainKeyword: q,
    subKeywords,
    displayQuery,
  };
}

/**
 * @param {object | null | undefined} batch
 * @returns {'openai' | 'local_sentiment' | 'heuristic'}
 */
function analysisSourceFromBatch(batch) {
  if (batch && typeof batch === 'object' && batch._analysis_mode === 'openai') {
    return 'openai';
  }
  if (batch && typeof batch === 'object' && batch._analysis_mode === 'local_sentiment') {
    return 'local_sentiment';
  }
  return 'heuristic';
}

/**
 * @param {object} cached
 * @returns {'openai' | 'heuristic' | 'unknown'}
 */
function analysisSourceFromCachedPayload(cached) {
  if (!cached || typeof cached !== 'object') return 'unknown';
  if (cached._analysis_mode === 'openai') return 'openai';
  if (cached._analysis_mode === 'local_sentiment') return 'local_sentiment';
  if (cached._analysis_mode === 'heuristic') return 'heuristic';
  const fromSummary = inferLegacyAnalysisSourceFromSummary(cached.summary);
  if (fromSummary === 'heuristic') return 'heuristic';
  return 'unknown';
}

/**
 * User-facing label when serving a TTL cache hit (distinct from live openai/heuristic).
 * @param {object} cached
 * @param {string} resolved
 * @returns {'cached_openai' | 'cached_heuristic'}
 */
function analysisSourceLabelForCached(cached, resolved) {
  const base =
    resolved === 'unknown' ? inferLegacyAnalysisSourceFromSummary(cached.summary) : resolved;
  if (cached._analysis_mode === 'openai' || base === 'openai') return 'cached_openai';
  if (cached._analysis_mode === 'local_sentiment' || base === 'local_sentiment') {
    return 'cached_local_sentiment';
  }
  if (cached._analysis_mode === 'heuristic' || base === 'heuristic') return 'cached_heuristic';
  return 'cached_openai';
}

/**
 * @param {null | ReturnType<typeof normalizeDateRangeInput>} dr
 */
function toWireDateRange(dr) {
  if (!dr || dr.preset === 'all') return null;
  return {
    preset: dr.preset,
    label: dr.label,
    start_date: dr.startDate,
    end_date: dr.endDate,
    timezone_note:
      'Preset ranges use UTC calendar boundaries. Custom ranges use explicit ISO-8601 instants.',
  };
}

/**
 * @param {string} query — main keyword
 * @param {{
 *   subKeywords?: string[],
 *   youtubeApiKey?: string,
 *   bypassCache?: boolean,
 *   skipHistoryPersist?: boolean,
 *   scanProfile?: 'manual' | 'watchlist',
 *   scanMode?: 'all_relevant' | 'recent_first' | 'trend_catcher',
 *   dateRange?: Record<string, unknown>,
 * }} [options]
 */
async function analyzeSearchQuery(query, options = {}) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) {
    throw new Error('Search query is required');
  }

  const profileName = options.scanProfile === 'watchlist' ? 'watchlist' : 'manual';
  const profile = scanProfile(profileName);
  const maxMatchedVideos = profile.maxMatchedVideos;
  const searchPoolSize = profile.maxSearchCandidates;
  const maxCommentsPerVideo = profile.maxCommentsPerVideo;

  const subKeywords = searchMatch.normalizeSubKeywordsList(options.subKeywords || []);
  const scanMode = normalizeScanMode(options.scanMode);
  const displayQuery =
    subKeywords.length > 0 ? `${q} (+${subKeywords.join(', ')})` : q;
  const dateRangeNorm =
    normalizeDateRangeInput(options.dateRange) ?? normalizeDateRangeInput({ preset: 'all' });
  const dateCacheKey = dateRangeCacheKeyPart(dateRangeNorm);
  const dateRangeWire = toWireDateRange(dateRangeNorm);
  const hp = {
    ...historyPayloadFields(q, subKeywords, displayQuery),
    ...(dateRangeWire ? { dateRange: dateRangeWire } : {}),
  };
  const subCacheKey = cacheSubKey(subKeywords);
  const fullCacheKey = `${subCacheKey}|${dateCacheKey}|${scanMode}`;

  const start = Date.now();
  const bypassCache = Boolean(options.bypassCache);
  const skipHistory = Boolean(options.skipHistoryPersist);

  if (!bypassCache) {
    const cached = analysisCache.get(q, PLATFORM, fullCacheKey);
    if (cached) {
      const durationMs = Date.now() - start;
      const videoCopy = (cached.videos || cached.content_items || []).map((v) =>
        enrichAnalyzerContentRow(PLATFORM, { ...v }),
      );
      const src = analysisSourceFromCachedPayload(cached);
      const analysisSource =
        src === 'unknown' ? inferLegacyAnalysisSourceFromSummary(cached.summary) : src;
      const analysisSourceLabel = analysisSourceLabelForCached(cached, src);
      if (!skipHistory) {
        persistHistorySafe({
          query: q,
          ...hp,
          platform: PLATFORM,
          videos: videoCopy,
          summary: cached.summary,
          overall_sentiment: cached.overall_sentiment,
          total_comments_analyzed: cached.total_comments_analyzed,
          status: 'completed',
          durationMs,
          searchType: 'search',
          source: 'manual',
          cached: true,
          analysisSource: analysisSourceLabel,
        });
      }
      applyPriorityAndTrendWhenHistorySkipped(videoCopy, skipHistory);
      logSearchDebug('cache-hit', {
        query: q,
        scanMode,
        profile: profileName,
        cacheKey: fullCacheKey,
        total_matching_count: cached.total_matching_count,
        has_count_breakdown: Boolean(cached.count_breakdown),
      });
      const cachedBreakdown =
        cached.count_breakdown && typeof cached.count_breakdown === 'object'
          ? { ...cached.count_breakdown, response_from_cache: true, bypass_cache_request: bypassCache }
          : null;
      const cachedOut = attachContentItemsMirror({
        ...cached,
        videos: videoCopy,
        analysis_source: analysisSourceLabel,
        ...(cachedBreakdown ? { count_breakdown: cachedBreakdown } : {}),
      });
      return {
        ...cachedOut,
        alerts: generateAlertsForResults(videoCopy, { maxAlerts: 8 }),
      };
    }
  }

  const youtubeApiKey = options.youtubeApiKey || process.env.YOUTUBE_API_KEY;
  if (!youtubeApiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured');
  }

  const flowKey = buildAnalysisCacheKey({
    query: q,
    platform: PLATFORM,
    subKeywords,
    dateKey: dateCacheKey,
    scanMode,
  });
  const flowHistory = readFlowHistory(flowKey);

  /** @type {Record<string, string>} */
  const ytSearch = {};
  if (dateRangeNorm && dateRangeNorm.startMs != null && dateRangeNorm.endMs != null) {
    ytSearch.publishedAfter = toRfc3339(dateRangeNorm.startMs);
    ytSearch.publishedBefore = toPublishedBeforeExclusive(dateRangeNorm.endMs);
  }

  let rawMerged = await mergeYoutubeCandidates(q, subKeywords, youtubeApiKey, searchPoolSize, ytSearch);
  if (dateRangeNorm && dateRangeNorm.startMs != null && dateRangeNorm.endMs != null) {
    rawMerged = filterByPublishedAtBounds(rawMerged, dateRangeNorm.startMs, dateRangeNorm.endMs).kept;
  }
  const relevanceRaw = rawMerged.filter((v) => searchMatch.evaluateRawVideoMatch(q, subKeywords, v).isRelevant);
  const candidates = relevanceRaw.filter((v) => !flowHistory.has(v.id));

  const fetchPoolUnique = rawMerged.length;
  const afterRawRelevance = relevanceRaw.length;
  const newVideosAnalyzed = candidates.length;

  logSearchDebug('youtube-pool', {
    query: q,
    scanMode,
    maxSearchCandidates: searchPoolSize,
    maxMatchedVideos,
    fetch_pool_unique: fetchPoolUnique,
    after_raw_relevance: afterRawRelevance,
    new_not_in_history: newVideosAnalyzed,
    bypass_cache_request: bypassCache,
  });

  if (candidates.length === 0) {
    let msg = historyEntries(flowKey).length
      ? 'No new relevant videos for this search yet. Try different keywords or a broader sub-topic.'
      : 'No videos found for this search.';
    if (subKeywords.length > 0 && rawMerged.length > 0 && relevanceRaw.length === 0) {
      msg =
        'No videos matched your main keyword and at least one sub-keyword in title or description. Try adjusting terms.';
    } else if (rawMerged.length === 0) {
      msg =
        dateRangeNorm && dateRangeNorm.preset !== 'all'
          ? 'No videos found in this date range. Try a wider window or All time.'
          : 'No videos found for this search.';
    }
    const emptyCb = buildCountBreakdown({
      maxSearchCandidates: searchPoolSize,
      maxMatchedVideos,
      scanMode,
      profile: profileName,
      fetchPoolUnique,
      afterRawRelevance,
      newVideosAnalyzed: 0,
      relevantAfterAnalysis: 0,
      totalMatchingCount: 0,
      totalAfterModeFilter: 0,
      displayedCount: 0,
      responseFromCache: false,
      bypassCacheRequest: bypassCache,
    });
    logSearchDebug('no-candidates', emptyCb);
    const empty = emptyResult(q, msg, {
      ...hp,
      dateRangeWire,
      scanMode,
      totalMatchingCount: 0,
      totalAfterModeFilter: 0,
      displayedCount: 0,
      count_breakdown: emptyCb,
    });
    if (!skipHistory) {
      persistHistorySafe({
        query: q,
        ...hp,
        platform: PLATFORM,
        videos: [],
        summary: empty.summary,
        overall_sentiment: empty.overall_sentiment,
        total_comments_analyzed: 0,
        status: 'completed',
        durationMs: Date.now() - start,
        searchType: 'search',
        source: 'manual',
        cached: false,
        analysisSource: 'empty',
      });
    }
    return empty;
  }

  const videos = candidates;

  const settled = await Promise.allSettled(
    videos.map((v) =>
      fetchVideoComments(v.id, youtubeApiKey, {
        maxResults: Math.min(safety.maxCommentsPerVideoFetch, maxCommentsPerVideo),
      }),
    ),
  );

  const commentBatches = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));

  let totalCommentsAnalyzed = 0;
  const items = videos.map((v, i) => {
    const trimmed = commentBatches[i].map(trimComment).filter(Boolean);
    totalCommentsAnalyzed += trimmed.length;
    return {
      video_id: v.id,
      title: v.title,
      description: v.description || '',
      comments: trimmed,
    };
  });

  const { items: itemsForAi, stats: aiFilterStats } = filterBatchItemsForAi(items, {
    maxPerVideo: Math.min(safety.maxCommentsPerVideoFetch, maxCommentsPerVideo),
    maxTotal: safety.maxCommentsTotalPerScan,
  });

  let batch;
  try {
    batch = await analyzeReviewBatch(
      {
        query: displayQuery,
        platform: PLATFORM,
        items: itemsForAi,
      },
      { skipPremiumSummary: profileName === 'watchlist' },
    );
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn('[analysis] fallback reason:', 'analyzeReviewBatch_exception', msg);
    console.error('[analyzer] analyzeReviewBatch failed:', msg);
    recordHeuristicFallback('exception', msg);
    const fb = buildNeutralFallback(q, videos, items, totalCommentsAnalyzed, {
      ...hp,
      dateRangeWire,
      scanMode,
    });
    const fbRows = Array.isArray(fb.videos) ? [...fb.videos] : [];
    fbRows.forEach((v) => {
      applyPriorityToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date() });
      applyTrendToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date() });
    });
    const fbSelection = selectRowsByScanMode(fbRows, scanMode, maxMatchedVideos);
    const fbSummary =
      scanMode === 'trend_catcher' && fbSelection.displayedCount === 0
        ? `Automated sentiment analysis was unavailable. Trend Catcher found no items with trend score ${TREND_CATCHER_MIN_TREND}+ from ${fbSelection.totalMatchingCount} matching videos.`
        : fb.summary;
    const fbCb = buildCountBreakdown({
      maxSearchCandidates: searchPoolSize,
      maxMatchedVideos,
      scanMode,
      profile: profileName,
      fetchPoolUnique,
      afterRawRelevance,
      newVideosAnalyzed,
      relevantAfterAnalysis: fbSelection.totalMatchingCount,
      totalMatchingCount: fbSelection.totalMatchingCount,
      totalAfterModeFilter: fbSelection.totalAfterModeFilter,
      displayedCount: fbSelection.displayedCount,
      responseFromCache: false,
      bypassCacheRequest: bypassCache,
    });
    logSearchDebug('fallback-neutral', { ...fbCb, reason: 'analyzeReviewBatch_exception' });
    const fbOut = attachContentItemsMirror({
      ...fb,
      summary: fbSummary,
      videos: fbSelection.selected,
      total_videos: fbSelection.displayedCount,
      total_matching_count: fbSelection.totalMatchingCount,
      total_after_mode_filter: fbSelection.totalAfterModeFilter,
      displayed_count: fbSelection.displayedCount,
      scan_mode: scanMode,
      trend_catcher_min_trend: TREND_CATCHER_MIN_TREND,
      total_comments_analyzed: fbSelection.selected.reduce(
        (acc, row) => acc + (Number(row.comments_analyzed) || 0),
        0,
      ),
      count_breakdown: fbCb,
    });
    if (!skipHistory) {
      persistHistorySafe({
        query: q,
        ...hp,
        platform: PLATFORM,
        videos: fbOut.videos,
        summary: fbOut.summary,
        overall_sentiment: fbOut.overall_sentiment,
        total_comments_analyzed: fbOut.total_comments_analyzed,
        status: 'partial',
        durationMs: Date.now() - start,
        searchType: 'search',
        source: 'manual',
        cached: false,
        analysisSource: 'partial_neutral',
      });
    }
    applyPriorityAndTrendWhenHistorySkipped(fbOut.videos, skipHistory);
    return {
      ...fbOut,
      alerts: generateAlertsForResults(fbOut.videos, { maxAlerts: 8 }),
    };
  }

  const byId = new Map(batch.videos.map((row) => [row.video_id, row]));
  const analyzedAt = new Date().toISOString();
  let mergedVideos = videos.map((v, i) => {
    const row = byId.get(v.id);
    const audienceSentiment = row?.audience_sentiment ?? row?.sentiment ?? { ...NEUTRAL_SENTIMENT };
    return {
      id: v.id,
      title: decodeHtmlEntities(v.title),
      description: v.description || '',
      url: v.url,
      published_at: v.published_at || v.publishedAt || null,
      publishedAt: v.published_at || v.publishedAt || null,
      view_count: typeof v.view_count === 'number' ? v.view_count : 0,
      like_count: typeof v.like_count === 'number' ? v.like_count : 0,
      comment_count: typeof v.comment_count === 'number' ? v.comment_count : 0,
      subscriber_count: typeof v.subscriber_count === 'number' ? v.subscriber_count : 0,
      content_format: v.content_format || 'unknown',
      contentFormat: v.content_format || 'unknown',
      comments_analyzed: items[i].comments.length,
      content_summary: decodeHtmlEntities(String(row?.content_summary ?? '')),
      contentSummary: decodeHtmlEntities(String(row?.content_summary ?? '')),
      video_insight_summary:
        row?.video_insight_summary && typeof row.video_insight_summary === 'object'
          ? {
              summary: decodeHtmlEntities(String(row.video_insight_summary.summary ?? '')),
              video_tone:
                row.video_insight_summary.video_tone === 'positive' ||
                row.video_insight_summary.video_tone === 'negative' ||
                row.video_insight_summary.video_tone === 'neutral'
                  ? row.video_insight_summary.video_tone
                  : 'neutral',
            }
          : undefined,
      content_sentiment_label: row?.content_sentiment_label ?? 'neutral',
      contentSentimentLabel: row?.content_sentiment_label ?? 'neutral',
      audience_sentiment: audienceSentiment,
      audienceSentiment,
      sentiment: audienceSentiment,
      analyzed_at: analyzedAt,
      analyzedAt,
    };
  });

  mergedVideos = mergedVideos
    .map((row) => {
      const m = searchMatch.evaluateVideoMatch(q, subKeywords, row);
      return enrichAnalyzerContentRow(PLATFORM, {
        ...row,
        match_meta: {
          mainMatched: m.mainMatched,
          matchedSubKeywords: m.matchedSubKeywords,
          isRelevant: m.isRelevant,
          matchSummary: m.matchSummary,
        },
      });
    })
    .filter((row) => row.match_meta.isRelevant);

  if (mergedVideos.length === 0) {
    const msg =
      subKeywords.length > 0
        ? 'No videos remained relevant after analysis (main + sub-keywords). Try broader sub-terms.'
        : 'No relevant videos after analysis.';
    mergedVideos.forEach((v) => {
      applyPriorityToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date() });
      applyTrendToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date() });
    });

    const selectedMeta = selectRowsByScanMode(mergedVideos, scanMode, maxMatchedVideos);
    const emptyMsg =
      scanMode === 'trend_catcher' && selectedMeta.totalMatchingCount > 0
        ? `Trend Catcher found no items with trend score ${TREND_CATCHER_MIN_TREND}+ in ${selectedMeta.totalMatchingCount} matching videos. Try All Relevant or Recent First.`
        : msg;
    const emptyCbPost = buildCountBreakdown({
      maxSearchCandidates: searchPoolSize,
      maxMatchedVideos,
      scanMode,
      profile: profileName,
      fetchPoolUnique,
      afterRawRelevance,
      newVideosAnalyzed,
      relevantAfterAnalysis: 0,
      totalMatchingCount: selectedMeta.totalMatchingCount,
      totalAfterModeFilter: selectedMeta.totalAfterModeFilter,
      displayedCount: 0,
      responseFromCache: false,
      bypassCacheRequest: bypassCache,
    });
    logSearchDebug('post-analysis-none-relevant', emptyCbPost);
    const empty = emptyResult(q, emptyMsg, {
      ...hp,
      dateRangeWire,
      scanMode,
      totalMatchingCount: selectedMeta.totalMatchingCount,
      totalAfterModeFilter: selectedMeta.totalAfterModeFilter,
      displayedCount: 0,
      count_breakdown: emptyCbPost,
    });
    if (!skipHistory) {
      persistHistorySafe({
        query: q,
        ...hp,
        platform: PLATFORM,
        videos: [],
        summary: empty.summary,
        overall_sentiment: empty.overall_sentiment,
        total_comments_analyzed: 0,
        status: 'completed',
        durationMs: Date.now() - start,
        searchType: 'search',
        source: 'manual',
        cached: false,
        analysisSource: 'empty',
      });
    }
    return empty;
  }

  mergedVideos.forEach((v) => {
    applyPriorityToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date() });
    applyTrendToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date() });
  });

  const selection = selectRowsByScanMode(mergedVideos, scanMode, maxMatchedVideos);
  const selectedVideos = selection.selected;

  if (selectedVideos.length === 0) {
    const emptyCbScan = buildCountBreakdown({
      maxSearchCandidates: searchPoolSize,
      maxMatchedVideos,
      scanMode,
      profile: profileName,
      fetchPoolUnique,
      afterRawRelevance,
      newVideosAnalyzed,
      relevantAfterAnalysis: selection.totalMatchingCount,
      totalMatchingCount: selection.totalMatchingCount,
      totalAfterModeFilter: selection.totalAfterModeFilter,
      displayedCount: 0,
      responseFromCache: false,
      bypassCacheRequest: bypassCache,
    });
    logSearchDebug('scan-mode-yielded-none', emptyCbScan);
    const empty = emptyResult(
      q,
      `No items matched Scan Mode "${scanMode.replace(/_/g, ' ')}" in this run.`,
      {
        ...hp,
        dateRangeWire,
        scanMode,
        totalMatchingCount: selection.totalMatchingCount,
        totalAfterModeFilter: selection.totalAfterModeFilter,
        displayedCount: 0,
        count_breakdown: emptyCbScan,
      },
    );
    if (!skipHistory) {
      persistHistorySafe({
        query: q,
        ...hp,
        platform: PLATFORM,
        videos: [],
        summary: empty.summary,
        overall_sentiment: empty.overall_sentiment,
        total_comments_analyzed: 0,
        status: 'completed',
        durationMs: Date.now() - start,
        searchType: 'search',
        source: 'manual',
        cached: false,
        analysisSource: 'empty',
      });
    }
    return empty;
  }

  totalCommentsAnalyzed = selectedVideos.reduce((acc, row) => acc + (row.comments_analyzed || 0), 0);

  addHistoryItems(flowKey, q, selectedVideos);

  const successCb = buildCountBreakdown({
    maxSearchCandidates: searchPoolSize,
    maxMatchedVideos,
    scanMode,
    profile: profileName,
    fetchPoolUnique,
    afterRawRelevance,
    newVideosAnalyzed,
    relevantAfterAnalysis: selection.totalMatchingCount,
    totalMatchingCount: selection.totalMatchingCount,
    totalAfterModeFilter: selection.totalAfterModeFilter,
    displayedCount: selection.displayedCount,
    responseFromCache: false,
    bypassCacheRequest: bypassCache,
  });
  logSearchDebug('analysis-complete', successCb);

  const payload = attachContentItemsMirror({
    query: q,
    main_keyword: q,
    sub_keywords: subKeywords,
    display_query: displayQuery,
    platform: PLATFORM,
    total_videos: selectedVideos.length,
    total_matching_count: selection.totalMatchingCount,
    total_after_mode_filter: selection.totalAfterModeFilter,
    displayed_count: selection.displayedCount,
    scan_mode: scanMode,
    trend_catcher_min_trend: TREND_CATCHER_MIN_TREND,
    total_comments_analyzed: totalCommentsAnalyzed,
    count_breakdown: successCb,
    sentiment: {
      positive: batch.overall_sentiment.positive,
      neutral: batch.overall_sentiment.neutral,
      negative: batch.overall_sentiment.negative,
    },
    overall_sentiment: batch.overall_sentiment_label,
    summary: batch.summary,
    top_complaints: batch.top_complaints,
    top_positive_mentions: batch.top_positive_mentions,
    insight_drivers: batch.insight_drivers || { why_negative: [], why_positive: [] },
    recommended_actions: batch.recommended_actions || [],
    videos: selectedVideos,
    ai_comment_stats: {
      raw: aiFilterStats.rawTotal,
      sent_to_model: aiFilterStats.sentToAi,
      dropped_noise: aiFilterStats.droppedNoise,
    },
    cached: false,
    analysis_source: analysisSourceFromBatch(batch),
    _analysis_mode: batch._analysis_mode,
    _analysis_model: batch._analysis_model,
    ...(dateRangeWire ? { date_range: dateRangeWire } : {}),
  });

  if (!skipHistory) {
    persistHistorySafe({
      query: q,
      ...hp,
      platform: PLATFORM,
      videos: payload.videos,
      summary: payload.summary,
      overall_sentiment: payload.overall_sentiment,
      total_comments_analyzed: payload.total_comments_analyzed,
      status: 'completed',
      durationMs: Date.now() - start,
      searchType: 'search',
      source: 'manual',
      cached: false,
      analysisSource: analysisSourceFromBatch(batch),
    });
  }

  applyPriorityAndTrendWhenHistorySkipped(payload.videos, skipHistory);

  const payloadOut = {
    ...payload,
    alerts: generateAlertsForResults(payload.videos, { maxAlerts: 8 }),
  };

  if (!bypassCache) {
    analysisCache.set(q, PLATFORM, payloadOut, fullCacheKey);
  }

  return payloadOut;
}

module.exports = {
  analyzeSearchQuery,
  buildAnalysisCacheKey,
  getAnalysisHistory: (query, platform = PLATFORM, subKeywords = []) =>
    historyEntries(buildAnalysisCacheKey({ query, platform, subKeywords, dateKey: 'all' })),
  getAllAnalysisHistory: () => allHistoryEntries(),
};
