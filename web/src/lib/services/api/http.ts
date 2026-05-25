/**
 * Shared fetch helpers for the Express API (JSON bodies + predictable errors).
 */

import { ReviewsApiError } from './reviews';

export type JsonRecord = Record<string, unknown>;

export async function readJsonSafe(res: Response): Promise<JsonRecord | null> {
	const text = await res.text();
	if (!text.trim()) return null;
	try {
		return JSON.parse(text) as JsonRecord;
	} catch {
		return null;
	}
}

/**
 * Throws {@link ReviewsApiError} when `!res.ok` or when the body is not valid JSON (likely HTML 404).
 */
export async function expectJsonOk(
	res: Response,
	fallbackMessage: string,
): Promise<JsonRecord> {
	const data = await readJsonSafe(res);
	if (!res.ok) {
		const msg =
			(typeof data?.error === 'string' && data.error) ||
			(typeof data?.message === 'string' && data.message) ||
			fallbackMessage;
		throw new ReviewsApiError(msg, res.status);
	}
	if (data === null) {
		throw new ReviewsApiError(
			res.status === 404
				? 'API route not found. Confirm the backend exposes this path and that dev proxy / PUBLIC_API_BASE_URL is correct.'
				: 'Invalid response from server (expected JSON).',
			res.status || 500,
		);
	}
	return data;
}
