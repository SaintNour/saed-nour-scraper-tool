import type {
	AnalysisResult,
	ContentAlert,
	ContentAlertSeverity,
	ContentAlertType,
	ContentEngagementMetrics,
	ContentItem,
	ContentRowStatus,
	ContentType,
	OverallSentimentLabel,
	Platform,
	PriorityLevel,
	ResultClassification,
	ScanMode,
	SearchCountBreakdown,
	TrendLevel,
} from '$lib/types/analysis';
import type { DateRangeSnapshot } from '$lib/types/dateRange';
import { DEFAULT_PLATFORM } from '$lib/types/analysis';
import type { BackendAnalysisResponse, BackendContentItem } from '$lib/types/backend';
import { decodeHtmlEntities } from '$lib/utils/htmlEntities';

const KNOWN_PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook'];

function asPlatform(raw: string | undefined): Platform {
	const p = (raw ?? DEFAULT_PLATFORM).toLowerCase();
	return KNOWN_PLATFORMS.includes(p as Platform) ? (p as Platform) : DEFAULT_PLATFORM;
}

function asLabel(raw: string | undefined): OverallSentimentLabel {
	const l = (raw ?? 'neutral').toLowerCase();
	if (l === 'positive' || l === 'negative' || l === 'neutral') return l;
	return 'neutral';
}

function normalizeCountBreakdown(raw: unknown): SearchCountBreakdown | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const o = raw as Record<string, unknown>;
	const sm = asScanMode(typeof o.scan_mode === 'string' ? o.scan_mode : undefined);
	const profile = o.profile === 'watchlist' ? 'watchlist' : 'manual';
	return {
		maxSearchCandidates: typeof o.max_search_candidates === 'number' ? o.max_search_candidates : 0,
		maxMatchedVideos: typeof o.max_matched_videos === 'number' ? o.max_matched_videos : 0,
		scanMode: sm,
		profile,
		fetchPoolUnique: typeof o.fetch_pool_unique === 'number' ? o.fetch_pool_unique : 0,
		afterRawRelevance: typeof o.after_raw_relevance === 'number' ? o.after_raw_relevance : 0,
		newVideosAnalyzed: typeof o.new_videos_analyzed === 'number' ? o.new_videos_analyzed : 0,
		relevantAfterAnalysis: typeof o.relevant_after_analysis === 'number' ? o.relevant_after_analysis : 0,
		totalMatchingCount: typeof o.total_matching_count === 'number' ? o.total_matching_count : 0,
		totalAfterModeFilter: typeof o.total_after_mode_filter === 'number' ? o.total_after_mode_filter : 0,
		displayedCount: typeof o.displayed_count === 'number' ? o.displayed_count : 0,
		responseFromCache: o.response_from_cache === true,
		bypassCacheRequest: o.bypass_cache_request === true,
	};
}

function asScanMode(raw: string | undefined): ScanMode {
	const s = String(raw ?? 'all_relevant').toLowerCase();
	if (s === 'recent_first' || s === 'trend_catcher' || s === 'all_relevant') return s;
	if (s === 'recent first') return 'recent_first';
	if (s === 'trend catcher') return 'trend_catcher';
	return 'all_relevant';
}

function normalizeRowStatus(raw?: string): ContentRowStatus {
	if (!raw) return 'complete';
	const s = raw.toLowerCase();
	if (s === 'partial') return 'partial';
	if (s === 'unavailable') return 'unavailable';
	return 'complete';
}

function normalizeContentFormat(raw?: string): 'video' | 'short' | 'unknown' {
	const f = (raw ?? 'unknown').toLowerCase();
	if (f === 'video' || f === 'short' || f === 'unknown') return f;
	return 'unknown';
}

function normalizeContentType(rawType: string | undefined, rawFormat: string | undefined): ContentType {
	const t = String(rawType ?? '').toLowerCase();
	if (
		t === 'video' ||
		t === 'short' ||
		t === 'post' ||
		t === 'thread' ||
		t === 'reel' ||
		t === 'unknown'
	) {
		return t;
	}
	const f = normalizeContentFormat(rawFormat);
	return f === 'unknown' ? 'unknown' : f;
}

function normalizeBackendMetrics(v: BackendContentItem): ContentEngagementMetrics | undefined {
	const m = v.metrics;
	const out: ContentEngagementMetrics = {};
	if (m && typeof m === 'object') {
		if (typeof m.view_count === 'number') out.viewCount = m.view_count;
		if (typeof m.like_count === 'number') out.likeCount = m.like_count;
		if (typeof m.comment_count === 'number') out.commentCount = m.comment_count;
		if (typeof m.share_count === 'number') out.shareCount = m.share_count;
		if (typeof m.creator_follower_count === 'number')
			out.creatorFollowerCount = m.creator_follower_count;
	}
	const ca = v.comments_analyzed;
	if (typeof ca === 'number' && ca > 0 && out.commentCount === undefined) {
		out.commentCount = ca;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeContentItem(v: BackendContentItem, analysisPlatform: Platform): ContentItem {
	const id = String(v.content_id ?? v.id ?? v.video_id ?? '');
	const canonicalRaw =
		typeof v.canonical_url === 'string' && v.canonical_url.trim()
			? v.canonical_url.trim()
			: undefined;
	const urlRaw = typeof v.url === 'string' && v.url.trim() ? v.url.trim() : undefined;
	const url = canonicalRaw ?? urlRaw;
	const contentType = normalizeContentType(v.content_type, v.content_format);
	const formatForFilters =
		v.content_format != null
			? normalizeContentFormat(v.content_format)
			: contentType === 'video' || contentType === 'short'
				? contentType
				: 'unknown';
	const rawSummary =
		typeof v.content_summary === 'string' && v.content_summary.trim()
			? v.content_summary.trim()
			: undefined;
	const summary = rawSummary !== undefined ? decodeHtmlEntities(rawSummary) : undefined;
	const contentSentimentLabel = asLabel(v.content_sentiment_label);
	const audienceSentiment = v.audience_sentiment ?? v.sentiment;
	const analyzedRaw = v.analyzed_at ?? v.analyzedAt;
	const analyzedAt = typeof analyzedRaw === 'string' && analyzedRaw.trim() ? analyzedRaw.trim() : undefined;
	const rc = v.result_classification;
	const resultClassification: ResultClassification | undefined =
		rc === 'new' || rc === 'seen' || rc === 'updated' ? rc : undefined;
	const mm = v.match_meta;
	const matchMeta =
		mm && typeof mm === 'object'
			? {
					mainMatched: Boolean(mm.mainMatched),
					matchedSubKeywords: Array.isArray(mm.matchedSubKeywords) ? mm.matchedSubKeywords : [],
					isRelevant: mm.isRelevant !== false,
					matchSummary: typeof mm.matchSummary === 'string' ? mm.matchSummary : undefined,
				}
			: undefined;
	const descriptionRaw =
		typeof v.description_text === 'string'
			? v.description_text
			: typeof v.description === 'string'
				? v.description
				: typeof v.body_text === 'string'
					? v.body_text
					: undefined;
	const descriptionText =
		descriptionRaw !== undefined && descriptionRaw.trim()
			? decodeHtmlEntities(descriptionRaw.trim())
			: undefined;
	const metrics = normalizeBackendMetrics(v);
	const creatorName =
		typeof v.creator_name === 'string' && v.creator_name.trim() ? v.creator_name.trim() : undefined;
	const publishedAt =
		typeof v.published_at === 'string' && v.published_at.trim() ? v.published_at.trim() : undefined;

	const plRaw = v.priority_level;
	const priorityLevel: PriorityLevel | undefined =
		plRaw === 'critical' || plRaw === 'high' || plRaw === 'medium' || plRaw === 'low' ? plRaw : undefined;
	const priorityScore =
		typeof v.priority_score === 'number' && Number.isFinite(v.priority_score)
			? Math.round(v.priority_score)
			: undefined;
	const priorityReason =
		typeof v.priority_reason === 'string' && v.priority_reason.trim() ? v.priority_reason.trim() : undefined;

	const tlTrend = v.trend_level;
	const trendLevel: TrendLevel | undefined =
		tlTrend === 'viral_candidate' ||
		tlTrend === 'trending' ||
		tlTrend === 'rising' ||
		tlTrend === 'normal'
			? tlTrend
			: undefined;
	const trendScore =
		typeof v.trend_score === 'number' && Number.isFinite(v.trend_score)
			? Math.round(v.trend_score)
			: undefined;
	const trendReason =
		typeof v.trend_reason === 'string' && v.trend_reason.trim() ? v.trend_reason.trim() : undefined;
	const vis = v.video_insight_summary;
	const videoInsightSummary =
		vis && typeof vis === 'object'
			? (() => {
					const tone: 'positive' | 'negative' | 'neutral' =
						vis.video_tone === 'positive' || vis.video_tone === 'negative' || vis.video_tone === 'neutral'
							? vis.video_tone
							: 'neutral';
					return {
					summary: typeof vis.summary === 'string' ? decodeHtmlEntities(vis.summary.trim()) : '',
					videoTone: tone,
				};
				})()
			: undefined;

	return {
		id,
		contentId: id,
		contentType,
		...(v.content_format != null || contentType === 'video' || contentType === 'short'
			? { contentFormat: formatForFilters }
			: {}),
		...(url !== undefined
			? { url, ...(canonicalRaw ? { canonicalUrl: canonicalRaw } : { canonicalUrl: url }) }
			: {}),
		...(descriptionText !== undefined ? { descriptionText } : {}),
		...(creatorName !== undefined ? { creatorName } : {}),
		...(publishedAt !== undefined ? { publishedAt } : {}),
		...(metrics !== undefined ? { metrics } : {}),
		title: decodeHtmlEntities(String(v.title ?? '')),
		...(summary !== undefined ? { contentSummary: summary } : {}),
		...(videoInsightSummary && videoInsightSummary.summary
			? { videoInsightSummary }
			: {}),
		...(v.content_sentiment_label ? { contentSentimentLabel } : {}),
		commentsAnalyzed: v.comments_analyzed ?? 0,
		audienceSentiment: {
			positive: audienceSentiment?.positive ?? 0,
			neutral: audienceSentiment?.neutral ?? 0,
			negative: audienceSentiment?.negative ?? 0,
		},
		sentiment: {
			positive: audienceSentiment?.positive ?? 0,
			neutral: audienceSentiment?.neutral ?? 0,
			negative: audienceSentiment?.negative ?? 0,
		},
		platform: v.platform ? asPlatform(v.platform) : analysisPlatform,
		status: normalizeRowStatus(v.status),
		...(analyzedAt !== undefined ? { analyzedAt } : {}),
		...(resultClassification !== undefined ? { resultClassification } : {}),
		...(matchMeta ? { matchMeta } : {}),
		...(priorityScore !== undefined ? { priorityScore } : {}),
		...(priorityLevel !== undefined ? { priorityLevel } : {}),
		...(priorityReason !== undefined ? { priorityReason } : {}),
		...(trendScore !== undefined ? { trendScore } : {}),
		...(trendLevel !== undefined ? { trendLevel } : {}),
		...(trendReason !== undefined ? { trendReason } : {}),
	};
}

function rawContentRows(raw: BackendAnalysisResponse): BackendContentItem[] {
	return raw.content_items ?? raw.videos ?? [];
}

const ALERT_TYPES = new Set<ContentAlertType>([
	'high_risk_negative',
	'trending',
	'new_high_priority',
	'updated_momentum',
]);

const ALERT_SEVERITIES = new Set<ContentAlertSeverity>(['low', 'medium', 'high', 'critical']);

function normalizeOneAlert(raw: unknown): ContentAlert | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const type = o.type;
	if (typeof type !== 'string' || !ALERT_TYPES.has(type as ContentAlertType)) return null;
	const alertId = String(o.alert_id ?? o.alertId ?? '').trim();
	if (!alertId) return null;
	const sev = o.severity;
	if (typeof sev !== 'string' || !ALERT_SEVERITIES.has(sev as ContentAlertSeverity)) return null;
	const title = typeof o.title === 'string' ? o.title.trim() : '';
	const message = typeof o.message === 'string' ? o.message.trim() : '';
	const relatedContentId = String(o.related_content_id ?? o.relatedContentId ?? '').trim();
	const createdAt =
		typeof o.created_at === 'string' && o.created_at.trim()
			? o.created_at.trim()
			: typeof o.createdAt === 'string' && o.createdAt.trim()
				? o.createdAt.trim()
				: '';
	if (!title || !message || !relatedContentId || !createdAt) return null;

	const priorityLevel =
		typeof o.priority_level === 'string'
			? o.priority_level
			: typeof o.priorityLevel === 'string'
				? o.priorityLevel
				: undefined;
	const trendLevel =
		typeof o.trend_level === 'string'
			? o.trend_level
			: typeof o.trendLevel === 'string'
				? o.trendLevel
				: undefined;
	const contentUrl =
		typeof o.content_url === 'string' && o.content_url.trim()
			? o.content_url.trim()
			: typeof o.contentUrl === 'string' && o.contentUrl.trim()
				? o.contentUrl.trim()
				: undefined;

	return {
		alertId,
		type: type as ContentAlertType,
		severity: sev as ContentAlertSeverity,
		title,
		message,
		relatedContentId,
		...(priorityLevel ? { priorityLevel } : {}),
		...(trendLevel ? { trendLevel } : {}),
		createdAt,
		...(contentUrl ? { contentUrl } : {}),
	};
}

function normalizeContentAlertsList(raw: unknown): ContentAlert[] {
	if (!Array.isArray(raw)) return [];
	const out: ContentAlert[] = [];
	for (const item of raw) {
		const a = normalizeOneAlert(item);
		if (a) out.push(a);
	}
	return out;
}

export function normalizeAnalysisResponse(raw: BackendAnalysisResponse): AnalysisResult {
	const analysisPlatform = asPlatform(raw.platform);
	const items = rawContentRows(raw).map((row) =>
		normalizeContentItem(row, analysisPlatform),
	);
	const total =
		raw.total_content_items ?? raw.total_videos ?? items.length;

	const id = raw.insight_drivers;
	const insightDrivers = {
		whyNegative: Array.isArray(id?.why_negative) ? id.why_negative : [],
		whyPositive: Array.isArray(id?.why_positive) ? id.why_positive : [],
	};

	const ai = raw.ai_comment_stats;
	const aiCommentStats =
		ai && typeof ai === 'object'
			? {
					raw: typeof ai.raw === 'number' ? ai.raw : 0,
					sentToModel: typeof ai.sent_to_model === 'number' ? ai.sent_to_model : 0,
					droppedNoise: typeof ai.dropped_noise === 'number' ? ai.dropped_noise : 0,
				}
			: undefined;

	const subs = Array.isArray(raw.sub_keywords)
		? raw.sub_keywords.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
		: [];
	const mainKw = String(raw.main_keyword ?? raw.query ?? '').trim();

	const alerts = normalizeContentAlertsList(raw.alerts);
	const countBreakdown = normalizeCountBreakdown(raw.count_breakdown);

	return {
		query: raw.query ?? '',
		...(mainKw ? { mainKeyword: mainKw } : {}),
		...(subs.length > 0 ? { subKeywords: subs } : {}),
		...(typeof raw.display_query === 'string' && raw.display_query.trim()
			? { displayQuery: raw.display_query.trim() }
			: {}),
		scanMode: asScanMode(raw.scan_mode),
		platform: analysisPlatform,
		totalContentItems: total,
		...(typeof raw.total_matching_count === 'number'
			? { totalMatchingCount: raw.total_matching_count }
			: {}),
		...(typeof raw.total_after_mode_filter === 'number'
			? { totalAfterModeFilter: raw.total_after_mode_filter }
			: {}),
		...(typeof raw.displayed_count === 'number' ? { displayedCount: raw.displayed_count } : {}),
		...(typeof raw.trend_catcher_min_trend === 'number'
			? { trendCatcherMinTrend: raw.trend_catcher_min_trend }
			: {}),
		totalCommentsAnalyzed: raw.total_comments_analyzed ?? 0,
		sentiment: {
			positive: raw.sentiment?.positive ?? 0,
			neutral: raw.sentiment?.neutral ?? 0,
			negative: raw.sentiment?.negative ?? 0,
		},
		overallSentiment: asLabel(raw.overall_sentiment),
		summary: raw.summary ?? '',
		topComplaints: raw.top_complaints ?? [],
		topPositiveMentions: raw.top_positive_mentions ?? [],
		insightDrivers,
		recommendedActions: Array.isArray(raw.recommended_actions) ? raw.recommended_actions : [],
		contentItems: items,
		...(aiCommentStats ? { aiCommentStats } : {}),
		...(raw.cached === true ? { cached: true } : {}),
		...(countBreakdown ? { countBreakdown } : {}),
		...(typeof raw.analysis_source === 'string' && raw.analysis_source.trim()
			? { analysisSource: raw.analysis_source.trim() }
			: {}),
		...(raw.date_range && typeof raw.date_range === 'object'
			? {
					dateRange: normalizeDateRangeSnapshot(raw.date_range),
				}
			: {}),
		alerts,
	};
}

function normalizeDateRangeSnapshot(raw: Record<string, unknown>): DateRangeSnapshot {
	const preset = String(raw.preset ?? 'all') as DateRangeSnapshot['preset'];
	return {
		preset:
			preset === 'today' ||
			preset === 'yesterday' ||
			preset === 'last_7_days' ||
			preset === 'last_30_days' ||
			preset === 'custom' ||
			preset === 'all'
				? preset
				: 'all',
		label: typeof raw.label === 'string' ? raw.label : 'All time',
		start_date: typeof raw.start_date === 'string' ? raw.start_date : null,
		end_date: typeof raw.end_date === 'string' ? raw.end_date : null,
		...(typeof raw.timezone_note === 'string' ? { timezone_note: raw.timezone_note } : {}),
	};
}
