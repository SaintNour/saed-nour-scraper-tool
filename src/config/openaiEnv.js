/**
 * Central OpenAI configuration: models, pools, scan caps, feature flags.
 *
 * Backend loads `.env` from the project root (see index.js). Do not rely on `web/.env`.
 *
 * Activation (real API):
 * - Requires a **valid-format** OPENAI_API_KEY (see validateOpenAiApiKeyFormat).
 * - OPENAI_ENABLED omitted or empty + valid key → enabled (default-on).
 * - OPENAI_ENABLED=false → off (explicit).
 * - Legacy ENABLE_AI=true → on (with valid key), if OPENAI_ENABLED not explicitly false.
 */

function num(envKey, defaultValue) {
  const v = process.env[envKey];
  if (v === undefined || v === '') return defaultValue;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}

function bool(envKey, defaultValue = false) {
  const v = String(process.env[envKey] || '').trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

function isExplicitlyFalse(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'no';
}

function isExplicitlyTrue(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Detects common .env mistakes (e.g. `OPENAI_API_KEY=sk-...ENABLE_AI=true` on one line).
 * @param {string | undefined} raw
 * @returns {{ valid: boolean, issues: string[], warning: string | null }}
 */
function validateOpenAiApiKeyFormat(raw) {
  if (raw === undefined || raw === null) {
    return { valid: false, issues: ['missing'], warning: null };
  }
  const s = String(raw);
  const t = s.trim();
  if (!t) {
    return { valid: false, issues: ['empty'], warning: null };
  }

  const issues = [];

  if (/ENABLE_AI/i.test(t)) issues.push('contains_ENABLE_AI_token');
  if (/OPENAI_ENABLED/i.test(t)) issues.push('contains_OPENAI_ENABLED_token');
  if (/OPENAI_API_KEY/i.test(t)) issues.push('contains_OPENAI_API_KEY_token');
  if (/\r|\n/.test(s)) issues.push('contains_newline');
  if (/\s/.test(t)) issues.push('contains_whitespace_inside_key');
  if (/=true\s*$/i.test(t) || /=false\s*$/i.test(t)) issues.push('trailing_assignment_like_true_false');
  if (t.includes('=') && /[=][^=]*true|false/i.test(t)) issues.push('embedded_equals_with_boolean');

  const valid = issues.length === 0;
  return {
    valid,
    issues,
    warning: valid
      ? null
      : `OPENAI_API_KEY appears malformed (${issues.join(', ')}). Use one variable per line in the root .env file.`,
  };
}

function getOpenAiApiKeyForRequests() {
  const raw = process.env.OPENAI_API_KEY;
  const v = validateOpenAiApiKeyFormat(raw);
  if (!v.valid) return null;
  return String(raw).trim();
}

function hasApiKey() {
  return validateOpenAiApiKeyFormat(process.env.OPENAI_API_KEY).valid;
}

/** Explicit dev-only heuristic path (must be set intentionally). */
function isDevMockEnabled() {
  return bool('OPENAI_DEV_MOCK', false) || bool('AI_DEV_MOCK', false);
}

function isOpenAiEnabled() {
  if (isDevMockEnabled()) {
    return false;
  }
  if (!hasApiKey()) {
    return false;
  }
  const rawOpen = process.env.OPENAI_ENABLED;
  const openTrim = rawOpen === undefined ? '' : String(rawOpen).trim();

  if (openTrim !== '') {
    if (isExplicitlyFalse('OPENAI_ENABLED')) return false;
    if (isExplicitlyTrue('OPENAI_ENABLED')) return true;
    return false;
  }

  if (String(process.env.ENABLE_AI || '').trim().toLowerCase() === 'true') {
    return true;
  }

  return true;
}

function describeOpenAiBlockedReason() {
  if (isDevMockEnabled()) {
    return 'OPENAI_DEV_MOCK or AI_DEV_MOCK is true (dev heuristic forced)';
  }
  const keyFmt = validateOpenAiApiKeyFormat(process.env.OPENAI_API_KEY);
  if (!keyFmt.valid && process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()) {
    return `OPENAI_API_KEY is malformed (${keyFmt.issues.join(', ')})`;
  }
  if (!hasApiKey()) {
    return 'OPENAI_API_KEY is missing, empty, or invalid';
  }
  const openTrim =
    process.env.OPENAI_ENABLED === undefined ? '' : String(process.env.OPENAI_ENABLED).trim();
  if (openTrim !== '' && !isExplicitlyFalse('OPENAI_ENABLED') && !isExplicitlyTrue('OPENAI_ENABLED')) {
    return `OPENAI_ENABLED is set to an invalid value; got "${openTrim}"`;
  }
  if (isExplicitlyFalse('OPENAI_ENABLED')) {
    return 'OPENAI_ENABLED is false';
  }
  return null;
}

/**
 * Log warnings once suitable for startup (never logs secret values).
 */
function logOpenAiKeyValidationWarnings() {
  const raw = process.env.OPENAI_API_KEY;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return;
  }
  const v = validateOpenAiApiKeyFormat(raw);
  if (!v.valid && v.warning) {
    console.warn('[env]', v.warning);
  }
}

/**
 * @returns {{ line: string, mode: 'real'|'disabled'|'dev_mock', defaultEnabledUnset: boolean }}
 */
function getOpenAiStartupDiagnostics() {
  if (isDevMockEnabled()) {
    return {
      line: 'OpenAI status: dev mock forced',
      mode: 'dev_mock',
      defaultEnabledUnset: false,
    };
  }

  const keyFmt = validateOpenAiApiKeyFormat(process.env.OPENAI_API_KEY);
  if (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim() !== '' && !keyFmt.valid) {
    return {
      line: 'OpenAI status: disabled (missing/invalid key)',
      mode: 'disabled',
      defaultEnabledUnset: false,
    };
  }

  if (!hasApiKey()) {
    return {
      line: 'OpenAI status: disabled (missing/invalid key)',
      mode: 'disabled',
      defaultEnabledUnset: false,
    };
  }

  if (isExplicitlyFalse('OPENAI_ENABLED')) {
    return {
      line: 'OpenAI status: disabled (OPENAI_ENABLED=false)',
      mode: 'disabled',
      defaultEnabledUnset: false,
    };
  }

  const openTrim =
    process.env.OPENAI_ENABLED === undefined ? '' : String(process.env.OPENAI_ENABLED).trim();
  if (openTrim !== '' && !isExplicitlyTrue('OPENAI_ENABLED') && !isExplicitlyFalse('OPENAI_ENABLED')) {
    console.warn(
      '[env] OPENAI_ENABLED must be true, false, or omitted; got:',
      JSON.stringify(openTrim),
    );
    return {
      line: 'OpenAI status: disabled (missing/invalid key)',
      mode: 'disabled',
      defaultEnabledUnset: false,
    };
  }

  const unsetOpenAiEnabled = openTrim === '';

  if (isExplicitlyTrue('OPENAI_ENABLED') || String(process.env.ENABLE_AI || '').trim().toLowerCase() === 'true') {
    return {
      line: 'OpenAI status: enabled (real API)',
      mode: 'real',
      defaultEnabledUnset: false,
    };
  }

  if (unsetOpenAiEnabled) {
    return {
      line: 'OpenAI status: enabled (real API)',
      mode: 'real',
      defaultEnabledUnset: true,
    };
  }

  return {
    line: 'OpenAI status: disabled (missing/invalid key)',
    mode: 'disabled',
    defaultEnabledUnset: false,
  };
}

const defaultModel = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
const premiumModel = process.env.OPENAI_PREMIUM_MODEL || 'gpt-4o';

const pools = {
  mini: {
    softCap: num('OPENAI_MINI_POOL_SOFT_CAP', 2_000_000),
    hardCap: num('OPENAI_MINI_POOL_HARD_CAP', 2_300_000),
    maxInputPerRequest: num('OPENAI_MINI_MAX_INPUT_TOKENS', 10_000),
    maxOutputPerRequest: num('OPENAI_MINI_MAX_OUTPUT_TOKENS', 1500),
  },
  large: {
    softCap: num('OPENAI_LARGE_POOL_SOFT_CAP', 80_000),
    hardCap: num('OPENAI_LARGE_POOL_HARD_CAP', 120_000),
    maxInputPerRequest: num('OPENAI_LARGE_MAX_INPUT_TOKENS', 4000),
    maxOutputPerRequest: num('OPENAI_LARGE_MAX_OUTPUT_TOKENS', 800),
  },
};

const safety = {
  maxVideosPerScan: num('OPENAI_SAFETY_MAX_VIDEOS', 20),
  maxCommentsPerVideoFetch: num('OPENAI_SAFETY_MAX_COMMENTS_PER_VIDEO', 20),
  maxCommentsTotalPerScan: num('OPENAI_SAFETY_MAX_COMMENTS_TOTAL', 250),
};

function scanProfile(name) {
  const isWatch = name === 'watchlist';
  return {
    maxSearchCandidates: num(
      isWatch ? 'OPENAI_WATCHLIST_MAX_SEARCH_CANDIDATES' : 'OPENAI_MANUAL_MAX_SEARCH_CANDIDATES',
      isWatch ? 30 : 40,
    ),
    maxMatchedVideos: Math.min(
      safety.maxVideosPerScan,
      num(
        isWatch ? 'OPENAI_WATCHLIST_MAX_MATCHED_VIDEOS' : 'OPENAI_MANUAL_MAX_MATCHED_VIDEOS',
        isWatch ? 10 : 15,
      ),
    ),
    maxCommentsPerVideo: Math.min(
      safety.maxCommentsPerVideoFetch,
      num(
        isWatch ? 'OPENAI_WATCHLIST_MAX_COMMENTS_PER_VIDEO' : 'OPENAI_MANUAL_MAX_COMMENTS_PER_VIDEO',
        isWatch ? 10 : 15,
      ),
    ),
  };
}

function poolForModel(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('gpt-4o') && !m.includes('mini')) return 'large';
  return 'mini';
}

module.exports = {
  isOpenAiEnabled,
  isDevMockEnabled,
  describeOpenAiBlockedReason,
  getOpenAiStartupDiagnostics,
  validateOpenAiApiKeyFormat,
  getOpenAiApiKeyForRequests,
  logOpenAiKeyValidationWarnings,
  hasApiKey,
  defaultModel,
  premiumModel,
  pools,
  safety,
  scanProfile,
  poolForModel,
  num,
  bool,
};
