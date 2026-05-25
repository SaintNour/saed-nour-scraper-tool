const axios = require('axios');
const { decodeHtmlEntities } = require('../utils/htmlEntities');

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const COMMENT_THREADS_URL = 'https://www.googleapis.com/youtube/v3/commentThreads';
const DEFAULT_MAX_COMMENTS = 20;
const MAX_VIDEO_RESULTS = 50;
const MAX_COMMENT_RESULTS = 100;
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Best-effort YouTube content format classifier.
 * Kept isolated for future improvements (e.g. duration metadata).
 */
function classifyYoutubeContentFormat({ title, description }) {
  const text = `${String(title || '')} ${String(description || '')}`.toLowerCase();
  if (/(^|\s)#?shorts?(\s|$)/i.test(text)) return 'short';
  if (String(title || '').trim() || String(description || '').trim()) return 'video';
  return 'unknown';
}

async function searchVideos(query, apiKey, options = {}) {
  const maxResults = Math.min(options.maxResults ?? 25, MAX_VIDEO_RESULTS);
  const q = String(query || '').trim();

  /** @type {Record<string, string | number>} */
  const params = {
    part: 'snippet',
    q,
    type: 'video',
    maxResults,
    key: apiKey,
  };
  if (typeof options.publishedAfter === 'string' && options.publishedAfter.trim()) {
    params.publishedAfter = options.publishedAfter.trim();
  }
  if (typeof options.publishedBefore === 'string' && options.publishedBefore.trim()) {
    params.publishedBefore = options.publishedBefore.trim();
  }

  const { data } = await axios.get(YOUTUBE_SEARCH_URL, {
    timeout: REQUEST_TIMEOUT_MS,
    params,
  });

  const baseRows = (data.items || [])
    .filter((item) => item.id?.videoId)
    .map((item) => {
      const id = item.id.videoId;
      const title = decodeHtmlEntities(String(item.snippet?.title || '').trim());
      const description = decodeHtmlEntities(String(item.snippet?.description || '').trim());
      const publishedAt =
        typeof item.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : null;
      return {
        id,
        channel_id: typeof item.snippet?.channelId === 'string' ? item.snippet.channelId : null,
        title,
        description,
        url: `https://www.youtube.com/watch?v=${id}`,
        content_format: classifyYoutubeContentFormat({ title, description }),
        published_at: publishedAt,
        publishedAt,
      };
    });

  const ids = baseRows.map((r) => r.id).filter(Boolean);
  const statsByVideoId = await fetchVideoStatsMap(ids, apiKey);
  const channelIds = [...new Set(baseRows.map((r) => r.channel_id).filter(Boolean))];
  const subsByChannelId = await fetchChannelSubscriberMap(channelIds, apiKey);

  return baseRows.map((r) => {
    const st = statsByVideoId.get(r.id) || {};
    const subs = r.channel_id ? subsByChannelId.get(r.channel_id) : null;
    return {
      ...r,
      view_count: Number.isFinite(st.view_count) ? st.view_count : 0,
      like_count: Number.isFinite(st.like_count) ? st.like_count : 0,
      comment_count: Number.isFinite(st.comment_count) ? st.comment_count : 0,
      subscriber_count: Number.isFinite(subs) ? subs : 0,
    };
  });
}

/**
 * @param {string[]} videoIds
 * @param {string} apiKey
 */
async function fetchVideoStatsMap(videoIds, apiKey) {
  const out = new Map();
  if (!Array.isArray(videoIds) || videoIds.length === 0) return out;
  try {
    const { data } = await axios.get(YOUTUBE_VIDEOS_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        part: 'statistics',
        id: videoIds.join(','),
        key: apiKey,
        maxResults: Math.min(videoIds.length, MAX_VIDEO_RESULTS),
      },
    });
    for (const item of data.items || []) {
      const id = item?.id;
      if (!id) continue;
      const s = item.statistics || {};
      out.set(id, {
        view_count: Number(s.viewCount || 0),
        like_count: Number(s.likeCount || 0),
        comment_count: Number(s.commentCount || 0),
      });
    }
  } catch (e) {
    console.warn('[youtube] videos stats unavailable:', e?.message || e);
  }
  return out;
}

/**
 * @param {string[]} channelIds
 * @param {string} apiKey
 */
async function fetchChannelSubscriberMap(channelIds, apiKey) {
  const out = new Map();
  if (!Array.isArray(channelIds) || channelIds.length === 0) return out;
  try {
    const { data } = await axios.get(YOUTUBE_CHANNELS_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        part: 'statistics',
        id: channelIds.join(','),
        key: apiKey,
        maxResults: Math.min(channelIds.length, MAX_VIDEO_RESULTS),
      },
    });
    for (const item of data.items || []) {
      const id = item?.id;
      if (!id) continue;
      const s = item.statistics || {};
      out.set(id, Number(s.subscriberCount || 0));
    }
  } catch (e) {
    console.warn('[youtube] channel stats unavailable:', e?.message || e);
  }
  return out;
}

async function fetchVideoComments(videoId, apiKey, options = {}) {
  const maxResults = Math.min(options.maxResults ?? DEFAULT_MAX_COMMENTS, MAX_COMMENT_RESULTS);

  const { data } = await axios.get(COMMENT_THREADS_URL, {
    timeout: REQUEST_TIMEOUT_MS,
    params: {
      part: 'snippet',
      videoId,
      maxResults,
      order: 'relevance',
      key: apiKey,
    },
  });

  return (data.items || [])
    .map((item) => {
      const snippet = item.snippet?.topLevelComment?.snippet;
      if (!snippet) return null;
      const t = String(snippet.textOriginal || snippet.textDisplay || '')
        .replace(/\s+/g, ' ')
        .trim();
      return decodeHtmlEntities(t);
    })
    .filter(Boolean);
}

module.exports = { searchVideos, fetchVideoComments };