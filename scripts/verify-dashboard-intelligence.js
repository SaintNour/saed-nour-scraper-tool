#!/usr/bin/env node
const assert = require('assert');
const { buildDashboardIntelligence } = require('../src/services/dashboardIntelligenceService');

const sample = {
  query: 'brand x',
  main_keyword: 'brand x',
  sub_keywords: ['battery'],
  platform: 'youtube',
  summary: 'Customers mention battery life and shipping delays.',
  sentiment: { positive: 40, neutral: 35, negative: 25 },
  overall_sentiment: 'neutral',
  top_complaints: ['shipping delays'],
  top_positive_mentions: ['build quality'],
  insight_drivers: {
    why_negative: ['Shipping friction shows up repeatedly in comments.'],
    why_positive: ['Hardware quality is a recurring praise theme.'],
  },
  recommended_actions: ['Clarify delivery timelines in checkout.'],
  videos: [
    {
      id: 'a',
      title: 'Unboxing',
      url: 'https://example.com/a',
      comments_analyzed: 50,
      audience_sentiment: { positive: 30, neutral: 40, negative: 30 },
      match_meta: { matchedSubKeywords: ['battery'] },
    },
  ],
  analysis_source: 'openai',
  _analysis_mode: 'openai',
  total_comments_analyzed: 50,
};

const intel = buildDashboardIntelligence(sample, {
  dateRange: { start: '2026-01-01', end: '2026-01-31', label: 'January' },
  historySummary: 'Prior run was more positive.',
});

assert.strictEqual(intel.keyword, 'brand x');
assert.ok(Array.isArray(intel.topStrengths));
assert.ok(intel.priorityContent.length >= 1);
assert.ok(intel.analysisSourceSummary.counts.openai >= 1);
console.log('OK dashboard intelligence smoke test');
console.log(JSON.stringify(intel, null, 2));
