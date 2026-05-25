const store = require('./monitoringStore');

/**
 * @param {object} opts
 * @param {string} opts.trackId
 * @param {'info'|'warning'|'critical'} opts.level
 * @param {string} opts.title
 * @param {string} opts.body
 */
function pushAlert(opts) {
  const data = store.load();
  const alert = {
    id: store.nextId(data),
    trackId: opts.trackId,
    level: opts.level,
    title: opts.title,
    body: opts.body,
    createdAt: new Date().toISOString(),
    read: false,
  };
  data.alerts.unshift(alert);
  data.alerts = data.alerts.slice(0, 200);
  store.save(data);
  return alert;
}

/**
 * Heuristic rules for monitoring runs (email/Slack hooks can subscribe here later).
 */
function evaluateMonitoringRun({ track, prevSnapshot, result }) {
  const trackId = track.id;
  if (!prevSnapshot || !result) return;

  const prev = prevSnapshot.sentiment;
  const cur = result.sentiment;
  if (!prev || !cur) return;

  const dNeg = (cur.negative ?? 0) - (prev.negative ?? 0);
  if (dNeg >= 12) {
    pushAlert({
      trackId,
      level: 'warning',
      title: 'Negative sentiment jumped',
      body: `Negative tone is up about ${Math.round(dNeg)} points since the last check for “${track.keyword}”.`,
    });
  }

  if (dNeg <= -12) {
    pushAlert({
      trackId,
      level: 'info',
      title: 'Negative sentiment improved',
      body: `Negative tone eased by about ${Math.round(-dNeg)} points for “${track.keyword}”.`,
    });
  }

  const prevC = new Set(prevSnapshot.top_complaints || []);
  const newThemes = (result.top_complaints || []).filter((t) => t && !prevC.has(t));
  if (newThemes.length) {
    pushAlert({
      trackId,
      level: 'info',
      title: 'New concern theme',
      body: `Emerging theme: ${newThemes.slice(0, 2).join('; ')}`,
    });
  }

  const newVideos = result.total_videos ?? 0;
  if (newVideos >= 5) {
    pushAlert({
      trackId,
      level: 'info',
      title: 'Fresh content batch',
      body: `${newVideos} new videos were analyzed in this run — conversation may be heating up.`,
    });
  }
}

module.exports = {
  pushAlert,
  evaluateMonitoringRun,
};
