import type { AnalysisResult } from '$lib/types/analysis';

/** Curated suggested questions — dashboard (live snapshot) mode. */
export const SUGGESTED_CHIPS_DASHBOARD = [
	"What's hurting my brand?",
	'What should I improve?',
	"What's trending right now?",
	'What are our biggest strengths?',
] as const;

/** Curated suggested questions — saved keyword history mode. */
export const SUGGESTED_CHIPS_HISTORY = [
	'What changed recently?',
	'Is it getting worse?',
	'What improved recently?',
	'What is the biggest weakness over time?',
	'What should we fix first?',
] as const;

/** After a comparison-style answer (backend follow-ups align; used as fallback). */
export const SUGGESTED_CHIPS_COMPARISON_FOLLOWUP = [
	'What should we fix first?',
	'What issue is growing fastest?',
	'What improved recently?',
	'Is anything trending right now?',
] as const;

const MAX_CHIPS = 5;

/**
 * Default chip set for the current UI context (before any API follow-ups).
 */
export function getDefaultSuggestedChips(options: {
	hasDashboardResult: boolean;
	historyKeywordSelected: boolean;
}): string[] {
	if (options.historyKeywordSelected) {
		return [...SUGGESTED_CHIPS_HISTORY].slice(0, MAX_CHIPS);
	}
	if (options.hasDashboardResult) {
		return [...SUGGESTED_CHIPS_DASHBOARD].slice(0, MAX_CHIPS);
	}
	// No snapshot yet — still show history-oriented prompts (chips may be disabled until a keyword is selected).
	return [...SUGGESTED_CHIPS_HISTORY].slice(0, MAX_CHIPS);
}

/**
 * Prefer server follow-ups, then comparison fallbacks, then mode defaults.
 */
export function pickSuggestedChipsAfterResponse(options: {
	followupSuggestions: string[] | undefined;
	usedComparisonContext: boolean | undefined;
	hasDashboardResult: boolean;
	historyKeywordSelected: boolean;
}): string[] {
	const raw = (options.followupSuggestions ?? []).map((s) => s.trim()).filter(Boolean);
	if (raw.length > 0) {
		return dedupeCap(raw, MAX_CHIPS);
	}
	if (options.usedComparisonContext) {
		return [...SUGGESTED_CHIPS_COMPARISON_FOLLOWUP].slice(0, MAX_CHIPS);
	}
	return getDefaultSuggestedChips({
		hasDashboardResult: options.hasDashboardResult,
		historyKeywordSelected: options.historyKeywordSelected,
	});
}

function dedupeCap(items: string[], max: number): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const s of items) {
		const k = s.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(s);
		if (out.length >= max) break;
	}
	return out;
}

/**
 * Maps a normalized {@link AnalysisResult} to a plain object the backend
 * `buildDashboardIntelligence` accepts (snake_case and camelCase both work).
 */
export function analysisResultToChatPayload(result: AnalysisResult): Record<string, unknown> {
	return {
		query: result.query,
		main_keyword: result.mainKeyword ?? result.query,
		sub_keywords: result.subKeywords ?? [],
		display_query: result.displayQuery,
		platform: result.platform,
		summary: result.summary,
		sentiment: result.sentiment,
		overall_sentiment: result.overallSentiment,
		total_comments_analyzed: result.totalCommentsAnalyzed,
		total_content_items: result.totalContentItems,
		top_complaints: result.topComplaints,
		top_positive_mentions: result.topPositiveMentions,
		insight_drivers: {
			why_negative: result.insightDrivers.whyNegative,
			why_positive: result.insightDrivers.whyPositive,
		},
		recommended_actions: result.recommendedActions,
		analysis_source: result.analysisSource,
		cached: result.cached,
		date_range: result.dateRange,
		ai_comment_stats: result.aiCommentStats
			? {
					raw: result.aiCommentStats.raw,
					sent_to_model: result.aiCommentStats.sentToModel,
					dropped_noise: result.aiCommentStats.droppedNoise,
				}
			: undefined,
		content_items: result.contentItems.map((row) => ({
			id: row.id,
			content_id: row.contentId ?? row.id,
			title: row.title,
			url: row.url ?? row.canonicalUrl,
			canonical_url: row.canonicalUrl ?? row.url,
			platform: row.platform,
			content_type: row.contentType,
			content_format: row.contentFormat,
			description_text: row.descriptionText ?? row.bodyText,
			creator_name: row.creatorName,
			published_at: row.publishedAt,
			metrics: row.metrics
				? {
						view_count: row.metrics.viewCount,
						like_count: row.metrics.likeCount,
						comment_count: row.metrics.commentCount,
						share_count: row.metrics.shareCount,
						creator_follower_count: row.metrics.creatorFollowerCount,
					}
				: undefined,
			content_summary: row.contentSummary,
			content_sentiment_label: row.contentSentimentLabel,
			comments_analyzed: row.commentsAnalyzed,
			analyzed_at: row.analyzedAt,
			audience_sentiment: row.audienceSentiment ?? row.sentiment,
			sentiment: row.sentiment,
			status: row.status,
			result_classification: row.resultClassification,
			match_meta: row.matchMeta
				? {
						main_matched: row.matchMeta.mainMatched,
						matched_sub_keywords: row.matchMeta.matchedSubKeywords,
						is_relevant: row.matchMeta.isRelevant,
						match_summary: row.matchMeta.matchSummary,
					}
				: undefined,
		})),
	};
}

/**
 * Client-side opening copy so the first panel open is not empty (no extra API call).
 */
export function buildOpeningMessageFromAnalysis(_result: AnalysisResult): string {
	return 'Hi there 👋 How can I help you today?';
}

export function buildOpeningMessageNoResult(): string {
	return [
		'Run a search above to load a live snapshot here.',
		'',
		'When you have saved keywords in history, you can also pick one under Context to chat from past runs.',
	].join('\n');
}

/** Opening copy when the user selected a saved keyword (history-aware mode). */
export function buildOpeningMessageHistoryKeyword(group: { displayLabel: string; runCount: number }): string {
	return [
		`Using history for “${group.displayLabel}” (${group.runCount} saved run(s)).`,
		'',
		'Ask what changed, what improved, or what to fix first — or use a suggested question.',
	].join('\n');
}

/** When there is no current analysis — prompt to pick history or run a search. */
export function buildOpeningMessageHistoryOrSearch(): string {
	return [
		'Select a saved keyword under Context to analyze patterns across runs, or run a search for a live snapshot.',
	].join('\n');
}

/**
 * Display assistant text; soften trailing system notes for local fallback mode.
 */
export function sanitizeAssistantAnswer(text: string, mode: string): string {
	let t = text.trim();
	if (mode === 'local_fallback') {
		t = t.replace(/\n\n\(Note:[\s\S]*$/i, '').trim();
	}
	return t;
}
