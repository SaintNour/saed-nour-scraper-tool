<script lang="ts">
	import type {
		ContentItem,
		ContentRowStatus,
		ContentType,
		OverallSentimentLabel,
		PriorityLevel,
	} from '$lib/types/analysis';
	import { DEFAULT_PLATFORM } from '$lib/types/analysis';
	import {
		commentConfidence,
		confidenceWording,
		classificationOf,
		dominantAudience,
		isSentimentMismatch,
	} from '$lib/utils/resultsDisplay';

	let {
		rows,
		caption = 'Results',
		isFilteredEmpty = false,
		filterEmptyHint = null,
	}: {
		rows: ContentItem[];
		caption?: string;
		isFilteredEmpty?: boolean;
		filterEmptyHint?: string | null;
	} = $props();

	let insightModal = $state<{ title: string; summary: string; tone: 'positive' | 'negative' | 'neutral' } | null>(
		null,
	);

	function toneClass(tone: 'positive' | 'negative' | 'neutral'): string {
		if (tone === 'positive') return 'text-emerald-300/90';
		if (tone === 'negative') return 'text-rose-300/90';
		return 'text-zinc-400';
	}

	function toneLabel(audience: OverallSentimentLabel): string {
		if (audience === 'positive') return 'Positive';
		if (audience === 'negative') return 'Negative';
		return 'Neutral';
	}

	function audienceToneClass(audience: OverallSentimentLabel): string {
		if (audience === 'positive') return 'text-emerald-300';
		if (audience === 'negative') return 'text-rose-300';
		return 'text-zinc-400';
	}

	function statusLabel(st: ContentRowStatus): string {
		if (st === 'partial') return 'Partial';
		if (st === 'unavailable') return 'Unavailable';
		return 'Complete';
	}

	function statusBadgeClass(st: ContentRowStatus): string {
		if (st === 'partial') return 'bg-amber-500/12 text-amber-200 ring-amber-500/25';
		if (st === 'unavailable') return 'bg-zinc-600/30 text-zinc-400 ring-zinc-500/30';
		return 'bg-emerald-500/10 text-emerald-200/90 ring-emerald-500/20';
	}

	function historyBadge(row: ContentItem): { label: string; class: string } {
		const c = classificationOf(row);
		if (c === 'new') return { label: 'New', class: 'bg-emerald-500/15 text-emerald-100 ring-emerald-500/30' };
		if (c === 'updated')
			return { label: 'Updated', class: 'bg-sky-500/15 text-sky-100 ring-sky-500/30' };
		return { label: 'Seen', class: 'bg-zinc-600/25 text-zinc-300 ring-zinc-500/35' };
	}

	function formatForLegacyBadges(row: ContentItem): 'video' | 'short' | 'unknown' {
		const ct = row.contentType;
		if (ct === 'video' || ct === 'short') return ct;
		if (ct && ct !== 'unknown') return 'unknown';
		return row.contentFormat ?? 'unknown';
	}

	function genericTypeBadge(ct: ContentType | undefined): { label: string; class: string } | null {
		if (!ct || ct === 'unknown' || ct === 'video' || ct === 'short') return null;
		const labels: Record<string, string> = {
			post: 'Post',
			thread: 'Thread',
			reel: 'Reel',
		};
		const label = labels[ct] ?? ct.charAt(0).toUpperCase() + ct.slice(1);
		const cls =
			ct === 'thread'
				? 'bg-violet-500/12 text-violet-200 ring-violet-500/25'
				: ct === 'reel'
					? 'bg-fuchsia-500/12 text-fuchsia-200 ring-fuchsia-500/25'
					: 'bg-sky-500/12 text-sky-200 ring-sky-500/25';
		return { label, class: cls };
	}

	function primarySummary(row: ContentItem): string {
		const insight = row.videoInsightSummary?.summary?.trim();
		if (insight) {
			return insight.length > 180 ? `${insight.slice(0, 179)}…` : insight;
		}
		const s = row.contentSummary?.trim();
		if (s) return s.length > 180 ? `${s.slice(0, 179)}…` : s;
		const d = row.descriptionText?.trim() ?? row.bodyText?.trim();
		return d ? (d.length > 180 ? `${d.slice(0, 179)}…` : d) : '';
	}

	function isInsightLong(summary: string | undefined): boolean {
		const s = String(summary || '').trim();
		return s.length > 160;
	}

	function openInsightModal(row: ContentItem) {
		const info = row.videoInsightSummary;
		if (!info || !info.summary) return;
		insightModal = {
			title: row.title,
			summary: info.summary,
			tone: info.videoTone ?? 'neutral',
		};
	}

	function closeInsightModal() {
		insightModal = null;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && insightModal) {
			closeInsightModal();
		}
	}

	function commentCount(row: ContentItem): number {
		const m = row.metrics?.commentCount;
		if (typeof m === 'number' && m >= 0) return m;
		return row.commentsAnalyzed;
	}

	function signalLine(row: ContentItem, confLabel: string): string {
		const parts: string[] = [];
		parts.push(`Confidence ${confLabel}`);
		if (row.signalStrength != null && Number.isFinite(row.signalStrength)) {
			const s = row.signalStrength;
			parts.push(`Signal ${Number.isInteger(s) ? s : Math.round(s * 100) / 100}`);
		}
		return parts.join(' · ');
	}

	function displayPriorityLevel(row: ContentItem): PriorityLevel | undefined {
		if (row.priorityLevel) return row.priorityLevel;
		const s = row.priorityScore;
		if (s == null || !Number.isFinite(s)) return undefined;
		if (s >= 82) return 'critical';
		if (s >= 64) return 'high';
		if (s >= 42) return 'medium';
		return 'low';
	}

	function priorityShortLabel(level: PriorityLevel): string {
		if (level === 'critical' || level === 'high') return 'High';
		if (level === 'medium') return 'Medium';
		return 'Low';
	}

	function priorityBadgeClass(level: PriorityLevel): string {
		if (level === 'critical' || level === 'high') {
			return 'bg-rose-500/22 text-rose-50 ring-rose-400/45';
		}
		if (level === 'medium') return 'bg-amber-500/22 text-amber-100 ring-amber-400/40';
		return 'bg-emerald-500/16 text-emerald-100 ring-emerald-400/35';
	}

	function youtubeThumbnailUrl(row: ContentItem): string | null {
		if ((row.platform ?? DEFAULT_PLATFORM) !== 'youtube') return null;
		const id = String(row.id ?? '').trim();
		if (!id) return null;
		return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
	}

	function trendBand(score: number): { icon: string; bracket: string; mode: 'hot' | 'cold' | 'mid' } {
		const n = Math.round(score);
		if (n >= 70) return { icon: '🔥', bracket: '(high)', mode: 'hot' };
		if (n < 45) return { icon: '❄️', bracket: '(low)', mode: 'cold' };
		return { icon: '', bracket: '', mode: 'mid' };
	}

	function trendSurfaceClass(mode: 'hot' | 'cold' | 'mid'): string {
		if (mode === 'hot') {
			return 'bg-gradient-to-br from-amber-600/30 to-rose-700/25 text-amber-50 ring-amber-500/35 shadow-[0_0_28px_-10px_rgba(251,146,60,0.4)] animate-[trendPulse_3s_ease-in-out_infinite]';
		}
		if (mode === 'cold') {
			return 'bg-sky-950/85 text-sky-100 ring-sky-400/30 shadow-[0_0_22px_-12px_rgba(56,189,248,0.38)]';
		}
		return 'bg-zinc-800/80 text-zinc-200 ring-zinc-600/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]';
	}

	/** Tone of the content/video (not comment sentiment). */
	function contentToneFromRow(row: ContentItem): OverallSentimentLabel | null {
		if (row.videoInsightSummary?.videoTone != null) return row.videoInsightSummary.videoTone;
		if (row.contentSentimentLabel) return row.contentSentimentLabel;
		return null;
	}

	function showRiskAlert(row: ContentItem, audience: OverallSentimentLabel): boolean {
		const p = displayPriorityLevel(row);
		if (p === 'critical') return true;
		if (p === 'high' && audience === 'negative') return true;
		return isSentimentMismatch(row);
	}

	const linkClass =
		'font-semibold leading-snug text-zinc-100 underline decoration-zinc-600/45 underline-offset-[3px] transition-colors duration-150 hover:text-sky-200/95 hover:decoration-sky-400/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500/40';
</script>

<div
	class="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121820]/40 shadow-[0_16px_46px_-22px_rgba(0,0,0,0.62),0_0_0_1px_rgba(255,255,255,0.04),0_1px_0_0_rgba(255,255,255,0.04)_inset]"
>
	<div class="border-b border-white/[0.06] bg-black/20 px-5 py-4 sm:px-6">
		<h3 class="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{caption}</h3>
	</div>

	<div class="space-y-4 p-4 sm:p-5">
		{#if rows.length === 0}
			<div class="rounded-xl border border-dashed border-zinc-800/80 bg-[#0b0f14]/40 px-6 py-16 text-center text-sm text-zinc-500">
				{#if isFilteredEmpty}
					{#if filterEmptyHint}
						<p class="font-medium text-zinc-400">Nothing to show</p>
						<p class="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-600">
							{filterEmptyHint}
						</p>
					{:else}
						<p class="font-medium text-zinc-400">Nothing fits this view</p>
						<p class="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-600">
							Set View to Everything or try a different order.
						</p>
					{/if}
				{:else}
					<p>No matching content for this search.</p>
				{/if}
			</div>
		{:else}
			{#each rows as row (row.id)}
				{@const audience = dominantAudience(row.sentiment)}
				{@const mismatch = isSentimentMismatch(row)}
				{@const conf = commentConfidence(row.commentsAnalyzed)}
				{@const confText = confidenceWording(conf)}
				{@const hist = historyBadge(row)}
				{@const genType = genericTypeBadge(row.contentType)}
				{@const summary = primarySummary(row)}
				{@const comments = commentCount(row)}
				{@const thumb = youtubeThumbnailUrl(row)}
				{@const pLevel = displayPriorityLevel(row)}
				{@const alertRow = showRiskAlert(row, audience)}
				{@const fmt = formatForLegacyBadges(row)}
				{@const contentTone = contentToneFromRow(row)}
				<article
					class="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0f141c]/90 shadow-[0_4px_28px_-10px_rgba(0,0,0,0.55)] transition duration-200 hover:border-sky-500/25 hover:shadow-[0_12px_40px_-14px_rgba(0,0,0,0.6)] {mismatch
						? 'ring-1 ring-amber-500/15'
						: ''}"
					title={mismatch ? 'Content and audience sentiment disagree' : undefined}
				>
					<div class="flex flex-col gap-4 p-4 lg:flex-row lg:items-stretch lg:gap-5">
						<!-- Thumbnail -->
						<div class="w-full shrink-0 lg:w-[200px]">
							{#if thumb && row.url}
								<a
									href={row.url}
									target="_blank"
									rel="noopener noreferrer"
									class="block overflow-hidden rounded-xl ring-1 ring-white/[0.08] transition hover:ring-sky-500/30"
								>
									<img
										src={thumb}
										alt=""
										class="aspect-video w-full object-cover"
										loading="lazy"
									/>
								</a>
							{:else if thumb}
								<div class="overflow-hidden rounded-xl ring-1 ring-white/[0.08]">
									<img
										src={thumb}
										alt=""
										class="aspect-video w-full object-cover"
										loading="lazy"
									/>
								</div>
							{:else}
								<div
									class="flex aspect-video w-full items-center justify-center rounded-xl bg-zinc-900/80 ring-1 ring-white/[0.06]"
								>
									<span class="text-[10px] text-zinc-600">No preview</span>
								</div>
							{/if}
						</div>

						<!-- Content -->
						<div class="min-w-0 flex-1">
							<div
								class="min-w-0 border-l-2 border-transparent pl-0 {mismatch
									? 'border-amber-400/60 pl-3'
									: ''}"
							>
								{#if row.url}
									<a
										href={row.url}
										target="_blank"
										rel="noopener noreferrer"
										class="line-clamp-1 break-words text-base {linkClass}"
									>
										{row.title}
									</a>
								{:else}
									<p class="line-clamp-1 break-words text-base font-semibold leading-snug text-zinc-100">
										{row.title}
									</p>
								{/if}

								{#if summary}
									<p class="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-500">
										{summary}
									</p>
								{/if}

								<div class="mt-3 space-y-1.5">
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-[11px] font-medium text-zinc-500">Audience sentiment</span>
										<span class="text-sm font-semibold {audienceToneClass(audience)}">
											{toneLabel(audience)}
										</span>
									</div>
									{#if contentTone != null}
										<div class="flex flex-wrap items-center gap-2">
											<span class="text-[11px] font-medium text-zinc-500">Video tone</span>
											<span class="text-sm font-semibold {audienceToneClass(contentTone)}">
												{toneLabel(contentTone)}
											</span>
										</div>
									{/if}
								</div>

								{#if row.videoInsightSummary?.summary && isInsightLong(row.videoInsightSummary.summary)}
									<button
										type="button"
										class="mt-2 text-[12px] font-medium text-sky-400/90 underline decoration-sky-500/30 underline-offset-2 transition hover:text-sky-300"
										onclick={() => openInsightModal(row)}
									>
										View full insight
									</button>
								{/if}

								<div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
									<span
										class="inline-flex rounded-md px-2 py-0.5 font-medium ring-1 ring-inset {hist.class}"
									>
										{hist.label}
									</span>
									<span
										class="inline-flex rounded-md px-2 py-0.5 font-medium ring-1 ring-inset {statusBadgeClass(
											row.status ?? 'complete',
										)}"
									>
										{statusLabel(row.status ?? 'complete')}
									</span>
									{#if genType}
										<span class="inline-flex rounded-md px-2 py-0.5 font-medium ring-1 ring-inset {genType.class}">
											{genType.label}
										</span>
									{:else if fmt === 'short'}
										<span class="text-zinc-500">Short</span>
									{:else if fmt === 'video'}
										<span class="text-zinc-500">Video</span>
									{/if}
									<span class="tabular-nums text-zinc-500">{comments} comments</span>
								</div>
								<p class="mt-2 text-[11px] leading-snug text-zinc-600" title={confText.hint}>
									{signalLine(row, confText.label)}
								</p>
								{#if row.matchMeta?.matchedSubKeywords?.length}
									<p class="mt-2 line-clamp-1 text-[11px] text-zinc-600">
										<span class="text-zinc-500">Matched · </span>{row.matchMeta.matchedSubKeywords.join(
											', ',
										)}
									</p>
								{/if}
							</div>
						</div>

						<!-- Metrics -->
						<div
							class="flex shrink-0 flex-row gap-4 border-t border-white/[0.06] pt-4 sm:gap-6 lg:w-[200px] lg:flex-col lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"
						>
							<div class="flex min-w-0 flex-1 flex-col lg:items-end lg:text-right">
								{#if row.trendScore != null && Number.isFinite(row.trendScore)}
									{@const band = trendBand(row.trendScore)}
									<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
										Trend score
									</p>
									<div
										class="mt-2 inline-flex items-baseline gap-1.5 rounded-xl px-3 py-2.5 ring-2 ring-inset tabular-nums {trendSurfaceClass(
											band.mode,
										)}"
										title={row.trendReason ?? undefined}
									>
										{#if band.icon}
											<span class="text-lg leading-none" aria-hidden="true">{band.icon}</span>
										{/if}
										<span class="text-2xl font-bold">{Math.round(row.trendScore)}</span>
										{#if band.bracket}
											<span class="text-xs font-medium text-white/80">{band.bracket}</span>
										{/if}
									</div>
									{#if row.trendReason}
										<p class="mt-2 line-clamp-2 text-left text-[11px] leading-snug text-zinc-600 lg:text-right">
											{row.trendReason}
										</p>
									{/if}
								{:else}
									<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
										Trend score
									</p>
									<p class="mt-2 text-sm text-zinc-600">—</p>
								{/if}
							</div>

							<div class="flex flex-col items-end gap-3 lg:w-full">
								{#if pLevel}
									<div class="text-right">
										<p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
											Priority
										</p>
										<span
											class="mt-2 inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset {priorityBadgeClass(
												pLevel,
											)}"
											title={row.priorityReason ?? undefined}
										>
											{priorityShortLabel(pLevel)}
										</span>
										{#if row.priorityScore != null && Number.isFinite(row.priorityScore)}
											<span class="ml-2 text-sm font-semibold tabular-nums text-zinc-400">
												{Math.round(row.priorityScore)}
											</span>
										{/if}
									</div>
								{/if}

								{#if alertRow}
									<span class="text-xl leading-none" title="High attention" aria-label="High attention"
										>🚨</span
									>
								{/if}
							</div>
						</div>
					</div>
				</article>
			{/each}
		{/if}
	</div>
</div>

<svelte:window onkeydown={onWindowKeydown} />

{#if insightModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Video insight summary"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeInsightModal();
		}}
	>
		<div class="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
			<div class="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
				<h4 class="text-sm font-semibold text-zinc-100">Video Insight Summary</h4>
				<button
					type="button"
					class="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-sky-200"
					onclick={closeInsightModal}
				>
					Close
				</button>
			</div>
			<div class="max-h-[62vh] space-y-3 overflow-y-auto px-4 py-4">
				<p class="line-clamp-2 text-xs font-medium text-zinc-400">{insightModal.title}</p>
				<p class="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
					{insightModal.summary}
				</p>
				<p class="text-sm {toneClass(insightModal.tone)}">
					<span class="font-medium text-zinc-300">Video Tone:</span>
					{toneLabel(insightModal.tone as OverallSentimentLabel)}
				</p>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes trendPulse {
		0%,
		100% {
			box-shadow: 0 0 26px -10px rgba(251, 146, 60, 0.38);
		}
		50% {
			box-shadow: 0 0 34px -8px rgba(251, 146, 60, 0.48);
		}
	}
</style>
