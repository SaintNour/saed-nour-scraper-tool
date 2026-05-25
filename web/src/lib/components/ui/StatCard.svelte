<script lang="ts">
	import type { OverallSentimentLabel } from '$lib/types/analysis';

	let {
		label,
		value,
		hint,
		clampLines = 0,
		sentimentTone,
	}: {
		label: string;
		value: string;
		hint?: string;
		clampLines?: 0 | 2;
		sentimentTone?: OverallSentimentLabel;
	} = $props();

	const valueTone = $derived(
		sentimentTone === 'positive'
			? 'text-emerald-200/95'
			: sentimentTone === 'negative'
				? 'text-rose-200/95'
				: sentimentTone === 'neutral'
					? 'text-zinc-200'
					: 'text-zinc-50',
	);

	const clampClass = $derived(clampLines === 2 ? 'line-clamp-2 break-words' : '');
</script>

<div
	class="group rounded-2xl border border-white/[0.05] bg-zinc-900/30 px-6 py-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm transition-colors duration-200 hover:border-zinc-700/60 hover:bg-zinc-900/40"
>
	<p class="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">{label}</p>
	<p
		class="mt-3 text-[1.65rem] font-semibold leading-none tracking-tight {valueTone} {clampClass}"
		title={clampLines ? value : undefined}
	>
		{value}
	</p>
	{#if hint}
		<p class="mt-3 text-xs leading-relaxed text-zinc-600">{hint}</p>
	{/if}
</div>
