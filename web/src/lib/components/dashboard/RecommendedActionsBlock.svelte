<script lang="ts">
	let { actions }: { actions: string[] } = $props();

	const items = $derived(actions.filter(Boolean).slice(0, 8));
</script>

{#if items.length > 0}
	<div
		class="rounded-2xl border border-white/[0.06] bg-zinc-900/25 px-5 py-5 sm:px-6 sm:py-6"
	>
		<h3 class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
			Recommended actions
		</h3>
		<ol class="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-200/95 marker:text-emerald-500/80">
			{#each items as action, i (i)}
				<li>{action}</li>
			{/each}
		</ol>
	</div>
{/if}
