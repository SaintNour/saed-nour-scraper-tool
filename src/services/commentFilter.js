/**
 * Pre-filters YouTube comments before any AI call: drops noise, dedupes, caps volume.
 * Tunable via env or per-call limits from {@link filterBatchItemsForAi}.
 */

const { safety } = require('../config/openaiEnv');

const MIN_CHARS = Number(process.env.COMMENT_MIN_CHARS || 12);
const MAX_PER_VIDEO_FOR_AI = Number(process.env.COMMENT_MAX_PER_VIDEO_AI || 8);
const MAX_TOTAL_FOR_AI = Number(
  process.env.COMMENT_MAX_TOTAL_AI || safety.maxCommentsTotalPerScan,
);

function isMostlyNonVerbal(text) {
  const t = String(text || '').replace(/\s/g, '');
  if (t.length < 8) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  return letters < 4;
}

const SPAM_PATTERNS = [
  /subscribe\s*to\s*my\s*channel/i,
  /check\s*out\s*my\s*channel/i,
  /^.{0,3}(sub|subs|subscribe)\b/i,
  /^\s*first\s*!?\s*$/i,
  /^\s*(lol|lmao|haha)\s*!?\s*$/i,
];

function normalizeForDedupe(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?.]+$/g, '')
    .trim();
}

function isNoise(text) {
  const t = String(text || '').trim();
  if (t.length < MIN_CHARS) return true;
  if (isMostlyNonVerbal(t)) return true;
  if (/^\d+$/.test(t)) return true;
  for (const re of SPAM_PATTERNS) {
    if (re.test(t)) return true;
  }
  return false;
}

function scoreComment(text) {
  const t = String(text || '');
  const len = t.length;
  const wordCount = t.split(/\s+/).filter(Boolean).length;
  // Prefer longer, substantive comments; slight boost for question marks (often signal)
  let score = len + wordCount * 3 + (/\?/.test(t) ? 15 : 0);
  return score;
}

/**
 * Dedupe by normalized text, keep highest-scoring instance.
 * @param {string[]} comments
 * @returns {string[]}
 */
function dedupeByNormalized(comments) {
  const best = new Map();
  for (const raw of comments) {
    const t = String(raw || '').trim();
    if (!t) continue;
    const key = normalizeForDedupe(t);
    if (key.length < 8) continue;
    const sc = scoreComment(t);
    const prev = best.get(key);
    if (!prev || sc > prev.score) best.set(key, { text: t, score: sc });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).map((x) => x.text);
}

/**
 * @param {string[]} comments
 * @returns {{ filtered: string[], stats: { raw: number, droppedNoise: number, droppedDup: number, sent: number } }}
 */
function filterCommentsForAi(comments) {
  const raw = Array.isArray(comments) ? comments : [];
  let droppedNoise = 0;
  const passed = [];
  for (const c of raw) {
    if (isNoise(c)) {
      droppedNoise += 1;
    } else {
      passed.push(String(c).trim());
    }
  }
  const beforeDedupe = passed.length;
  const deduped = dedupeByNormalized(passed);
  const droppedDup = beforeDedupe - deduped.length;

  const sorted = deduped.sort((a, b) => scoreComment(b) - scoreComment(a));
  const capped = sorted.slice(0, MAX_TOTAL_FOR_AI);

  return {
    filtered: capped,
    stats: {
      raw: raw.length,
      droppedNoise,
      droppedDup,
      sent: capped.length,
    },
  };
}

/**
 * Per-video noise/dedupe, then global budget across the batch (representative subset).
 * @param {Array<{ video_id: string, title?: string, description?: string, comments: string[] }>} items
 * @param {{ maxPerVideo?: number, maxTotal?: number }} [limits]
 * @returns {{ items: typeof items, stats: { rawTotal: number, droppedNoise: number, sentToAi: number } }}
 */
function filterBatchItemsForAi(items, limits = {}) {
  const maxPerVideoCap = Math.min(
    safety.maxCommentsPerVideoFetch,
    limits.maxPerVideo ?? MAX_PER_VIDEO_FOR_AI,
  );
  const maxTotalCap = Math.min(
    safety.maxCommentsTotalPerScan,
    limits.maxTotal ?? MAX_TOTAL_FOR_AI,
  );

  const lists = [];
  let totalRaw = 0;
  let totalDroppedNoise = 0;

  for (const item of items) {
    const raw = Array.isArray(item.comments) ? item.comments : [];
    totalRaw += raw.length;
    const passed = [];
    for (const c of raw) {
      if (isNoise(c)) totalDroppedNoise += 1;
      else passed.push(String(c).trim());
    }
    const deduped = dedupeByNormalized(passed);
    const sorted = deduped.sort((a, b) => scoreComment(b) - scoreComment(a));
    const capped = sorted.slice(0, maxPerVideoCap);
    for (const text of capped) {
      lists.push({ video_id: item.video_id, text, score: scoreComment(text) });
    }
  }

  lists.sort((a, b) => b.score - a.score);
  const picked = lists.slice(0, maxTotalCap);

  const byVid = new Map();
  for (const item of items) {
    byVid.set(item.video_id, []);
  }
  for (const p of picked) {
    const arr = byVid.get(p.video_id);
    if (arr) arr.push(p.text);
  }

  const out = items.map((item) => ({
    ...item,
    comments: byVid.get(item.video_id) || [],
  }));

  return {
    items: out,
    stats: {
      rawTotal: totalRaw,
      droppedNoise: totalDroppedNoise,
      sentToAi: picked.length,
    },
  };
}

module.exports = {
  filterCommentsForAi,
  filterBatchItemsForAi,
  MIN_CHARS,
  MAX_PER_VIDEO_FOR_AI,
  MAX_TOTAL_FOR_AI,
  scoreComment,
};
