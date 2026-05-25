const express = require('express');
const {
  listHistory,
  listHistoryGroups,
  getHistoryGroupDetail,
  deleteHistoryByGroupKey,
  getHistoryById,
  deleteHistoryById,
  clearAllHistory,
  clearHeuristicHistoryEntries,
  createHistoryFromBody,
} = require('../services/searchHistoryService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const history = listHistory();
    res.json({ history });
  } catch (e) {
    console.error('[history] GET / failed', e);
    res.status(500).json({ error: e.message || 'Failed to load history' });
  }
});

/** Remove heuristic / legacy mock rows only (explicit opt-in). Register before `/:id`. */
router.post('/clear-heuristic', (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (body.confirm !== true) {
      return res.status(400).json({
        error: 'Set confirm: true in JSON body to delete heuristic history entries only.',
      });
    }
    const out = clearHeuristicHistoryEntries();
    res.json({ ok: true, removedCount: out.removedCount });
  } catch (e) {
    console.error('[history] POST /clear-heuristic failed', e);
    res.status(500).json({ error: e.message || 'Failed to clear heuristic history' });
  }
});

/** Keyword groups (main keyword, case-insensitive) — register before `/:id`. */
router.get('/groups', (req, res) => {
  try {
    const groups = listHistoryGroups();
    res.json({ groups });
  } catch (e) {
    console.error('[history] GET /groups failed', e);
    res.status(500).json({ error: e.message || 'Failed to load keyword groups' });
  }
});

router.get('/groups/:groupKey', (req, res) => {
  try {
    const groupKey = decodeURIComponent(String(req.params.groupKey || ''));
    const detail = getHistoryGroupDetail(groupKey);
    if (!detail) {
      return res.status(404).json({ error: 'Keyword group not found' });
    }
    res.json(detail);
  } catch (e) {
    console.error('[history] GET /groups/:groupKey failed', e);
    res.status(500).json({ error: e.message || 'Failed to load keyword group' });
  }
});

router.delete('/groups/:groupKey', (req, res) => {
  try {
    const groupKey = decodeURIComponent(String(req.params.groupKey || ''));
    const { removedCount } = deleteHistoryByGroupKey(groupKey);
    res.json({ ok: true, removedCount });
  } catch (e) {
    console.error('[history] DELETE /groups/:groupKey failed', e);
    res.status(500).json({ error: e.message || 'Failed to delete keyword group' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const out = getHistoryById(req.params.id);
    if (!out) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    res.json({ item: out.item, results: out.results });
  } catch (e) {
    console.error('[history] GET /:id failed', e);
    res.status(500).json({ error: e.message || 'Failed to load entry' });
  }
});

/**
 * Optional: ingest a completed search snapshot (tools/tests). Normal path is server-side from analyzer.
 */
router.post('/', (req, res) => {
  try {
    const out = createHistoryFromBody(req.body || {});
    res.status(201).json({ ok: true, historyId: out.historyId });
  } catch (e) {
    console.error('[history] POST / failed', e);
    res.status(400).json({ error: e.message || 'Invalid body' });
  }
});

/** Clear all — register before `/:id` so `DELETE /api/history` is not captured as an id. */
router.delete('/', (req, res) => {
  try {
    clearAllHistory();
    res.json({ ok: true });
  } catch (e) {
    console.error('[history] DELETE / failed', e);
    res.status(500).json({ error: e.message || 'Failed to clear history' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const ok = deleteHistoryById(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[history] DELETE /:id failed', e);
    res.status(500).json({ error: e.message || 'Failed to delete' });
  }
});

module.exports = router;
/** Default export interop (e.g. ESM `import historyRoutes from '...'`). */
module.exports.default = router;
