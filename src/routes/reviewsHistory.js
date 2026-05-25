const { getAllAnalysisHistory, getAnalysisHistory } = require('../services/analyzerService');
const searchMatch = require('../services/searchMatch');

async function reviewsHistoryHandler(req, res) {
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const platform = typeof req.query.platform === 'string' ? req.query.platform : 'youtube';

  try {
    if (!query.trim()) {
      const items = getAllAnalysisHistory();
      return res.json({ platform, items });
    }

    const rawSubs = req.query.subKeywords ?? req.query.sub_keywords;
    const subKeywords = searchMatch.normalizeSubKeywordsList(
      searchMatch.parseSubKeywordsFromQueryValue(rawSubs),
    );
    const items = getAnalysisHistory(query.trim(), platform, subKeywords);
    res.json({ query: query.trim(), platform, subKeywords, items });
  } catch (err) {
    console.error('Review history load failed:', err);
    const message = err.message || 'Internal server error';
    res.status(500).json({ error: message });
  }
}

module.exports = reviewsHistoryHandler;
