<script lang="ts">
	import { page } from '$app/stores';
	import { PLATFORM_OPTIONS } from '$lib/types/platform';
	import { dashboardPlatform } from '$lib/stores/dashboardPlatform';
	import { mainScrollY } from '$lib/stores/mainScrollY';
	import type { PlatformId } from '$lib/types/analysis';

	const links = [
		{
			href: '/',
			label: 'Home',
			active: (path: string) => path === '/' || path === '',
		},
		{
			href: '/monitoring',
			label: 'Automation',
			active: (path: string) => path.startsWith('/monitoring'),
		},
		{
			href: '/history',
			label: 'History',
			active: (path: string) => path.startsWith('/history'),
		},
	] as const;

	function setPlatform(id: PlatformId) {
		const opt = PLATFORM_OPTIONS.find((p) => p.id === id);
		if (opt?.status !== 'active') return;
		dashboardPlatform.set(id);
	}

	const logoScale = $derived(
		Math.max(0.86, 1 - Math.min($mainScrollY, 96) / 96 * 0.14),
	);
</script>

{#snippet platformGlyph(id: PlatformId)}
	{#if id === 'youtube'}
		<svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M21.8 8.001a2.746 2.746 0 00-1.935-1.948C18.17 5.5 12 5.5 12 5.5s-6.17 0-7.865.553A2.746 2.746 0 002.2 8.001 28.88 28.88 0 002 12a28.88 28.88 0 00.2 3.999 2.746 2.746 0 001.935 1.948C5.83 18.5 12 18.5 12 18.5s6.17 0 7.865-.553a2.746 2.746 0 001.935-1.948A28.88 28.88 0 0022 12a28.88 28.88 0 00-.2-3.999z"
				fill="currentColor"
				class="text-red-500/90"
			/>
			<path d="M10 15.5v-7l6 3.5-6 3.5z" fill="#0a0e15" />
		</svg>
	{:else if id === 'tiktok'}
		<svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M14.5 4.5c.35 2.1 1.75 3.65 3.85 3.75V9.9c-1.35 0-2.6-.55-3.5-1.45v6.55c0 3.2-2.6 5.8-5.8 5.8S3.25 18.2 3.25 15s2.6-5.8 5.8-5.8c.2 0 .4 0 .6.05v2.05c-.2-.05-.4-.05-.6-.05-2.05 0-3.7 1.65-3.7 3.7s1.65 3.7 3.7 3.7 3.7-1.65 3.7-3.7V2h2.55z"
				fill="currentColor"
				class="text-cyan-300/90"
			/>
		</svg>
	{:else if id === 'instagram'}
		<svg class="h-4 w-4 shrink-0 text-fuchsia-300/90" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" stroke-width="1.5" />
			<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5" />
			<circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" />
		</svg>
	{:else}
		<svg class="h-4 w-4 shrink-0 text-blue-400/90" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path
				d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06C2 17.06 5.66 21.2 10.44 21.94v-7.05H7.9v-2.91h2.54V9.41c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.56v1.87h2.77l-.44 2.91h-2.33v7.05C18.34 21.2 22 17.06 22 12.06z"
			/>
		</svg>
	{/if}
{/snippet}

<aside
	class="fixed left-0 top-0 z-50 flex h-screen w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#090d13]/95 px-4 py-7 backdrop-blur-xl sm:px-5"
	aria-label="Main navigation"
>
	<a
		href="/"
		class="mb-10 flex items-center gap-3 outline-none transition-transform duration-300 ease-out focus-visible:ring-2 focus-visible:ring-sky-500/40"
		style="transform: scale({logoScale}); transform-origin: left center;"
	>
		<img
			src="/branding/logo.png"
			alt="Saed Nour Scraper Tool"
			class="h-auto w-full max-w-[200px] max-h-[88px] bg-transparent object-contain object-left [filter:drop-shadow(0_2px_12px_rgba(56,189,248,0.12))]"
			width="200"
			height="88"
		/>
	</a>

	<p class="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Navigation</p>
	<nav class="flex flex-col gap-1" aria-label="Primary">
		{#each links as item (item.href)}
			{@const isActive = item.active($page.url.pathname)}
			<a
				href={item.href}
				class="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[13px] font-medium transition-all
					{isActive
					? 'border-sky-500/30 bg-sky-500/[0.12] text-sky-50 shadow-[0_0_24px_-10px_rgba(56,189,248,0.45)]'
					: 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200'}"
			>
				{#if item.label === 'Home'}
					<svg class="h-4 w-4 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linejoin="round"
						/>
					</svg>
				{:else if item.label === 'Automation'}
					<svg class="h-4 w-4 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M12 8a3 3 0 100 6 3 3 0 000-6z"
							stroke="currentColor"
							stroke-width="1.6"
						/>
						<path
							d="M19.4 15a7.86 7.86 0 00.1-1 8 8 0 10-8 8h.1"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					</svg>
				{:else}
					<svg class="h-4 w-4 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M4 6h16M4 12h10M4 18h16"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
						/>
					</svg>
				{/if}
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="mt-auto border-t border-white/[0.05] pt-6">
		<p class="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Platform</p>
		<div class="flex flex-col gap-2">
			{#each PLATFORM_OPTIONS as p (p.id)}
				<button
					type="button"
					disabled={p.status === 'coming_soon'}
					aria-pressed={$dashboardPlatform === p.id}
					onclick={() => setPlatform(p.id)}
					class="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-all
						{p.status === 'coming_soon'
						? 'cursor-not-allowed border-zinc-800/40 bg-zinc-900/20 text-zinc-600'
						: $dashboardPlatform === p.id
							? 'border-sky-400/55 bg-sky-500/[0.12] text-sky-50 shadow-[0_0_20px_-10px_rgba(56,189,248,0.5)]'
							: 'border-zinc-800/70 bg-zinc-900/30 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/50'}"
				>
					{@render platformGlyph(p.id)}
					<span class="min-w-0 flex-1 font-medium">{p.label}</span>
					{#if p.status === 'coming_soon'}
						<span class="text-[9px] font-semibold uppercase text-zinc-600">Soon</span>
					{:else if $dashboardPlatform === p.id}
						<span
							class="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]"
							aria-hidden="true"
						></span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
</aside>
