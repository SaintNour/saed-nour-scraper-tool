/**
 * Polls for due watchlist items (default every 5 minutes). User-facing intervals remain 3h / 4h / 5h only.
 */

const TICK_MS = Number(process.env.MONITORING_SCHEDULER_TICK_MS || 300_000);

function startMonitoringScheduler(runDueTracks) {
  if (String(process.env.DISABLE_MONITORING_SCHEDULER || '').toLowerCase() === 'true') {
    return () => {};
  }
  const id = setInterval(() => {
    runDueTracks().catch((err) => console.error('[watchlist] scheduler tick failed', err));
  }, TICK_MS);
  return () => clearInterval(id);
}

module.exports = { startMonitoringScheduler, TICK_MS };
