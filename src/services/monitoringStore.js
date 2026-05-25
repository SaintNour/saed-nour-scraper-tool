const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../../data/monitoring.json');

function defaultState() {
  return {
    tracks: [],
    alerts: [],
    seq: 0,
  };
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tracks)) data.tracks = [];
    if (!Array.isArray(data.alerts)) data.alerts = [];
    if (typeof data.seq !== 'number') data.seq = 0;
    return data;
  } catch {
    return defaultState();
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function nextId(state) {
  state.seq += 1;
  return `alt_${state.seq}_${Date.now()}`;
}

module.exports = {
  load,
  save,
  nextId,
  DATA_PATH,
};
