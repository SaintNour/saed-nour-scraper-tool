const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../data/searchHistory.json');

function defaultState() {
  return {
    seq: 0,
    history: [],
    results: [],
    resultIndex: {},
  };
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.history)) data.history = [];
    if (!Array.isArray(data.results)) data.results = [];
    if (typeof data.seq !== 'number') data.seq = 0;
    if (!data.resultIndex || typeof data.resultIndex !== 'object') data.resultIndex = {};
    return data;
  } catch {
    return defaultState();
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function nextSeq(state) {
  state.seq += 1;
  return state.seq;
}

module.exports = {
  load,
  save,
  nextSeq,
  DATA_PATH,
  defaultState,
};
