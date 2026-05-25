<script lang="ts">
	import type { OverallSentimentLabel } from '$lib/types/analysis';

	let {
		contentFormat = 'unknown',
		contentSentimentLabel,
		size = 'sm',
		showFormat = true,
		showSentiment = true,
	}: {
		contentFormat?: 'video' | 'short' | 'unknown';
		contentSentimentLabel?: OverallSentimentLabel;
		size?: 'xs' | 'sm';
		showFormat?: boolean;
		showSentiment?: boolean;
	} = $props();

	function formatLabel(format: 'video' | 'short' | 'unknown'): string {
		if (format === 'short') return 'Short';
		if (format === 'video') return 'Video';
		return 'Unknown';
	}

	function formatBadgeClass(format: 'video' | 'short' | 'unknown'): string {
		if (format === 'short') return 'bg-violet-500/12 text-violet-200 ring-violet-500/25';
		if (format === 'video') return 'bg-sky-500/12 text-sky-200 ring-sky-500/25';
		return 'bg-zinc-600/30 text-zinc-400 ring-zinc-500/30';
	}

	function sentimentLabel(label?: OverallSentimentLabel): string {
		if (label === 'positive') return 'Positive';
		if (label === 'negative') return 'Negative';
		if (label === 'neutral') return 'Neutral';
		return 'Unknown';
	}

	function sentimentClass(label?: OverallSentimentLabel): string {
		if (label === 'positive') return 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/20';
		if (label === 'negative') return 'bg-rose-500/12 text-rose-200 ring-rose-500/25';
		if (label === 'neutral') return 'bg-zinc-600/30 text-zinc-300 ring-zinc-500/35';
		return 'bg-zinc-700/25 text-zinc-400 ring-zinc-500/30';
	}

	const pad = $derived(size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs');
</script>

<div class="flex flex-wrap items-center gap-1.5">
	{#if showFormat}
		<span
			class="inline-flex rounded-lg font-medium ring-1 ring-inset {pad} {formatBadgeClass(contentFormat)}"
		>
			{formatLabel(contentFormat)}
		</span>
	{/if}
	{#if showSentiment}
		<span
			class="inline-flex rounded-lg font-medium ring-1 ring-inset {pad} {sentimentClass(
				contentSentimentLabel,
			)}"
		>
			{sentimentLabel(contentSentimentLabel)}
		</span>
	{/if}
</div>
