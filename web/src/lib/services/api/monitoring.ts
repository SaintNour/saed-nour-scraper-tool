import { ReviewsApiError } from './reviews';
import { readJsonSafe } from './http';
import { getApiUrl } from './url';

const NETWORK_HINT =
	'Cannot reach the API. Start the backend, use `npm run dev` / `vite preview` so `/api` is proxied, or set PUBLIC_API_BASE_URL to the API origin.';

function devLog(...args: unknown[]) {
	if (import.meta.env.DEV) {
		console.info('[api:monitoring]', ...args);
	}
}

/** Same-origin or absolute URL; surfaces network failures as {@link ReviewsApiError} with status 0. */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(url, init);
	} catch (e) {
		throw new ReviewsApiError(NETWORK_HINT, 0, { cause: e });
	}
}

export type WatchlistIntervalHours = 3 | 4 | 5;

export type WatchlistStatus = 'scheduled' | 'running' | 'ok' | 'error';
export type WatchlistAlertState = 'none' | 'active';

export type WatchlistRotationMode = 'round_robin' | 'main_only';

export type MonitoringTrack = {
	id: string;
	keyword: string;
	mainKeyword?: string;
	subKeywords?: string[];
	displayQuery?: string;
	rotationMode?: WatchlistRotationMode;
	nextSubKeywordIndex?: number;
	/** Sub-keyword that will run on the next scheduled/manual execution (round-robin). */
	nextSubKeyword?: string | null;
	/** Full query string for the next run, e.g. `Brand (+Pads)`. */
	nextScheduledQuery?: string | null;
	/** Visual order of rotation, e.g. `Struts → Pads → Rotors`. */
	rotationOrderLabel?: string | null;
	lastExecutedQuery?: string | null;
	lastExecutedSubKeyword?: string | null;
	/** Hours between automated checks (3, 4, or 5) */
	intervalHours: number;
	/** Minutes between checks (intervalHours * 60) — legacy API */
	intervalMinutes: number;
	/** Same as intervalMinutes — convenience */
	frequency: number;
	/** e.g. "3h" */
	frequencyLabel: string;
	createdAt: string;
	lastRunAt: string | null;
	lastCheckedAt: string | null;
	nextRunAt: string | null;
	nextCheckAt: string | null;
	status: WatchlistStatus;
	latestSummary: string | null;
	lastResultCount: number | null;
	newCount: number | null;
	updatedCount: number | null;
	unchangedCount: number | null;
	lastRunStatus: string | null;
	lastError: string | null;
	lastChangeType: string | null;
	alertState: WatchlistAlertState;
	lastSnapshot: unknown;
	lastChangeSummary: {
		lines: string[];
		sentimentDelta: { negative: number; positive: number } | null;
		comparedAt: string;
	} | null;
};

export type MonitoringAlert = {
	id: string;
	trackId: string;
	level: 'info' | 'warning' | 'critical';
	title: string;
	body: string;
	createdAt: string;
	read: boolean;
};

function asTracks(data: Record<string, unknown>): MonitoringTrack[] {
	const raw = data.tracks;
	return Array.isArray(raw) ? (raw as MonitoringTrack[]) : [];
}

function asAlerts(data: Record<string, unknown>): MonitoringAlert[] {
	const raw = data.alerts;
	return Array.isArray(raw) ? (raw as MonitoringAlert[]) : [];
}

export async function fetchMonitoringTracks(): Promise<MonitoringTrack[]> {
	const url = getApiUrl('/monitoring/tracks');
	const res = await apiFetch(url);

	devLog('GET', url, '→', res.status, res.statusText);

	const data = await readJsonSafe(res);

	if (!res.ok) {
		devLog('non-OK response body', data ?? '(empty or non-JSON)');
		if (res.status === 404) {
			throw new ReviewsApiError(
				'Watchlist API not found (404). Confirm the server registers GET /api/monitoring/tracks and restart the backend after route changes.',
				404,
			);
		}
		const msg =
			(typeof data?.error === 'string' && data.error) ||
			(typeof data?.message === 'string' && data.message) ||
			`Could not load watchlist (${res.status})`;
		throw new ReviewsApiError(msg, res.status);
	}

	if (data === null) {
		throw new ReviewsApiError(
			'Invalid response from server (expected JSON). The request may have hit a static page or the wrong host — check proxy and PUBLIC_API_BASE_URL.',
			res.status || 500,
		);
	}

	return asTracks(data);
}

/** Alerts are best-effort: failures should not block the rest of the page. */
export async function fetchMonitoringAlerts(limit = 50): Promise<MonitoringAlert[]> {
	const url = `${getApiUrl('/monitoring/alerts')}?limit=${limit}`;
	let res: Response;
	try {
		res = await apiFetch(url);
	} catch (e) {
		console.warn('[monitoring] alerts unreachable', e);
		return [];
	}

	devLog('GET', url, '→', res.status);

	if (!res.ok) {
		const body = await readJsonSafe(res);
		const msg = typeof body?.error === 'string' ? body.error : res.statusText;
		console.warn('[monitoring] alerts request failed', res.status, msg);
		return [];
	}
	const data = await readJsonSafe(res);
	return data ? asAlerts(data) : [];
}

export async function createMonitoringTrack(
	keyword: string,
	intervalHours: WatchlistIntervalHours = 3,
	subKeywords?: string[],
): Promise<MonitoringTrack> {
	const url = getApiUrl('/monitoring/tracks');
	const body: Record<string, unknown> = { keyword, intervalHours };
	if (subKeywords && subKeywords.length > 0) body.subKeywords = subKeywords;
	const res = await apiFetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	devLog('POST', url, '→', res.status);

	const data = await readJsonSafe(res);
	if (!res.ok) {
		devLog('POST error body', data ?? '(empty or non-JSON)');
		const msg =
			(typeof data?.error === 'string' && data.error) ||
			(res.status === 409 ? 'This keyword is already on your watchlist.' : 'Could not add keyword');
		throw new ReviewsApiError(msg, res.status);
	}
	if (data === null) {
		throw new ReviewsApiError('Invalid response from server', res.status);
	}
	const track = data.track;
	if (!track || typeof track !== 'object') {
		throw new ReviewsApiError('Invalid response from server', res.status);
	}
	return track as MonitoringTrack;
}

export async function deleteMonitoringTrack(id: string): Promise<void> {
	const url = getApiUrl(`/monitoring/tracks/${encodeURIComponent(id)}`);
	const res = await apiFetch(url, { method: 'DELETE' });
	devLog('DELETE', url, '→', res.status);
	if (!res.ok) {
		const data = await readJsonSafe(res);
		const msg = typeof data?.error === 'string' ? data.error : 'Could not remove track';
		throw new ReviewsApiError(msg, res.status);
	}
}

export async function runMonitoringTrackNow(id: string): Promise<unknown> {
	const url = getApiUrl(`/monitoring/tracks/${encodeURIComponent(id)}/run`);
	const res = await apiFetch(url, { method: 'POST' });
	devLog('POST', url, '→', res.status);
	const data = await readJsonSafe(res);
	if (!res.ok) {
		devLog('run error body', data ?? '(empty or non-JSON)');
		const msg = typeof data?.error === 'string' ? data.error : 'Run failed';
		throw new ReviewsApiError(msg, res.status);
	}
	return data ?? {};
}
