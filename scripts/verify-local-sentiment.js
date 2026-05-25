#!/usr/bin/env node
/**
 * Quick checks for localSentimentService (run: node scripts/verify-local-sentiment.js)
 */

const assert = require('assert');
const { analyzeLocalSentiment } = require('../src/services/localSentimentService');

const cases = [
  {
    name: 'trash — negative, high confidence',
    text: 'This product is trash',
    expect: { sentiment: 'negative', fallbackNeeded: false },
  },
  {
    name: 'great + love — positive, high confidence',
    text: 'This is great, I love it',
    expect: { sentiment: 'positive', fallbackNeeded: false },
  },
  {
    name: 'no strong lexicon — fallback (weak)',
    text:
      'Satisfactory but unremarkable experience with no strong positives or negatives in the short time I used it.',
    expect: { fallbackNeeded: true },
  },
  {
    name: 'not worth + disappointing — negative',
    text: 'Not worth it, very disappointing',
    expect: { sentiment: 'negative', fallbackNeeded: false },
  },
];

let failed = 0;
for (const c of cases) {
  const r = analyzeLocalSentiment(c.text);
  try {
    if (c.expect.sentiment !== undefined) {
      assert.strictEqual(r.sentiment, c.expect.sentiment, 'sentiment');
    }
    if (c.expect.fallbackNeeded !== undefined) {
      assert.strictEqual(r.fallbackNeeded, c.expect.fallbackNeeded, 'fallbackNeeded');
    }
    console.log(`OK  ${c.name}`, {
      sentiment: r.sentiment,
      confidence: r.confidence.toFixed(2),
      fallbackNeeded: r.fallbackNeeded,
      reason: r.reason,
    });
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${c.name}`, r, e.message);
  }
}

if (failed) {
  process.exit(1);
}
console.log('\nAll local sentiment checks passed.');
