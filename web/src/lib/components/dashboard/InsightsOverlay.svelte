<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import StatCard from '$lib/components/ui/StatCard.svelte';
	import SummaryCard from '$lib/components/dashboard/SummaryCard.svelte';
	import SentimentBars from '$lib/components/charts/SentimentBars.svelte';
	import InsightExplanationBlock from '$lib/components/dashboard/InsightExplanationBlock.svelte';
	import type { AnalysisResult } from '$lib/types/analysis';

	let {
		open = false,
		data = null,
		onClose,
	}: {
		open?: boolean;
		data: AnalysisResult | null;
		onClose: () => void;
	} = $props();

	function formatSentiment(s: AnalysisResult['overallSentiment']): string {
		return s.charAt(0).toUpperCase() + s.slice(1);
	}

	const topTheme = $derived(
		data?.topPositiveMentions.find((t) => t.trim().length > 0)?.trim() ?? '—',
	);

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open && data}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[200] flex items-stretch justify-center bg-black/70 p-0 sm:p-6"
		role="presentation"
		transition:fade={{ duration: 180 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
	>
		<div
			class="flex h-full w-full max-h-[100dvh] max-w-5xl flex-col overflow-hidden rounded-none border border-white/[0.08] bg-[#0f141c] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.75)] sm:my-auto sm:max-h-[92vh] sm:rounded-2xl"
			transition:fly={{ y: 10, duration: 220, easing: cubicOut }}
			role="dialog"
			aria-modal="true"
			aria-labelledby="insights-overlay-title"
		>
			<header
				class="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#121820]/95 px-4 py-4 sm:px-6"
			>
				<div class="min-w-0">
					<h2 id="insights-overlay-title" class="text-lg font-semibold tracking-tight text-zinc-50">
						Insights
					</h2>
					<p class="mt-0.5 truncate text-xs text-zinc-500">
						{data.displayQuery?.trim() || data.query}
					</p>
				</div>
				<button
					type="button"
					class="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
					onclick={onClose}
				>
					Close
				</button>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
				<section class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
					<div class="animate-in" style="animation: fadeSlide 0.35s ease-out 0.02s both;">
						<StatCard label="Videos & posts" value={String(data.totalContentItems)} hint="In this search" />
					</div>
					<div class="animate-in" style="animation: fadeSlide 0.35s ease-out 0.06s both;">
						<StatCard
							label="Comments reviewed"
							value={String(data.totalCommentsAnalyzed)}
							hint="Collected from these posts"
						/>
					</div>
					<div class="animate-in" style="animation: fadeSlide 0.35s ease-out 0.1s both;">
						<StatCard
							label="Overall tone"
							value={formatSentiment(data.overallSentiment)}
							hint="Across the sample"
							sentimentTone={data.overallSentiment}
						/>
					</div>
					<div class="animate-in" style="animation: fadeSlide 0.35s ease-out 0.14s both;">
						<StatCard
							label="Strongest positive signal"
							value={topTheme}
							hint="Recurring praise theme"
							clampLines={2}
						/>
					</div>
				</section>

				<div class="mt-10 grid gap-8 lg:grid-cols-2 lg:gap-10">
					<div>
						<SummaryCard summary={data.summary} title="Overview" />
					</div>
					<div class="lg:pt-1">
						<SentimentBars sentiment={data.sentiment} />
					</div>
				</div>

				<div class="mt-10">
					<InsightExplanationBlock
						drivers={data.insightDrivers}
						topComplaints={data.topComplaints}
						topPositiveMentions={data.topPositiveMentions}
					/>
				</div>

				<section class="mt-10 rounded-2xl border border-white/[0.06] bg-[#121820]/50 p-6">
					<h3 class="text-base font-semibold text-zinc-100">❓ What should I do?</h3>
					<ol class="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-zinc-300">
						{#each data.recommendedActions as action, i (i)}
							<li>{action}</li>
						{:else}
							<li class="text-zinc-500">No actions suggested for this run.</li>
						{/each}
					</ol>
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes fadeSlide {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
