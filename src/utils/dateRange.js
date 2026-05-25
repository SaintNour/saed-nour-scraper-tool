/**
 * Shared date-range model for search/analysis across platforms.
 *
 * **Timezone strategy:** Preset ranges (`today`, `yesterday`, `last_7_days`, `last_30_days`) are
 * resolved using **UTC calendar boundaries** (start-of-day 00:00:00.000Z through end-of-day
 * 23:59:59.999Z in UTC). This keeps server-side resolution deterministic and matches query
 * strings that omit a timezone. Custom ranges expect **explicit ISO-8601 instants** in
 * `startDate` / `endDate` (typically produced by the client from date inputs, normalized to UTC
 * or offset-aware ISO strings).
 *
 * **Missing timestamps:** When a content item has no `publishedAt`, post-filtering **keeps** the
 * item (lenient) so searches do not silently drop data; callers may inspect
 * `date_filter_includes_items_without_timestamp` on the analysis payload.
 *
 * @module dateRange
 */

/** @typedef {'all' | 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'custom'} DatePreset */

/**
 * @param {unknown} v
 * @returns {v is DatePreset}
 */
function isPreset(v) {
  return (
    v === 'all' ||
    v === 'today' ||
    v === 'yesterday' ||
    v === 'last_7_days' ||
    v === 'last_30_days' ||
    v === 'custom'
  );
}

/**
 * @param {Date} d
 * @returns {number}
 */
function startOfUtcDayFromDate(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

/**
 * @param {Date} d
 * @returns {number}
 */
function endOfUtcDayFromDate(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

/**
 * @param {number} ms
 * @returns {Date}
 */
function utcDayFromMs(ms) {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * @param {DatePreset} preset
 * @param {Date} [now]
 * @returns {{ startMs: number, endMs: number, label: string } | null}
 */
function boundsForPreset(preset, now = new Date()) {
  const t = now.getTime();
  const todayStart = startOfUtcDayFromDate(now);

  if (preset === 'today') {
    return {
      startMs: todayStart,
      endMs: endOfUtcDayFromDate(now),
      label: 'Today (UTC)',
    };
  }
  if (preset === 'yesterday') {
    const y = new Date(todayStart - 24 * 60 * 60 * 1000);
    return {
      startMs: startOfUtcDayFromDate(y),
      endMs: endOfUtcDayFromDate(y),
      label: 'Yesterday (UTC)',
    };
  }
  if (preset === 'last_7_days') {
    const start = new Date(todayStart - 6 * 24 * 60 * 60 * 1000);
    return {
      startMs: startOfUtcDayFromDate(start),
      endMs: endOfUtcDayFromDate(now),
      label: 'Last 7 days (UTC)',
    };
  }
  if (preset === 'last_30_days') {
    const start = new Date(todayStart - 29 * 24 * 60 * 60 * 1000);
    return {
      startMs: startOfUtcDayFromDate(start),
      endMs: endOfUtcDayFromDate(now),
      label: 'Last 30 days (UTC)',
    };
  }
  return null;
}

/**
 * @param {string} iso
 * @returns {number | null}
 */
function parseIsoToMs(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const n = Date.parse(iso.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize client/request input into concrete bounds or "all".
 *
 * @param {Record<string, unknown> | null | undefined} raw
 * @returns {null | {
 *   preset: DatePreset,
 *   label: string,
 *   startDate: string | null,
 *   endDate: string | null,
 *   startMs: number | null,
 *   endMs: number | null,
 * }}
 */
function normalizeDateRangeInput(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const presetRaw = raw.preset ?? raw.date_preset ?? 'all';
  const preset = isPreset(presetRaw) ? presetRaw : 'all';

  if (preset === 'all') {
    return {
      preset: 'all',
      label: 'All time',
      startDate: null,
      endDate: null,
      startMs: null,
      endMs: null,
    };
  }

  if (preset === 'custom') {
    const startDate = typeof raw.startDate === 'string' ? raw.startDate : String(raw.start_date || '');
    const endDate = typeof raw.endDate === 'string' ? raw.endDate : String(raw.end_date || '');
    const startMs = parseIsoToMs(startDate);
    const endMs = parseIsoToMs(endDate);
    if (startMs == null || endMs == null || startMs > endMs) {
      return {
        preset: 'all',
        label: 'All time',
        startDate: null,
        endDate: null,
        startMs: null,
        endMs: null,
      };
    }
    return {
      preset: 'custom',
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : 'Custom range',
      startDate,
      endDate,
      startMs,
      endMs,
    };
  }

  const b = boundsForPreset(preset);
  if (!b) {
    return null;
  }
  return {
    preset,
    label: b.label,
    startDate: new Date(b.startMs).toISOString(),
    endDate: new Date(b.endMs).toISOString(),
    startMs: b.startMs,
    endMs: b.endMs,
  };
}

/**
 * RFC 3339 for YouTube `publishedAfter` (inclusive).
 * @param {number} ms
 */
function toRfc3339(ms) {
  return new Date(ms).toISOString();
}

/**
 * YouTube `publishedBefore` is exclusive of the instant; use next ms after end-of-day.
 * @param {number} endMs
 */
function toPublishedBeforeExclusive(endMs) {
  return new Date(endMs + 1).toISOString();
}

/**
 * @param {null | ReturnType<typeof normalizeDateRangeInput>} dr
 */
function dateRangeCacheKeyPart(dr) {
  if (!dr || dr.preset === 'all' || dr.startMs == null || dr.endMs == null) {
    return 'all';
  }
  return `${dr.preset}:${dr.startMs}:${dr.endMs}`;
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {number | null} startMs
 * @param {number | null} endMs
 * @returns {{ kept: Array<Record<string, unknown>>, droppedForMissingTimestamp: number }}
 */
function filterByPublishedAtBounds(items, startMs, endMs) {
  if (startMs == null || endMs == null) {
    return { kept: items, droppedForMissingTimestamp: 0 };
  }
  let droppedForMissingTimestamp = 0;
  const kept = [];
  for (const item of items) {
    const pt = item.published_at || item.publishedAt;
    if (!pt || typeof pt !== 'string') {
      kept.push(item);
      droppedForMissingTimestamp += 1;
      continue;
    }
    const t = Date.parse(pt);
    if (!Number.isFinite(t)) {
      kept.push(item);
      droppedForMissingTimestamp += 1;
      continue;
    }
    if (t >= startMs && t <= endMs) {
      kept.push(item);
    }
  }
  return { kept, droppedForMissingTimestamp };
}

/**
 * Parse `datePreset`, `dateStart`, `dateEnd` from Express query into normalized range.
 * @param {Record<string, unknown>} query
 */
function normalizeDateRangeFromExpressQuery(query) {
  const pick = (v) => (Array.isArray(v) ? v[0] : v);
  const presetRaw = pick(query.datePreset ?? query.date_preset) ?? 'all';
  const start = pick(query.dateStart ?? query.date_start);
  const end = pick(query.dateEnd ?? query.date_end);
  return normalizeDateRangeInput({
    preset: typeof presetRaw === 'string' ? presetRaw : 'all',
    startDate: typeof start === 'string' ? start : undefined,
    endDate: typeof end === 'string' ? end : undefined,
  });
}

module.exports = {
  normalizeDateRangeInput,
  normalizeDateRangeFromExpressQuery,
  boundsForPreset,
  dateRangeCacheKeyPart,
  filterByPublishedAtBounds,
  toRfc3339,
  toPublishedBeforeExclusive,
};
