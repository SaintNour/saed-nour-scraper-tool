const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../data/openai-usage.json');

function utcDateString() {
  return new Date().toISOString().slice(0, 10);
}

function defaultState() {
  const d = utcDateString();
  return {
    utcDate: d,
    mini: { inputTokens: 0, outputTokens: 0, requests: 0 },
    large: { inputTokens: 0, outputTokens: 0, requests: 0 },
    byModel: {},
    downgrades: 0,
    skipped: 0,
    lastUpdated: new Date().toISOString(),
  };
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (typeof data.utcDate !== 'string') data.utcDate = utcDateString();
    if (!data.mini || typeof data.mini.inputTokens !== 'number') {
      data.mini = { inputTokens: 0, outputTokens: 0, requests: 0 };
    }
    if (!data.large || typeof data.large.inputTokens !== 'number') {
      data.large = { inputTokens: 0, outputTokens: 0, requests: 0 };
    }
    if (!data.byModel || typeof data.byModel !== 'object') data.byModel = {};
    if (typeof data.downgrades !== 'number') data.downgrades = 0;
    if (typeof data.skipped !== 'number') data.skipped = 0;
    return data;
  } catch {
    return defaultState();
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/** Reset counters when UTC day changes. */
function ensureCurrentDay(state) {
  const today = utcDateString();
  if (state.utcDate === today) return state;
  const fresh = defaultState();
  fresh.utcDate = today;
  save(fresh);
  return fresh;
}

function recordUsage({ pool, model, inputTokens, outputTokens }) {
  let state = ensureCurrentDay(load());
  const p = pool === 'large' ? 'large' : 'mini';
  state[p].inputTokens += inputTokens;
  state[p].outputTokens += outputTokens;
  state[p].requests += 1;
  const m = String(model || 'unknown');
  state.byModel[m] = (state.byModel[m] || 0) + 1;
  save(state);
  return state;
}

function recordDowngrade() {
  let state = ensureCurrentDay(load());
  state.downgrades += 1;
  save(state);
  return state;
}

function recordSkip() {
  let state = ensureCurrentDay(load());
  state.skipped += 1;
  save(state);
  return state;
}

function getSnapshot() {
  return ensureCurrentDay(load());
}

module.exports = {
  load,
  save,
  DATA_PATH,
  recordUsage,
  recordDowngrade,
  recordSkip,
  getSnapshot,
  ensureCurrentDay,
  utcDateString,
};
