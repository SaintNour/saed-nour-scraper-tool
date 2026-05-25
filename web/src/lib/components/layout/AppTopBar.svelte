<script lang="ts">
	const logoSrc = '/branding/logo.png';
</script>

<header
	class="sticky top-0 z-40 flex h-[3.75rem] shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-[#0b0f14]/90 px-5 backdrop-blur-md sm:px-8 lg:px-10"
>
	<a
		href="/"
		class="group flex min-w-0 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f14]"
	>
		<img
			src={logoSrc}
			alt="Saed Nour Scraper Tool"
			class="h-10 w-auto max-w-[min(100%,280px)] shrink-0 bg-transparent object-contain object-left sm:h-11"
			width="280"
			height="72"
		/>
		<span class="hidden text-[11px] text-zinc-500 sm:inline">Review intelligence</span>
	</a>

	<nav class="flex shrink-0 items-center gap-2" aria-label="Quick actions">
		<a
			href="/monitoring"
			class="rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 sm:text-[13px]"
		>
			Watchlist
		</a>
		<a
			href="/history"
			class="rounded-lg px-3 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 sm:text-[13px]"
		>
			History
		</a>
	</nav>
</header>
