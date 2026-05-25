/**
 * Stable keys for YouTube (and generic URL) deduplication across searches.
 * Prefer `contentKeys.js` for new code — same implementation, platform-agnostic module name.
 */

/**
 * @param {string | undefined} url
 * @param {string | undefined} fallbackId — API video id when known
 * @returns {string | null}
 */
function extractYoutubeVideoId(url, fallbackId) {
  if (fallbackId && /^[a-zA-Z0-9_-]{11}$/.test(String(fallbackId))) {
    return String(fallbackId);
  }
  if (!url || typeof url !== 'string') {
    return fallbackId && String(fallbackId).length >= 6 ? String(fallbackId) : null;
  }
  try {
    const u = new URL(url, 'https://www.youtube.com');
    if (u.hostname.replace(/^www\./, '') === 'youtu.be') {
      const p = u.pathname.replace(/^\//, '').split('/')[0];
      if (p && p.length >= 6) return p.slice(0, 11);
    }
    const v = u.searchParams.get('v');
    if (v && v.length >= 6) return v.slice(0, 11);
    const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
    if (shorts) return shorts[1].slice(0, 11);
    const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
    if (embed) return embed[1].slice(0, 11);
  } catch {
    /* ignore */
  }
  const id = String(fallbackId || '');
  return id.length >= 6 ? id : null;
}

/**
 * @param {string | null} videoId
 * @returns {string | null}
 */
function canonicalYoutubeWatchUrl(videoId) {
  if (!videoId) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Normalize URL for fallback dedupe (lowercase host, strip tracking params).
 * @param {string | undefined} url
 * @returns {string | null}
 */
function normalizeUrlKey(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.href.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * @param {string} platform
 * @param {{ id?: string, url?: string }} row
 * @returns {string}
 */
function stableContentKey(platform, row) {
  const p = String(platform || 'youtube').toLowerCase();
  if (p === 'youtube') {
    const vid = extractYoutubeVideoId(row.url, row.id);
    if (vid) return `${p}:${vid}`;
  }
  const id = row.id && String(row.id).trim();
  if (id) return `${p}:${id}`;
  const uk = normalizeUrlKey(row.url);
  if (uk) return `${p}:url:${uk}`;
  return `${p}:unknown:${String(row.title || '').slice(0, 40)}`;
}

/**
 * Dedupe an array of video/content rows (first occurrence wins).
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} platform
 * @returns {Array<Record<string, unknown>>}
 */
function dedupeContentRows(rows, platform) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = stableContentKey(platform, {
      id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
      url: typeof row.url === 'string' ? row.url : undefined,
      title: typeof row.title === 'string' ? row.title : '',
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

module.exports = {
  extractYoutubeVideoId,
  canonicalYoutubeWatchUrl,
  normalizeUrlKey,
  stableContentKey,
  dedupeContentRows,
};
