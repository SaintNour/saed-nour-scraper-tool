const crypto = require('crypto');
const { analyzeSearchQuery } = require('./analyzerService');
const searchHistoryService = require('./searchHistoryService');
const searchMatch = require('./searchMatch');
const store = require('./monitoringStore');
const { evaluateMonitoringRun } = require('./alertService');

/** Only multi-hour schedules (hours). */
const ALLOWED_INTERVAL_HOURS = [3, 4, 5];
const DEFAULT_INTERVAL_HOURS = 3;

const activeRuns = new Set();

function normalizeKeyword(k) {
  return String(k || '')
    .trim()
    .slice(0, 200);
}

function parseSubKeywordsInput(raw) {
  if (Array.isArray(raw)) return searchMatch.normalizeSubKeywordsList(raw);
  if (typeof raw === 'string' && raw.trim()) {
    return searchMatch.normalizeSubKeywordsList(raw.split(','));
  }
  return [];
}

/** Dedupe watchlist entries: same main + same sub set (order-insensitive). */
function trackFingerprint(keyword, subKeywords) {
  const main = normalizeKeyword(keyword).toLowerCase();
  const subs = searchMatch.normalizeSubKeywordsList(subKeywords || []);
  return `${main}::${subs.map((s) => s.toLowerCase()).sort().join('|')}`;
}

/**
 * Migrate legacy intervals (30m, 1h, 2h, or unknown) to allowed hour buckets.
 * @param {Record<string, unknown>} t
 * @returns {boolean} true if mutated
 */
function intervalHoursRead(t) {
  let h = Number(t.intervalHours);
  if (ALLOWED_INTERVAL_HOURS.includes(h)) return h;
  const legacyMin = Number(t.intervalMinutes);
  if (legacyMin === 180) return 3;
  if (legacyMin === 240) return 4;
  if (legacyMin === 300) return 5;
  return DEFAULT_INTERVAL_HOURS;
}

function ensureTrackIntervalHours(t) {
  const beforeH = t.intervalHours;
  const beforeM = t.intervalMinutes;
  const h = intervalHoursRead(t);
  if (h !== beforeH || beforeM !== h * 60) {
    t.intervalHours = h;
    t.intervalMinutes = h * 60;
    return true;
  }
  return false;
}

/**
 * Default rotation: one sub-keyword per run when subs exist; main-only when empty.
 * @param {Record<string, unknown>} t
 * @returns {boolean}
 */
function ensureTrackRotation(t) {
  if (!t || typeof t !== 'object') return false;
  let changed = false;
  const subs = searchMatch.normalizeSubKeywordsList(t.subKeywords || []);
  if (subs.length === 0) {
    if (t.rotationMode !== 'main_only') {
      t.rotationMode = 'main_only';
      changed = true;
    }
    if (t.nextSubKeywordIndex !== 0) {
      t.nextSubKeywordIndex = 0;
      changed = true;
    }
  } else {
    if (!t.rotationMode || t.rotationMode === 'all') {
      t.rotationMode = 'round_robin';
      changed = true;
    }
    let idx = Number(t.nextSubKeywordIndex);
    if (!Number.isFinite(idx)) {
      idx = 0;
      changed = true;
    }
    idx = Math.floor(idx % subs.length);
    if (idx < 0) idx += subs.length;
    if (t.nextSubKeywordIndex !== idx) {
      t.nextSubKeywordIndex = idx;
      changed = true;
    }
  }
  if (t.lastExecutedQuery === undefined) {
    t.lastExecutedQuery = null;
    changed = true;
  }
  if (t.lastExecutedSubKeyword === undefined) {
    t.lastExecutedSubKeyword = null;
    changed = true;
  }
  return changed;
}

function migrateAllTracksIfNeeded() {
  const data = store.load();
  if (!Array.isArray(data.tracks)) return;
  let changed = false;
  for (const t of data.tracks) {
    if (t && ensureTrackIntervalHours(t)) changed = true;
    if (t && ensureTrackRotation(t)) changed = true;
  }
  if (changed) store.save(data);
}

migrateAllTracksIfNeeded();

/** After restart, clear stale `running` (in-memory lock was lost). */
function recoverStuckRunningTracks() {
  const data = store.load();
  if (!Array.isArray(data.tracks)) return;
  let changed = false;
  for (const t of data.tracks) {
    if (t && t.status === 'running') {
      t.status = 'scheduled';
      t.lastRunStatus = null;
      changed = true;
    }
  }
  if (changed) store.save(data);
}

recoverStuckRunningTracks();

function normalizeIntervalHoursFromBody(body) {
  const h = Number(body?.intervalHours);
  if (ALLOWED_INTERVAL_HOURS.includes(h)) return h;
  const legacyMin = Number(body?.intervalMinutes);
  if (legacyMin === 180) return 3;
  if (legacyMin === 240) return 4;
  if (legacyMin === 300) return 5;
  return DEFAULT_INTERVAL_HOURS;
}

function diffSnapshots(prev, curr, keyword) {
  if (!prev || !curr) {
    return {
      lines: ['Baseline saved — future runs will show what changed.'],
      sentimentDelta: null,
    };
  }

  const lines = [];
  const p = prev.sentiment || {};
  const c = curr.sentiment || {};
  const dNeg = (c.negative ?? 0) - (p.negative ?? 0);
  const dPos = (c.positive ?? 0) - (p.positive ?? 0);

  if (Math.abs(dNeg) >= 5) {
    lines.push(
      dNeg > 0
        ? `Negative reactions rose ~${Math.round(dNeg)} pts vs last check`
        : `Negative reactions eased ~${Math.round(-dNeg)} pts vs last check`,
    );
  }
  if (Math.abs(dPos) >= 5) {
    lines.push(
      dPos > 0
        ? `Positive reactions rose ~${Math.round(dPos)} pts`
        : `Positive reactions dipped ~${Math.round(-dPos)} pts`,
    );
  }

  const prevThemes = new Set(prev.top_complaints || []);
  const newNeg = (curr.top_complaints || []).filter((t) => t && !prevThemes.has(t));
  if (newNeg.length) {
    lines.push(`New concern threads: ${newNeg.slice(0, 3).join('; ')}`);
  }

  const prevPos = new Set(prev.top_positive_mentions || []);
  const newPos = (curr.top_positive_mentions || []).filter((t) => t && !prevPos.has(t));
  if (newPos.length) {
    lines.push(`New praise themes: ${newPos.slice(0, 3).join('; ')}`);
  }

  const nv = curr.new_video_count ?? 0;
  if (nv > 0) {
    lines.push(`${nv} new video(s) included in this run`);
  }

  if (lines.length === 0) {
    lines.push(`No major shift for “${keyword}” since the last check.`);
  }

  return {
    lines,
    sentimentDelta: { negative: dNeg, positive: dPos },
  };
}

function buildSnapshot(result) {
  return {
    runAt: new Date().toISOString(),
    sentiment: result.sentiment ? { ...result.sentiment } : null,
    top_complaints: [...(result.top_complaints || [])],
    top_positive_mentions: [...(result.top_positive_mentions || [])],
    summary: result.summary || '',
    new_video_count: result.total_videos ?? 0,
  };
}

function rotationOrderLabel(subs) {
  if (!subs || subs.length === 0) return null;
  return subs.join(' → ');
}

function toWireTrack(t) {
  if (!t) return null;
  const h = intervalHoursRead(t);
  const snap = t.lastSnapshot && typeof t.lastSnapshot === 'object' ? t.lastSnapshot : null;
  const subs = searchMatch.normalizeSubKeywordsList(Array.isArray(t.subKeywords) ? t.subKeywords : []);
  const displayQ =
    typeof t.displayQuery === 'string' && t.displayQuery.trim()
      ? t.displayQuery.trim()
      : subs.length > 0
        ? `${t.keyword} (+${subs.join(', ')})`
        : t.keyword;
  const rotMode = t.rotationMode || (subs.length ? 'round_robin' : 'main_only');
  const nextIdx =
    subs.length > 0
      ? (((Number(t.nextSubKeywordIndex) || 0) % subs.length) + subs.length) % subs.length
      : 0;
  const nextSub = subs.length > 0 ? subs[nextIdx] : null;
  const nextScheduledQuery =
    subs.length > 0 && nextSub ? `${t.keyword} (+${nextSub})` : t.keyword;
  return {
    id: t.id,
    keyword: t.keyword,
    mainKeyword: t.mainKeyword ?? t.keyword,
    subKeywords: subs,
    displayQuery: displayQ,
    rotationMode: rotMode,
    nextSubKeywordIndex: subs.length ? nextIdx : 0,
    nextSubKeyword: nextSub,
    nextScheduledQuery,
    rotationOrderLabel: rotationOrderLabel(subs),
    lastExecutedQuery: t.lastExecutedQuery ?? null,
    lastExecutedSubKeyword: t.lastExecutedSubKeyword ?? null,
    intervalHours: h,
    intervalMinutes: h * 60,
    frequency: h * 60,
    frequencyLabel: `${h}h`,
    createdAt: t.createdAt,
    lastRunAt: t.lastRunAt,
    lastCheckedAt: t.lastCheckedAt ?? t.lastRunAt,
    nextRunAt: t.nextRunAt,
    nextCheckAt: t.nextRunAt,
    status: t.status || 'scheduled',
    latestSummary: snap?.summary ?? t.latestSummary ?? null,
    lastResultCount:
      typeof snap?.new_video_count === 'number' ? snap.new_video_count : t.lastResultCount ?? null,
    newCount: t.newCount ?? null,
    updatedCount: t.updatedCount ?? null,
    unchangedCount: t.unchangedCount ?? null,
    lastRunStatus: t.lastRunStatus ?? null,
    lastError: t.lastError ?? null,
    lastChangeType: t.lastChangeType ?? null,
    alertState: t.alertState || 'none',
    lastSnapshot: t.lastSnapshot,
    lastChangeSummary: t.lastChangeSummary || null,
  };
}

function listTracks() {
  migrateAllTracksIfNeeded();
  const data = store.load();
  const rows = Array.isArray(data.tracks) ? data.tracks : [];
  return rows.filter(Boolean).map((t) => toWireTrack(t));
}

function createTrack({ keyword, mainKeyword, subKeywords, intervalMinutes, intervalHours }) {
  const k = normalizeKeyword(mainKeyword ?? keyword);
  if (!k) throw new Error('Keyword is required');

  const subs = parseSubKeywordsInput(subKeywords);
  const fp = trackFingerprint(k, subs);

  const data = store.load();
  if (!Array.isArray(data.tracks)) data.tracks = [];

  if (data.tracks.some((t) => t && trackFingerprint(t.keyword, t.subKeywords || []) === fp)) {
    const err = new Error('This search (main + sub-keywords) is already on your watchlist');
    err.code = 'DUPLICATE';
    throw err;
  }

  const hours = ALLOWED_INTERVAL_HOURS.includes(Number(intervalHours))
    ? Number(intervalHours)
    : normalizeIntervalHoursFromBody({ intervalHours, intervalMinutes });
  const now = Date.now();
  const next = new Date(now + hours * 3600000).toISOString();
  const displayQuery = subs.length > 0 ? `${k} (+${subs.join(', ')})` : k;
  const track = {
    id: crypto.randomUUID(),
    keyword: k,
    mainKeyword: k,
    subKeywords: subs,
    displayQuery,
    rotationMode: subs.length > 0 ? 'round_robin' : 'main_only',
    nextSubKeywordIndex: 0,
    lastExecutedQuery: null,
    lastExecutedSubKeyword: null,
    intervalHours: hours,
    intervalMinutes: hours * 60,
    createdAt: new Date(now).toISOString(),
    lastRunAt: null,
    lastCheckedAt: null,
    nextRunAt: next,
    lastSnapshot: null,
    lastChangeSummary: null,
    status: 'scheduled',
    lastRunStatus: null,
    latestSummary: null,
    lastResultCount: null,
    newCount: null,
    updatedCount: null,
    unchangedCount: null,
    lastError: null,
    lastChangeType: null,
    alertState: 'none',
  };
  data.tracks.push(track);
  store.save(data);
  return track;
}

function deleteTrack(id) {
  const data = store.load();
  data.tracks = data.tracks.filter((t) => t.id !== id);
  store.save(data);
}

function getTrack(id) {
  return store.load().tracks.find((t) => t.id === id) || null;
}

function countClassifications(videos) {
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  for (const v of videos) {
    const c = v.result_classification;
    if (c === 'new') newCount += 1;
    else if (c === 'updated') updatedCount += 1;
    else unchangedCount += 1;
  }
  return { newCount, updatedCount, unchangedCount };
}

function deriveLastChangeType({ newCount, updatedCount }) {
  if (newCount > 0 && updatedCount > 0) return 'new_and_updated';
  if (newCount > 0) return 'new_only';
  if (updatedCount > 0) return 'updated_only';
  return 'none';
}

/**
 * @param {string} id
 */
async function runTrackById(id) {
  if (activeRuns.has(id)) {
    console.warn('[watchlist] run skipped (already in progress)', id);
    return { skipped: true, reason: 'in_progress' };
  }

  activeRuns.add(id);
  const runStarted = Date.now();

  try {
    let data = store.load();
    const idx = data.tracks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error('Track not found');

    let track = data.tracks[idx];
    ensureTrackIntervalHours(track);

    track.status = 'running';
    track.lastRunStatus = 'running';
    ensureTrackRotation(track);
    data.tracks[idx] = track;
    store.save(data);

    const allSubs = searchMatch.normalizeSubKeywordsList(track.subKeywords || []);
    let subsForRun = [];
    /** @type {string | null} */
    let selectedSub = null;
    let runDisplayQuery = track.keyword;
    /** @type {number | null} */
    let rotationIndexUsed = null;

    if (allSubs.length === 0) {
      subsForRun = [];
    } else if ((track.rotationMode || 'round_robin') === 'round_robin') {
      rotationIndexUsed =
        (((Number(track.nextSubKeywordIndex) || 0) % allSubs.length) + allSubs.length) % allSubs.length;
      selectedSub = allSubs[rotationIndexUsed];
      subsForRun = selectedSub ? [selectedSub] : [];
      runDisplayQuery = selectedSub ? `${track.keyword} (+${selectedSub})` : track.keyword;
    } else {
      subsForRun = allSubs;
      runDisplayQuery =
        typeof track.displayQuery === 'string' && track.displayQuery.trim()
          ? track.displayQuery.trim()
          : `${track.keyword} (+${allSubs.join(', ')})`;
    }

    const result = await analyzeSearchQuery(track.keyword, {
      bypassCache: true,
      skipHistoryPersist: true,
      subKeywords: subsForRun,
      scanProfile: 'watchlist',
    });

    data = store.load();
    const i2 = data.tracks.findIndex((t) => t.id === id);
    if (i2 === -1) throw new Error('Track not found');
    track = data.tracks[i2];

    const videoCopy = (result.videos || []).map((v) => ({ ...v }));
    const durationMs = Date.now() - runStarted;

    searchHistoryService.recordSearchCompletion({
      query: track.keyword,
      mainKeyword: track.mainKeyword ?? track.keyword,
      subKeywords: allSubs,
      selectedSubKeyword: selectedSub,
      displayQuery: runDisplayQuery,
      platform: 'youtube',
      videos: videoCopy,
      summary: result.summary,
      overall_sentiment: result.overall_sentiment,
      total_comments_analyzed: result.total_comments_analyzed,
      status: 'completed',
      durationMs,
      searchType: 'watchlist',
      source: 'watchlist',
      trackId: track.id,
      cached: false,
      analysisSource:
        typeof result.analysis_source === 'string' ? result.analysis_source : undefined,
    });

    const { newCount, updatedCount, unchangedCount } = countClassifications(videoCopy);
    const prevSnap = track.lastSnapshot;
    const snapshot = buildSnapshot(result);
    const { lines, sentimentDelta } = diffSnapshots(
      prevSnap,
      { ...snapshot, sentiment: result.sentiment },
      track.keyword,
    );

    track.lastRunAt = snapshot.runAt;
    track.lastCheckedAt = snapshot.runAt;
    track.lastSnapshot = snapshot;
    track.latestSummary = result.summary || snapshot.summary || '';
    track.lastResultCount = result.total_videos ?? snapshot.new_video_count ?? 0;
    track.newCount = newCount;
    track.updatedCount = updatedCount;
    track.unchangedCount = unchangedCount;
    track.lastChangeType = deriveLastChangeType({ newCount, updatedCount });
    track.lastRunStatus = 'ok';
    track.status = 'ok';
    track.lastError = null;
    track.lastChangeSummary = {
      lines,
      sentimentDelta,
      comparedAt: snapshot.runAt,
    };
    track.lastExecutedQuery = runDisplayQuery;
    track.lastExecutedSubKeyword = selectedSub;
    if (allSubs.length > 0 && rotationIndexUsed !== null) {
      track.nextSubKeywordIndex = (rotationIndexUsed + 1) % allSubs.length;
    }
    ensureTrackIntervalHours(track);
    ensureTrackRotation(track);
    const h = intervalHoursRead(track);
    track.nextRunAt = new Date(Date.now() + h * 3600000).toISOString();
    track.alertState = newCount > 0 || updatedCount > 0 ? 'active' : 'none';

    data.tracks[i2] = track;
    store.save(data);

    evaluateMonitoringRun({ track, prevSnapshot: prevSnap, result });

    console.log(
      `[watchlist] completed "${track.keyword}" (${newCount} new, ${updatedCount} updated, ${unchangedCount} unchanged)`,
    );

    return { track: toWireTrack(track), result, changeSummary: track.lastChangeSummary };
  } catch (e) {
    console.error('[watchlist] run failed', id, e);
    try {
      const data = store.load();
      const i2 = data.tracks.findIndex((t) => t.id === id);
      if (i2 !== -1) {
        const t = data.tracks[i2];
        ensureTrackIntervalHours(t);
        t.status = 'error';
        t.lastRunStatus = 'error';
        t.lastError = e.message || String(e);
        const h = intervalHoursRead(t);
        t.nextRunAt = new Date(Date.now() + h * 3600000).toISOString();
        data.tracks[i2] = t;
        store.save(data);
      }
    } catch (inner) {
      console.error('[watchlist] failed to persist error state', inner);
    }
    throw e;
  } finally {
    activeRuns.delete(id);
  }
}

function isDue(track, nowMs) {
  if (!track) return false;
  if (activeRuns.has(track.id)) return false;
  if (track.status === 'running') return false;
  const h = intervalHoursRead(track);
  const periodMs = h * 3600000;
  if (!track.lastCheckedAt) return true;
  const last = new Date(track.lastCheckedAt).getTime();
  return nowMs >= last + periodMs;
}

async function runDueTracks() {
  migrateAllTracksIfNeeded();
  const data = store.load();
  const now = Date.now();
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  const due = tracks.filter((t) => t && isDue(t, now));

  if (due.length === 0) return;

  await Promise.all(
    due.map((t) =>
      runTrackById(t.id).catch((err) => {
        console.error('[watchlist] scheduled run failed', t.id, err.message || err);
      }),
    ),
  );
}

function listAlerts(limit = 50) {
  return store.load().alerts.slice(0, limit);
}

module.exports = {
  listTracks,
  createTrack,
  deleteTrack,
  getTrack,
  runTrackById,
  runDueTracks,
  listAlerts,
};
