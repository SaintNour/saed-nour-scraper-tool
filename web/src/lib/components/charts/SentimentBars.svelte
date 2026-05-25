<script lang="ts">
	import type { SentimentBreakdown } from '$lib/types/analysis';
	import { formatPercent } from '$lib/utils/format';

	let { sentiment }: { sentiment: SentimentBreakdown } = $props();

	const rows = [
		{ key: 'positive' as const, label: 'Positive', class: 'bg-emerald-500' },
		{ key: 'neutral' as const, label: 'Neutral', class: 'bg-zinc-500' },
		{ key: 'negative' as const, label: 'Negative', class: 'bg-rose-500' },
	];
</script>

<div
	class="rounded-2xl border border-white/[0.06] bg-zinc-900/30 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm sm:p-7"
>
	<div class="flex items-start justify-between gap-3">
		<h3 class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
			Sentiment breakdown
		</h3>
		<span class="pt-0.5 text-[10px] text-zinc-600/90">Estimated</span>
	</div>
	<div class="mt-6 space-y-4">
		{#each rows as row (row.key)}
			<div>
				<div class="mb-1.5 flex justify-between text-xs text-zinc-500">
					<span>{row.label}</span>
					<span class="tabular-nums text-zinc-400">{formatPercent(sentiment[row.key])}</span>
				</div>
				<div class="h-1.5 overflow-hidden rounded-full bg-zinc-800/90">
					<div
						class="h-full rounded-full transition-all {row.class}"
						style="width: {Math.min(100, Math.max(0, sentiment[row.key]))}%"
					></div>
				</div>
			</div>
		{/each}
	</div>
</div>
