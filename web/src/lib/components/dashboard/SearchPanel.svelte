<script lang="ts">
	let {
		query = $bindable(''),
		disabled = false,
		loading = false,
		onAnalyze,
	}: {
		query?: string;
		disabled?: boolean;
		loading?: boolean;
		onAnalyze: () => void;
	} = $props();

	function submit(e: Event) {
		e.preventDefault();
		onAnalyze();
	}
</script>

<form class="flex flex-col gap-3 sm:flex-row sm:items-end" onsubmit={submit}>
	<div class="min-w-0 flex-1">
		<label for="review-query" class="mb-1.5 block text-xs font-medium text-zinc-400">
			Search query
		</label>
		<input
			id="review-query"
			type="search"
			autocomplete="off"
			placeholder="e.g. brand review, product name, competitor…"
			bind:value={query}
			{disabled}
			class="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
		/>
	</div>
	<button
		type="submit"
		disabled={disabled || loading || !query.trim()}
		class="shrink-0 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-950/40 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
	>
		{loading ? 'Analyzing…' : 'Analyze'}
	</button>
</form>
