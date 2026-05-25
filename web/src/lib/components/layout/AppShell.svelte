<script lang="ts">
	import { onMount } from 'svelte';
	import AppSidebar from './AppSidebar.svelte';
	import { mainScrollY } from '$lib/stores/mainScrollY';

	let { children } = $props();

	onMount(() => {
		function syncScroll() {
			const y = window.scrollY || document.documentElement.scrollTop || 0;
			mainScrollY.set(y);
		}
		syncScroll();
		window.addEventListener('scroll', syncScroll, { passive: true });
		return () => window.removeEventListener('scroll', syncScroll);
	});
</script>

<!--
  Sidebar is fixed; main column is offset so content scrolls independently of nav.
-->
<div class="relative z-10 min-h-screen w-full max-w-[100vw] bg-[#0b0f14]">
	<AppSidebar />
	<div class="min-w-0 w-full flex-1 flex-col pl-[240px] [--main-pad:240px]">
		{@render children()}
	</div>
</div>
