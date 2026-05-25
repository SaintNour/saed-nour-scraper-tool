/**
 * Keyword relevance: main keyword required; if sub-keywords exist, at least one must match.
 * Used by analyzer, history metadata, and watchlist automation.
 */

/**
 * @param {string} s
 * @returns {string}
 */
function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u2019'`]/g, "'")
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown[]} raw
 * @returns {string[]}
 */
function normalizeSubKeywordsList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const t = String(x ?? '')
      .trim()
      .slice(0, 200);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/**
 * @param {string} phrase
 * @param {string} haystackNorm
 * @returns {boolean}
 */
function phraseMatches(phrase, haystackNorm) {
  const p = normalizeText(phrase);
  if (!p) return false;
  return haystackNorm.includes(p);
}

/**
 * Build searchable text from a video row (before AI summary).
 * @param {{ title?: string, description?: string }} v
 */
function haystackFromVideoRaw(v) {
  const title = String(v?.title ?? '');
  const desc = String(v?.description ?? '');
  return normalizeText(`${title} ${desc}`);
}

/**
 * @param {{ title?: string, description?: string, content_summary?: string, contentSummary?: string }} v
 */
function haystackFromVideoEnriched(v) {
  const title = String(v?.title ?? '');
  const desc = String(v?.description ?? '');
  const sum =
    typeof v.content_summary === 'string'
      ? v.content_summary
      : typeof v.contentSummary === 'string'
        ? v.contentSummary
        : '';
  return normalizeText(`${title} ${desc} ${sum}`);
}

/**
 * @param {string} mainKeyword
 * @param {string[]} subKeywords — already normalized list (trimmed, deduped)
 * @param {string} haystackNorm
 * @returns {{ mainMatched: boolean, matchedSubKeywords: string[], isRelevant: boolean, matchSummary: string }}
 */
function evaluateMatchFromHaystack(mainKeyword, subKeywords, haystackNorm) {
  const main = String(mainKeyword ?? '').trim();
  const mainNorm = normalizeText(main);
  const mainMatched = mainNorm.length > 0 && haystackNorm.includes(mainNorm);

  const matchedSubKeywords = [];
  for (const sub of subKeywords) {
    if (phraseMatches(sub, haystackNorm)) {
      matchedSubKeywords.push(sub);
    }
  }

  const subs = normalizeSubKeywordsList(subKeywords);
  let isRelevant;
  if (subs.length === 0) {
    isRelevant = mainMatched;
  } else {
    isRelevant = mainMatched && matchedSubKeywords.length > 0;
  }

  let matchSummary = '';
  if (!mainMatched) matchSummary = 'Main keyword not found in title/description';
  else if (subs.length > 0 && matchedSubKeywords.length === 0) {
    matchSummary = 'Main keyword matched; no sub-keyword match';
  } else if (matchedSubKeywords.length > 0) {
    matchSummary = `Matched: ${matchedSubKeywords.join(', ')}`;
  } else {
    matchSummary = 'Main keyword matched';
  }

  return { mainMatched, matchedSubKeywords, isRelevant, matchSummary };
}

/**
 * @param {string} mainKeyword
 * @param {string[]} subKeywords
 * @param {{ title?: string, description?: string, content_summary?: string, contentSummary?: string }} video
 */
function evaluateVideoMatch(mainKeyword, subKeywords, video) {
  const subs = normalizeSubKeywordsList(subKeywords);
  const hay = haystackFromVideoEnriched(video);
  return evaluateMatchFromHaystack(mainKeyword, subs, hay);
}

/**
 * Raw candidate (pre-AI) — title + description only.
 * @param {string} mainKeyword
 * @param {string[]} subKeywords
 * @param {{ title?: string, description?: string }} video
 */
function evaluateRawVideoMatch(mainKeyword, subKeywords, video) {
  const subs = normalizeSubKeywordsList(subKeywords);
  const hay = haystackFromVideoRaw(video);
  return evaluateMatchFromHaystack(mainKeyword, subs, hay);
}

/**
 * @param {string} mainKeyword
 * @param {string[]} subKeywords
 * @returns {string[]}
 */
/**
 * Express query values: repeated `subKeywords` and/or comma-separated strings.
 * @param {unknown} raw - string | string[] | undefined
 * @returns {string[]}
 */
function parseSubKeywordsFromQueryValue(raw) {
  if (Array.isArray(raw)) {
    return raw.flatMap((r) => String(r).split(',')).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function buildYoutubeSearchQueries(mainKeyword, subKeywords) {
  const main = String(mainKeyword ?? '').trim();
  if (!main) return [];
  const subs = normalizeSubKeywordsList(subKeywords);
  const queries = [main];
  const maxExtra = 3;
  for (let i = 0; i < Math.min(subs.length, maxExtra); i++) {
    queries.push(`${main} ${subs[i]}`.trim());
  }
  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

module.exports = {
  normalizeText,
  normalizeSubKeywordsList,
  parseSubKeywordsFromQueryValue,
  evaluateVideoMatch,
  evaluateRawVideoMatch,
  evaluateMatchFromHaystack,
  haystackFromVideoRaw,
  haystackFromVideoEnriched,
  buildYoutubeSearchQueries,
};
