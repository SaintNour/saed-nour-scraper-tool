/**
 * REST / JSON wire shapes from the Node API (snake_case at top level).
 * Use with `normalizeAnalysisResponse` to produce {@link AnalysisResult}.
 *
 * Legacy fields `total_videos` + `videos` remain for the current analyzer;
 * prefer `total_content_items` + `content_items` for new backends.
 */

/** Sentiment block as returned by the API (numeric keys match the frontend). */
export type BackendSentimentBreakdown = {
	positive: number;
	neutral: number;
	negative: number;
};

/** Wire metrics (snake_case); optional fields vary by platform. */
export type BackendContentMetrics = {
	view_count?: number;
	like_count?: number;
	comment_count?: number;
	share_count?: number;
	creator_follower_count?: number;
};

/** One backend row before mapping to {@link ContentItem}. */
export type BackendContentItem = {
	id: string;
	/** Legacy YouTube batch id; prefer `id` / `content_id`. */
	video_id?: string;
	content_id?: string;
	title: string;
	url?: string;
	canonical_url?: string;
	content_format?: 'video' | 'short' | 'unknown' | string;
	/** Preferred normalized type when present. */
	content_type?: string;
	description?: string;
	description_text?: string;
	body_text?: string;
	creator_name?: string;
	published_at?: string;
	metrics?: BackendContentMetrics;
	content_summary?: string;
	video_insight_summary?: {
		summary?: string;
		video_tone?: 'positive' | 'negative' | 'neutral' | string;
	};
	content_sentiment_label?: 'positive' | 'neutral' | 'negative' | string;
	comments_analyzed?: number;
	audience_sentiment?: BackendSentimentBreakdown;
	sentiment?: BackendSentimentBreakdown;
	/** Per-row platform when APIs return mixed sources */
	platform?: string;
	status?: string;
	analyzed_at?: string;
	analyzedAt?: string;
	/** Cross-search classification from persisted history */
	result_classification?: 'new' | 'seen' | 'updated';
	/** Platform-agnostic priority (Phase A scoring). */
	priority_score?: number;
	priority_level?: 'critical' | 'high' | 'medium' | 'low';
	priority_reason?: string;
	/** Phase B: momentum / trend (separate from priority). */
	trend_score?: number;
	trend_level?: 'viral_candidate' | 'trending' | 'rising' | 'normal';
	trend_reason?: string;
	/** Keyword match metadata from analyzer */
	match_meta?: {
		mainMatched?: boolean;
		matchedSubKeywords?: string[];
		isRelevant?: boolean;
		matchSummary?: string;
	};
};

/** Raw analysis JSON (snake_case). Partial fields tolerate incremental API changes. */
export type BackendAnalysisResponse = {
	query?: string;
	main_keyword?: string;
	sub_keywords?: string[];
	display_query?: string;
	scan_mode?: 'all_relevant' | 'recent_first' | 'trend_catcher' | string;
	platform?: string;

	/** Legacy count field (still emitted by the current API). */
	total_videos?: number;
	/** Preferred unified count when present. */
	total_content_items?: number;
	total_matching_count?: number;
	total_after_mode_filter?: number;
	displayed_count?: number;
	/** Minimum trend score (0–100) for Trend Catcher scan mode. */
	trend_catcher_min_trend?: number;

	/** Pipeline counts (snake_case) — see analyzerService buildCountBreakdown */
	count_breakdown?: {
		max_search_candidates?: number;
		max_matched_videos?: number;
		scan_mode?: string;
		profile?: string;
		fetch_pool_unique?: number;
		after_raw_relevance?: number;
		new_videos_analyzed?: number;
		relevant_after_analysis?: number;
		total_matching_count?: number;
		total_after_mode_filter?: number;
		displayed_count?: number;
		response_from_cache?: boolean;
		bypass_cache_request?: boolean;
	};

	total_comments_analyzed?: number;
	sentiment?: BackendSentimentBreakdown;
	overall_sentiment?: string;
	summary?: string;
	top_complaints?: string[];
	top_positive_mentions?: string[];
	insight_drivers?: {
		why_negative?: string[];
		why_positive?: string[];
	};
	recommended_actions?: string[];
	ai_comment_stats?: {
		raw?: number;
		sent_to_model?: number;
		dropped_noise?: number;
	};
	cached?: boolean;
	/** How this run was produced (snake_case from analyzer). */
	analysis_source?: string;

	/** Legacy list field (same row shape as `content_items`). */
	videos?: BackendContentItem[];
	/** Preferred unified list when present. */
	content_items?: BackendContentItem[];

	/** Phase C: analysis alerts. */
	alerts?: Array<Record<string, unknown>>;

	/** Search time window (optional). */
	date_range?: {
		preset?: string;
		label?: string;
		start_date?: string | null;
		end_date?: string | null;
		timezone_note?: string;
	};
};
