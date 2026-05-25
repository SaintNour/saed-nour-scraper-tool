/**
 * Phase-1 local sentiment layer: lexicon + phrases + light negation/intensifier handling.
 * Use before OpenAI to classify obvious cases; escalate when `fallbackNeeded` is true.
 *
 * @module localSentimentService
 */

/** @typedef {'positive' | 'negative' | 'neutral'} SentimentLabel */

const NEGATORS = new Set([
  'not',
  'no',
  'never',
  'neither',
  'nobody',
  'nothing',
  'nowhere',
  'without',
  "isn't",
  "wasn't",
  "weren't",
  "aren't",
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "couldn't",
  "won't",
  "wouldn't",
  "shouldn't",
  'cannot',
]);

const INTENSIFIERS = new Set(['very', 'really', 'super', 'extremely', 'so', 'totally', 'highly', 'quite']);

/** Single-token signals (longer checked via phrases first). */
const POSITIVE_WORDS = new Set([
  'great',
  'amazing',
  'good',
  'love',
  'best',
  'solid',
  'reliable',
  'happy',
  'impressed',
  'excellent',
  'awesome',
  'perfect',
  'fantastic',
  'wonderful',
  'brilliant',
  'outstanding',
  'helpful',
  'recommend',
  'recommended',
  'quality',
  'worth',
]);

const NEGATIVE_WORDS = new Set([
  'trash',
  'garbage',
  'scam',
  'bad',
  'terrible',
  'worst',
  'junk',
  'broken',
  'overpriced',
  'disappointed',
  'disappointing',
  'hate',
  'awful',
  'horrible',
  'useless',
  'regret',
  'refund',
  'waste',
]);

/** Multi-word patterns (matched before single words). Order: longest intent first. */
const POSITIVE_PHRASES = [
  'worth it',
  'well worth',
  'highly recommend',
  'love it',
  'best purchase',
  'great product',
  'very happy',
  'really good',
  'really great',
  'very good',
  'very satisfied',
];

const NEGATIVE_PHRASES = [
  'waste of money',
  'waste of time',
  'not worth it',
  'not worth',
  'never again',
  'not good',
  'not reliable',
  'very bad',
  'really bad',
  'super disappointing',
  'very disappointing',
  'rip off',
  'ripoff',
];

const MIN_CHARS_FALLBACK = 15;
/** Minimum accumulated weight on the winning side (single strong word can qualify). */
const MIN_WEIGHT_STRONG = 1.0;
const RATIO_WIN = 1.35;
const CONF_MIXED_LOW = 0.55;

/**
 * @param {string} text
 * @returns {string[]}
 */
function wordsBeforeIndex(text, idx, maxWords) {
  const before = text.slice(0, idx).toLowerCase();
  const m = before.match(/\b[\w']+\b/g);
  if (!m || m.length === 0) return [];
  return m.slice(-maxWords);
}

/**
 * @param {string[]} wordsBefore
 * @returns {boolean}
 */
function hasNegationInWindow(wordsBefore) {
  for (let i = wordsBefore.length - 1; i >= 0 && i >= wordsBefore.length - 5; i -= 1) {
    if (NEGATORS.has(wordsBefore[i])) return true;
  }
  return false;
}

/**
 * @param {string[]} wordsBefore
 * @returns {boolean}
 */
function hasIntensifierAdjacent(wordsBefore) {
  const last = wordsBefore[wordsBefore.length - 1];
  return last ? INTENSIFIERS.has(last) : false;
}

/**
 * Score phrase/word hits with negation + intensifier heuristics.
 * @param {string} rawText
 * @returns {{ pos: number, neg: number, matchedPositiveWords: string[], matchedNegativeWords: string[], matchedPhrases: string[] }}
 */
function scoreText(rawText) {
  const text = String(rawText || '');
  const lower = text.toLowerCase();
  const matchedPositiveWords = [];
  const matchedNegativeWords = [];
  const matchedPhrases = [];
  let pos = 0;
  let neg = 0;

  const used = []; // [start, end] exclusive ranges to avoid double-counting overlaps

  function overlaps(s, e) {
    return used.some(([a, b]) => !(e <= a || s >= b));
  }

  function mark(s, e) {
    used.push([s, e]);
  }

  function bumpPhrase(start, end, phrase, isPositive) {
    if (overlaps(start, end)) return;
    const wb = wordsBeforeIndex(lower, start, 6);
    const negated = hasNegationInWindow(wb);
    const intens = hasIntensifierAdjacent(wb);
    let w = 1 + (intens ? 0.35 : 0);
    if (negated) w *= -1;

    matchedPhrases.push(phrase);
    if (isPositive) {
      if (negated) {
        neg += Math.abs(w);
        matchedNegativeWords.push(`¬${phrase}`);
      } else {
        pos += w;
        matchedPositiveWords.push(phrase);
      }
    } else if (negated) {
      pos += Math.abs(w) * 0.5;
      matchedPositiveWords.push(`¬${phrase}`);
    } else {
      neg += w;
      matchedNegativeWords.push(phrase);
    }
    mark(start, end);
  }

  // Phrases (positive)
  for (const phrase of [...POSITIVE_PHRASES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    let m;
    while ((m = re.exec(lower)) !== null) {
      bumpPhrase(m.index, m.index + m[0].length, phrase, true);
    }
  }

  // Phrases (negative)
  for (const phrase of [...NEGATIVE_PHRASES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    let m;
    while ((m = re.exec(lower)) !== null) {
      bumpPhrase(m.index, m.index + m[0].length, phrase, false);
    }
  }

  // Single words (skip if substring inside used range — crude: check overlap)
  function wordHit(word, isPositive) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let m;
    while ((m = re.exec(lower)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      if (overlaps(s, e)) continue;
      const wb = wordsBeforeIndex(lower, s, 6);
      const negated = hasNegationInWindow(wb);
      const intens = hasIntensifierAdjacent(wb);
      let w = 1 + (intens ? 0.35 : 0);
      if (negated) w *= -1;

      if (isPositive) {
        if (negated) {
          neg += Math.abs(w);
          matchedNegativeWords.push(`¬${word}`);
        } else {
          pos += w;
          matchedPositiveWords.push(word);
        }
      } else if (negated) {
        pos += Math.abs(w) * 0.55;
        matchedPositiveWords.push(`¬${word}`);
      } else {
        neg += w;
        matchedNegativeWords.push(word);
      }
      mark(s, e);
    }
  }

  for (const w of POSITIVE_WORDS) wordHit(w, true);
  for (const w of NEGATIVE_WORDS) wordHit(w, false);

  return {
    pos,
    neg,
    matchedPositiveWords: [...new Set(matchedPositiveWords)],
    matchedNegativeWords: [...new Set(matchedNegativeWords)],
    matchedPhrases: [...new Set(matchedPhrases)],
  };
}

/**
 * Derive label + confidence + fallback from scores.
 * @param {{ pos: number, neg: number }} s
 * @param {string} rawText
 */
function decide(s, rawText) {
  const t = String(rawText || '').trim();
  const total = s.pos + s.neg;

  if (t.length < MIN_CHARS_FALLBACK) {
    return {
      sentiment: /** @type {SentimentLabel} */ ('neutral'),
      confidence: 0.25,
      fallbackNeeded: true,
      reason: 'text_too_short',
    };
  }

  if (total < 0.45) {
    return {
      sentiment: /** @type {SentimentLabel} */ ('neutral'),
      confidence: 0.35,
      fallbackNeeded: true,
      reason: 'weak_evidence',
    };
  }

  const mixed =
    s.pos >= 0.85 &&
    s.neg >= 0.85 &&
    s.pos / s.neg < RATIO_WIN &&
    s.neg / s.pos < RATIO_WIN;

  if (mixed) {
    return {
      sentiment: /** @type {SentimentLabel} */ ('neutral'),
      confidence: Math.max(0.35, 1 - Math.abs(s.pos - s.neg) / (total + 0.01)),
      fallbackNeeded: true,
      reason: 'mixed_signals',
    };
  }

  let sentiment;
  if (s.pos > s.neg * RATIO_WIN && s.pos >= MIN_WEIGHT_STRONG) {
    sentiment = 'positive';
  } else if (s.neg > s.pos * RATIO_WIN && s.neg >= MIN_WEIGHT_STRONG) {
    sentiment = 'negative';
  } else {
    return {
      sentiment: /** @type {SentimentLabel} */ ('neutral'),
      confidence: 0.42,
      fallbackNeeded: true,
      reason: 'ambiguous_balance',
    };
  }

  const margin = Math.abs(s.pos - s.neg);
  let confidence = 0.55 + Math.min(0.4, margin / (total + 1) + total * 0.06);
  if (confidence > 0.97) confidence = 0.97;

  const fallbackNeeded = confidence < CONF_MIXED_LOW + 0.02;

  return {
    sentiment: /** @type {SentimentLabel} */ (sentiment),
    confidence,
    fallbackNeeded,
    reason: fallbackNeeded ? 'low_confidence_margin' : 'strong_lexicon_signal',
  };
}

/**
 * Main API: analyze arbitrary text (title, description, comment, or combined).
 * @param {string} text
 * @returns {{
 *   sentiment: SentimentLabel,
 *   confidence: number,
 *   matchedPositiveWords: string[],
 *   matchedNegativeWords: string[],
 *   matchedPhrases: string[],
 *   fallbackNeeded: boolean,
 *   reason: string
 * }}
 */
function analyzeLocalSentiment(text) {
  const s = scoreText(text);
  const d = decide(s, text);
  return {
    sentiment: d.sentiment,
    confidence: d.confidence,
    matchedPositiveWords: s.matchedPositiveWords,
    matchedNegativeWords: s.matchedNegativeWords,
    matchedPhrases: s.matchedPhrases,
    fallbackNeeded: d.fallbackNeeded,
    reason: d.reason,
  };
}

/**
 * Combine content item fields for a single local pass (audience + content context).
 * @param {{ title?: string, description?: string, comments?: string[] }} item
 * @returns {string}
 */
function combineItemText(item) {
  const title = String(item?.title || '').trim();
  const description = String(item?.description || '').trim();
  const comments = Array.isArray(item.comments) ? item.comments.map((c) => String(c || '').trim()).filter(Boolean) : [];
  return [title, description, ...comments].join('\n');
}

/**
 * Analyze one batch item (combined text).
 * @param {{ title?: string, description?: string, comments?: string[] }} item
 */
function analyzeItemSentiment(item) {
  return analyzeLocalSentiment(combineItemText(item));
}

module.exports = {
  analyzeLocalSentiment,
  combineItemText,
  analyzeItemSentiment,
  scoreText,
};
