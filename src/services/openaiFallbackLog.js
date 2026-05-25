/**
 * Last heuristic fallback reason for debugging (in-memory). Never stores secrets.
 * @type {{ at: string, category: string, detail: string } | null}
 */
let lastHeuristicFallback = null;

/**
 * @param {string} category — e.g. config_disabled | invalid_or_missing_key | dev_mock_forced | budget_blocked | openai_request_failed | parse_error | stale_cached_heuristic_skipped | exception
 * @param {string} [detail]
 */
function recordHeuristicFallback(category, detail) {
  lastHeuristicFallback = {
    at: new Date().toISOString(),
    category: String(category || 'unknown'),
    detail: detail ? String(detail).slice(0, 500) : '',
  };
}

function getLastHeuristicFallback() {
  return lastHeuristicFallback;
}

module.exports = {
  recordHeuristicFallback,
  getLastHeuristicFallback,
};
