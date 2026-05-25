import { getApiUrl } from './url';
import { expectJsonOk } from './http';
import { ReviewsApiError } from './reviews';

export type DashboardChatHistoryItem = {
	role: 'user' | 'assistant';
	content: string;
};

export type ChatContextMode = 'dashboard' | 'history_keyword';

export type DashboardChatRequest = {
	question: string;
	/** Defaults to dashboard when omitted (backward compatible). */
	contextMode?: ChatContextMode;
	/** Normalized main keyword for `history_keyword` mode (alias of `keyword`). */
	groupKey?: string;
	keyword?: string;
	analysis?: Record<string, unknown>;
	intelligence?: Record<string, unknown>;
	history?: DashboardChatHistoryItem[];
	options?: Record<string, unknown>;
};

export type ChatIntent =
	| 'snapshot'
	| 'action'
	| 'comparison'
	| 'strengths'
	| 'weaknesses'
	| 'trend'
	| 'general';

export type DashboardChatResponse = {
	answer: string;
	mode: 'openai' | 'local_fallback' | 'unavailable';
	usedModel?: string | null;
	followupSuggestions?: string[];
	contextMode?: ChatContextMode;
	/** Keyword/phrase intent label from the server (Phase 2 routing). */
	chatIntent?: ChatIntent;
	/** True when history mode used structured comparison intelligence. */
	usedComparisonContext?: boolean;
};

/**
 * POST /api/ai/dashboard-chat — brand assistant using dashboard intelligence.
 */
export async function postDashboardChat(body: DashboardChatRequest): Promise<DashboardChatResponse> {
	const res = await fetch(getApiUrl('/ai/dashboard-chat'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	const data = await expectJsonOk(res, 'Dashboard chat failed');

	const answer = typeof data.answer === 'string' ? data.answer : '';
	const mode =
		data.mode === 'openai' || data.mode === 'local_fallback' || data.mode === 'unavailable'
			? data.mode
			: 'unavailable';

	if (!answer && mode === 'unavailable') {
		throw new ReviewsApiError('Assistant unavailable for this request.', res.status);
	}

	const followupSuggestions = Array.isArray(data.followupSuggestions)
		? data.followupSuggestions.filter((x): x is string => typeof x === 'string')
		: [];

	const contextMode =
		data.contextMode === 'history_keyword' || data.contextMode === 'dashboard'
			? data.contextMode
			: undefined;

	const chatIntentRaw = data.chatIntent;
	const chatIntent =
		chatIntentRaw === 'snapshot' ||
		chatIntentRaw === 'action' ||
		chatIntentRaw === 'comparison' ||
		chatIntentRaw === 'strengths' ||
		chatIntentRaw === 'weaknesses' ||
		chatIntentRaw === 'trend' ||
		chatIntentRaw === 'general'
			? chatIntentRaw
			: undefined;

	const usedComparisonContext =
		typeof data.usedComparisonContext === 'boolean' ? data.usedComparisonContext : undefined;

	return {
		answer,
		mode,
		usedModel: typeof data.usedModel === 'string' || data.usedModel === null ? data.usedModel : null,
		followupSuggestions,
		...(contextMode ? { contextMode } : {}),
		...(chatIntent ? { chatIntent } : {}),
		...(usedComparisonContext !== undefined ? { usedComparisonContext } : {}),
	};
}
