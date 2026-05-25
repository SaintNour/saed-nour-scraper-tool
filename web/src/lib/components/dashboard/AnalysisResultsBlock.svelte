<script lang="ts">
	import ResultsTable from '$lib/components/tables/ResultsTable.svelte';
	import type { AnalysisResult } from '$lib/types/analysis';
	import { getPlatformLabel } from '$lib/types/platform';
	import { createMonitoringTrack, ReviewsApiError } from '$lib/services/api';
	import {
		filterRowsByVisibility,
		processResultRows,
		type ResultsFilter,
		type ResultsSort,
		type ResultsVisibility,
	} from '$lib/utils/resultsDisplay';

	let { data }: { data: AnalysisResult } = $props();

	const visibilityOptions: { value: ResultsVisibility; label: string; short?: string }[] = [
		{ value: 'new', label: 'New' },
		{ value: 'updated', label: 'Updated' },
		{ value: 'new+updated', label: 'New + Updated', short: 'New+Upd' },
		{ value: 'all', label: 'All' },
	];

	let trackBusy = $state(false);
	let trackMsg = $state<string | null>(null);

	async function addToWatchlist() {
		const q = data.query.trim();
		if (!q) return;
		trackBusy = true;
		trackMsg = null;
		try {
			await createMonitoringTrack(q, 3);
			trackMsg = 'Saved — we’ll re-check on schedule (Automation).';
		} catch (e) {
			trackMsg = e instanceof ReviewsApiError ? e.message : 'Could not add watch';
		} finally {
			trackBusy = false;
		}
	}

	let sort = $state<ResultsSort>('latest');
	let filter = $state<ResultsFilter>('all');
	/** Default: new + updated (hide unchanged “seen” only). */
	let visibility = $state<ResultsVisibility>('new+updated');

	const displayRows = $derived(
		processResultRows(data.contentItems, { sort, filter, visibility }),
	);

	const sourceCount = $derived(data.contentItems.length);
	const matchingCount = $derived(data.totalMatchingCount ?? sourceCount);
	const afterModeCount = $derived(data.totalAfterModeFilter ?? matchingCount);
	const displayedCount = $derived(data.displayedCount ?? sourceCount);
	const isTrendCatcher = $derived(data.scanMode === 'trend_catcher');
	const cb = $derived(data.countBreakdown);
	const isFilteredEmpty = $derived(displayRows.length === 0 && sourceCount > 0);

	const afterVisibilityOnly = $derived(filterRowsByVisibility(data.contentItems, visibility));
	const visibilityExcludesEverything = $derived(
		sourceCount > 0 && afterVisibilityOnly.length === 0 && visibility !== 'all',
	);

	const tableEmptyHint = $derived.by((): string | null => {
		if (!visibilityExcludesEverything) return null;
		switch (visibility) {
			case 'new+updated':
				return 'No new or updated results. Try switching to “All”.';
			case 'new':
				return 'No “new” rows match this filter. Try “All” or “New + Updated”.';
			case 'updated':
				return 'No “updated” rows match this filter. Try “All”.';
			default:
				return null;
		}
	});

	const selectClass =
		'w-[9.5rem] shrink-0 cursor-pointer rounded-lg border border-zinc-800/50 bg-zinc-950/50 py-1.5 pl-2 pr-7 text-[12px] leading-tight text-zinc-300 outline-none transition-colors hover:border-zinc-700/80 focus:border-emerald-500/35 sm:w-[10.5rem] sm:pl-2.5 sm:text-sm';

	const segBtnActive =
		'bg-zinc-800 text-zinc-100 shadow-sm ring-1 ring-white/10';
	const segBtnIdle = 'text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-300';

	/** Screen reader summary of the single-line metadata row. */
	const metadataAria = $derived.by(() => {
		const plat = getPlatformLabel(data.platform);
		if (isTrendCatcher) {
			if (displayedCount === 0 && matchingCount > 0) {
				const threshold = data.trendCatcherMinTrend ?? 70;
				return `Search ${data.query}. ${plat}. ${displayedCount} results. ${matchingCount} matches. ${afterModeCount} trending. None reached trend score ${threshold} plus.`;
			}
			return `Search ${data.query}. ${plat}. ${displayedCount} results. ${matchingCount} matches. ${afterModeCount} trending.`;
		}
		let s = `Search ${data.query}. ${plat}. ${displayedCount} results. ${matchingCount} matches.`;
		if (cb?.responseFromCache) s += ' Cached snapshot.';
		return s;
	});
</script>

<div class="space-y-5">
	{#if sourceCount === 0}
		<div
			class="rounded-2xl border border-dashed border-zinc-800/70 bg-zinc-900/20 px-6 py-14 text-center"
			role="status"
		>
			<p class="text-sm font-medium text-zinc-300">
				{isTrendCatcher ? 'No Trend Catcher results found' : 'No videos or posts matched'}
			</p>
			<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
				{#if isTrendCatcher && matchingCount > 0}
					{matchingCount} matching videos were found, but none reached trend score {data.trendCatcherMinTrend ?? 70}+.
					Try All Relevant or Recent First.
				{:else}
					Try different words, a broader topic, or check the spelling.
				{/if}
			</p>
		</div>
	{:else}
		<header
			class="grid gap-4 border-b border-zinc-800/40 pb-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-5"
		>
			<div class="min-w-0 space-y-2">
				<p
					class="flex min-w-0 items-center gap-x-2 overflow-x-auto text-[11px] leading-none text-zinc-500 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					aria-label={metadataAria}
					role="group"
				>
					<span class="shrink-0 whitespace-nowrap">
						<span class="text-zinc-600">Search</span>
						<span class="font-medium text-zinc-200"> “{data.query}”</span>
					</span>
					<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
					<span class="shrink-0 whitespace-nowrap">{getPlatformLabel(data.platform)}</span>
					<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
					<span class="shrink-0 whitespace-nowrap">
						<span class="font-medium tabular-nums text-zinc-300">{displayedCount}</span>
						<span class="text-zinc-600"> results</span>
					</span>
					<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
					<span class="shrink-0 whitespace-nowrap">
						<span class="font-medium tabular-nums text-zinc-300">{matchingCount}</span>
						<span class="text-zinc-600"> matches</span>
					</span>
					{#if isTrendCatcher}
						<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
						<span class="shrink-0 whitespace-nowrap">
							<span class="font-medium tabular-nums text-sky-300/90">{afterModeCount}</span>
							<span class="text-zinc-600"> trending</span>
						</span>
					{/if}
					{#if isTrendCatcher && displayedCount === 0 && matchingCount > 0}
						<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
						<span class="shrink-0 whitespace-nowrap text-amber-200/80">
							threshold {data.trendCatcherMinTrend ?? 70}+
						</span>
					{/if}
					{#if cb?.responseFromCache}
						<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
						<span class="shrink-0 whitespace-nowrap text-zinc-600">cached</span>
					{/if}
				</p>
				{#if data.platform === 'youtube'}
					<div class="flex flex-wrap items-center gap-2">
						<button
							type="button"
							disabled={trackBusy}
							onclick={addToWatchlist}
							class="rounded-lg border border-zinc-700/80 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-emerald-500/35 hover:text-zinc-100 disabled:opacity-50"
						>
							{trackBusy ? 'Adding…' : 'Track this keyword'}
						</button>
						<a
							href="/monitoring"
							class="text-xs text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline"
						>
							Automation
						</a>
						{#if trackMsg}
							<span class="text-xs text-zinc-500">{trackMsg}</span>
						{/if}
					</div>
				{/if}
			</div>

			<div
				class="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 lg:flex-nowrap lg:gap-x-4"
				role="toolbar"
				aria-label="Order and filter results"
			>
				<div class="flex min-w-0 items-center gap-2">
					<span
						id="history-filter-label"
						class="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600"
					>
						History
					</span>
					<div
						class="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						role="group"
						aria-labelledby="history-filter-label"
					>
						{#each visibilityOptions as opt}
							<button
								type="button"
								class="shrink-0 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium leading-none transition-colors sm:px-2.5 sm:text-xs {visibility === opt.value
									? segBtnActive
									: segBtnIdle}"
								aria-pressed={visibility === opt.value}
								onclick={() => {
									visibility = opt.value;
								}}
							>
								<span class="sm:hidden">{opt.short ?? opt.label}</span>
								<span class="hidden sm:inline">{opt.label}</span>
							</button>
						{/each}
					</div>
				</div>

				<div
					class="hidden h-5 w-px shrink-0 bg-zinc-800/90 sm:block"
					aria-hidden="true"
				></div>

				<div class="flex items-center gap-1.5">
					<label for="results-sort" class="shrink-0 text-[11px] font-medium text-zinc-500">Order</label>
					<select id="results-sort" class={selectClass} bind:value={sort}>
						<option value="latest">Latest</option>
						<option value="negative">Most negative</option>
						<option value="positive">Most positive</option>
						<option value="comments">Most comments</option>
					</select>
				</div>

				<div class="flex items-center gap-1.5">
					<label for="results-filter" class="shrink-0 text-[11px] font-medium text-zinc-500">View</label>
					<select id="results-filter" class={selectClass} bind:value={filter}>
						<option value="all">Everything</option>
						<option value="audience_negative">Mostly negative</option>
						<option value="audience_positive">Mostly positive</option>
						<option value="video">Videos</option>
						<option value="short">Shorts</option>
					</select>
				</div>
			</div>
		</header>

		<ResultsTable
			rows={displayRows}
			{isFilteredEmpty}
			filterEmptyHint={tableEmptyHint}
		/>
	{/if}
</div>
