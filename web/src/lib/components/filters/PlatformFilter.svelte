<script lang="ts">
	import { PLATFORM_OPTIONS } from '$lib/types/platform';
	import type { PlatformId } from '$lib/types/analysis';
	import { DEFAULT_PLATFORM } from '$lib/types/analysis';

	let { selected = $bindable<PlatformId>(DEFAULT_PLATFORM) }: { selected?: PlatformId } = $props();
</script>

<div class="flex flex-wrap gap-2.5">
	{#each PLATFORM_OPTIONS as p (p.id)}
		<button
			type="button"
			disabled={p.status === 'coming_soon'}
			aria-pressed={selected === p.id}
			class="group relative rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all duration-200
				{p.status === 'coming_soon'
				? 'cursor-not-allowed border-zinc-800/45 bg-zinc-900/20 text-zinc-500'
				: selected === p.id
					? 'border-sky-400/65 bg-sky-500/[0.14] text-sky-50 ring-1 ring-sky-400/35 shadow-[0_0_0_1px_rgba(56,189,248,0.24),0_0_26px_-10px_rgba(56,189,248,0.55)]'
					: 'border-zinc-700/80 bg-zinc-900/35 text-zinc-300 hover:border-zinc-500/80 hover:bg-zinc-900/55'}"
			onclick={() => {
				if (p.status === 'active') selected = p.id;
			}}
		>
			<span class="font-medium">{p.label}</span>
			{#if p.status === 'coming_soon'}
				<span
					class="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-400"
				>
					Coming soon
				</span>
			{/if}
			<p class="mt-1 text-xs leading-snug text-zinc-600 group-hover:text-zinc-500">{p.description}</p>
		</button>
	{/each}
</div>
