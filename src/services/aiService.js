const { analyzeComments } = require('./openaiService');
const {
  isOpenAiEnabled,
  isDevMockEnabled,
  describeOpenAiBlockedReason,
  defaultModel,
  premiumModel,
  pools,
} = require('../config/openaiEnv');
const { chatCompletion } = require('./openaiRuntime');
const { recordHeuristicFallback } = require('./openaiFallbackLog');
const { analyzeItemSentiment } = require('./localSentimentService');

/** Serialized user JSON must not exceed this (chars) — aligns with ~10k token input budget. */
const MAX_BATCH_INPUT_CHARS = 36000;

/** Batch completion — bounded by mini pool per-request output cap. */
const MAX_BATCH_COMPLETION_TOKENS = () =>
  Math.min(1500, pools.mini.maxOutputPerRequest);

/**
 * When true (default), skip the OpenAI batch call if every item passes the local layer with high confidence.
 * Set LOCAL_SENTIMENT_SHORT_CIRCUIT=false to always use OpenAI when enabled.
 */
const LOCAL_LAYER_SHORT_CIRCUIT =
  String(process.env.LOCAL_SENTIMENT_SHORT_CIRCUIT || 'true').toLowerCase() !== 'false';

const LOCAL_LAYER_MIN_CONFIDENCE = Number(process.env.LOCAL_SENTIMENT_MIN_CONFIDENCE || 0.58);

const NEUTRAL_SENTIMENT = { positive: 0, neutral: 100, negative: 0 };
const POSITIVE_TERMS = [
  'good',
  'great',
  'excellent',
  'love',
  'amazing',
  'recommend',
  'helpful',
  'fast',
  'quality',
  'easy',
];
const NEGATIVE_TERMS = [
  'bad',
  'poor',
  'terrible',
  'hate',
  'broken',
  'refund',
  'slow',
  'waste',
  'issue',
  'problem',
];
const COMPLAINT_THEME_TERMS = ['price', 'shipping', 'quality', 'battery', 'support'];
const PRAISE_THEME_TERMS = ['value', 'design', 'quality', 'performance', 'service'];

function countTermHits(text, terms) {
  const t = String(text || '').toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (t.includes(term)) total += 1;
  }
  return total;
}

function asPercentSentiment({ positiveHits, negativeHits }) {
  if (positiveHits === 0 && negativeHits === 0) return { ...NEUTRAL_SENTIMENT };
  const neutralBase = 30;
  const signal = positiveHits + negativeHits;
  const positive = Math.round(((100 - neutralBase) * positiveHits) / signal);
  const negative = Math.round((100 - neutralBase) - positive);
  const neutral = 100 - positive - negative;
  return { positive, neutral, negative };
}

function dominantLabel(sentiment) {
  if (sentiment.positive >= sentiment.neutral && sentiment.positive >= sentiment.negative) {
    return 'positive';
  }
  if (sentiment.negative >= sentiment.positive && sentiment.negative >= sentiment.neutral) {
    return 'negative';
  }
  return 'neutral';
}

function buildContentSummary(item) {
  const title = String(item?.title || '').trim();
  const description = String(item?.description || '').trim();
  if (title && description) {
    return `${title} — ${description.slice(0, 110)}${description.length > 110 ? '…' : ''}`;
  }
  if (title) return title;
  if (description) return description.slice(0, 120);
  return 'No content summary available.';
}

/**
 * @param {{ title?: string, description?: string }} item
 * @returns {'positive' | 'negative' | 'neutral'}
 */
function deriveVideoToneFromContent(item) {
  const contentText = [item?.title, item?.description].join(' ');
  const p = countTermHits(contentText, POSITIVE_TERMS);
  const n = countTermHits(contentText, NEGATIVE_TERMS);
  if (p > n) return 'positive';
  if (n > p) return 'negative';
  return 'neutral';
}

/**
 * Build a compact per-item insight block without extra model calls.
 * @param {{ title?: string, description?: string, comments?: string[] }} item
 * @param {'positive' | 'neutral' | 'negative'} contentLabel
 */
function buildVideoInsightSummary(item, contentLabel) {
  const content = buildContentSummary(item);
  let tone = contentLabel;
  if (tone === 'neutral') {
    tone = deriveVideoToneFromContent(item);
  }

  return {
    summary: String(content).slice(0, 220),
    video_tone: tone,
  };
}

function aggregateThemes(items, terms, fallback) {
  const counts = new Map();
  for (const term of terms) counts.set(term, 0);

  for (const item of items) {
    const text = [item.title, item.description, ...(item.comments || [])].join(' ');
    for (const term of terms) {
      if (String(text).toLowerCase().includes(term)) {
        counts.set(term, (counts.get(term) || 0) + 1);
      }
    }
  }

  const ranked = [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([term]) => term);
  return ranked.length ? ranked : [fallback];
}

/**
 * @param {{ label?: string, logDetail?: string, requestSkipped?: boolean }} meta
 * @returns {{ category: string, detail: string }}
 */
function classifyHeuristicFallbackMeta(meta) {
  const label = meta.label || 'heuristic';
  const logDetail = String(meta.logDetail || '');
  const combined = `${label} ${logDetail}`;

  if (label === 'dev_mock') {
    return { category: 'dev_mock_forced', detail: logDetail || 'OPENAI_DEV_MOCK or AI_DEV_MOCK' };
  }
  if (label === 'openai_disabled') {
    const why = describeOpenAiBlockedReason() || 'unknown';
    if (/OPENAI_ENABLED is false/i.test(why)) {
      return { category: 'config_disabled', detail: why };
    }
    if (/malformed|missing, empty, or invalid|invalid value/i.test(why)) {
      return { category: 'invalid_or_missing_key', detail: why };
    }
    return { category: 'config_disabled', detail: why };
  }
  if (
    /hard_cap|budget|exceeds_pool|estimated_input/i.test(combined) ||
    /budget_or_guard/i.test(logDetail) ||
    label === 'mini_pool_hard_cap_skip' ||
    label === 'budget_hard_cap_skip'
  ) {
    return { category: 'budget_blocked', detail: logDetail || label };
  }
  if (label === 'parse_error') {
    return { category: 'parse_error', detail: logDetail };
  }
  if (meta.requestSkipped && /OPENAI_API_KEY|invalid format/i.test(logDetail)) {
    return { category: 'invalid_or_missing_key', detail: logDetail };
  }
  if (label === 'heuristic' && !logDetail) {
    return { category: 'generic_heuristic', detail: '' };
  }
  return { category: 'openai_request_failed', detail: logDetail || label };
}

/**
 * Heuristic fallback when OpenAI is off, budget-exhausted, or API fails (no silent mock as default).
 * @param {{ label?: string, logDetail?: string, requestSkipped?: boolean }} meta
 */
function buildHeuristicBatchAnalysis(payload, meta = {}) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const videos = items.map((item) => {
    const contentText = [item.title, item.description].join(' ');
    const audienceText = (item.comments || []).join(' ');

    const contentPositiveHits = countTermHits(contentText, POSITIVE_TERMS);
    const contentNegativeHits = countTermHits(contentText, NEGATIVE_TERMS);
    const audiencePositiveHits = countTermHits(audienceText, POSITIVE_TERMS);
    const audienceNegativeHits = countTermHits(audienceText, NEGATIVE_TERMS);
    const contentSentiment = asPercentSentiment({
      positiveHits: contentPositiveHits,
      negativeHits: contentNegativeHits,
    });
    const audienceSentiment = asPercentSentiment({
      positiveHits: audiencePositiveHits,
      negativeHits: audienceNegativeHits,
    });

    return {
      video_id: item.video_id,
      content_summary: buildContentSummary(item),
      content_sentiment_label: dominantLabel(contentSentiment),
      audience_sentiment: audienceSentiment,
      video_insight_summary: buildVideoInsightSummary(item, dominantLabel(contentSentiment)),
    };
  });

  const overall = videos.length
    ? {
        positive: Math.round(
          videos.reduce((s, v) => s + v.audience_sentiment.positive, 0) / videos.length,
        ),
        neutral: Math.round(
          videos.reduce((s, v) => s + v.audience_sentiment.neutral, 0) / videos.length,
        ),
        negative: Math.round(
          videos.reduce((s, v) => s + v.audience_sentiment.negative, 0) / videos.length,
        ),
      }
    : { ...NEUTRAL_SENTIMENT };
  overall.neutral = 100 - overall.positive - overall.negative;

  const topComplaints = aggregateThemes(items, COMPLAINT_THEME_TERMS, 'Limited complaint signals');
  const topPositiveMentions = aggregateThemes(items, PRAISE_THEME_TERMS, 'Limited praise signals');

  const whyNegative = topComplaints
    .filter((t) => t && !t.startsWith('Limited'))
    .slice(0, 3)
    .map(
      (t) =>
        `Customers often cite ${t} when expressing frustration — worth checking fulfillment and messaging.`,
    );
  if (whyNegative.length === 0) {
    whyNegative.push('No strong negative theme stood out in this sample.');
  }

  const whyPositive = topPositiveMentions
    .filter((t) => t && !t.startsWith('Limited'))
    .slice(0, 3)
    .map((t) => `People repeatedly praise ${t}; consider doubling down in marketing and FAQs.`);

  if (whyPositive.length === 0) {
    whyPositive.push('Positive signals are light in this sample.');
  }

  const recommendedActions = [];
  if (topComplaints[0] && !String(topComplaints[0]).startsWith('Limited')) {
    recommendedActions.push(`Clarify policies and updates around ${topComplaints[0]}`);
  }
  if (topPositiveMentions[0] && !String(topPositiveMentions[0]).startsWith('Limited')) {
    recommendedActions.push(`Highlight ${topPositiveMentions[0]} in product pages and creative`);
  }
  if (dominantLabel(overall) === 'negative') {
    recommendedActions.push('Prioritize a response plan for recurring complaints before the next campaign');
  }
  recommendedActions.push('Re-run this search after shipping or pricing changes to measure impact');
  const recommended_actions = [...new Set(recommendedActions)].slice(0, 5);

  const label = meta.label || 'heuristic';
  const logDetail = meta.logDetail || '';

  let summaryNote = `Heuristic offline analysis (${videos.length} videos, overall ${dominantLabel(overall)}).`;
  if (label === 'dev_mock') {
    summaryNote = `Development mode: OPENAI_DEV_MOCK or AI_DEV_MOCK is enabled. Heuristic scoring only (${videos.length} videos). Disable those variables and restart the server to use the live OpenAI API.`;
  } else if (label === 'openai_disabled') {
    const why = describeOpenAiBlockedReason() || 'see server logs';
    if (/OPENAI_ENABLED is false/i.test(why)) {
      summaryNote = `OpenAI is disabled (OPENAI_ENABLED=false). Heuristic scoring only (${videos.length} videos).`;
    } else if (/OPENAI_API_KEY is missing|malformed|empty, or invalid|invalid value/i.test(why)) {
      summaryNote = `OpenAI API key is missing or not valid in the project root .env. Heuristic scoring only (${videos.length} videos).`;
    } else {
      summaryNote = `OpenAI is not active for this server (${why}). Heuristic scoring only (${videos.length} videos).`;
    }
  } else if (
    /hard_cap|budget|exceeds_pool|estimated_input/i.test(String(label)) ||
    /budget_or_guard/i.test(logDetail)
  ) {
    summaryNote = `Token budget or request-size limits blocked a live OpenAI call. Heuristic scoring only (${videos.length} videos).`;
  } else if (label === 'parse_error') {
    summaryNote = `OpenAI returned a response that could not be parsed as JSON. Heuristic scoring only (${videos.length} videos).`;
  } else if (label !== 'heuristic') {
    summaryNote = `OpenAI did not return a usable result (${label}). Heuristic scoring only (${videos.length} videos).`;
  }

  const { category, detail } = classifyHeuristicFallbackMeta({
    label,
    logDetail,
    requestSkipped: meta.requestSkipped,
  });
  recordHeuristicFallback(category, detail);
  const logSuffix = detail ? ` | ${detail.slice(0, 220)}` : '';
  console.warn(`[ai] heuristic fallback: category=${category}${logSuffix} | videos=${videos.length}`);

  return {
    overall_sentiment: overall,
    overall_sentiment_label: dominantLabel(overall),
    top_complaints: topComplaints,
    top_positive_mentions: topPositiveMentions,
    insight_drivers: {
      why_negative: whyNegative,
      why_positive: whyPositive,
    },
    recommended_actions,
    summary: summaryNote,
    videos,
    _analysis_mode: 'heuristic',
    _analysis_reason: label,
  };
}

const BATCH_SCHEMA = {
  name: 'youtube_batch_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      overall_sentiment: {
        type: 'object',
        properties: {
          positive: { type: 'number', description: 'Percentage 0–100' },
          neutral: { type: 'number' },
          negative: { type: 'number' },
        },
        required: ['positive', 'neutral', 'negative'],
        additionalProperties: false,
      },
      overall_sentiment_label: {
        type: 'string',
        enum: ['positive', 'neutral', 'negative'],
      },
      top_complaints: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
      },
      top_positive_mentions: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
      },
      summary: { type: 'string' },
      insight_drivers: {
        type: 'object',
        properties: {
          why_negative: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
            description: 'Short business-readable sentences on why sentiment is negative',
          },
          why_positive: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
            description: 'Short business-readable sentences on why sentiment is positive',
          },
        },
        required: ['why_negative', 'why_positive'],
        additionalProperties: false,
      },
      recommended_actions: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 6,
        description: 'Concrete next steps for marketing, product, or support',
      },
      videos: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            video_id: { type: 'string' },
            content_summary: {
              type: 'string',
              description: 'One concise sentence: inferred topic/angle from title, description, and comments',
            },
            content_sentiment_label: {
              type: 'string',
              enum: ['positive', 'neutral', 'negative'],
              description: 'Dominant tone of that video’s content and discussion',
            },
            audience_sentiment: {
              type: 'object',
              properties: {
                positive: { type: 'number' },
                neutral: { type: 'number' },
                negative: { type: 'number' },
              },
              required: ['positive', 'neutral', 'negative'],
              additionalProperties: false,
            },
            video_insight_summary: {
              type: 'object',
              properties: {
                summary: {
                  type: 'string',
                  description: '1-2 short sentences describing what the content discusses.',
                },
                video_tone: {
                  type: 'string',
                  enum: ['positive', 'negative', 'neutral'],
                  description:
                    'Tone of the video/post content itself (creator stance), not audience comments. Prefer positive or negative; use neutral only when truly balanced.',
                },
              },
              required: ['summary', 'video_tone'],
              additionalProperties: false,
            },
          },
          required: [
            'video_id',
            'content_summary',
            'content_sentiment_label',
            'audience_sentiment',
            'video_insight_summary',
          ],
          additionalProperties: false,
        },
      },
    },
    required: [
      'overall_sentiment',
      'overall_sentiment_label',
      'top_complaints',
      'top_positive_mentions',
      'summary',
      'insight_drivers',
      'recommended_actions',
      'videos',
    ],
    additionalProperties: false,
  },
};

function applyBatchPayloadGuard(payload) {
  const max = MAX_BATCH_INPUT_CHARS;
  const clone = JSON.parse(JSON.stringify(payload));
  if (!Array.isArray(clone.items)) {
    clone.items = [];
  }

  for (;;) {
    const size = JSON.stringify(clone).length;
    if (size <= max) {
      return clone;
    }

    let progress = false;

    for (let i = clone.items.length - 1; i >= 0; i--) {
      if (clone.items[i].comments?.length > 0) {
        clone.items[i].comments.pop();
        progress = true;
        break;
      }
    }
    if (progress) continue;

    for (const item of clone.items) {
      if (item.title && item.title.length > 80) {
        item.title = `${item.title.slice(0, 80)}…`;
        progress = true;
      }
    }
    if (progress) continue;

    for (const item of clone.items) {
      if (item.description && item.description.length > 50) {
        item.description = item.description.slice(0, item.description.length - 120);
        progress = true;
        break;
      }
    }
    if (progress) continue;

    throw new Error(
      `Batch input exceeds maximum serialized size (${max} chars) and could not be reduced safely`,
    );
  }
}

function parseBatchResponse(raw) {
  if (raw == null || raw === '') {
    throw new Error('OpenAI returned empty message content; cannot parse batch JSON');
  }
  const str = typeof raw === 'string' ? raw : String(raw);
  try {
    return JSON.parse(str);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse OpenAI batch JSON response: ${detail}`);
  }
}

async function enhanceSummaryWithPremiumModel(safePayload, batch) {
  if (!isOpenAiEnabled()) return null;

  const userJson = JSON.stringify({
    query: safePayload.query,
    platform: safePayload.platform,
    draft_summary: batch.summary,
    top_complaints: batch.top_complaints,
    top_positive_mentions: batch.top_positive_mentions,
  });

  const messages = [
    {
      role: 'system',
      content:
        'You write a short executive dashboard summary (2–4 sentences). Neutral tone, no markdown, no bullet points.',
    },
    { role: 'user', content: userJson },
  ];

  const maxOut = Math.min(800, pools.large.maxOutputPerRequest);
  const r = await chatCompletion({
    messages,
    model: premiumModel,
    max_tokens: maxOut,
    temperature: 0.35,
    taskType: 'premium',
  });

  if (!r.ok) {
    console.warn('[analysis] fallback reason:', r.reason);
    console.warn('[analysis] premium summary detail:', { skip: r.skip, reason: r.reason });
    console.warn('[ai] premium summary skipped:', r.reason);
    return null;
  }
  const text = String(r.content || '').trim();
  return text || null;
}

/**
 * Map local label + confidence to a 0–100 audience_sentiment block (sums to 100).
 * @param {'positive' | 'negative' | 'neutral'} label
 * @param {number} confidence
 */
function audienceFromLocalLabel(label, confidence) {
  const c = Math.min(0.97, Math.max(0.5, confidence));
  if (label === 'positive') {
    const positive = Math.min(92, Math.round(52 + c * 40));
    const negative = Math.round((100 - positive) * 0.28);
    const neutral = 100 - positive - negative;
    return { positive, neutral, negative };
  }
  if (label === 'negative') {
    const negative = Math.min(92, Math.round(52 + c * 40));
    const positive = Math.round((100 - negative) * 0.28);
    const neutral = 100 - positive - negative;
    return { positive, neutral, negative };
  }
  return { positive: 34, neutral: 38, negative: 28 };
}

/**
 * Build the same batch shape as OpenAI using only the local sentiment layer (cost saver).
 * @param {object} payload
 * @param {Array<ReturnType<typeof analyzeItemSentiment>>} perItemLocal
 */
function buildBatchFromLocalSentiment(payload, perItemLocal) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const videos = items.map((item, i) => {
    const loc = perItemLocal[i];
    const audienceSentiment = audienceFromLocalLabel(loc.sentiment, loc.confidence);
    return {
      video_id: item.video_id,
      content_summary: buildContentSummary(item),
      content_sentiment_label: loc.sentiment,
      audience_sentiment: audienceSentiment,
      video_insight_summary: buildVideoInsightSummary(item, deriveVideoToneFromContent(item)),
    };
  });

  let p = 0;
  let neu = 0;
  let neg = 0;
  for (const v of videos) {
    p += v.audience_sentiment.positive;
    neu += v.audience_sentiment.neutral;
    neg += v.audience_sentiment.negative;
  }
  const n = videos.length || 1;
  const overall = {
    positive: Math.round(p / n),
    neutral: Math.round(neu / n),
    negative: Math.round(neg / n),
  };
  const sum = overall.positive + overall.neutral + overall.negative;
  if (sum !== 100) {
    overall.neutral += 100 - sum;
  }

  const overallLabel = dominantLabel(overall);
  const topComplaints = aggregateThemes(items, COMPLAINT_THEME_TERMS, 'Limited complaint signals');
  const topPositiveMentions = aggregateThemes(items, PRAISE_THEME_TERMS, 'Limited praise signals');

  const summary = `Local sentiment layer (no OpenAI call): ${videos.length} video(s), overall ${overallLabel}. Clear lexicon signals; mixed or weak text still uses OpenAI.`;

  return {
    overall_sentiment: overall,
    overall_sentiment_label: overallLabel,
    top_complaints: topComplaints,
    top_positive_mentions: topPositiveMentions,
    insight_drivers: {
      why_negative:
        overallLabel === 'negative'
          ? ['Local analysis flagged stronger negative wording in the sample.']
          : ['Negative drivers are subdued in this sample.'],
      why_positive:
        overallLabel === 'positive'
          ? ['Local analysis flagged stronger positive wording in the sample.']
          : ['Positive drivers are subdued in this sample.'],
    },
    recommended_actions: [
      'Validate with a full OpenAI run if messaging or pricing changed recently.',
      'Use this pass for obvious polarity; escalate nuanced threads to the model.',
    ],
    summary,
    videos,
    _analysis_mode: 'local_sentiment',
    _analysis_model: 'lexicon_v1',
    _local_sentiment: perItemLocal.map((r) => ({
      confidence: r.confidence,
      fallbackNeeded: r.fallbackNeeded,
      reason: r.reason,
    })),
  };
}

/**
 * Single-call batch analysis (mini model) + optional premium polish of the main summary.
 * @param {{ query: string, platform: string, items: Array<{ video_id: string, title: string, description: string, comments: string[] }> }} payload
 * @param {{ skipPremiumSummary?: boolean }} [options]
 */
async function analyzeReviewBatch(payload, options = {}) {
  if (isDevMockEnabled()) {
    console.warn('[analysis] fallback reason:', 'dev_mock_forced');
    return buildHeuristicBatchAnalysis(payload, {
      label: 'dev_mock',
      logDetail: 'OPENAI_DEV_MOCK or AI_DEV_MOCK=true',
    });
  }
  if (!isOpenAiEnabled()) {
    console.warn('[analysis] fallback reason:', 'openai_disabled', describeOpenAiBlockedReason() || 'unknown');
    return buildHeuristicBatchAnalysis(payload, {
      label: 'openai_disabled',
      logDetail: describeOpenAiBlockedReason() || 'unknown',
    });
  }

  if (LOCAL_LAYER_SHORT_CIRCUIT) {
    const batchItems = Array.isArray(payload.items) ? payload.items : [];
    const perItemLocal = batchItems.map((it) => analyzeItemSentiment(it));
    const allLocalClear =
      perItemLocal.length > 0 &&
      perItemLocal.every(
        (r) => !r.fallbackNeeded && r.confidence >= LOCAL_LAYER_MIN_CONFIDENCE,
      );
    if (allLocalClear) {
      console.log(
        '[ai] local sentiment layer: all items clear — skipping OpenAI batch (set LOCAL_SENTIMENT_SHORT_CIRCUIT=false to force API)',
      );
      return buildBatchFromLocalSentiment(payload, perItemLocal);
    }
  }

  const safePayload = applyBatchPayloadGuard(payload);
  const userContent = JSON.stringify(safePayload);
  const systemContent =
    'You analyze YouTube search results for brand/customer insight: each item has title, description, and viewer comments. ' +
    'Infer overall sentiment percentages (must sum to 100). ' +
    'Per video: content_summary from title+description; content_sentiment_label (title+description tone); ' +
    'audience_sentiment from comments only (three percentages summing to 100). ' +
    'Also generate video_insight_summary with: (1) summary = 1-2 concise business-friendly sentences on what the video/post itself discusses, (2) video_tone = positive|negative|neutral for the content itself (creator stance). Do NOT use audience comments to set video_tone. Prefer positive or negative when possible; use neutral only when genuinely balanced. ' +
    'List up to 5 recurring complaints and 5 praise themes. ' +
    'insight_drivers: why_negative and why_positive as 2–4 short sentences each explaining *why* people feel that way (business language, no jargon). ' +
    'recommended_actions: 3–6 specific next steps (e.g. improve shipping comms, update FAQ, highlight a product strength in ads). ' +
    'summary: 2–4 neutral sentences for stakeholders. Return only JSON matching the schema.';

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];

  const result = await chatCompletion({
    messages,
    model: defaultModel,
    max_tokens: MAX_BATCH_COMPLETION_TOKENS(),
    temperature: 0.3,
    response_format: {
      type: 'json_schema',
      json_schema: BATCH_SCHEMA,
    },
    taskType: 'routine',
  });

  if (!result.ok) {
    const detail = result.skip ? `budget_or_guard: ${result.reason}` : `request_failed: ${result.reason}`;
    console.warn('[analysis] fallback reason:', result.reason);
    console.warn('[analysis] fallback detail:', {
      skip: result.skip,
      kind: result.skip ? 'budget_or_guard' : 'api_error',
      detail,
    });
    console.warn('[ai] batch OpenAI call not executed:', detail);
    return buildHeuristicBatchAnalysis(payload, {
      label: result.reason || 'ai_unavailable',
      logDetail: detail,
      requestSkipped: Boolean(result.skip),
    });
  }

  let parsed;
  try {
    parsed = parseBatchResponse(result.content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[analysis] fallback reason:', 'parse_error');
    console.error('[ai] batch parse failed:', msg);
    return buildHeuristicBatchAnalysis(payload, { label: 'parse_error', logDetail: msg });
  }

  let out = normalizeBatchShape(parsed);
  out._analysis_mode = 'openai';
  out._analysis_model = result.model;

  if (!options.skipPremiumSummary) {
    const premium = await enhanceSummaryWithPremiumModel(safePayload, out);
    if (premium) {
      out = {
        ...out,
        summary: premium,
        _premium_summary: true,
        _routine_summary: parsed.summary,
      };
    }
  }

  return out;
}

function normalizeBatchShape(b) {
  const base = typeof b === 'object' && b !== null ? b : {};
  const id = base.insight_drivers && typeof base.insight_drivers === 'object' ? base.insight_drivers : {};
  return {
    ...base,
    insight_drivers: {
      why_negative: Array.isArray(id.why_negative) ? id.why_negative : [],
      why_positive: Array.isArray(id.why_positive) ? id.why_positive : [],
    },
    recommended_actions: Array.isArray(base.recommended_actions) ? base.recommended_actions : [],
    videos: Array.isArray(base.videos)
      ? base.videos.map((v) => ({
          ...v,
          video_insight_summary:
            v && typeof v.video_insight_summary === 'object' && v.video_insight_summary !== null
              ? {
                  summary: String(v.video_insight_summary.summary || '').slice(0, 220),
                  video_tone:
                    v.video_insight_summary.video_tone === 'positive' ||
                    v.video_insight_summary.video_tone === 'negative' ||
                    v.video_insight_summary.video_tone === 'neutral'
                      ? v.video_insight_summary.video_tone
                      : 'neutral',
                }
              : {
                  summary: String(v?.content_summary || '').slice(0, 220),
                  video_tone: 'neutral',
                },
        }))
      : [],
  };
}

async function analyzeSentiment(texts) {
  if (!isOpenAiEnabled()) {
    return {
      sentiment: { ...NEUTRAL_SENTIMENT },
      topComplaints: [],
      topPositiveMentions: [],
    };
  }
  return analyzeComments(texts);
}

function buildFallbackSummary({ sentiment, topComplaints, topPositiveMentions }) {
  const parts = [
    `Sentiment mix: ${Math.round(sentiment.positive)}% positive, ${Math.round(sentiment.neutral)}% neutral, ${Math.round(sentiment.negative)}% negative.`,
  ];
  if (topPositiveMentions?.length) {
    parts.push(`Common praise: ${topPositiveMentions.slice(0, 3).join('; ')}.`);
  }
  if (topComplaints?.length) {
    parts.push(`Common concerns: ${topComplaints.slice(0, 3).join('; ')}.`);
  }
  return parts.join(' ');
}

async function generateSummary({ query, sentiment, topComplaints, topPositiveMentions }) {
  if (!isOpenAiEnabled()) {
    return buildFallbackSummary({ sentiment, topComplaints, topPositiveMentions });
  }

  const messages = [
    {
      role: 'system',
      content:
        'Write a concise 2–4 sentence neutral summary for stakeholders. No markdown, no bullet points.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        search_query: query,
        sentiment_percentages: sentiment,
        recurring_complaints: topComplaints,
        recurring_praise: topPositiveMentions,
      }),
    },
  ];

  const r = await chatCompletion({
    messages,
    model: defaultModel,
    max_tokens: Math.min(220, pools.mini.maxOutputPerRequest),
    temperature: 0.4,
    taskType: 'routine',
  });

  if (!r.ok) {
    console.warn('[ai] generateSummary failed:', r.reason);
    return buildFallbackSummary({ sentiment, topComplaints, topPositiveMentions });
  }

  const text = r.content?.trim();
  return text || buildFallbackSummary({ sentiment, topComplaints, topPositiveMentions });
}

module.exports = {
  analyzeReviewBatch,
  analyzeSentiment,
  generateSummary,
  buildHeuristicBatchAnalysis,
};
