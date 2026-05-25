import { ReviewsApiError } from './reviews';
import { readJsonSafe } from './http';
import { getApiUrl } from './url';
import type {
	KeywordHistoryDetailResponse,
	KeywordHistoryGroup,
	SavedSearchResult,
	SearchHistoryEntry,
} from '$lib/types/searchHistory';

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
	return fetch(url, init);
}

/** Grouped keyword summaries for the main History page. */
export async function fetchHistoryGroups(): Promise<KeywordHistoryGroup[]> {
	const url = getApiUrl('/history/groups');
	let res: Response;
	try {
		res = await apiFetch(url);
	} catch (e) {
		throw new ReviewsApiError('Network error while loading keyword groups.', 0, { cause: e });
	}
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg =
			(typeof data?.error === 'string' && data.error) ||
			`Failed to load history groups (${res.status})`;
		throw new ReviewsApiError(msg, res.status);
	}
	if (!data || !Array.isArray(data.groups)) {
		throw new ReviewsApiError('Invalid response from history groups API.', res.status || 500);
	}
	return data.groups as KeywordHistoryGroup[];
}

/** All runs for one keyword (normalized key), newest first. */
export async function fetchHistoryGroupDetail(groupKey: string): Promise<KeywordHistoryDetailResponse> {
	const url = getApiUrl(`/history/groups/${encodeURIComponent(groupKey)}`);
	let res: Response;
	try {
		res = await apiFetch(url);
	} catch (e) {
		throw new ReviewsApiError('Network error while loading keyword history.', 0, { cause: e });
	}
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg =
			(typeof data?.error === 'string' && data.error) ||
			`Failed to load keyword (${res.status})`;
		throw new ReviewsApiError(msg, res.status);
	}
	if (!data?.runs || !Array.isArray(data.runs)) {
		throw new ReviewsApiError('Invalid response from history API.', res.status || 500);
	}
	return data as KeywordHistoryDetailResponse;
}

export async function deleteHistoryGroup(groupKey: string): Promise<{ removedCount: number }> {
	const url = getApiUrl(`/history/groups/${encodeURIComponent(groupKey)}`);
	let res: Response;
	try {
		res = await apiFetch(url, { method: 'DELETE' });
	} catch (e) {
		throw new ReviewsApiError('Network error while deleting keyword history.', 0, { cause: e });
	}
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg = (typeof data?.error === 'string' && data.error) || 'Delete failed';
		throw new ReviewsApiError(msg, res.status);
	}
	const n = data?.removedCount;
	return { removedCount: typeof n === 'number' ? n : 0 };
}

export async function fetchSearchHistory(): Promise<SearchHistoryEntry[]> {
	const url = getApiUrl('/history');
	let res: Response;
	try {
		res = await apiFetch(url);
	} catch (e) {
		throw new ReviewsApiError('Network error while loading search history.', 0, { cause: e });
	}
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg =
			(typeof data?.error === 'string' && data.error) || `Failed to load history (${res.status})`;
		throw new ReviewsApiError(msg, res.status);
	}
	if (!data || !Array.isArray(data.history)) {
		throw new ReviewsApiError('Invalid response from history API.', res.status || 500);
	}
	return data.history as SearchHistoryEntry[];
}

export async function fetchSearchHistoryDetail(id: string): Promise<{
	item: SearchHistoryEntry;
	results: SavedSearchResult[];
}> {
	const url = getApiUrl(`/history/${encodeURIComponent(id)}`);
	let res: Response;
	try {
		res = await apiFetch(url);
	} catch (e) {
		throw new ReviewsApiError('Network error while loading history detail.', 0, { cause: e });
	}
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg =
			(typeof data?.error === 'string' && data.error) || `Failed to load entry (${res.status})`;
		throw new ReviewsApiError(msg, res.status);
	}
	if (!data?.item || typeof data.item !== 'object') {
		throw new ReviewsApiError('Invalid response from history API.', res.status || 500);
	}
	return {
		item: data.item as SearchHistoryEntry,
		results: Array.isArray(data.results) ? (data.results as SavedSearchResult[]) : [],
	};
}

export async function deleteSearchHistoryEntry(id: string): Promise<void> {
	const url = getApiUrl(`/history/${encodeURIComponent(id)}`);
	let res: Response;
	try {
		res = await apiFetch(url, { method: 'DELETE' });
	} catch (e) {
		throw new ReviewsApiError('Network error while deleting history.', 0, { cause: e });
	}
	if (!res.ok) {
		const data = await readJsonSafe(res);
		const msg = (typeof data?.error === 'string' && data.error) || 'Delete failed';
		throw new ReviewsApiError(msg, res.status);
	}
}

export async function clearAllSearchHistory(): Promise<void> {
	const url = getApiUrl('/history');
	let res: Response;
	try {
		res = await apiFetch(url, { method: 'DELETE' });
	} catch (e) {
		throw new ReviewsApiError('Network error while clearing history.', 0, { cause: e });
	}
	if (!res.ok) {
		const data = await readJsonSafe(res);
		const msg = (typeof data?.error === 'string' && data.error) || 'Clear failed';
		throw new ReviewsApiError(msg, res.status);
	}
}

/** Removes heuristic / legacy mock rows only (server requires confirm: true). */
export async function clearHeuristicSearchHistory(): Promise<{ removedCount: number }> {
	const url = getApiUrl('/history/clear-heuristic');
	let res: Response;
	try {
		res = await apiFetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ confirm: true }),
		});
	} catch (e) {
		throw new ReviewsApiError('Network error while clearing heuristic history.', 0, { cause: e });
	}
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg =
			(typeof data?.error === 'string' && data.error) ||
			`Failed to clear heuristic history (${res.status})`;
		throw new ReviewsApiError(msg, res.status);
	}
	const n = data?.removedCount;
	return { removedCount: typeof n === 'number' ? n : 0 };
}
