<script lang="ts">
	import type { SavedSearchResult, SearchHistoryEntry } from '$lib/types/searchHistory';
	import { getPlatformLabel } from '$lib/types/platform';

	let {
		open,
		loading = false,
		error = null,
		item = null,
		results = [],
		onClose,
	}: {
		open: boolean;
		loading?: boolean;
		error?: string | null;
		item?: SearchHistoryEntry | null;
		results?: SavedSearchResult[];
		onClose: () => void;
	} = $props();

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

	function clsBadge(c: string): string {
		if (c === 'new') return 'bg-emerald-500/12 text-emerald-100 ring-emerald-500/25';
		if (c === 'updated') return 'bg-sky-500/12 text-sky-100 ring-sky-500/25';
		return 'bg-zinc-600/20 text-zinc-300 ring-zinc-500/30';
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="history-detail-title"
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
	>
		<div
			class="max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl"
		>
			<div
				class="sticky top-0 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-5 py-4 backdrop-blur-sm"
			>
				<h2 id="history-detail-title" class="text-lg font-semibold text-zinc-50">Search details</h2>
				<button
					type="button"
					class="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
					onclick={onClose}
				>
					Close
				</button>
			</div>

			<div class="px-5 py-5">
				{#if loading}
					<p class="text-sm text-zinc-500">Loading…</p>
				{:else if error}
					<p class="text-sm text-rose-300">{error}</p>
				{:else if item}
					<div class="space-y-4 text-sm">
						<div>
							<p class="text-xs uppercase tracking-wide text-zinc-600">Search</p>
							<p class="mt-1 font-medium text-zinc-100">
								“{item.displayQuery ?? item.keyword}”
							</p>
							{#if item.subKeywords && item.subKeywords.length > 0}
								<p class="mt-2 text-xs text-zinc-500">
									Main: <span class="text-zinc-400">{item.mainKeyword ?? item.keyword}</span>
									· Subs:
									<span class="text-zinc-400">{item.subKeywords.join(', ')}</span>
								</p>
							{/if}
						</div>
						<div class="flex flex-wrap gap-3 text-xs text-zinc-500">
							<span>{getPlatformLabel(item.platform)}</span>
							<span>·</span>
							<span>{formatWhen(item.createdAt)}</span>
							{#if item.cached}
								<span class="rounded bg-zinc-800/80 px-1.5 py-0.5 text-zinc-400">Cached replay</span>
							{/if}
							{#if item.analysisSource}
								<span
									class="rounded bg-zinc-800/80 px-1.5 py-0.5 text-zinc-400"
									title="How this snapshot was produced"
								>
									{item.analysisSource}
								</span>
							{/if}
						</div>
						{#if item.staleHeuristicNote}
							<p
								class="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-100/95"
								role="note"
							>
								{item.staleHeuristicNote}
							</p>
						{/if}
						{#if item.summary}
							<div>
								<p class="text-xs uppercase tracking-wide text-zinc-600">Summary</p>
								<p class="mt-1 leading-relaxed text-zinc-300">{item.summary}</p>
							</div>
						{/if}
						{#if item.sentiment}
							<p class="text-xs text-zinc-500">
								Overall sentiment: <span class="text-zinc-300">{sentimentLabel(item.sentiment)}</span>
							</p>
						{/if}
						<div>
							<p class="text-xs uppercase tracking-wide text-zinc-600">Saved snapshot</p>
							<ul class="mt-2 space-y-2">
								{#each item.normalizedResults ?? [] as row (row.id)}
									<li class="rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-xs">
										<div class="flex flex-wrap items-center gap-2">
											<span class="font-medium text-zinc-200">{row.title}</span>
											{#if row.result_classification}
												<span
													class="rounded px-1.5 py-0.5 text-[10px] uppercase ring-1 ring-inset {clsBadge(
														row.result_classification,
													)}"
												>
													{row.result_classification}
												</span>
											{/if}
										</div>
										{#if row.url}
											<a
												href={row.url}
												target="_blank"
												rel="noopener noreferrer"
												class="mt-1 block truncate text-emerald-400/90 hover:underline"
											>
												{row.url}
											</a>
										{/if}
										{#if row.matched_sub_keywords && row.matched_sub_keywords.length > 0}
											<p class="mt-1.5 text-[11px] text-zinc-600">
												Matched subs: {row.matched_sub_keywords.join(', ')}
											</p>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
						{#if results.length > 0}
							<div>
								<p class="text-xs uppercase tracking-wide text-zinc-600">Persisted result rows</p>
								<ul class="mt-2 space-y-1.5 text-xs text-zinc-500">
									{#each results as r (r.id)}
										<li>
											Seen {r.seenCount}× · last {formatWhen(r.lastSeenAt)}
											{#if r.videoId}
												· ID {r.videoId}
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
