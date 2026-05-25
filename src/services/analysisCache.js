/**
 * In-memory TTL cache for full analysis responses (same keyword → fewer API calls).
 * Set ANALYSIS_CACHE_TTL_MS=0 to disable.
 */

const { isOpenAiEnabled } = require('../config/openaiEnv');
const { recordHeuristicFallback } = require('./openaiFallbackLog');

const DEFAULT_TTL_MS = Number(process.env.ANALYSIS_CACHE_TTL_MS || 60 * 60 * 1000);

/** @type {Map<string, { payload: object, expiresAt: number }>} */
const cache = new Map();

function now() {
  return Date.now();
}

function cacheKey(query, platform, subKey = '') {
  const sub = String(subKey || '');
  return `${String(platform).toLowerCase()}:${String(query).trim().toLowerCase()}::${sub}`;
}

/**
 * Old UI copy that should never be replayed from TTL cache (even if OPENAI_* env is misread).
 */
function isLegacyMisleadingCachedSummary(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const s = String(payload.summary || '');
  if (s.includes('Mock mode is enabled')) return true;
  return false;
}

function isStaleHeuristicPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!isOpenAiEnabled()) return false;
  if (payload._analysis_mode === 'heuristic') return true;
  const s = String(payload.summary || '');
  if (s.includes('Development mock')) return true;
  if (s.includes('OpenAI is disabled or not configured')) return true;
  return false;
}

function get(query, platform, subKey = '') {
  if (DEFAULT_TTL_MS <= 0) return null;
  const key = cacheKey(query, platform, subKey);
  const entry = cache.get(key);
  if (!entry) return null;
  if (now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  if (isLegacyMisleadingCachedSummary(entry.payload)) {
    cache.delete(key);
    recordHeuristicFallback(
      'stale_cached_heuristic_skipped',
      `legacy mock-mode summary text; key=${key}`,
    );
    console.warn(
      '[analysisCache] dropped legacy cached summary (mock-mode copy); forcing fresh run. key=',
      key,
    );
    return null;
  }
  if (isStaleHeuristicPayload(entry.payload)) {
    cache.delete(key);
    const reason =
      entry.payload?._analysis_mode === 'heuristic'
        ? 'cached entry was heuristic'
        : 'summary matched legacy heuristic/mock text';
    recordHeuristicFallback('stale_cached_heuristic_skipped', `${reason}; key=${key}`);
    console.warn(
      '[analysisCache] dropped stale heuristic snapshot (OpenAI enabled); will run fresh analysis. key=',
      key,
    );
    return null;
  }
  return { ...entry.payload, cached: true };
}

function set(query, platform, payload, subKey = '') {
  if (DEFAULT_TTL_MS <= 0) return;
  const key = cacheKey(query, platform, subKey);
  cache.set(key, { payload, expiresAt: now() + DEFAULT_TTL_MS });
}

function invalidate(query, platform, subKey = '') {
  cache.delete(cacheKey(query, platform, subKey));
}

module.exports = {
  get,
  set,
  invalidate,
  cacheKey,
};
