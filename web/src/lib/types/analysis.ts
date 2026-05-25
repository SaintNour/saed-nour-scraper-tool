/**
 * Domain types for the review dashboard (camelCase).
 * Platform-agnostic: “content” covers videos, posts, reels, etc.
 */

import type { DateRangeSnapshot } from './dateRange';

/** Connected social network for an analysis run. */
export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

/** Default selection until the user picks another network (first supported backend). */
export const DEFAULT_PLATFORM: Platform = 'youtube';

/** @alias Platform — kept for existing imports. */
export type PlatformId = Platform;
export type ScanMode = 'all_relevant' | 'recent_first' | 'trend_catcher';

export type OverallSentimentLabel = 'positive' | 'neutral' | 'negative';

/** Percentage-style scores (0–100) for positive / neutral / negative. */
export type SentimentBreakdown = {
	positive: number;
	neutral: number;
	negative: number;
};

/** Row-level ingest / scoring state (extend when APIs add partial failures). */
export type ContentRowStatus = 'complete' | 'partial' | 'unavailable';

/** Cross-search dedupe / freshness (from persisted history). */
export type ResultClassification = 'new' | 'seen' | 'updated';

/** Business priority tier (from platform-agnostic scoring). */
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

/** Momentum / viral tier (Phase B; separate from priority). */
export type TrendLevel = 'viral_candidate' | 'trending' | 'rising' | 'normal';

/** Phase C: analysis-run alert kinds (not push notifications). */
export type ContentAlertType =
	| 'high_risk_negative'
	| 'trending'
	| 'new_high_priority'
	| 'updated_momentum';

export type ContentAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

/** One alert derived from scoring + history classification. */
export type ContentAlert = {
	alertId: string;
	type: ContentAlertType;
	severity: ContentAlertSeverity;
	title: string;
	message: string;
	relatedContentId: string;
	priorityLevel?: string;
	trendLevel?: string;
	createdAt: string;
	/** Link to the content item when the API provided a URL */
	contentUrl?: string;
};

/** Normalized format label (legacy filters may still use `contentFormat`). */
export type ContentType =
	| 'video'
	| 'short'
	| 'post'
	| 'thread'
	| 'reel'
	| 'unknown';

/** Engagement numbers shared across networks (optional where unavailable). */
export type ContentEngagementMetrics = {
	viewCount?: number;
	likeCount?: number;
	commentCount?: number;
	shareCount?: number;
	/** Channel subs, page followers, profile followers, etc. */
	creatorFollowerCount?: number;
};

/** One content row in results (video, post, thread, reel, …). */
export type ContentItem = {
	/** Stable id on the source API (e.g. YouTube video id). */
	id: string;
	/** Same as `id` when exposed explicitly by the backend. */
	contentId?: string;
	title: string;
	/** Canonical link to the item on the source network. */
	url?: string;
	/** Alias when the API sends `canonical_url` explicitly. */
	canonicalUrl?: string;
	/** Best-effort format classification from source metadata (legacy). */
	contentFormat?: 'video' | 'short' | 'unknown';
	/** Preferred normalized type when the API sends `content_type`. */
	contentType?: ContentType;
	/** Body copy: description, post text, thread OP, caption, etc. */
	descriptionText?: string;
	/** Alias for body copy when sources use “body” wording. */
	bodyText?: string;
	creatorName?: string;
	publishedAt?: string;
	/** Cross-network engagement; YouTube maps views/likes/subs here when available. */
	metrics?: ContentEngagementMetrics;
	/** Short model-generated summary of the item (optional). */
	contentSummary?: string;
	/** Compact item-level explanation block for cards. */
	videoInsightSummary?: {
		summary: string;
		videoTone: 'positive' | 'negative' | 'neutral';
	};
	/** Sentiment of the content itself (title + description). */
	contentSentimentLabel?: OverallSentimentLabel;
	/** Audience signals: comments, replies, reactions thread, etc. */
	commentsAnalyzed: number;
	/** When the row was analyzed (ISO), for ordering. */
	analyzedAt?: string;
	/** Audience/comment sentiment breakdown. */
	audienceSentiment?: SentimentBreakdown;
	sentiment: SentimentBreakdown;
	/** Source network; omitted on wire → filled from analysis-level platform in normalize. */
	platform?: Platform;
	status?: ContentRowStatus;
	/** Present when backend compared against saved search history. */
	resultClassification?: ResultClassification;
	/** Normalized 0–100 priority score (backend + dashboard intelligence). */
	priorityScore?: number;
	/** Tier derived from {@link priorityScore}. */
	priorityLevel?: PriorityLevel;
	/** Short explanation of why this item ranks where it does. */
	priorityReason?: string;
	/** 0–100 momentum score (recency + engagement vs size + relevance). */
	trendScore?: number;
	trendLevel?: TrendLevel;
	trendReason?: string;
	signalStrength?: number;
	/** Local keyword relevance (main + optional sub-terms). */
	matchMeta?: {
		mainMatched: boolean;
		matchedSubKeywords: string[];
		isRelevant: boolean;
		matchSummary?: string;
	};
};

/** Why sentiment looks the way it does — business-readable sentences from the model. */
export type InsightDrivers = {
	whyNegative: string[];
	whyPositive: string[];
};

/** Search pipeline counts (camelCase) — mirrors API `count_breakdown`. */
export type SearchCountBreakdown = {
	maxSearchCandidates: number;
	maxMatchedVideos: number;
	scanMode: ScanMode;
	profile: 'manual' | 'watchlist';
	/** Unique video IDs returned from YouTube search (deduped, after date filter). */
	fetchPoolUnique: number;
	/** Passed title/description relevance (before history / analysis). */
	afterRawRelevance: number;
	/** New videos pulled for comment fetch (excludes items already in this flow’s history). */
	newVideosAnalyzed: number;
	/** Relevant after sentiment analysis — same basis as totalMatchingCount. */
	relevantAfterAnalysis: number;
	totalMatchingCount: number;
	totalAfterModeFilter: number;
	displayedCount: number;
	responseFromCache: boolean;
	bypassCacheRequest: boolean;
};

/** Normalized analysis payload for the UI. */
export type AnalysisResult = {
	query: string;
	/** Primary brand/topic term (same as query when only main is used). */
	mainKeyword?: string;
	/** Optional sub-terms; when non-empty, results must match main and at least one sub. */
	subKeywords?: string[];
	/** Human-readable query label (e.g. main + subs). */
	displayQuery?: string;
	/** Selection mode used before the 15-item cap. */
	scanMode?: ScanMode;
	platform: Platform;
	totalContentItems: number;
	/** Matching items before any scan-mode filter/cap. */
	totalMatchingCount?: number;
	/** Items remaining after scan-mode filter/sort, before final cap. */
	totalAfterModeFilter?: number;
	/** Final rows returned/displayed after cap. */
	displayedCount?: number;
	/** Minimum trend score (0–100) when scan mode is Trend Catcher. */
	trendCatcherMinTrend?: number;
	totalCommentsAnalyzed: number;
	sentiment: SentimentBreakdown;
	overallSentiment: OverallSentimentLabel;
	summary: string;
	topComplaints: string[];
	topPositiveMentions: string[];
	/** Deeper “why” behind positive vs negative tone. */
	insightDrivers: InsightDrivers;
	/** Suggested next steps for teams. */
	recommendedActions: string[];
	contentItems: ContentItem[];
	/** Optional: comments collected vs sent to the model (cost optimization). */
	aiCommentStats?: {
		raw: number;
		sentToModel: number;
		droppedNoise: number;
	};
	/** True when served from server-side TTL cache. */
	cached?: boolean;
	/** How many videos were fetched, filtered, and ranked — for trustworthy counts. */
	countBreakdown?: SearchCountBreakdown;
	/**
	 * How this run was produced: openai | heuristic | partial_neutral | empty |
	 * cached_openai | cached_heuristic (and similar).
	 */
	analysisSource?: string;
	/** Time window used for this search (optional). */
	dateRange?: DateRangeSnapshot;
	/** Phase C: important events for this run (empty when none). */
	alerts: ContentAlert[];
};

export type AnalysisHistoryItem = {
	id: string;
	query: string;
	title: string;
	url: string;
	platform: Platform;
	contentFormat: 'video' | 'short' | 'unknown';
	contentType?: ContentType;
	contentSentimentLabel: OverallSentimentLabel;
	analyzedAt: string;
};
