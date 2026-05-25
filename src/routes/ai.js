const express = require('express');
const { analyzeComments } = require('../services/openaiService');
const { analyzeReviewBatch } = require('../services/aiService');
const { chatCompletion } = require('../services/openaiRuntime');
const { defaultModel, premiumModel, isOpenAiEnabled } = require('../config/openaiEnv');
const { buildDashboardIntelligence } = require('../services/dashboardIntelligenceService');
const { runDashboardChat } = require('../services/dashboardChatService');
const { buildKeywordComparisonIntelligence } = require('../services/historyComparisonService');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    service: 'analyzer-ai',
    endpoints: {
      GET_status: '/api/ai/status',
      POST_chat: '/api/ai/chat',
      POST_analyzeComments: '/api/ai/analyze-comments',
      POST_analyzeBatch: '/api/ai/analyze-batch',
      POST_dashboardIntelligence: '/api/ai/dashboard-intelligence',
      POST_dashboardChat: '/api/ai/dashboard-chat',
      GET_keywordComparison: '/api/ai/keyword-comparison?groupKey=…',
    },
  });
});

router.get('/status', (req, res) => {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const enabled = isOpenAiEnabled();
  res.json({
    defaultModel,
    premiumModel,
    hasOpenAiKey: hasKey,
    openAiEnabled: enabled,
    hint: !hasKey
      ? 'Add OPENAI_API_KEY and set OPENAI_ENABLED=true for real analysis.'
      : !enabled
        ? 'Set OPENAI_ENABLED=true (or legacy ENABLE_AI=true) to enable live OpenAI in pipelines.'
        : 'Ready.',
  });
});

/**
 * Minimal chat completion — budgeted via openaiRuntime (same pools as the app).
 */
router.post('/chat', async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'Body must include messages: [{ role: "system"|"user"|"assistant", content: string }, ...]',
    });
  }
  if (messages.length > 40) {
    return res.status(400).json({ error: 'Too many messages (max 40)' });
  }

  for (const m of messages) {
    if (!m || typeof m.content !== 'string') {
      return res.status(400).json({ error: 'Each message needs a string content field' });
    }
    const role = m.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      return res.status(400).json({ error: 'Each message role must be system, user, or assistant' });
    }
    if (m.content.length > 32000) {
      return res.status(400).json({ error: 'Message content too long (max 32000 chars)' });
    }
  }

  const maxTokens = Math.min(4096, Math.max(16, Number(req.body?.max_tokens) || 512));
  const temperature =
    typeof req.body?.temperature === 'number' && req.body.temperature >= 0 && req.body.temperature <= 2
      ? req.body.temperature
      : 0.7;
  const model =
    typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : defaultModel;
  const taskType = model === premiumModel || (model.includes('gpt-4o') && !model.includes('mini')) ? 'premium' : 'routine';

  const result = await chatCompletion({
    messages,
    model,
    max_tokens: maxTokens,
    temperature,
    taskType,
  });

  if (!result.ok) {
    const status = result.skip ? 503 : 500;
    return res.status(status).json({ error: result.reason || 'chat failed', skipped: Boolean(result.skip) });
  }

  res.json({
    model: result.model,
    message: { role: 'assistant', content: result.content },
    usage: result.usage ?? null,
    downgraded: result.downgraded,
  });
});

router.post('/analyze-comments', async (req, res) => {
  try {
    const comments = req.body?.comments;
    if (!Array.isArray(comments)) {
      return res.status(400).json({ error: 'Body must include comments: string[]' });
    }
    const result = await analyzeComments(comments);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'analyze-comments failed' });
  }
});

router.post('/analyze-batch', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) {
      return res.status(400).json({
        error: 'Body must include query (string), platform (string), and items (array)',
      });
    }
    if (!Array.isArray(payload.items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }
    const result = await analyzeReviewBatch(payload);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'analyze-batch failed' });
  }
});

/**
 * Build compact dashboard intelligence for future chatbot context (no extra model call).
 * Body: { analysis: object, options?: { dateRange?, historySummary?, watchlistNote?, localRowHints? } }
 */
router.post('/dashboard-intelligence', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const analysis = body.analysis;
    if (!analysis || typeof analysis !== 'object') {
      return res.status(400).json({
        error: 'Body must include analysis: { ... } (analyzer or API-shaped result)',
      });
    }
    const options = body.options && typeof body.options === 'object' ? body.options : {};
    const intelligence = buildDashboardIntelligence(analysis, options);
    res.json({ intelligence });
  } catch (err) {
    console.error('[ai] dashboard-intelligence failed', err);
    res.status(500).json({ error: err?.message || 'dashboard-intelligence failed' });
  }
});

/**
 * Brand intelligence assistant (mini model).
 * Body: { question, history?, options?,
 *   contextMode?: "dashboard" | "history_keyword",
 *   analysis? + intelligence? (dashboard) | groupKey? / keyword? (history_keyword) }
 * Response may include chatIntent and usedComparisonContext (history mode routes comparison questions to comparison intelligence).
 */
router.post('/dashboard-chat', async (req, res) => {
  try {
    const out = await runDashboardChat(req.body && typeof req.body === 'object' ? req.body : {});
    res.json(out);
  } catch (err) {
    const code = err?.code;
    if (code === 'NO_CONTEXT' || code === 'BAD_REQUEST') {
      return res.status(400).json({ error: err.message || 'Bad request', mode: 'unavailable' });
    }
    console.error('[ai] dashboard-chat failed', err);
    res.status(500).json({
      error: err?.message || 'dashboard-chat failed',
      mode: 'unavailable',
    });
  }
});

/**
 * Debug: structured “what changed?” intelligence for one keyword (history comparison).
 * Query: groupKey (required), maxRunsPerWindow (optional, default 3)
 */
router.get('/keyword-comparison', (req, res) => {
  try {
    const groupKey = typeof req.query.groupKey === 'string' ? req.query.groupKey.trim() : '';
    if (!groupKey) {
      return res.status(400).json({ error: 'Query parameter groupKey is required.' });
    }
    const rawMax = req.query.maxRunsPerWindow;
    const maxRunsPerWindow =
      rawMax != null && String(rawMax).trim() !== ''
        ? Math.min(8, Math.max(1, parseInt(String(rawMax), 10) || 3))
        : undefined;
    const intel = buildKeywordComparisonIntelligence(groupKey, {
      ...(maxRunsPerWindow != null ? { maxRunsPerWindow } : {}),
    });
    if (!intel) {
      return res.status(404).json({ error: 'No saved history for that keyword.' });
    }
    res.json({ comparison: intel });
  } catch (err) {
    console.error('[ai] keyword-comparison failed', err);
    res.status(500).json({ error: err?.message || 'keyword-comparison failed' });
  }
});

module.exports = router;
