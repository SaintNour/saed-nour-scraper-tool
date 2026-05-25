<script lang="ts">
	import './layout.css';
	import AppShell from '$lib/components/layout/AppShell.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/branding/favicon-64.png" sizes="64x64" />
	<link rel="icon" type="image/png" href="/branding/favicon-48.png" sizes="48x48" />
	<link rel="icon" type="image/png" href="/branding/favicon-32.png" sizes="32x32" />
	<link rel="icon" type="image/png" href="/branding/favicon-128.png" sizes="128x128" />
	<link rel="apple-touch-icon" href="/branding/favicon-192.png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap"
		rel="stylesheet"
	/>
	<title>Saed Nour Scraper Tool</title>
</svelte:head>

<div
	class="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#0f1724] via-[#0c121b] to-[#080c12] font-[family-name:var(--font-sans)] text-zinc-100 antialiased"
	style="--font-sans: 'DM Sans', ui-sans-serif, system-ui, sans-serif; --app-accent: 56 189 248;"
>
	<!-- Ambient depth: subtle blue + neutral (SaaS polish) -->
	<div
		class="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_82%_54%_at_50%_-14%,rgba(56,189,248,0.11),transparent_58%)]"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_42%_at_100%_0%,rgba(30,64,175,0.18),transparent_52%)]"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none fixed inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#080c12] via-transparent to-transparent"
		aria-hidden="true"
	></div>

	<AppShell>
		{@render children()}
	</AppShell>
</div>
