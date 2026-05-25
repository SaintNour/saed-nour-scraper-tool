<script lang="ts">
	import type { AnalysisHistoryItem } from '$lib/types/analysis';
	import { getPlatformLabel } from '$lib/types/platform';
	import ContentMetaBadges from '$lib/components/ui/ContentMetaBadges.svelte';

	let {
		items,
		emptyLabel = 'Run an analysis to build history.',
	}: {
		items: AnalysisHistoryItem[];
		emptyLabel?: string;
	} = $props();

	function formatWhen(value: string): string {
		if (!value) return 'Just now';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return 'Just now';
		return d.toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}

</script>

<aside
	class="rounded-2xl border border-white/[0.06] bg-zinc-900/30 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm sm:p-6"
	aria-labelledby="analysis-history-title"
>
	<div class="mb-4 border-b border-zinc-800/50 pb-4">
		<h3
			id="analysis-history-title"
			class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"
		>
			Analysis history
		</h3>
	</div>

	{#if items.length === 0}
		<p class="text-sm leading-relaxed text-zinc-600">{emptyLabel}</p>
	{:else}
		<ul class="space-y-3.5" role="list">
			{#each items as item (item.id)}
				<li class="rounded-xl border border-zinc-800/60 bg-zinc-950/35 p-3.5">
					{#if item.url}
						<a
							href={item.url}
							target="_blank"
							rel="noopener noreferrer"
							class="line-clamp-2 text-sm font-medium leading-snug text-zinc-100 underline decoration-zinc-600/45 underline-offset-2 transition-colors hover:text-emerald-200 hover:decoration-emerald-500/35"
						>
							{item.title}
						</a>
					{:else}
						<p class="line-clamp-2 text-sm font-medium leading-snug text-zinc-100">{item.title}</p>
					{/if}
					<div class="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
						<span>{getPlatformLabel(item.platform)}</span>
						<span aria-hidden="true">•</span>
						<span>{formatWhen(item.analyzedAt)}</span>
					</div>
					<div class="mt-2">
						<ContentMetaBadges
							contentFormat={item.contentFormat}
							contentSentimentLabel={item.contentSentimentLabel}
							size="xs"
						/>
					</div>
					{#if item.query}
						<div class="mt-2">
							<a
								href={`/?query=${encodeURIComponent(item.query)}&platform=${encodeURIComponent(item.platform)}`}
								class="text-[11px] font-medium text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-300"
							>
								Open in dashboard
							</a>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</aside>
