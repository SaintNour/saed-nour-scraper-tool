<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import AlertsPanel from '$lib/components/dashboard/AlertsPanel.svelte';
	import type { ContentAlert } from '$lib/types/analysis';

	let {
		open = false,
		alerts = [],
		onClose,
	}: {
		open?: boolean;
		alerts: ContentAlert[];
		onClose: () => void;
	} = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[195] bg-black/60 backdrop-blur-[2px]"
		role="presentation"
		transition:fade={{ duration: 200 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
	></div>
	<div
		class="fixed inset-y-0 right-0 z-[196] flex w-full max-w-md flex-col border-l border-white/[0.08] bg-[#0c1018] shadow-[-24px_0_64px_-24px_rgba(0,0,0,0.75)]"
		transition:fly={{ x: 24, duration: 260, easing: cubicOut }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="alerts-drawer-title"
	>
		<header
			class="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0f141c]/95 px-5 py-4"
		>
			<div>
				<h2 id="alerts-drawer-title" class="text-base font-semibold tracking-tight text-zinc-50">
					Alerts
				</h2>
				<p class="mt-0.5 text-xs text-zinc-500">High-signal items from this run</p>
			</div>
			<button
				type="button"
				class="rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
				onclick={onClose}
			>
				Close
			</button>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
			{#if alerts.length === 0}
				<p class="text-sm leading-relaxed text-zinc-500">No alerts for this run.</p>
			{:else}
				<AlertsPanel {alerts} variant="flush" />
			{/if}
		</div>
	</div>
{/if}
