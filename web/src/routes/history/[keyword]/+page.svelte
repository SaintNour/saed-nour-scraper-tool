<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		fetchHistoryGroupDetail,
		fetchSearchHistoryDetail,
		deleteSearchHistoryEntry,
		deleteHistoryGroup,
		ReviewsApiError,
	} from '$lib/services/api';
	import type { SavedSearchResult, SearchHistoryEntry } from '$lib/types/searchHistory';
	import { getPlatformLabel } from '$lib/types/platform';
	import HistoryRunDetailModal from '$lib/components/history/HistoryRunDetailModal.svelte';

	let loading = $state(true);
	let error = $state<string | null>(null);
	let displayLabel = $state('');
	let runs = $state<SearchHistoryEntry[]>([]);
	/** Normalized key from API (lowercase) for deletes */
	let resolvedGroupKey = $state('');

	let detailOpen = $state(false);
	let detailLoading = $state(false);
	let detailError = $state<string | null>(null);
	let detailItem = $state<SearchHistoryEntry | null>(null);
	let detailResults = $state<SavedSearchResult[]>([]);

	let deleteBusy = $state<string | null>(null);
	let deleteGroupBusy = $state(false);

	async function loadGroupFor(raw: string) {
		if (!raw) {
			error = 'Missing keyword';
			loading = false;
			return;
		}
		loading = true;
		error = null;
		try {
			const data = await fetchHistoryGroupDetail(raw);
			runs = data.runs;
			displayLabel = data.displayLabel;
			resolvedGroupKey = data.groupKey;
		} catch (e) {
			if (e instanceof ReviewsApiError) {
				error = e.message;
			} else if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'Unable to load keyword history.';
			}
			runs = [];
			console.error('[history keyword]', e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const k = page.params.keyword;
		if (k === undefined || k === '') {
			error = 'Missing keyword';
			loading = false;
			return;
		}
		void loadGroupFor(k);
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

	function badgeClass(status: string): string {
		if (status === 'partial') return 'bg-amber-500/15 text-amber-100 ring-amber-500/25';
		if (status === 'failed') return 'bg-rose-500/15 text-rose-100 ring-rose-500/25';
		return 'bg-zinc-600/20 text-zinc-300 ring-zinc-500/30';
	}

	async function openDetail(id: string) {
		detailOpen = true;
		detailLoading = true;
		detailError = null;
		detailItem = null;
		detailResults = [];
		try {
			const { item, results } = await fetchSearchHistoryDetail(id);
			detailItem = item;
			detailResults = results;
		} catch (e) {
			detailError =
				e instanceof ReviewsApiError ? e.message : e instanceof Error ? e.message : 'Load failed';
			console.error('[history detail]', e);
		} finally {
			detailLoading = false;
		}
	}

	function closeDetail() {
		detailOpen = false;
	}

	async function removeRun(id: string, ev: MouseEvent) {
		ev.stopPropagation();
		if (!confirm('Remove this run from your log?')) return;
		deleteBusy = id;
		try {
			await deleteSearchHistoryEntry(id);
			if (detailItem?.id === id) closeDetail();
			await loadGroupFor(page.params.keyword ?? '');
			if (runs.length === 0) {
				goto('/history');
			}
		} catch (e) {
			alert(e instanceof ReviewsApiError ? e.message : 'Could not delete');
			console.error('[history delete]', e);
		} finally {
			deleteBusy = null;
		}
	}

	async function removeAllForKeyword() {
		if (!resolvedGroupKey) return;
		if (
			!confirm(
				`Delete all ${runs.length} saved run(s) for “${displayLabel}”? This cannot be undone.`,
			)
		) {
			return;
		}
		deleteGroupBusy = true;
		try {
			await deleteHistoryGroup(resolvedGroupKey);
			goto('/history');
		} catch (e) {
			alert(e instanceof ReviewsApiError ? e.message : 'Could not delete group');
			console.error('[history delete group]', e);
		} finally {
			deleteGroupBusy = false;
		}
	}
</script>

<main class="mx-auto max-w-6xl px-5 pb-28 pt-16 sm:px-8 lg:px-10 lg:pt-20">
	<nav class="mb-6 text-sm">
		<a
			href="/history"
			class="font-medium text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-300"
		>
			← Search history
		</a>
	</nav>

	<header class="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
				{#if displayLabel}
					“{displayLabel}”
				{:else}
					Keyword history
				{/if}
			</h1>
			<p class="mt-2 text-sm text-zinc-500">
				All saved runs for this main keyword, newest first. Same persistence as dashboard “new / seen /
				updated” labels.
			</p>
		</div>
		{#if runs.length > 0 && resolvedGroupKey}
			<button
				type="button"
				disabled={deleteGroupBusy}
				onclick={removeAllForKeyword}
				class="self-start rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-rose-500/30 hover:text-rose-200 disabled:opacity-50"
			>
				{deleteGroupBusy ? 'Deleting…' : 'Delete all for keyword'}
			</button>
		{/if}
	</header>

	{#if loading}
		<div
			class="rounded-2xl border border-zinc-800/50 bg-zinc-900/20 px-6 py-10 text-sm text-zinc-500"
			role="status"
			aria-busy="true"
		>
			Loading runs…
		</div>
	{:else if error}
		<div
			class="rounded-xl border border-rose-500/20 bg-rose-950/15 px-4 py-3.5 text-sm leading-snug text-rose-100/95"
			role="alert"
		>
			{error}
		</div>
	{:else if runs.length === 0}
		<div
			class="rounded-2xl border border-dashed border-zinc-800/60 bg-zinc-900/[0.15] px-8 py-16 text-center"
		>
			<p class="text-sm text-zinc-500">No runs found for this keyword.</p>
			<a href="/history" class="mt-4 inline-block text-sm font-medium text-emerald-400/90 hover:underline"
				>Back to history</a
			>
		</div>
	{:else}
		<ul class="space-y-3" role="list">
			{#each runs as entry (entry.id)}
				<li>
					<div
						role="button"
						tabindex="0"
						class="group w-full cursor-pointer rounded-2xl border border-zinc-800/60 bg-zinc-950/30 px-5 py-4 text-left transition-colors hover:border-zinc-700/80 hover:bg-zinc-900/40"
						onclick={() => openDetail(entry.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openDetail(entry.id);
							}
						}}
					>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="font-medium text-zinc-100">
									“{entry.displayQuery ?? entry.keyword}”
								</p>
								<p class="mt-1 text-xs text-zinc-500">
									{getPlatformLabel(entry.platform)} · {formatWhen(entry.createdAt)} ·
									{entry.resultCount}
									{entry.resultCount === 1 ? 'result' : 'results'}
									{#if entry.durationMs != null}
										· {entry.durationMs}ms
									{/if}
								</p>
								{#if entry.staleHeuristicNote}
									<p
										class="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs leading-snug text-amber-100/95"
										role="note"
									>
										{entry.staleHeuristicNote}
									</p>
								{/if}
								{#if entry.summary}
									<p class="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
										{entry.summary}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 flex-col items-end gap-2">
								<span
									class="inline-flex rounded-lg px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset {badgeClass(
										entry.status,
									)}"
								>
									{entry.status}
								</span>
								{#if entry.sentiment}
									<span class="text-[11px] text-zinc-500"
										>Overall: {sentimentLabel(entry.sentiment)}</span
									>
								{/if}
								{#if entry.analysisSource}
									<span
										class="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400 ring-1 ring-zinc-700/50"
									>
										{entry.analysisSource}
									</span>
								{/if}
								<button
									type="button"
									class="text-[11px] text-zinc-600 underline-offset-2 hover:text-rose-300 hover:underline"
									onclick={(e) => removeRun(entry.id, e)}
									disabled={deleteBusy === entry.id}
								>
									{deleteBusy === entry.id ? 'Removing…' : 'Remove'}
								</button>
							</div>
						</div>
						{#if entry.topResultTitle}
							<p class="mt-3 border-t border-zinc-800/40 pt-3 text-xs text-zinc-600">
								Top result: <span class="text-zinc-400">{entry.topResultTitle}</span>
							</p>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<HistoryRunDetailModal
	open={detailOpen}
	loading={detailLoading}
	error={detailError}
	item={detailItem}
	results={detailResults}
	onClose={closeDetail}
/>
