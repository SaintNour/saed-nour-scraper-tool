const historyStore = require('./historyStore');
const searchMatch = require('./searchMatch');
const { applyPriorityToContentRow } = require('./contentPriorityService');
const { applyTrendToContentRow } = require('./contentTrendService');
const { isOpenAiEnabled } = require('../config/openaiEnv');
const {
  extractYoutubeVideoId,
  canonicalYoutubeWatchUrl,
  stableContentKey,
  dedupeContentRows,
} = require('../utils/contentKeys');

const PLATFORM = 'youtube';

/**
 * Legacy rows without `analysisSource`: infer from summary text (best-effort).
 * @param {string | null | undefined} summary
 * @returns {'openai' | 'heuristic' | 'partial_neutral' | 'empty' | 'unknown'}
 */
function inferLegacyAnalysisSourceFromSummary(summary) {
  const s = String(summary || '');
  if (!s.trim()) return 'unknown';
  if (s.includes('Automated sentiment analysis was unavailable')) return 'partial_neutral';
  if (s.includes('Development mock:')) return 'heuristic';
  if (s.includes('Mock mode is enabled')) return 'heuristic';
  if (s.includes('OpenAI is disabled or not configured')) return 'heuristic';
  if (s.includes('Heuristic scoring only')) return 'heuristic';
  if (s.includes('Daily token budget prevented')) return 'heuristic';
  if (s.includes('heuristic scoring only')) return 'heuristic';
  return 'unknown';
}

/**
 * API-facing decoration so the UI can label legacy heuristic rows when live OpenAI is on.
 * @param {Record<string, unknown>} item
 */
function decorateHistoryItemForClient(item) {
  const stored = item.analysisSource;
  const inferred = !stored;
  const source =
    typeof stored === 'string' && stored
      ? stored
      : inferLegacyAnalysisSourceFromSummary(
          typeof item.summary === 'string' ? item.summary : null,
        );

  /** @type {string | null} */
  let staleHeuristicNote = null;
  if (isOpenAiEnabled()) {
    if (source === 'heuristic' || source === 'cached_heuristic') {
      staleHeuristicNote = inferred
        ? 'Legacy entry: summary matches heuristic output (not a live OpenAI run).'
        : 'Heuristic scoring (not live OpenAI).';
    } else if (source === 'partial_neutral') {
      staleHeuristicNote =
        'Fallback analysis (sentiment neutralized); live model was unavailable for this run.';
    }
  }

  return {
    ...item,
    analysisSource: source,
    analysisSourceInferred: inferred,
    staleHeuristicNote,
  };
}

/**
 * @param {object | null | undefined} prev
 * @param {object} next
 * @returns {boolean}
 */
function isMateriallyChanged(prev, next) {
  if (!prev) return false;
  const sa = (s) => String(s ?? '').trim();
  if (sa(prev.summary) !== sa(next.summary)) return true;
  if (sa(prev.sentiment) !== sa(next.sentiment)) return true;
  if (sa(prev.title) !== sa(next.title)) return true;
  const pc =
    prev.metrics?.commentsCount ?? prev.metrics?.comments ?? prev.metrics?.commentCount ?? null;
  const nc =
    next.metrics?.commentsCount ?? next.metrics?.comments ?? next.metrics?.commentCount ?? null;
  if (pc !== null && nc !== null && Number(nc) >= Number(pc) + 5) return true;
  if (pc !== null && nc !== null && Number(nc) > Number(pc) * 1.25) return true;
  return false;
}

/**
 * Find latest prior saved result for this platform + video id (any search).
 * @param {ReturnType<historyStore['load']>} state
 * @param {string} platform
 * @param {string | null} videoId
 * @param {string | null} canonicalUrl
 * @returns {object | null}
 */
function findLatestPriorResult(state, platform, videoId, canonicalUrl, contentId) {
  const p = String(platform).toLowerCase();
  const stableId = videoId || contentId;
  const key =
    stableId && p === 'youtube'
      ? `${p}:${stableId}`
      : canonicalUrl
        ? `${p}:url:${canonicalUrl}`
        : null;
  if (key && state.resultIndex[key]) {
    const rid = state.resultIndex[key];
    const found = state.results.find((r) => r.id === rid);
    if (found) return found;
  }
  let best = null;
  for (const r of state.results) {
    if (String(r.platform).toLowerCase() !== p) continue;
    const rid = r.videoId || r.contentId;
    if (stableId && rid === stableId) {
      if (!best || r.lastSeenAt > best.lastSeenAt) best = r;
    }
  }
  return best;
}

/**
 * @param {object} video — wire row (snake_case + camelCase tolerant)
 * @param {string} platform
 */
function matchedSubKeywordsFromVideo(video) {
  if (video && typeof video === 'object' && video.match_meta && Array.isArray(video.match_meta.matchedSubKeywords)) {
    return video.match_meta.matchedSubKeywords;
  }
  return [];
}

function snapshotFromVideo(video, platform) {
  const url = typeof video.url === 'string' ? video.url : '';
  const id = typeof video.id === 'string' ? video.id : String(video.id ?? '');
  const videoId =
    platform === 'youtube' ? extractYoutubeVideoId(url, id) : id || null;
  const canonicalFromRow =
    typeof video.canonical_url === 'string' && video.canonical_url.trim()
      ? video.canonical_url.trim()
      : null;
  const title = typeof video.title === 'string' ? video.title : String(video.title ?? '');
  const summary =
    typeof video.content_summary === 'string'
      ? video.content_summary
      : typeof video.contentSummary === 'string'
        ? video.contentSummary
        : '';
  const sentiment =
    typeof video.content_sentiment_label === 'string'
      ? video.content_sentiment_label
      : typeof video.contentSentimentLabel === 'string'
        ? video.contentSentimentLabel
        : 'neutral';
  const comments =
    typeof video.comments_analyzed === 'number'
      ? video.comments_analyzed
      : typeof video.commentsAnalyzed === 'number'
        ? video.commentsAnalyzed
        : 0;
  const m =
    video.metrics && typeof video.metrics === 'object' ? video.metrics : {};
  const viewCount =
    m.view_count != null ? Number(m.view_count) : m.views != null ? Number(m.views) : null;
  const likeCount =
    m.like_count != null ? Number(m.like_count) : m.likes != null ? Number(m.likes) : null;
  const contentType =
    typeof video.content_type === 'string'
      ? video.content_type
      : typeof video.content_format === 'string'
        ? video.content_format
        : typeof video.contentFormat === 'string'
          ? video.contentFormat
          : 'unknown';

  return {
    videoId,
    /** Same as videoId for YouTube; generic alias for other platforms. */
    contentId: videoId || id || null,
    contentType,
    canonicalUrl: canonicalFromRow || (videoId ? canonicalYoutubeWatchUrl(videoId) : url || null),
    title,
    summary,
    sentiment,
    metrics: {
      views: viewCount,
      likes: likeCount,
      comments: comments,
      commentsCount: comments,
      viewCount,
      likeCount,
      commentCount: comments,
      shareCount: m.share_count != null ? Number(m.share_count) : null,
      creatorFollowerCount:
        m.creator_follower_count != null ? Number(m.creator_follower_count) : null,
    },
  };
}

/**
 * Classify and attach `result_classification` to each video; persist history + results.
 * Mutates `videos` array items in place.
 *
 * @param {{
 *   query: string,
 *   platform?: string,
 *   videos: Array<Record<string, unknown>>,
 *   summary?: string,
 *   overall_sentiment?: string,
 *   total_videos?: number,
 *   total_comments_analyzed?: number,
 *   status?: string,
 *   durationMs?: number,
 *   searchType?: string,
 *   cached?: boolean,
 *   source?: 'manual' | 'watchlist',
 *   trackId?: string | null,
 *   mainKeyword?: string,
 *   subKeywords?: string[],
 *   selectedSubKeyword?: (string|null),
 *   displayQuery?: string,
 *   analysisSource?: string,
 * }} opts
 * @returns {{ historyId: string, videos: Array<Record<string, unknown>> }}
 */
function recordSearchCompletion(opts) {
  const platform = String(opts.platform || PLATFORM).toLowerCase();
  const query = String(opts.query || '').trim();
  if (!query) {
    return { historyId: '', videos: opts.videos || [] };
  }

  const subKeywords = searchMatch.normalizeSubKeywordsList(
    opts.subKeywords !== undefined ? opts.subKeywords : [],
  );
  const displayQuery =
    typeof opts.displayQuery === 'string' && opts.displayQuery.trim()
      ? opts.displayQuery.trim()
      : subKeywords.length > 0
        ? `${query} (+${subKeywords.join(', ')})`
        : query;

  const mainKeyword =
    typeof opts.mainKeyword === 'string' && opts.mainKeyword.trim()
      ? opts.mainKeyword.trim()
      : query;

  const selectedSub =
    opts.selectedSubKeyword != null && String(opts.selectedSubKeyword).trim()
      ? String(opts.selectedSubKeyword).trim()
      : null;

  const state = historyStore.load();
  let rows = Array.isArray(opts.videos) ? [...opts.videos] : [];
  rows = dedupeContentRows(rows, platform);

  const now = new Date().toISOString();
  const historyId = `h_${historyStore.nextSeq(state)}_${Date.now()}`;

  const normalizedResults = rows.map((v) => {
    const snap = snapshotFromVideo(v, platform);
    const prior = findLatestPriorResult(
      state,
      platform,
      snap.videoId,
      snap.canonicalUrl,
      snap.contentId,
    );
    let classification = 'new';
    if (prior) {
      classification = isMateriallyChanged(
        {
          summary: prior.summary,
          sentiment: prior.sentiment,
          title: prior.title,
          metrics: prior.metrics,
        },
        snap,
      )
        ? 'updated'
        : 'seen';
    }

    v.result_classification = classification;
    applyPriorityToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date(now) });
    applyTrendToContentRow(/** @type {Record<string, unknown>} */ (v), { now: new Date(now) });

    const firstSeenAt = prior ? prior.firstSeenAt : now;
    const seenCount = prior ? (prior.seenCount || 1) + 1 : 1;

    const resultId = `r_${historyStore.nextSeq(state)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const matchedSubs = matchedSubKeywordsFromVideo(v);

    const saved = {
      id: resultId,
      searchHistoryId: historyId,
      platform,
      resultId: snap.videoId || snap.contentId || v.id,
      videoId: snap.videoId,
      contentId: snap.contentId,
      contentType: snap.contentType,
      canonicalUrl: snap.canonicalUrl || (typeof v.url === 'string' ? v.url : null),
      title: snap.title,
      channelName: null,
      creatorName: typeof v.creator_name === 'string' ? v.creator_name : null,
      publishedAt:
        typeof v.published_at === 'string'
          ? v.published_at
          : typeof v.publishedAt === 'string'
            ? v.publishedAt
            : null,
      foundAt: now,
      summary: snap.summary,
      sentiment: snap.sentiment,
      metrics: snap.metrics,
      firstSeenAt,
      lastSeenAt: now,
      seenCount,
      resultClassification: classification,
      matchedSubKeywords: matchedSubs,
      ...(typeof v.priority_score === 'number'
        ? {
            priorityScore: v.priority_score,
            priorityLevel: typeof v.priority_level === 'string' ? v.priority_level : undefined,
            priorityReason: typeof v.priority_reason === 'string' ? v.priority_reason : undefined,
          }
        : {}),
      ...(typeof v.trend_score === 'number'
        ? {
            trendScore: v.trend_score,
            trendLevel: typeof v.trend_level === 'string' ? v.trend_level : undefined,
            trendReason: typeof v.trend_reason === 'string' ? v.trend_reason : undefined,
          }
        : {}),
    };

    state.results.push(saved);

    const idxKey =
      (snap.videoId || snap.contentId) && platform === 'youtube'
        ? `${platform}:${snap.videoId || snap.contentId}`
        : snap.canonicalUrl
          ? `${platform}:url:${String(snap.canonicalUrl).toLowerCase()}`
          : null;
    if (idxKey) {
      state.resultIndex[idxKey] = resultId;
    }

    return {
      id: typeof v.id === 'string' ? v.id : String(v.id),
      title: snap.title,
      url: typeof v.url === 'string' ? v.url : undefined,
      content_format: v.content_format || v.contentFormat,
      content_type: v.content_type || snap.contentType,
      canonical_url: v.canonical_url || snap.canonicalUrl,
      content_summary: snap.summary,
      content_sentiment_label: snap.sentiment,
      comments_analyzed: snap.metrics.comments,
      metrics: snap.metrics,
      result_classification: classification,
      matched_sub_keywords: matchedSubs,
      ...(typeof v.priority_score === 'number'
        ? {
            priority_score: v.priority_score,
            priority_level: typeof v.priority_level === 'string' ? v.priority_level : undefined,
            priority_reason: typeof v.priority_reason === 'string' ? v.priority_reason : undefined,
          }
        : {}),
      ...(typeof v.trend_score === 'number'
        ? {
            trend_score: v.trend_score,
            trend_level: typeof v.trend_level === 'string' ? v.trend_level : undefined,
            trend_reason: typeof v.trend_reason === 'string' ? v.trend_reason : undefined,
          }
        : {}),
    };
  });

  const top = rows[0];
  const topTitle = top && typeof top.title === 'string' ? top.title : null;
  const topUrl =
    top && typeof top.url === 'string'
      ? top.url
      : top
        ? canonicalYoutubeWatchUrl(snapshotFromVideo(top, platform).videoId)
        : null;

  const src = opts.source === 'watchlist' ? 'watchlist' : 'manual';
  const historyItem = {
    id: historyId,
    keyword: query,
    mainKeyword,
    subKeywords,
    displayQuery,
    effectiveQuery: displayQuery,
    ...(selectedSub ? { selectedSubKeyword: selectedSub } : {}),
    platform,
    searchType: opts.searchType || (src === 'watchlist' ? 'watchlist' : 'search'),
    source: src,
    watchlistTrackId: opts.trackId ?? null,
    createdAt: now,
    resultCount: rows.length,
    summary: opts.summary ?? null,
    sentiment: opts.overall_sentiment ?? null,
    topResultTitle: topTitle,
    topResultUrl: topUrl,
    normalizedResults,
    status: opts.status || 'completed',
    durationMs: typeof opts.durationMs === 'number' ? opts.durationMs : null,
    totalCommentsAnalyzed: opts.total_comments_analyzed ?? null,
    cached: Boolean(opts.cached),
    analysisSource:
      typeof opts.analysisSource === 'string' && opts.analysisSource.trim()
        ? opts.analysisSource.trim()
        : undefined,
    ...(opts.dateRange && typeof opts.dateRange === 'object' ? { dateRange: opts.dateRange } : {}),
  };

  state.history.push(historyItem);
  historyStore.save(state);

  return { historyId, videos: rows };
}

function listHistory() {
  const state = historyStore.load();
  return [...state.history]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((h) => decorateHistoryItemForClient(h));
}

function getHistoryById(id) {
  const state = historyStore.load();
  const item = state.history.find((h) => h.id === id);
  if (!item) return null;
  const results = state.results.filter((r) => r.searchHistoryId === id);
  return { item: decorateHistoryItemForClient(item), results };
}

function rebuildResultIndex(state) {
  state.resultIndex = {};
  for (const r of state.results) {
    const p = String(r.platform).toLowerCase();
    const cid = r.videoId || r.contentId;
    const key =
      cid && p === 'youtube'
        ? `${p}:${cid}`
        : r.canonicalUrl
          ? `${p}:url:${String(r.canonicalUrl).toLowerCase()}`
          : null;
    if (key) state.resultIndex[key] = r.id;
  }
}

function deleteHistoryById(id) {
  const state = historyStore.load();
  const before = state.history.length;
  state.history = state.history.filter((h) => h.id !== id);
  state.results = state.results.filter((r) => r.searchHistoryId !== id);
  rebuildResultIndex(state);
  historyStore.save(state);
  return state.history.length < before;
}

function clearAllHistory() {
  historyStore.save(historyStore.defaultState());
}

/**
 * Remove persisted history rows that are heuristic (stored or inferred). Does not touch OpenAI-backed rows.
 * @returns {{ removedCount: number }}
 */
function clearHeuristicHistoryEntries() {
  const state = historyStore.load();
  const removeIds = new Set();

  for (const h of state.history) {
    const stored = h.analysisSource;
    const inferred = inferLegacyAnalysisSourceFromSummary(h.summary);
    const isHeuristic =
      stored === 'heuristic' ||
      stored === 'cached_heuristic' ||
      (!stored && inferred === 'heuristic');
    if (isHeuristic) {
      removeIds.add(h.id);
    }
  }

  const before = state.history.length;
  state.history = state.history.filter((h) => !removeIds.has(h.id));
  state.results = state.results.filter((r) => !removeIds.has(r.searchHistoryId));
  rebuildResultIndex(state);
  historyStore.save(state);

  return { removedCount: before - state.history.length };
}

/**
 * POST body validation — optional manual / tool ingestion.
 * @param {Record<string, unknown>} body
 */
/**
 * Case-insensitive key for grouping runs (main keyword preferred, else legacy `keyword`).
 * @param {Record<string, unknown>} item
 * @returns {string}
 */
function keywordGroupKeyForItem(item) {
  const main =
    item.mainKeyword != null && String(item.mainKeyword).trim()
      ? String(item.mainKeyword).trim()
      : '';
  const fallback = typeof item.keyword === 'string' ? item.keyword.trim() : '';
  const raw = main || fallback;
  return raw.toLowerCase();
}

/**
 * @param {string | null | undefined} summary
 * @param {number} [max]
 */
function truncateSnippet(summary, max = 220) {
  const t = String(summary || '').trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * @param {Array<Record<string, unknown>>} runs — newest first
 */
function displayLabelForKeywordGroup(runs) {
  if (!runs.length) return '';
  const latest = runs[0];
  const main =
    latest.mainKeyword != null && String(latest.mainKeyword).trim()
      ? String(latest.mainKeyword).trim()
      : '';
  if (main) return main;
  const kw = typeof latest.keyword === 'string' ? latest.keyword.trim() : '';
  if (kw) return kw;
  const dq = typeof latest.displayQuery === 'string' ? latest.displayQuery.trim() : '';
  return dq || '';
}

/**
 * Summaries for the main History page — one row per distinct main keyword.
 * @returns {Array<{
 *   groupKey: string,
 *   displayLabel: string,
 *   runCount: number,
 *   latestRunAt: string,
 *   latestSentiment: string | null,
 *   latestSummarySnippet: string | null,
 *   latestAnalysisSource: string | undefined,
 *   platform: string,
 * }>}
 */
function listHistoryGroups() {
  const state = historyStore.load();
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const byKey = new Map();
  for (const h of state.history) {
    const decorated = decorateHistoryItemForClient(h);
    const k = keywordGroupKeyForItem(decorated);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(decorated);
  }
  const groups = [];
  for (const [groupKey, runs] of byKey.entries()) {
    runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const latest = runs[0];
    groups.push({
      groupKey,
      displayLabel: displayLabelForKeywordGroup(runs),
      runCount: runs.length,
      latestRunAt: latest.createdAt,
      latestSentiment: latest.sentiment ?? null,
      latestSummarySnippet: truncateSnippet(
        typeof latest.summary === 'string' ? latest.summary : null,
      ),
      latestAnalysisSource: latest.analysisSource,
      platform: latest.platform,
    });
  }
  groups.sort((a, b) => String(b.latestRunAt).localeCompare(String(a.latestRunAt)));
  return groups;
}

/**
 * All decorated runs for one keyword (newest first), or null if none.
 * @param {string} groupKeyRaw
 */
function getHistoryGroupDetail(groupKeyRaw) {
  const normalized = String(groupKeyRaw || '').trim().toLowerCase();
  if (!normalized) return null;
  const state = historyStore.load();
  const runs = [];
  for (const h of state.history) {
    const decorated = decorateHistoryItemForClient(h);
    if (keywordGroupKeyForItem(decorated) === normalized) {
      runs.push(decorated);
    }
  }
  runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (runs.length === 0) return null;
  return {
    groupKey: normalized,
    displayLabel: displayLabelForKeywordGroup(runs),
    runs,
  };
}

/**
 * Delete every saved run whose main keyword groups to `groupKeyRaw`.
 * @param {string} groupKeyRaw
 * @returns {{ removedCount: number }}
 */
function deleteHistoryByGroupKey(groupKeyRaw) {
  const normalized = String(groupKeyRaw || '').trim().toLowerCase();
  if (!normalized) return { removedCount: 0 };
  const state = historyStore.load();
  const removeIds = new Set();
  for (const h of state.history) {
    if (keywordGroupKeyForItem(h) === normalized) {
      removeIds.add(h.id);
    }
  }
  if (removeIds.size === 0) return { removedCount: 0 };
  const before = state.history.length;
  state.history = state.history.filter((h) => !removeIds.has(h.id));
  state.results = state.results.filter((r) => !removeIds.has(r.searchHistoryId));
  rebuildResultIndex(state);
  historyStore.save(state);
  return { removedCount: before - state.history.length };
}

function createHistoryFromBody(body) {
  const keyword =
    typeof body.keyword === 'string'
      ? body.keyword.trim()
      : typeof body.query === 'string'
        ? body.query.trim()
        : '';
  if (!keyword) {
    throw new Error('keyword or query is required');
  }
  const platform = typeof body.platform === 'string' ? body.platform : PLATFORM;
  let subKeywords = [];
  if (Array.isArray(body.subKeywords)) {
    subKeywords = body.subKeywords;
  } else if (typeof body.subKeywords === 'string' && body.subKeywords.trim()) {
    subKeywords = body.subKeywords.split(',');
  }
  const displayQuery =
    typeof body.displayQuery === 'string' && body.displayQuery.trim() ? body.displayQuery.trim() : undefined;
  return recordSearchCompletion({
    query: keyword,
    mainKeyword: keyword,
    subKeywords,
    displayQuery,
    platform,
    videos: Array.isArray(body.videos) ? body.videos : [],
    summary: typeof body.summary === 'string' ? body.summary : '',
    overall_sentiment: typeof body.sentiment === 'string' ? body.sentiment : 'neutral',
    total_comments_analyzed: typeof body.totalCommentsAnalyzed === 'number' ? body.totalCommentsAnalyzed : 0,
    status: typeof body.status === 'string' ? body.status : 'completed',
    durationMs: typeof body.durationMs === 'number' ? body.durationMs : null,
    searchType: typeof body.searchType === 'string' ? body.searchType : 'search',
    source: 'manual',
    cached: false,
    analysisSource:
      typeof body.analysisSource === 'string' && body.analysisSource.trim()
        ? body.analysisSource.trim()
        : 'unknown',
  });
}

module.exports = {
  recordSearchCompletion,
  listHistory,
  listHistoryGroups,
  getHistoryGroupDetail,
  deleteHistoryByGroupKey,
  getHistoryById,
  deleteHistoryById,
  clearAllHistory,
  clearHeuristicHistoryEntries,
  inferLegacyAnalysisSourceFromSummary,
  decorateHistoryItemForClient,
  createHistoryFromBody,
  dedupeContentRows,
  stableContentKey,
  keywordGroupKeyForItem,
};
