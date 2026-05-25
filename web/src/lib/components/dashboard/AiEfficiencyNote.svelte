<script lang="ts">
	/** Shown when the API returns comment filtering stats (model cost optimization). */
	let { stats }: { stats: { raw: number; sentToModel: number; droppedNoise: number } } = $props();
</script>

{#if stats.sentToModel > 0 && stats.raw > stats.sentToModel}
	<p class="text-[11px] leading-relaxed text-zinc-600">
		For this run, {stats.sentToModel} high-signal comments were analyzed by the model (of {stats.raw}
		collected; short or duplicate lines were skipped to save cost).
	</p>
{/if}
