const OpenAI = require('openai');
const { pools, poolForModel, defaultModel, getOpenAiApiKeyForRequests } = require('../config/openaiEnv');
const usageStore = require('./openaiUsageStore');

function estimateTokens(text) {
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.max(1, Math.ceil(s.length / 4));
}

function poolTotals(poolName) {
  const snap = usageStore.getSnapshot();
  const p = poolName === 'large' ? snap.large : snap.mini;
  return (p.inputTokens || 0) + (p.outputTokens || 0);
}

/**
 * After adding estimated input + output, would we exceed this pool's daily hard cap?
 */
function wouldExceedPoolHardCap(poolName, addInput, addOutput) {
  const cfg = poolName === 'large' ? pools.large : pools.mini;
  return poolTotals(poolName) + addInput + addOutput > cfg.hardCap;
}

function nearLargeSoftCap() {
  return poolTotals('large') >= pools.large.softCap;
}

/**
 * @param {{
 *   messages: Array<{role: string, content: string}>,
 *   model?: string,
 *   max_tokens: number,
 *   temperature?: number,
 *   response_format?: object,
 *   taskType?: 'routine' | 'premium',
 * }} opts
 */
async function chatCompletion(opts) {
  const apiKey = getOpenAiApiKeyForRequests();
  if (!apiKey) {
    console.warn('[openai] chatCompletion skipped:', {
      reason: 'OPENAI_API_KEY missing or invalid format',
      skip: true,
    });
    return { ok: false, reason: 'OPENAI_API_KEY missing or invalid format', skip: true };
  }

  const taskType = opts.taskType || 'routine';
  let model = opts.model || defaultModel;
  let downgraded = false;

  if (taskType === 'premium' && poolForModel(model) === 'large') {
    if (nearLargeSoftCap() || wouldExceedPoolHardCap('large', 2000, opts.max_tokens)) {
      console.warn('[openai] premium: downgrading to mini model (large pool soft/hard guard)');
      usageStore.recordDowngrade();
      model = defaultModel;
      downgraded = true;
    }
  }

  let pool = poolForModel(model);
  const cfg = pool === 'large' ? pools.large : pools.mini;
  let maxOut = Math.min(opts.max_tokens, cfg.maxOutputPerRequest);
  const estIn = estimateTokens(opts.messages);

  if (estIn > cfg.maxInputPerRequest) {
    console.warn('[openai] chatCompletion skipped:', {
      reason: 'estimated_input_exceeds_pool_request_limit',
      skip: true,
      pool,
      estimatedInput: estIn,
      maxInputAllowed: cfg.maxInputPerRequest,
    });
    return { ok: false, reason: 'estimated_input_exceeds_pool_request_limit', skip: true };
  }

  if (wouldExceedPoolHardCap(pool, estIn, maxOut)) {
    if (pool === 'large') {
      console.warn('[openai] large pool hard cap: attempting mini');
      usageStore.recordDowngrade();
      model = defaultModel;
      pool = 'mini';
      downgraded = true;
      const mcfg = pools.mini;
      maxOut = Math.min(maxOut, mcfg.maxOutputPerRequest);
      if (estIn > mcfg.maxInputPerRequest || wouldExceedPoolHardCap('mini', estIn, maxOut)) {
        usageStore.recordSkip();
        console.warn('[openai] chatCompletion skipped:', {
          reason: 'budget_hard_cap_skip',
          skip: true,
          pool: 'mini',
          estimatedInput: estIn,
          maxOutput: maxOut,
        });
        return { ok: false, reason: 'budget_hard_cap_skip', skip: true };
      }
    } else {
      usageStore.recordSkip();
      console.warn('[openai] chatCompletion skipped:', {
        reason: 'mini_pool_hard_cap_skip',
        skip: true,
        pool: 'mini',
        estimatedInput: estIn,
        maxOutput: maxOut,
      });
      return { ok: false, reason: 'mini_pool_hard_cap_skip', skip: true };
    }
  }

  const openai = new OpenAI({ apiKey });

  try {
    const req = {
      model,
      messages: opts.messages,
      max_tokens: maxOut,
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.3,
    };
    if (opts.response_format) {
      req.response_format = opts.response_format;
    }

    console.log('[openai] sending request', {
      model,
      pool,
      estimatedInput: estIn,
      maxOutput: maxOut,
    });

    const completion = await openai.chat.completions.create(req);
    const content = completion.choices[0]?.message?.content;
    const u = completion.usage;
    const inTokens = u?.prompt_tokens ?? estIn;
    const outTokens = u?.completion_tokens ?? estimateTokens(content || '');

    usageStore.recordUsage({
      pool,
      model,
      inputTokens: inTokens,
      outputTokens: outTokens,
    });

    return {
      ok: true,
      content: content ?? '',
      model,
      usage: u || null,
      downgraded,
    };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error('[openai] chatCompletion error:', {
      message: err?.message,
      status: err?.status,
      code: err?.code,
      type: err?.type,
      response: err?.response?.data || null,
    });
    return { ok: false, reason: msg, skip: false };
  }
}

module.exports = {
  estimateTokens,
  chatCompletion,
  wouldExceedPoolHardCap,
  nearLargeSoftCap,
  poolTotals,
  defaultModel,
};
