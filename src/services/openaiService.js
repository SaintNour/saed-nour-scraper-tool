const { isOpenAiEnabled, defaultModel, pools } = require('../config/openaiEnv');
const { chatCompletion } = require('./openaiRuntime');

/** Total user-message budget (characters) for comment text — keeps input tokens low. */
const MAX_PROMPT_CHARS = 6000;

/** Per-line cap after normalize — aggressive trim before dedupe and budget. */
const MAX_COMMENT_LINE_CHARS = 200;

/** Cap completion size; bounded by mini pool per-request output. */
function maxCommentCompletionTokens() {
  return Math.min(512, pools.mini.maxOutputPerRequest);
}

const RESPONSE_SCHEMA = {
  name: 'comment_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      sentiment: {
        type: 'object',
        properties: {
          positive: {
            type: 'number',
            description: 'Estimated share of positive sentiment, 0–100',
          },
          negative: {
            type: 'number',
            description: 'Estimated share of negative sentiment, 0–100',
          },
          neutral: {
            type: 'number',
            description: 'Estimated share of neutral or mixed sentiment, 0–100',
          },
        },
        required: ['positive', 'negative', 'neutral'],
        additionalProperties: false,
      },
      topComplaints: {
        type: 'array',
        description: 'Up to 5 distinct recurring complaints or criticisms',
        items: { type: 'string' },
        maxItems: 5,
      },
      topPositiveMentions: {
        type: 'array',
        description: 'Up to 5 distinct recurring praise themes or positive points',
        items: { type: 'string' },
        maxItems: 5,
      },
    },
    required: ['sentiment', 'topComplaints', 'topPositiveMentions'],
    additionalProperties: false,
  },
};

const EMPTY_ANALYSIS = {
  sentiment: { positive: 0, negative: 0, neutral: 100 },
  topComplaints: [],
  topPositiveMentions: [],
};

function normalizeForDedupe(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCommentsPayload(comments) {
  const seen = new Set();
  const lines = [];
  let total = 0;

  for (const raw of comments) {
    const line = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_COMMENT_LINE_CHARS);
    if (!line) continue;

    const key = normalizeForDedupe(line);
    if (seen.has(key)) continue;
    seen.add(key);

    const next = total + line.length + 1;
    if (next > MAX_PROMPT_CHARS) break;
    lines.push(line);
    total = next;
  }

  return lines.join('\n');
}

function parseStructuredResponse(raw) {
  if (raw == null || raw === '') {
    throw new Error('OpenAI returned empty message content; cannot parse JSON');
  }
  const str = typeof raw === 'string' ? raw : String(raw);
  try {
    return JSON.parse(str);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse OpenAI JSON response: ${detail}`);
  }
}

/**
 * Sends comment texts to OpenAI and returns structured analysis.
 */
async function analyzeComments(comments) {
  if (!isOpenAiEnabled()) {
    return { ...EMPTY_ANALYSIS };
  }

  if (!comments?.length) {
    return { ...EMPTY_ANALYSIS };
  }

  const payload = buildCommentsPayload(comments);
  if (!payload.trim()) {
    return { ...EMPTY_ANALYSIS };
  }

  const messages = [
    {
      role: 'system',
      content:
        'You analyze customer comments from YouTube. Infer overall sentiment distribution across all comments. ' +
        'Percentages must be non-negative numbers that sum to 100. ' +
        'List distinct recurring themes for complaints and for praise (short labels or phrases, not duplicates).',
    },
    {
      role: 'user',
      content: `Analyze these comments (one per line):\n\n${payload}`,
    },
  ];

  const result = await chatCompletion({
    messages,
    model: defaultModel,
    max_tokens: maxCommentCompletionTokens(),
    temperature: 0.3,
    response_format: {
      type: 'json_schema',
      json_schema: RESPONSE_SCHEMA,
    },
    taskType: 'routine',
  });

  if (!result.ok) {
    console.warn('[openai] analyzeComments skipped:', result.reason);
    return { ...EMPTY_ANALYSIS };
  }

  try {
    return parseStructuredResponse(result.content);
  } catch (e) {
    console.error('[openai] analyzeComments parse error:', e?.message || e);
    return { ...EMPTY_ANALYSIS };
  }
}

module.exports = { analyzeComments };
