const { analyzeSearchQuery } = require('../services/analyzerService');

/** Legacy alias: GET /youtube-reviews?q=... (prefer GET /reviews?query=...). */
async function youtubeReviewsHandler(req, res) {
  const q = req.query.q;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'Missing or empty query parameter: q' });
  }

  try {
    const result = await analyzeSearchQuery(q.trim());
    res.json({ query: q.trim(), ...result });
  } catch (err) {
    const message =
      err.response?.data?.error?.message || err.message || 'Request failed';
    const status =
      err.response?.status >= 400 && err.response?.status < 600
        ? err.response.status
        : 500;
    res.status(status).json({ error: message });
  }
}

module.exports = youtubeReviewsHandler;
