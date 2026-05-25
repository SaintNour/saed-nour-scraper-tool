<script lang="ts">
	import StatCard from '$lib/components/ui/StatCard.svelte';
	import type { AnalysisResult } from '$lib/types/analysis';

	/** Snapshot metrics — maps cleanly from any platform’s normalized analysis payload. */
	let { data }: { data: AnalysisResult } = $props();

	function formatSentiment(s: AnalysisResult['overallSentiment']): string {
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	const topTheme = $derived(
		data.topPositiveMentions.find((t) => t.trim().length > 0)?.trim() ?? '—',
	);
</script>

<section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
	<StatCard
		label="Videos & posts"
		value={String(data.totalContentItems)}
		hint="In this search"
	/>
	<StatCard
		label="Comments reviewed"
		value={String(data.totalCommentsAnalyzed)}
		hint="Collected from these posts"
	/>
	<StatCard
		label="Overall tone"
		value={formatSentiment(data.overallSentiment)}
		hint="Across the sample"
		sentimentTone={data.overallSentiment}
	/>
	<StatCard
		label="Strongest positive signal"
		value={topTheme}
		hint="Recurring praise theme"
		clampLines={2}
	/>
</section>
