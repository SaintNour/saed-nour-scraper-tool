<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import DashboardCommandBar from '$lib/components/dashboard/DashboardCommandBar.svelte';
	import InsightsOverlay from '$lib/components/dashboard/InsightsOverlay.svelte';
	import AlertsDrawer from '$lib/components/dashboard/AlertsDrawer.svelte';
	import AnalysisResultsBlock from '$lib/components/dashboard/AnalysisResultsBlock.svelte';
	import AiChatBubble from '$lib/components/dashboard/AiChatBubble.svelte';
	import { fetchReviewAnalysis, ReviewsApiError } from '$lib/services/api';
	import type { AnalysisResult, ScanMode } from '$lib/types/analysis';
	import type { DateRangePreset } from '$lib/types/dateRange';
	import { buildDateRangeQuery } from '$lib/utils/dateRange';
	import { dashboardPlatform } from '$lib/stores/dashboardPlatform';

	let query = $state('');
	let subKeywordsDraft = $state('');
	let subKeywords = $state<string[]>([]);
	let scanMode = $state<ScanMode>('all_relevant');
	let datePreset = $state<DateRangePreset>('all');
	let customDateStart = $state('');
	let customDateEnd = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);
	let result = $state<AnalysisResult | null>(null);
	let insightsOpen = $state(false);
	let alertsOpen = $state(false);
	/** Dev-only: pass refresh=true to API to skip TTL cache. */
	let devBypassCache = $state(false);

	function dedupeSubs(list: string[]): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const x of list) {
			const t = x.trim().slice(0, 200);
			if (!t) continue;
			const k = t.toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			out.push(t);
		}
		return out;
	}

	function cacheFootnote(src: string | undefined): string {
		if (src === 'cached_openai') {
			return 'Cached OpenAI result for this search (faster repeat lookups).';
		}
		if (src === 'cached_heuristic') {
			return 'Cached heuristic result for this search (faster repeat lookups). Run a fresh analysis if you expected live OpenAI.';
		}
		return 'Recent cached result for this search (faster repeat lookups).';
	}

	function parseSubKeywordsParams(params: URLSearchParams): string[] {
		const multi = params.getAll('subKeywords');
		if (multi.length > 0) return multi.map((s) => s.trim()).filter(Boolean);
		const one = params.get('subKeywords');
		if (one && one.trim()) return one.split(',').map((s) => s.trim()).filter(Boolean);
		return [];
	}

	function syncUrlFromSearch() {
		const u = new URL(window.location.href);
		const q = query.trim();
		if (q) u.searchParams.set('query', q);
		u.searchParams.set('platform', get(dashboardPlatform));
		u.searchParams.set('scanMode', scanMode);
		u.searchParams.delete('subKeywords');
		for (const s of subKeywords) {
			const t = s.trim();
			if (t) u.searchParams.append('subKeywords', t);
		}
		window.history.replaceState({}, '', u);
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const q = params.get('query');
		const p = params.get('platform');
		const sm = params.get('scanMode');
		if (q && q.trim()) query = q.trim();
		subKeywords = parseSubKeywordsParams(params);
		if (p === 'youtube' || p === 'tiktok' || p === 'instagram' || p === 'facebook') {
			dashboardPlatform.set(p);
		}
		if (sm === 'all_relevant' || sm === 'recent_first' || sm === 'trend_catcher') {
			scanMode = sm;
		}
		if (subKeywords.length) {
			subKeywordsDraft = subKeywords.join(', ');
		}
	});

	async function runAnalyze() {
		const q = query.trim();
		if (!q) return;

		subKeywords = dedupeSubs(subKeywordsDraft.split(/[,]/).map((s) => s.trim()).filter(Boolean));

		error = null;
		result = null;
		insightsOpen = false;
		alertsOpen = false;
		loading = true;

		try {
			const dateRange = buildDateRangeQuery(datePreset, customDateStart, customDateEnd);
			result = await fetchReviewAnalysis(q, get(dashboardPlatform), {
				subKeywords,
				dateRange,
				scanMode,
				refresh: import.meta.env.DEV && devBypassCache,
			});
			syncUrlFromSearch();
		} catch (e) {
			result = null;
			if (e instanceof ReviewsApiError) {
				error = e.message;
			} else if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'Something went wrong';
			}
		} finally {
			loading = false;
		}
	}

	const alertCount = $derived(result?.alerts?.length ?? 0);
</script>

<div class="min-h-screen">
	<DashboardCommandBar
		bind:query
		bind:subKeywordsDraft
		bind:scanMode
		bind:datePreset
		bind:customDateStart
		bind:customDateEnd
		{loading}
		showInsights={!!result}
		showAlerts={!!result}
		{alertCount}
		onAnalyze={runAnalyze}
		onOpenInsights={() => {
			insightsOpen = true;
		}}
		onOpenAlerts={() => {
			alertsOpen = true;
		}}
		error={error}
	/>

	<main class="mx-auto max-w-[1600px] px-4 pb-28 pt-4 sm:px-6 lg:px-8">
		{#if import.meta.env.DEV}
			<label
				class="mb-3 flex max-w-md cursor-pointer items-center gap-2 text-[11px] text-zinc-500"
			>
				<input
					type="checkbox"
					bind:checked={devBypassCache}
					class="rounded border-zinc-700 bg-zinc-900 text-sky-500 focus:ring-sky-500/30"
				/>
				<span>Fresh run (skip server cache) — dev only</span>
			</label>
		{/if}
		{#if result}
			<div
				class="mb-4 flex flex-col gap-3 border-b border-white/[0.06] pb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
			>
				<div class="min-w-0 max-w-full flex-1">
					<p
						class="flex min-w-0 items-center gap-x-2 overflow-x-auto text-[11px] leading-none text-zinc-500 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						aria-label="Results summary"
					>
						<span class="shrink-0 whitespace-nowrap font-medium text-zinc-200">
							{#if result.scanMode === 'trend_catcher'}
								Trend Catcher
							{:else}
								Results
							{/if}
						</span>
						{#if result.cached}
							<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
							<span
								class="shrink-0 whitespace-nowrap rounded border border-zinc-700/80 bg-zinc-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
							>
								Cached
							</span>
						{/if}
						{#if result.scanMode === 'trend_catcher' && (result.displayedCount ?? 0) === 0 && (result.totalMatchingCount ?? 0) > 0}
							<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
							<span class="shrink-0 whitespace-nowrap text-amber-200/85">
								No rows ≥ threshold · {result.totalMatchingCount} matches
							</span>
						{:else}
							<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
							<span class="shrink-0 whitespace-nowrap">
								<span class="font-medium tabular-nums text-zinc-300">{result.displayedCount ?? result.contentItems.length}</span>
								<span class="text-zinc-600"> results</span>
							</span>
							<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
							<span class="shrink-0 whitespace-nowrap">
								<span class="font-medium tabular-nums text-zinc-300">{result.totalMatchingCount ?? result.contentItems.length}</span>
								<span class="text-zinc-600"> matches</span>
							</span>
							{#if result.scanMode === 'trend_catcher'}
								<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
								<span class="shrink-0 whitespace-nowrap">
									<span class="font-medium tabular-nums text-sky-300/90">{result.totalAfterModeFilter ?? 0}</span>
									<span class="text-zinc-600"> trending</span>
								</span>
							{/if}
							{#if result.countBreakdown?.maxSearchCandidates}
								<span class="shrink-0 text-zinc-700" aria-hidden="true">•</span>
								<span class="shrink-0 whitespace-nowrap text-zinc-600">
									cap {result.countBreakdown.maxSearchCandidates}/scan
								</span>
							{/if}
						{/if}
					</p>
					{#if result.cached}
						<p class="mt-1.5 text-[10px] leading-snug text-zinc-600">{cacheFootnote(result.analysisSource)}</p>
					{/if}
				</div>
				<div class="flex shrink-0 flex-wrap gap-2 sm:hidden">
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs font-semibold text-amber-100"
						onclick={() => {
							alertsOpen = true;
						}}
					>
						Alerts
						{#if alertCount > 0}
							<span class="rounded-md bg-amber-500/20 px-1.5 text-[10px] font-bold">{alertCount}</span>
						{/if}
					</button>
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100"
						onclick={() => {
							insightsOpen = true;
						}}
					>
						Insights
					</button>
				</div>
			</div>

			<AnalysisResultsBlock data={result} />
		{:else if loading}
			<div
				class="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-[#121820]/30 px-8 py-16 text-center"
				role="status"
				aria-live="polite"
				aria-busy={true}
			>
				<span
					class="mb-5 inline-block h-10 w-10 animate-spin rounded-full border-2 border-zinc-800 border-t-sky-500/90"
					aria-hidden="true"
				></span>
				<p class="text-sm font-medium text-zinc-300">Analyzing…</p>
				<p class="mt-2 max-w-xs text-xs leading-relaxed text-zinc-600">
					Reading comments and scoring signals.
				</p>
			</div>
		{:else}
			<div
				class="rounded-2xl border border-dashed border-white/[0.08] bg-[#121820]/25 px-8 py-20 text-center"
			>
				<p class="mx-auto max-w-md text-sm leading-relaxed text-zinc-500">
					Enter a keyword and run analysis to populate the dashboard.
				</p>
			</div>
		{/if}
	</main>
</div>

<InsightsOverlay open={insightsOpen} data={result} onClose={() => (insightsOpen = false)} />

<AlertsDrawer
	open={alertsOpen}
	alerts={result?.alerts ?? []}
	onClose={() => (alertsOpen = false)}
/>

<AiChatBubble
	result={result}
	query={query}
	subKeywords={subKeywords}
	platform={$dashboardPlatform}
/>
