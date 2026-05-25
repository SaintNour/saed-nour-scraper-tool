<script lang="ts">
	let {
		summary,
		title = 'Summary',
	}: {
		summary: string;
		title?: string;
	} = $props();
</script>

<article
	class="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/45 to-zinc-950/50 p-6 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] backdrop-blur-sm sm:p-8"
	aria-labelledby="summary-card-title"
>
	<div
		class="pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-emerald-500/45 via-emerald-500/20 to-transparent sm:w-[3px] sm:rounded-l-sm"
		aria-hidden="true"
	></div>
	<div class="pl-4 sm:pl-6">
		<h3
			id="summary-card-title"
			class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"
		>
			{title}
		</h3>
		<p class="mt-5 text-[15px] leading-[1.7] text-zinc-300/95 sm:text-base">
			{summary}
		</p>
	</div>
</article>
