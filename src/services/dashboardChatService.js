/**
 * Dashboard assistant chat — interprets {@link buildDashboardIntelligence} only (no live web).
 * Uses mini model via {@link chatCompletion} with routine task type.
 */

const { chatCompletion } = require('./openaiRuntime');
const { defaultModel, pools, isOpenAiEnabled } = require('../config/openaiEnv');
const { buildDashboardIntelligence } = require('./dashboardIntelligenceService');
const { buildKeywordIntelligence } = require('./historyIntelligenceService');
const { buildKeywordComparisonIntelligence } = require('./historyComparisonService');

const INTELLIGENCE_JSON_MAX = 12000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CONTENT_CHARS = 1500;
const CHAT_MAX_OUT = Math.min(512, pools.mini.maxOutputPerRequest);

const SYSTEM_PROMPT = `You are a brand intelligence assistant embedded in an analytics dashboard. You are NOT a general-purpose chatbot.

Rules:
- Answer ONLY using the "Dashboard intelligence context" JSON provided in this conversation. Do not browse the web, invent data, or assume facts outside that JSON.
- Be balanced, professional, and action-focused. Prefer practical implications for marketing, product, and support teams.
- Structure answers when helpful: direct answer, brief reasoning tied to signals in the context, and a recommended action when relevant.
- If evidence in the context is thin, mixed, or ambiguous, say so explicitly and avoid strong claims.
- Do not use generic filler ("as an AI…", "great question"). Stay concise and scannable.
- Do not claim precise metrics unless they appear in the context.`;

const HISTORY_SYSTEM_PROMPT = `You are a brand intelligence assistant working from SAVED SEARCH HISTORY for one keyword (aggregated across past dashboard runs). You are NOT a general-purpose chatbot and you do NOT have live or real-time data.

Rules:
- Answer ONLY using the "Historical intelligence context" JSON in this conversation. Do not browse the web or invent runs, videos, or metrics.
- Emphasize patterns over time (recurring wording, run-level sentiment mix, changes between recent summaries) when the JSON supports it.
- Never imply this is a live feed — say clearly that the evidence comes from stored history.
- Be balanced and action-focused for marketing, product, and support teams.
- If the JSON is thin, say so and suggest running a fresh analysis on the dashboard for current detail.
- Do not use generic filler. Stay concise.`;

const HISTORY_COMPARISON_SYSTEM_PROMPT = `You are a brand intelligence analyst interpreting STRUCTURED COMPARISON of SAVED SEARCH HISTORY for one keyword (recent saved runs vs earlier saved runs). You are NOT a general-purpose chatbot.

Rules:
- Answer ONLY using the "Keyword comparison intelligence" JSON. Do not browse the web or invent runs, videos, or metrics.
- Lead with CHANGE: direction (improving / worsening / stable / mixed), sentiment shift, emerging vs declining themes, and priority/trend deltas when the JSON includes them.
- Sound like an analyst: clearest change signal first, then evidence from the JSON. Tie recommendations to recommendedActions and topicChanges when relevant.
- Grounding: if _meta.limitedBasis is true or there is no prior window / only one run, state that the basis is limited and avoid false precision. Prefer phrasing like "recently", "compared with earlier runs", "based on limited history", "appears stable", or "negative themes may be showing up more often in summaries" only when supported by the JSON.
- Never imply live or real-time data — evidence is from stored history only.
- Do not use generic filler. Stay concise and scannable.`;

/**
 * Lightweight intent labels for routing and metadata (keyword/phrase heuristics).
 * @param {string} questionRaw
 * @returns {'snapshot' | 'action' | 'comparison' | 'strengths' | 'weaknesses' | 'trend' | 'general'}
 */
function detectChatIntent(questionRaw) {
  const q = String(questionRaw || '').toLowerCase().trim();
  if (!q) return 'general';

  const comparison =
    /\bwhat\s+changed\b/.test(q) ||
    /\bchanged\s+recently\b/.test(q) ||
    /\b(is\s+it\s+)?getting\s+(better|worse)\b/.test(q) ||
    /\b(is\s+it\s+)?getting\s+better\s+or\s+worse\b/.test(q) ||
    /\bget\s+(worse|better)\b/.test(q) ||
    /\bwhat\s+improved\b/.test(q) ||
    /\bwhat\s+declined\b/.test(q) ||
    /\b(biggest|largest|main)\s+new\s+issue\b/.test(q) ||
    /\bhow\s+is\s+this\s+different\b/.test(q) ||
    /\bdifferent\s+from\s+before\b/.test(q) ||
    /\bcompare\s+(recent|the\s+recent|to\s+before|with\s+earlier)\b/.test(q) ||
    /\brecent\s+vs\.?\s*previous\b/.test(q) ||
    /\bvs\.?\s+(previous|earlier|before)\b/.test(q) ||
    /\bcompared\s+(with|to)\s+(earlier|previous|before)\b/.test(q) ||
    /\b(better|worse)\s+than\s+before\b/.test(q) ||
    (/\bmore\s+negative\b/.test(q) && /\b(recent|now|lately|than|before|earlier|runs?)\b/.test(q)) ||
    (/\bmore\s+positive\b/.test(q) && /\b(recent|now|lately|than|before|earlier|runs?)\b/.test(q)) ||
    (/\bover\s+time\b/.test(q) && /\b(how|chang|evolv|shift|diff)\w*\b/.test(q)) ||
    /\bchang(e|es)\s+over\s+time\b/.test(q);

  if (comparison) return 'comparison';

  if (/what should we fix first|fix first|prioritiz|priority|what to do first|next step|address first/i.test(q)) {
    return 'action';
  }
  if (/\bstrengths?\b|what(?:'s| is) working|positive signals|going well/i.test(q)) {
    return 'strengths';
  }
  if (/\bweakness|complaints?\b|negative themes|what(?:'s| is) wrong/i.test(q)) {
    return 'weaknesses';
  }
  if (/\btrend|trending|what(?:'s| is) hot/i.test(q)) {
    return 'trend';
  }
  if (/summarize|summary|overview|snapshot|in short|briefly|the main points/i.test(q)) {
    return 'snapshot';
  }

  return 'general';
}

/**
 * @param {unknown} obj
 * @param {number} max
 */
function safeJsonForPrompt(obj, max) {
  try {
    const s = JSON.stringify(obj, null, 0);
    if (s.length <= max) return { text: s, truncated: false };
    return { text: `${s.slice(0, max)}\n…[context truncated for cost control]`, truncated: true };
  } catch {
    return { text: '{}', truncated: false };
  }
}

/**
 * @param {unknown} raw
 * @returns {Array<{ role: 'user' | 'assistant', content: string }>}
 */
function clampHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof m.content !== 'string' || !m.content.trim()) continue;
    out.push({
      role,
      content: m.content.trim().slice(0, MAX_HISTORY_CONTENT_CHARS),
    });
  }
  return out;
}

/**
 * Resolve intelligence: explicit `intelligence`, history keyword mode, or build from `analysis` + `options`.
 * @param {Record<string, unknown>} body
 * @param {string} [question] — used for history_keyword comparison routing
 * @returns {{
 *   intelligence: object,
 *   builtFromAnalysis: boolean,
 *   contextMode: 'dashboard' | 'history_keyword',
 *   chatIntent: 'snapshot' | 'action' | 'comparison' | 'strengths' | 'weaknesses' | 'trend' | 'general',
 *   usedComparisonContext: boolean,
 * } | null}
 */
function resolveIntelligence(body, question) {
  const q = typeof question === 'string' ? question : '';
  const chatIntent = detectChatIntent(q);

  const mode =
    body && typeof body === 'object' && body.contextMode === 'history_keyword'
      ? 'history_keyword'
      : 'dashboard';

  if (mode === 'history_keyword') {
    const key = body.groupKey ?? body.keyword;
    if (typeof key !== 'string' || !key.trim()) {
      const err = new Error('groupKey or keyword is required when contextMode is history_keyword');
      err.code = 'BAD_REQUEST';
      throw err;
    }
    const trimmed = key.trim();
    const opts = body.options && typeof body.options === 'object' ? body.options : {};
    const maxRunsPerWindow =
      typeof opts.maxRunsPerWindow === 'number' && Number.isFinite(opts.maxRunsPerWindow)
        ? opts.maxRunsPerWindow
        : undefined;

    if (chatIntent === 'comparison') {
      const intel = buildKeywordComparisonIntelligence(trimmed, {
        ...(maxRunsPerWindow != null ? { maxRunsPerWindow } : {}),
      });
      if (!intel) {
        const err = new Error('No saved history found for that keyword.');
        err.code = 'NO_CONTEXT';
        throw err;
      }
      return {
        intelligence: intel,
        builtFromAnalysis: false,
        contextMode: 'history_keyword',
        chatIntent,
        usedComparisonContext: true,
      };
    }

    const intel = buildKeywordIntelligence(trimmed);
    if (!intel) {
      const err = new Error('No saved history found for that keyword.');
      err.code = 'NO_CONTEXT';
      throw err;
    }
    return {
      intelligence: intel,
      builtFromAnalysis: false,
      contextMode: 'history_keyword',
      chatIntent,
      usedComparisonContext: false,
    };
  }

  const intel = body?.intelligence;
  if (intel && typeof intel === 'object') {
    return {
      intelligence: intel,
      builtFromAnalysis: false,
      contextMode: 'dashboard',
      chatIntent,
      usedComparisonContext: false,
    };
  }
  const analysis = body?.analysis;
  if (analysis && typeof analysis === 'object') {
    const opts = body?.options && typeof body.options === 'object' ? body.options : {};
    return {
      intelligence: buildDashboardIntelligence(analysis, opts),
      builtFromAnalysis: true,
      contextMode: 'dashboard',
      chatIntent,
      usedComparisonContext: false,
    };
  }
  return null;
}

/**
 * Offline answer when comparison JSON is the context.
 * @param {Record<string, unknown>} intelligence
 */
function comparisonRuleBasedAnswer(intelligence) {
  const summary = String(intelligence?.summary || '').trim();
  const dir = String(intelligence?.overallDirection || 'stable');
  const rec = Array.isArray(intelligence?.recommendedActions) ? intelligence.recommendedActions : [];
  const limited = intelligence?._meta?.limitedBasis === true;
  const basisNote = String(intelligence?._meta?.basisNote || '').trim();
  const parts = [];
  if (limited) {
    parts.push('Based on limited saved history, treat directions as indicative rather than definitive.');
  }
  parts.push(`Compared with earlier runs, the structured signal is ${dir}.`);
  if (summary) parts.push(summary.slice(0, 850));
  if (rec.length) {
    parts.push(`Suggested angles: ${rec.slice(0, 4).join(' ')}`);
  }
  if (limited && basisNote) parts.push(basisNote);
  return parts.join(' ').trim() || 'Insufficient comparison context in stored history.';
}

/**
 * Lightweight rule-based answer when OpenAI is off or the API call fails.
 * @param {string} question
 * @param {Record<string, unknown>} intelligence
 */
function ruleBasedAnswer(question, intelligence) {
  if (
    intelligence?._meta?.contextKind === 'keyword_history_comparison' ||
    typeof intelligence?.comparisonMode === 'string'
  ) {
    return comparisonRuleBasedAnswer(intelligence);
  }

  const q = String(question || '').toLowerCase().trim();
  const s = String(intelligence?.summary || '').trim();
  const overall = String(intelligence?.overallSentiment || '');
  const weak = Array.isArray(intelligence?.topWeaknesses) ? intelligence.topWeaknesses : [];
  const str = Array.isArray(intelligence?.topStrengths) ? intelligence.topStrengths : [];
  const rec = Array.isArray(intelligence?.topRecommendations) ? intelligence.topRecommendations : [];
  const trend = Array.isArray(intelligence?.trendingTopics) ? intelligence.trendingTopics : [];
  const br = intelligence?.sentimentBreakdown;

  if (/what should we fix first|priority|fix first|address first/i.test(q)) {
    const w = weak[0] || 'No single weakness stood out in the compressed context.';
    const r = rec[0] || 'Review dashboard recommendations for the next concrete step.';
    return `The clearest weakness signal in the current dashboard intelligence is: ${w}. I’d prioritize that before broad messaging changes. Suggested direction: ${r}`;
  }

  if (/strength|what(?:'s| is) working|positive/i.test(q)) {
    if (str.length) return `Top strengths called out in the context: ${str.slice(0, 4).join('; ')}. Lean into these in creative and product copy where evidence supports it.`;
    return `Strength themes are limited in the provided context. ${s ? `Executive summary: ${s.slice(0, 400)}` : 'Add more analysis coverage for stronger strength signals.'}`;
  }

  if (/trend|trending|what(?:'s| is) trending/i.test(q)) {
    if (trend.length) return `Recurring themes in the intelligence package: ${trend.slice(0, 6).join('; ')}.`;
    return `Trending topics are not strongly separated in this snapshot. ${s ? `Summary snapshot: ${s.slice(0, 450)}` : 'Use a fuller analysis run for clearer themes.'}`;
  }

  if (/why.*negative|negative sentiment|why is sentiment/i.test(q)) {
    const parts = [];
    if (br && typeof br === 'object') {
      parts.push(
        `Sentiment mix in context: ~${br.positive}% positive, ~${br.neutral}% neutral, ~${br.negative}% negative.`,
      );
    }
    if (weak.length) parts.push(`Complaint / weakness themes: ${weak.slice(0, 4).join('; ')}.`);
    if (parts.length) return `${parts.join(' ')} Address the clearest recurring weakness first if it aligns with business priorities.`;
    return s
      ? `From the executive summary only: ${s.slice(0, 700)}`
      : 'Insufficient detail in the intelligence object to explain negative sentiment specifically.';
  }

  if (s) {
    return `Based only on the dashboard intelligence summary: ${s.slice(0, 900)} Overall tone in context: ${overall || 'unspecified'}. For specifics, tie actions to listed strengths, weaknesses, and recommendations.`;
  }

  return 'The intelligence context is too thin for a detailed answer. Re-run analysis or pass a richer intelligence object.';
}

function defaultFollowupSuggestions(intelligence, contextMode, usedComparisonContext) {
  if (contextMode === 'history_keyword' && usedComparisonContext) {
    return [
      'What should we fix first?',
      'What issue is growing fastest?',
      'What improved recently?',
      'Is anything trending right now?',
    ];
  }
  if (contextMode === 'history_keyword') {
    return [
      'How has overall tone shifted across saved runs?',
      'What themes recur in the summaries?',
      'What should we prioritize based on this history?',
    ];
  }
  const w = Array.isArray(intelligence?.topWeaknesses) && intelligence.topWeaknesses[0];
  const base = [
    'What should we fix first?',
    'What is trending right now?',
    'What are the biggest strengths?',
    'Why is sentiment negative?',
  ];
  if (w && typeof w === 'string') {
    return [`How should we address: ${w.slice(0, 55)}${w.length > 55 ? '…' : ''}?`, ...base.slice(0, 3)];
  }
  return base;
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{
 *   answer: string,
 *   mode: 'openai' | 'local_fallback' | 'unavailable',
 *   usedModel: string | null,
 *   usedIntelligenceSummary: { builtFromAnalysis: boolean, truncated: boolean } | null,
 *   followupSuggestions: string[],
 *   contextMode?: 'dashboard' | 'history_keyword',
 *   chatIntent?: string,
 *   usedComparisonContext?: boolean,
 * }>}
 */
async function runDashboardChat(body) {
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) {
    const err = new Error('question is required');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const resolved = resolveIntelligence(body, question);
  if (!resolved) {
    const err = new Error('Provide either intelligence or analysis in the request body.');
    err.code = 'NO_CONTEXT';
    throw err;
  }

  const { intelligence, builtFromAnalysis, contextMode, chatIntent, usedComparisonContext } = resolved;
  const intelForPrompt = { ...intelligence };
  if (!usedComparisonContext) {
    delete intelForPrompt._meta;
  }
  const { text: contextBlock, truncated } = safeJsonForPrompt(intelForPrompt, INTELLIGENCE_JSON_MAX);
  const history = clampHistory(body.history);

  const metaOpts = body.options && typeof body.options === 'object' ? body.options : {};
  const platformHint = metaOpts.platformHint || metaOpts.platform || intelligence?._meta?.platform;
  const keywordHint = metaOpts.keyword || intelligence?.keyword;

  const ctxLabel =
    usedComparisonContext && contextMode === 'history_keyword'
      ? 'Keyword comparison intelligence'
      : contextMode === 'history_keyword'
        ? 'Historical intelligence context'
        : 'Dashboard intelligence context';
  const systemPrompt =
    usedComparisonContext && contextMode === 'history_keyword'
      ? HISTORY_COMPARISON_SYSTEM_PROMPT
      : contextMode === 'history_keyword'
        ? HISTORY_SYSTEM_PROMPT
        : SYSTEM_PROMPT;

  const dataSourceLine =
    contextMode === 'history_keyword'
      ? usedComparisonContext
        ? 'Data source: comparison of recent saved runs vs earlier saved runs for this keyword (not live).'
        : 'Data source: aggregated saved runs for this keyword (not a live dashboard snapshot).'
      : null;

  const userBlock = [
    dataSourceLine,
    keywordHint ? `Focus keyword / topic (hint): ${keywordHint}` : null,
    platformHint ? `Platform hint: ${platformHint}` : null,
    `${ctxLabel} (JSON):`,
    contextBlock,
    '',
    `User question: ${question}`,
  ]
    .filter(Boolean)
    .join('\n');

  const messages = [{ role: 'system', content: systemPrompt }];
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({ role: 'user', content: userBlock });

  const followupSuggestions = defaultFollowupSuggestions(intelligence, contextMode, usedComparisonContext);

  const usedIntelligenceSummary = {
    builtFromAnalysis,
    truncated,
  };

  const responseMeta = {
    contextMode,
    chatIntent,
    usedComparisonContext,
  };

  if (!isOpenAiEnabled()) {
    return {
      answer: `${ruleBasedAnswer(question, intelligence)}\n\n(Note: Live OpenAI is disabled for this server; this is a structured offline answer from dashboard intelligence only.)`,
      mode: 'local_fallback',
      usedModel: null,
      usedIntelligenceSummary,
      followupSuggestions,
      ...responseMeta,
    };
  }

  const result = await chatCompletion({
    messages,
    model: defaultModel,
    max_tokens: CHAT_MAX_OUT,
    temperature: 0.35,
    taskType: 'routine',
  });

  if (result.ok && typeof result.content === 'string' && result.content.trim()) {
    return {
      answer: result.content.trim(),
      mode: 'openai',
      usedModel: result.model || defaultModel,
      usedIntelligenceSummary,
      followupSuggestions,
      ...responseMeta,
    };
  }

  const reason = result?.reason || 'unknown';
  const fallback = ruleBasedAnswer(question, intelligence);
  return {
    answer: `${fallback}\n\n(Note: The assistant could not run a full model response (${reason}). The answer above is derived only from dashboard intelligence.)`,
    mode: 'local_fallback',
    usedModel: null,
    usedIntelligenceSummary,
    followupSuggestions,
    ...responseMeta,
  };
}

module.exports = {
  runDashboardChat,
  resolveIntelligence,
  ruleBasedAnswer,
  detectChatIntent,
};
