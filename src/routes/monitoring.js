const express = require('express');
const {
  listTracks,
  createTrack,
  deleteTrack,
  runTrackById,
  listAlerts,
} = require('../services/monitoringService');
const store = require('../services/monitoringStore');

const router = express.Router();

function getTracks(req, res) {
  try {
    if (process.env.DEBUG_MONITORING === '1') {
      console.log('GET /api/monitoring/tracks hit');
      console.log('[monitoring] GET', req.originalUrl || req.url);
    }
    const tracks = listTracks();
    res.json({ tracks });
  } catch (e) {
    console.error('[monitoring] GET /tracks failed', e);
    res.status(500).json({ error: e.message || 'Failed to load tracks' });
  }
}

function postTrack(req, res) {
  try {
    const keyword = req.body?.keyword ?? req.body?.q ?? req.body?.mainKeyword;
    const subKeywords = req.body?.subKeywords ?? req.body?.sub_keywords;
    const intervalMinutes = req.body?.intervalMinutes;
    const intervalHours = req.body?.intervalHours;
    const track = createTrack({ keyword, subKeywords, intervalMinutes, intervalHours });
    const wire = listTracks().find((t) => t.id === track.id);
    res.status(201).json({ track: wire });
  } catch (e) {
    console.error('[monitoring] POST /tracks failed', e);
    if (e.code === 'DUPLICATE') {
      return res.status(409).json({ error: e.message || 'Duplicate keyword' });
    }
    res.status(400).json({ error: e.message || 'Invalid request' });
  }
}

function removeTrack(req, res) {
  try {
    deleteTrack(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
}

async function postRun(req, res) {
  try {
    const out = await runTrackById(req.params.id);
    res.json(out);
  } catch (e) {
    const status = e.message === 'Track not found' ? 404 : 500;
    res.status(status).json({ error: e.message || 'Run failed' });
  }
}

function getAlerts(req, res) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    res.json({ alerts: listAlerts(limit) });
  } catch (e) {
    console.error('[monitoring] GET /alerts failed', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
}

function markAllRead(req, res) {
  try {
    const data = store.load();
    for (const a of data.alerts) a.read = true;
    store.save(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
}

router.get('/tracks', getTracks);
router.post('/tracks', postTrack);
router.delete('/tracks/:id', removeTrack);
router.post('/tracks/:id/run', postRun);
router.get('/alerts', getAlerts);
router.post('/alerts/read-all', markAllRead);

module.exports = router;
