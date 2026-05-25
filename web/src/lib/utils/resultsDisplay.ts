import type { ContentItem, OverallSentimentLabel, ResultClassification, SentimentBreakdown } from '$lib/types/analysis';

export type ResultsSort = 'negative' | 'positive' | 'comments' | 'latest';
export type ResultsFilter = 'all' | 'audience_negative' | 'audience_positive' | 'video' | 'short';

/**
 * How to narrow rows by cross-search history classification.
 * - `new+updated` — hide unchanged duplicates (recommended default).
 * - `new` / `updated` — single class only.
 * - `all` — no visibility filtering.
 */
export type ResultsVisibility = 'new' | 'updated' | 'new+updated' | 'all';

export function dominantAudience(s: SentimentBreakdown): OverallSentimentLabel {
	const { positive, neutral, negative } = s;
	if (positive >= neutral && positive >= negative) return 'positive';
	if (negative >= positive && negative >= neutral) return 'negative';
	return 'neutral';
}

export function isSentimentMismatch(row: ContentItem): boolean {
	const c = row.contentSentimentLabel;
	const a = dominantAudience(row.sentiment);
	if (c === 'positive' && a === 'negative') return true;
	if (c === 'negative' && a === 'positive') return true;
	return false;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export function commentConfidence(commentsAnalyzed: number): ConfidenceLevel {
	const n = commentsAnalyzed;
	if (n <= 3) return 'low';
	if (n <= 7) return 'medium';
	return 'high';
}

export function confidenceWording(level: ConfidenceLevel): { label: string; hint: string } {
	switch (level) {
		case 'low':
			return { label: 'Low', hint: 'Few comments — treat as directional' };
		case 'medium':
			return { label: 'Medium', hint: 'Moderate amount of feedback' };
		default:
			return { label: 'High', hint: 'Plenty of comments to lean on' };
	}
}

/** Missing classification = treat as first-time hit (same as backend UX). */
export function classificationOf(row: ContentItem): ResultClassification {
	return row.resultClassification ?? 'new';
}

function applyVisibility(rows: ContentItem[], visibility: ResultsVisibility): ContentItem[] {
	if (visibility === 'all') return rows;
	return rows.filter((r) => {
		const c = classificationOf(r);
		if (visibility === 'new') return c === 'new';
		if (visibility === 'updated') return c === 'updated';
		/* new+updated */
		return c === 'new' || c === 'updated';
	});
}

/** Visibility-only pass (for empty-state hints). Same rules as inside {@link processResultRows}. */
export function filterRowsByVisibility(items: ContentItem[], visibility: ResultsVisibility): ContentItem[] {
	return applyVisibility([...items], visibility);
}

function applyFilter(rows: ContentItem[], filter: ResultsFilter): ContentItem[] {
	if (filter === 'all') return rows;
	if (filter === 'video') return rows.filter((r) => (r.contentFormat ?? 'unknown') === 'video');
	if (filter === 'short') return rows.filter((r) => (r.contentFormat ?? 'unknown') === 'short');
	if (filter === 'audience_negative') {
		return rows.filter((r) => dominantAudience(r.sentiment) === 'negative');
	}
	if (filter === 'audience_positive') {
		return rows.filter((r) => dominantAudience(r.sentiment) === 'positive');
	}
	return rows;
}

function applySort(rows: ContentItem[], sort: ResultsSort, indexById: Map<string, number>): ContentItem[] {
	const out = [...rows];
	if (sort === 'negative') {
		out.sort((a, b) => b.sentiment.negative - a.sentiment.negative);
	} else if (sort === 'positive') {
		out.sort((a, b) => b.sentiment.positive - a.sentiment.positive);
	} else if (sort === 'comments') {
		out.sort((a, b) => b.commentsAnalyzed - a.commentsAnalyzed);
	} else {
		out.sort((a, b) => {
			const ta = a.analyzedAt ?? '';
			const tb = b.analyzedAt ?? '';
			const c = tb.localeCompare(ta);
			if (c !== 0) return c;
			return (indexById.get(b.id) ?? 0) - (indexById.get(a.id) ?? 0);
		});
	}
	return out;
}

export function processResultRows(
	items: ContentItem[],
	opts: { sort: ResultsSort; filter: ResultsFilter; visibility?: ResultsVisibility },
): ContentItem[] {
	const indexById = new Map(items.map((r, i) => [r.id, i]));
	let rows = [...items];
	rows = applyVisibility(rows, opts.visibility ?? 'new+updated');
	rows = applyFilter(rows, opts.filter);
	rows = applySort(rows, opts.sort, indexById);
	return rows;
}
