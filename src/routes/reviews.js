const { analyzeSearchQuery } = require('../services/analyzerService');
const searchMatch = require('../services/searchMatch');
const { normalizeDateRangeFromExpressQuery } = require('../utils/dateRange');

async function reviewsHandler(req, res) {
  const query = req.query.query;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Missing or empty query parameter: query' });
  }

  try {
    const refresh =
      req.query.refresh === '1' ||
      req.query.refresh === 'true' ||
      String(req.query.refresh || '').toLowerCase() === 'yes';
    const rawSubs = req.query.subKeywords ?? req.query.sub_keywords;
    const subKeywords = searchMatch.normalizeSubKeywordsList(
      searchMatch.parseSubKeywordsFromQueryValue(rawSubs),
    );
    const scanMode = typeof req.query.scanMode === 'string' ? req.query.scanMode : undefined;
    const dateRange = normalizeDateRangeFromExpressQuery(req.query);
    const result = await analyzeSearchQuery(query.trim(), {
      bypassCache: refresh,
      subKeywords,
      scanMode,
      dateRange,
    });
    res.json(result);
  } catch (err) {
    console.error('Review analysis failed:', err);
    const message = err.message || 'Internal server error';
    res.status(500).json({ error: message });
  }
}

module.exports = reviewsHandler;
