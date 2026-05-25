<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchHistoryGroups,
		clearAllSearchHistory,
		clearHeuristicSearchHistory,
		ReviewsApiError,
	} from '$lib/services/api';
	import type { KeywordHistoryGroup } from '$lib/types/searchHistory';
	import { getPlatformLabel } from '$lib/types/platform';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let groups = $state<KeywordHistoryGroup[]>([]);

	let clearBusy = $state(false);
	let heuristicClearBusy = $state(false);

	async function load() {
		loading = true;
		error = null;
		try {
			groups = await fetchHistoryGroups();
		} catch (e) {
			if (e instanceof ReviewsApiError) {
				error = e.message;
			} else if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'Unable to load history.';
			}
			console.error('[history page] load failed', e);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load();
	});

	function formatWhen(value: string): string {
		if (!value) return '—';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleString([], {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}

	function sentimentLabel(s: string | null | undefined): string {
		if (!s) return '—';
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	function keywordHref(g: KeywordHistoryGroup): string {
		return `/history/${encodeURIComponent(g.groupKey)}`;
	}

	async function clearAll(ev: MouseEvent) {
		ev.preventDefault();
		if (!confirm('Clear all search history? This cannot be undone.')) return;
		clearBusy = true;
		try {
			await clearAllSearchHistory();
			await load();
		} catch (e) {
			alert(e instanceof ReviewsApiError ? e.message : 'Could not clear');
			console.error('[history clear]', e);
		} finally {
			clearBusy = false;
		}
	}

	async function clearHeuristicOnly(ev: MouseEvent) {
		ev.preventDefault();
		if (
			!confirm(
				'Remove only heuristic / legacy mock history rows? OpenAI-backed entries stay. This cannot be undone.',
			)
		) {
			return;
		}
		heuristicClearBusy = true;
		try {
			const { removedCount } = await clearHeuristicSearchHistory();
			await load();
			if (removedCount === 0) {
				alert('No heuristic history rows matched (nothing removed).');
			}
		} catch (e) {
			alert(e instanceof ReviewsApiError ? e.message : 'Could not clear heuristic history');
			console.error('[history clear heuristic]', e);
		} finally {
			heuristicClearBusy = false;
		}
	}
</script>

<main class="mx-auto max-w-6xl px-5 pb-28 pt-16 sm:px-8 lg:px-10 lg:pt-20">
	<header class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Search history</h1>
			<p class="mt-2 text-sm text-zinc-500">
				Grouped by main keyword — open a group to see every saved run (new vs seen labels still apply).
			</p>
		</div>
		{#if groups.length > 0}
			<div class="flex flex-wrap gap-2 self-start">
				<button
					type="button"
					disabled={heuristicClearBusy || clearBusy}
					onclick={clearHeuristicOnly}
					class="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-amber-500/30 hover:text-amber-100 disabled:opacity-50"
				>
					{heuristicClearBusy ? 'Clearing…' : 'Clear heuristic only'}
				</button>
				<button
					type="button"
					disabled={clearBusy || heuristicClearBusy}
					onclick={clearAll}
					class="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-rose-500/30 hover:text-rose-200 disabled:opacity-50"
				>
					{clearBusy ? 'Clearing…' : 'Clear all'}
				</button>
			</div>
		{/if}
	</header>

	{#if loading}
		<div
			class="rounded-2xl border border-zinc-800/50 bg-zinc-900/20 px-6 py-10 text-sm text-zinc-500"
			role="status"
			aria-busy="true"
		>
			Loading history…
		</div>
	{:else if error}
		<div
			class="rounded-xl border border-rose-500/20 bg-rose-950/15 px-4 py-3.5 text-sm leading-snug text-rose-100/95"
			role="alert"
		>
			{error}
		</div>
	{:else if groups.length === 0}
		<div
			class="rounded-2xl border border-dashed border-zinc-800/60 bg-zinc-900/[0.15] px-8 py-20 text-center"
		>
			<p class="text-sm text-zinc-500">No searches logged yet. Run a search on the home page.</p>
		</div>
	{:else}
		<ul class="space-y-3" role="list">
			{#each groups as g (g.groupKey)}
				<li>
					<a
						href={keywordHref(g)}
						class="group block w-full rounded-2xl border border-zinc-800/60 bg-zinc-950/30 px-5 py-4 text-left transition-colors hover:border-emerald-500/25 hover:bg-zinc-900/40"
					>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-medium text-zinc-100">“{g.displayLabel}”</p>
								<p class="mt-1 text-xs text-zinc-500">
									{getPlatformLabel(g.platform)} · {g.runCount}
									{g.runCount === 1 ? 'run' : 'runs'} · Last {formatWhen(g.latestRunAt)}
								</p>
								{#if g.latestSummarySnippet}
									<p class="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
										{g.latestSummarySnippet}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-2 text-right">
								{#if g.latestSentiment}
									<span class="text-[11px] text-zinc-500"
										>Latest: {sentimentLabel(g.latestSentiment)}</span
									>
								{/if}
								{#if g.latestAnalysisSource}
									<span
										class="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400 ring-1 ring-zinc-700/50"
										title="Source of the latest run"
									>
										{g.latestAnalysisSource}
									</span>
								{/if}
								<span
									class="text-[11px] font-medium text-emerald-400/90 opacity-0 transition-opacity group-hover:opacity-100"
									aria-hidden="true"
								>
									View runs →
								</span>
							</div>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
