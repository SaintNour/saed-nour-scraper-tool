<script lang="ts">
	let {
		title,
		headingId,
		themes,
		emptyLabel = 'Nothing to show yet.',
		variant = 'neutral',
	}: {
		title: string;
		/** Unique id for heading + `aria-labelledby` (required when multiple cards appear on one page). */
		headingId: string;
		themes: string[];
		emptyLabel?: string;
		variant?: 'complaints' | 'positive' | 'neutral';
	} = $props();

	const shell = $derived(
		variant === 'complaints'
			? 'border-rose-500/12 bg-rose-950/[0.1]'
			: variant === 'positive'
				? 'border-emerald-500/12 bg-emerald-950/[0.1]'
				: 'border-white/[0.06] bg-zinc-900/30',
	);

	const dot = $derived(
		variant === 'complaints'
			? 'bg-rose-400/70'
			: variant === 'positive'
				? 'bg-emerald-400/70'
				: 'bg-zinc-500',
	);
</script>

<section
	class="rounded-2xl border {shell} p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm sm:p-7"
	aria-labelledby={headingId}
>
	<h3
		id={headingId}
		class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"
	>
		{title}
	</h3>

	{#if themes.length === 0}
		<p class="mt-6 text-sm leading-relaxed text-zinc-600">{emptyLabel}</p>
	{:else}
		<ul class="mt-6 space-y-3.5" role="list">
			{#each themes as line, i (i)}
				<li class="flex gap-3 text-sm leading-relaxed text-zinc-300/95">
					<span
						class="mt-2 h-1 w-1 shrink-0 rounded-full {dot}"
						aria-hidden="true"
					></span>
					<span class="min-w-0">{line}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
