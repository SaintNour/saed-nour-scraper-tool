const express = require('express');
const cors = require('cors');

const reviewsHandler = require('./routes/reviews');
const reviewsHistoryHandler = require('./routes/reviewsHistory');
const monitoringRoutes = require('./routes/monitoring');
const historyRoutes = require('./routes/history');
const aiRoutes = require('./routes/ai');
const systemRoutes = require('./routes/system');
const youtubeReviewsHandler = require('./routes/youtubeReviews');

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function resolveCorsOrigins() {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_CORS_ORIGINS;
}

/** Register the same Express router at `/api/...` and at a legacy unprefixed path. */
function mountRouter(app, apiPath, legacyPath, router) {
  app.use(apiPath, router);
  if (legacyPath !== apiPath) {
    app.use(legacyPath, router);
  }
}

function createApp() {
  const app = express();

  app.use(express.json({ limit: '512kb' }));
  app.use(
    cors({
      origin: resolveCorsOrigins(),
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    }),
  );

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'analyzer-api' });
  });

  app.use('/api/ai', aiRoutes);
  mountRouter(app, '/api/system', '/system', systemRoutes);

  app.get('/api/reviews', reviewsHandler);
  app.get('/api/reviews/history', reviewsHistoryHandler);
  app.get('/reviews', reviewsHandler);
  app.get('/reviews/history', reviewsHistoryHandler);

  mountRouter(app, '/api/monitoring', '/monitoring', monitoringRoutes);
  mountRouter(app, '/api/history', '/history', historyRoutes);

  app.get('/youtube-reviews', youtubeReviewsHandler);

  return app;
}

module.exports = { createApp };
