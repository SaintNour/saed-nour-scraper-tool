const express = require('express');
const {
  pools,
  defaultModel,
  premiumModel,
  isOpenAiEnabled,
  isDevMockEnabled,
  validateOpenAiApiKeyFormat,
  hasApiKey,
} = require('../config/openaiEnv');
const usageStore = require('../services/openaiUsageStore');

const router = express.Router();

/**
 * Safe diagnostics only — no secrets, no raw env values.
 * Mounted at app.use('/api/system', router) → GET /api/system/openai-status
 */
router.get('/openai-status', (req, res) => {
  const keyFmt = validateOpenAiApiKeyFormat(process.env.OPENAI_API_KEY);
  res.json({
    openAiEnabled: isOpenAiEnabled(),
    hasApiKey: hasApiKey(),
    apiKeyFormatOk: keyFmt.valid,
    devMockForced: isDevMockEnabled(),
    defaultModel,
    premiumModel,
  });
});

/**
 * Token pool usage snapshot (persisted daily file + in-memory counters).
 * GET /api/system/openai-usage
 */
router.get('/openai-usage', (req, res) => {
  const snap = usageStore.getSnapshot();
  res.json({
    utcDate: snap.utcDate,
    openAiEnabled: isOpenAiEnabled(),
    models: { default: defaultModel, premium: premiumModel },
    pools: {
      mini: {
        softCap: pools.mini.softCap,
        hardCap: pools.mini.hardCap,
        used: (snap.mini.inputTokens || 0) + (snap.mini.outputTokens || 0),
        inputTokens: snap.mini.inputTokens,
        outputTokens: snap.mini.outputTokens,
        requests: snap.mini.requests,
      },
      large: {
        softCap: pools.large.softCap,
        hardCap: pools.large.hardCap,
        used: (snap.large.inputTokens || 0) + (snap.large.outputTokens || 0),
        inputTokens: snap.large.inputTokens,
        outputTokens: snap.large.outputTokens,
        requests: snap.large.requests,
      },
    },
    byModel: snap.byModel || {},
    downgrades: snap.downgrades || 0,
    skipped: snap.skipped || 0,
    lastUpdated: snap.lastUpdated,
  });
});

module.exports = router;
module.exports.default = router;
