import type { Platform, ResultClassification } from './analysis';
import type { DateRangeSnapshot } from './dateRange';

export type SearchHistoryStatus = 'completed' | 'partial' | 'failed';

/** One persisted search run (activity log row). */
export type SearchHistoryEntry = {
	id: string;
	keyword: string;
	/** Same as keyword for new saves; use for main term display. */
	mainKeyword?: string;
	subKeywords?: string[];
	/** When watchlist rotates subs, the sub-term used for this run (full list still in subKeywords). */
	selectedSubKeyword?: string | null;
	displayQuery?: string;
	effectiveQuery?: string;
	platform: Platform;
	searchType: string;
	/** manual = dashboard search; watchlist = automated or manual run from watchlist */
	source?: 'manual' | 'watchlist';
	watchlistTrackId?: string | null;
	createdAt: string;
	resultCount: number;
	summary: string | null;
	sentiment: string | null;
	topResultTitle: string | null;
	topResultUrl: string | null;
	normalizedResults: NormalizedResultSnapshot[];
	status: SearchHistoryStatus;
	durationMs: number | null;
	totalCommentsAnalyzed: number | null;
	cached?: boolean;
	/** openai | heuristic | partial_neutral | empty | cached_openai | cached_heuristic | unknown */
	analysisSource?: string;
	analysisSourceInferred?: boolean;
	/** Shown when live OpenAI is on but this row is heuristic / fallback */
	staleHeuristicNote?: string | null;
	/** Time window used for this search (new saves only). */
	dateRange?: DateRangeSnapshot;
};

export type NormalizedResultSnapshot = {
	id: string;
	title: string;
	url?: string;
	content_format?: string;
	content_summary?: string;
	content_sentiment_label?: string;
	comments_analyzed?: number;
	result_classification?: ResultClassification;
	matched_sub_keywords?: string[];
};

export type { ResultClassification };

/** One row on the main History page — all runs sharing the same main keyword (case-insensitive). */
export type KeywordHistoryGroup = {
	groupKey: string;
	displayLabel: string;
	runCount: number;
	latestRunAt: string;
	latestSentiment: string | null;
	latestSummarySnippet: string | null;
	latestAnalysisSource?: string;
	platform: Platform;
};

/** API payload for GET `/api/history/groups/:groupKey`. */
export type KeywordHistoryDetailResponse = {
	groupKey: string;
	displayLabel: string;
	runs: SearchHistoryEntry[];
};

/** Per-result row in persistence (detail / global index). */
export type SavedSearchResult = {
	id: string;
	searchHistoryId: string;
	platform: string;
	resultId?: string;
	/** YouTube video id when applicable; use `contentId` for generic reads. */
	videoId?: string | null;
	contentId?: string | null;
	contentType?: string | null;
	canonicalUrl?: string | null;
	title: string;
	channelName: string | null;
	creatorName?: string | null;
	publishedAt: string | null;
	foundAt: string;
	summary: string;
	sentiment: string;
	metrics: {
		views: number | null;
		likes: number | null;
		comments: number | null;
		commentsCount?: number | null;
		viewCount?: number | null;
		likeCount?: number | null;
		commentCount?: number | null;
		shareCount?: number | null;
		creatorFollowerCount?: number | null;
	};
	firstSeenAt: string;
	lastSeenAt: string;
	seenCount: number;
	resultClassification: ResultClassification;
	matchedSubKeywords?: string[];
};
