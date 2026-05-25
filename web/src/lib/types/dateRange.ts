/**
 * Shared date-range model for dashboard search, history, chat, and future trends.
 *
 * **UTC presets:** `today`, `yesterday`, `last_7_days`, `last_30_days` resolve to UTC calendar
 * boundaries (same rules as `src/utils/dateRange.js`). Custom ranges use explicit ISO instants.
 */

export type DateRangePreset =
	| 'all'
	| 'today'
	| 'yesterday'
	| 'last_7_days'
	| 'last_30_days'
	| 'custom';

/** Wire / persistence shape (matches analyzer `date_range` and history `dateRange`). */
export type DateRangeSnapshot = {
	preset: DateRangePreset;
	label: string;
	start_date: string | null;
	end_date: string | null;
	timezone_note?: string;
};

/** Request payload for search (camelCase); analyzer normalizes. */
export type DateRangeQueryInput = {
	preset: DateRangePreset;
	startDate?: string;
	endDate?: string;
	label?: string;
};
