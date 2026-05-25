import type { AnalysisHistoryItem, AnalysisResult, Platform, ScanMode } from '$lib/types/analysis';
import type { DateRangeQueryInput } from '$lib/types/dateRange';
import type { BackendAnalysisResponse } from '$lib/types/backend';
import { getPlatformLabel, isAnalysisAvailable } from '$lib/types/platform';
import { normalizeAnalysisResponse } from './normalize';
import { getApiUrl } from './url';

/** Thrown when the reviews API returns an error or the request fails. */
export class ReviewsApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number, options?: { cause?: unknown }) {
		super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
		this.name = 'ReviewsApiError';
		this.status = status;
	}
}

/**
 * GET /reviews — loads snake_case JSON from Express and returns a normalized {@link AnalysisResult}.
 * Additional platforms can branch here later without changing callers.
 */
function subKeywordsQueryString(subs: string[] | undefined): string {
	if (!subs?.length) return '';
	const parts = subs.map((s) => s.trim()).filter(Boolean);
	if (parts.length === 0) return '';
	return `&${parts.map((p) => `subKeywords=${encodeURIComponent(p)}`).join('&')}`;
}

function dateRangeQueryString(dr: DateRangeQueryInput | null | undefined): string {
	if (!dr || dr.preset === 'all') return '';
	let s = `&datePreset=${encodeURIComponent(dr.preset)}`;
	if (dr.preset === 'custom') {
		if (dr.startDate) s += `&dateStart=${encodeURIComponent(dr.startDate)}`;
		if (dr.endDate) s += `&dateEnd=${encodeURIComponent(dr.endDate)}`;
	}
	return s;
}

function scanModeQueryString(scanMode: ScanMode | undefined): string {
	if (!scanMode) return '';
	return `&scanMode=${encodeURIComponent(scanMode)}`;
}

export async function fetchReviewAnalysis(
	query: string,
	platform: Platform,
	opts?: {
		refresh?: boolean;
		subKeywords?: string[];
		dateRange?: DateRangeQueryInput | null;
		scanMode?: ScanMode;
	},
): Promise<AnalysisResult> {
	if (!isAnalysisAvailable(platform)) {
		throw new ReviewsApiError(`${getPlatformLabel(platform)} is not available yet.`, 400);
	}

	const q = query.trim();
	if (!q) {
		throw new ReviewsApiError('Query is required.', 400);
	}

	const refresh = opts?.refresh === true ? '&refresh=true' : '';
	const subQs = subKeywordsQueryString(opts?.subKeywords);
	const drQs = dateRangeQueryString(opts?.dateRange ?? null);
	const scanModeQs = scanModeQueryString(opts?.scanMode);
	const url = `${getApiUrl('/reviews')}?query=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}${refresh}${subQs}${drQs}${scanModeQs}`;

	let res: Response;
	try {
		res = await fetch(url);
	} catch (err) {
		throw new ReviewsApiError('Network error while contacting the API.', 0, { cause: err });
	}

	if (!res.ok) {
		let message = res.statusText || 'Request failed';
		try {
			const body = (await res.json()) as { error?: string };
			if (typeof body?.error === 'string' && body.error) message = body.error;
		} catch {
			/* use statusText */
		}
		throw new ReviewsApiError(message, res.status);
	}

	let raw: BackendAnalysisResponse;
	try {
		raw = (await res.json()) as BackendAnalysisResponse;
	} catch (err) {
		throw new ReviewsApiError('Invalid JSON response from the API.', res.status, { cause: err });
	}

	return normalizeAnalysisResponse(raw);
}

type HistoryApiResponse = {
	query?: string;
	platform?: string;
	items?: Array<{
		id?: string;
		query?: string;
		title?: string;
		url?: string;
		platform?: string;
		contentFormat?: string;
		contentSentimentLabel?: string;
		analyzedAt?: string;
	}>;
};

function asHistoryLabel(raw?: string): AnalysisHistoryItem['contentSentimentLabel'] {
	const s = (raw ?? 'neutral').toLowerCase();
	if (s === 'positive' || s === 'negative' || s === 'neutral') return s;
	return 'neutral';
}

function asHistoryFormat(raw?: string): AnalysisHistoryItem['contentFormat'] {
	const f = (raw ?? 'unknown').toLowerCase();
	if (f === 'video' || f === 'short' || f === 'unknown') return f;
	return 'unknown';
}

function asPlatform(raw?: string): Platform {
	const p = (raw ?? 'youtube').toLowerCase();
	if (p === 'youtube' || p === 'tiktok' || p === 'instagram' || p === 'facebook') return p;
	return 'youtube';
}

function mapHistoryItems(raw: HistoryApiResponse, fallbackPlatform: Platform): AnalysisHistoryItem[] {
	return (raw.items ?? [])
		.filter((item) => Boolean(item.id && item.title))
		.map((item) => ({
			id: String(item.id),
			query: typeof item.query === 'string' ? item.query : '',
			title: String(item.title),
			url: typeof item.url === 'string' ? item.url : '',
			platform: asPlatform(item.platform) ?? fallbackPlatform,
			contentFormat: asHistoryFormat(item.contentFormat),
			contentSentimentLabel: asHistoryLabel(item.contentSentimentLabel),
			analyzedAt: typeof item.analyzedAt === 'string' ? item.analyzedAt : '',
		}))
		.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
}

export async function fetchAnalysisHistory(
	query: string,
	platform: Platform,
): Promise<AnalysisHistoryItem[]> {
	const q = query.trim();
	if (!q) return [];

	const url = `${getApiUrl('/reviews/history')}?query=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}`;

	let res: Response;
	try {
		res = await fetch(url);
	} catch (err) {
		throw new ReviewsApiError('Network error while loading history.', 0, { cause: err });
	}

	if (!res.ok) {
		let message = res.statusText || 'Request failed';
		try {
			const body = (await res.json()) as { error?: string };
			if (typeof body?.error === 'string' && body.error) message = body.error;
		} catch {
			/* use statusText */
		}
		throw new ReviewsApiError(message, res.status);
	}

	let raw: HistoryApiResponse;
	try {
		raw = (await res.json()) as HistoryApiResponse;
	} catch (err) {
		throw new ReviewsApiError('Invalid JSON response from the API.', res.status, { cause: err });
	}

	return mapHistoryItems(raw, platform);
}

export async function fetchAllAnalysisHistory(): Promise<AnalysisHistoryItem[]> {
	const url = `${getApiUrl('/reviews/history')}`;

	let res: Response;
	try {
		res = await fetch(url);
	} catch (err) {
		throw new ReviewsApiError('Network error while loading history.', 0, { cause: err });
	}

	if (!res.ok) {
		let message = res.statusText || 'Request failed';
		try {
			const body = (await res.json()) as { error?: string };
			if (typeof body?.error === 'string' && body.error) message = body.error;
		} catch {
			/* use statusText */
		}
		throw new ReviewsApiError(message, res.status);
	}

	let raw: HistoryApiResponse;
	try {
		raw = (await res.json()) as HistoryApiResponse;
	} catch (err) {
		throw new ReviewsApiError('Invalid JSON response from the API.', res.status, { cause: err });
	}

	return mapHistoryItems(raw, 'youtube');
}
