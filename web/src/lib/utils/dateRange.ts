/**
 * Client-side preset resolution — must match `src/utils/dateRange.js` (UTC boundaries).
 */
import type { DateRangePreset, DateRangeQueryInput, DateRangeSnapshot } from '$lib/types/dateRange';

function startOfUtcDay(d: Date): number {
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

function endOfUtcDay(d: Date): number {
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

export function resolveDateRangePreset(preset: DateRangePreset, now = new Date()): {
	startMs: number;
	endMs: number;
	label: string;
} | null {
	if (preset === 'all' || preset === 'custom') return null;
	const todayStart = startOfUtcDay(now);

	if (preset === 'today') {
		return {
			startMs: todayStart,
			endMs: endOfUtcDay(now),
			label: 'Today (UTC)',
		};
	}
	if (preset === 'yesterday') {
		const y = new Date(todayStart - 24 * 60 * 60 * 1000);
		return {
			startMs: startOfUtcDay(y),
			endMs: endOfUtcDay(y),
			label: 'Yesterday (UTC)',
		};
	}
	if (preset === 'last_7_days') {
		const start = new Date(todayStart - 6 * 24 * 60 * 60 * 1000);
		return {
			startMs: startOfUtcDay(start),
			endMs: endOfUtcDay(now),
			label: 'Last 7 days (UTC)',
		};
	}
	if (preset === 'last_30_days') {
		const start = new Date(todayStart - 29 * 24 * 60 * 60 * 1000);
		return {
			startMs: startOfUtcDay(start),
			endMs: endOfUtcDay(now),
			label: 'Last 30 days (UTC)',
		};
	}
	return null;
}

/** Build API request body / query params from UI state. */
export function buildDateRangeQuery(
	preset: DateRangePreset,
	customStartYmd: string,
	customEndYmd: string,
): DateRangeQueryInput | null {
	if (preset === 'all') {
		return { preset: 'all', label: 'All time' };
	}
	if (preset === 'custom') {
		const a = customStartYmd.trim();
		const b = customEndYmd.trim();
		if (!a || !b) return { preset: 'all', label: 'All time' };
		const startMs = Date.parse(`${a}T00:00:00.000Z`);
		const endMs = Date.parse(`${b}T23:59:59.999Z`);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
			return { preset: 'all', label: 'All time' };
		}
		return {
			preset: 'custom',
			startDate: new Date(startMs).toISOString(),
			endDate: new Date(endMs).toISOString(),
			label: 'Custom range',
		};
	}
	const bounds = resolveDateRangePreset(preset);
	if (!bounds) return { preset: 'all', label: 'All time' };
	return {
		preset,
		startDate: new Date(bounds.startMs).toISOString(),
		endDate: new Date(bounds.endMs).toISOString(),
		label: bounds.label,
	};
}

export function snapshotFromQueryInput(q: DateRangeQueryInput | null): DateRangeSnapshot | undefined {
	if (!q || q.preset === 'all') return undefined;
	return {
		preset: q.preset,
		label: q.label ?? q.preset,
		start_date: q.startDate ?? null,
		end_date: q.endDate ?? null,
		timezone_note: 'Preset ranges use UTC calendar boundaries. Custom ranges use explicit ISO instants.',
	};
}
