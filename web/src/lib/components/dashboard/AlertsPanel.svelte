<script lang="ts">
	import type { ContentAlert, ContentAlertType } from '$lib/types/analysis';

	let {
		alerts,
		variant = 'card',
	}: {
		alerts: ContentAlert[];
		/** `card` = bordered panel; `flush` = list only (e.g. drawer) */
		variant?: 'card' | 'flush';
	} = $props();

	const shown = $derived(alerts.slice(0, 5));

	function iconFor(type: ContentAlertType): string {
		if (type === 'high_risk_negative') return '⚠️';
		if (type === 'trending') return '🔥';
		if (type === 'new_high_priority') return '🆕';
		if (type === 'updated_momentum') return '⚡';
		return '•';
	}

	function severityRing(sev: ContentAlert['severity']): string {
		if (sev === 'critical') return 'ring-rose-500/35 bg-rose-500/8';
		if (sev === 'high') return 'ring-amber-500/30 bg-amber-500/8';
		if (sev === 'medium') return 'ring-sky-500/28 bg-sky-500/8';
		return 'ring-zinc-600/40 bg-zinc-800/40';
	}
</script>

{#if shown.length > 0}
	{#if variant === 'card'}
		<div
			class="rounded-2xl border border-white/[0.06] bg-zinc-950/30 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]"
		>
			<h3 class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Alerts</h3>
			<p class="mt-1 text-xs text-zinc-600">High-signal items from this run (not notifications).</p>
			<ul class="mt-4 space-y-3" role="list">
				{#each shown as alert (alert.alertId)}
					<li
						class="flex gap-3 rounded-xl border border-zinc-800/50 p-3.5 ring-1 ring-inset {severityRing(
							alert.severity,
						)}"
					>
						<span class="shrink-0 text-lg leading-none" aria-hidden="true">{iconFor(alert.type)}</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-zinc-100">{alert.title}</p>
							<p class="mt-1 text-xs leading-relaxed text-zinc-500">{alert.message}</p>
							{#if alert.contentUrl}
								<a
									href={alert.contentUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-2 inline-block text-[11px] font-medium text-sky-400/90 underline decoration-sky-500/35 underline-offset-2 hover:text-sky-300"
								>
									Open content
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<ul class="space-y-3" role="list">
			{#each shown as alert (alert.alertId)}
				<li
					class="flex gap-3 rounded-xl border border-zinc-800/50 p-3.5 ring-1 ring-inset {severityRing(
						alert.severity,
					)}"
				>
					<span class="shrink-0 text-lg leading-none" aria-hidden="true">{iconFor(alert.type)}</span>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-zinc-100">{alert.title}</p>
						<p class="mt-1 text-xs leading-relaxed text-zinc-500">{alert.message}</p>
						{#if alert.contentUrl}
							<a
								href={alert.contentUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="mt-2 inline-block text-[11px] font-medium text-sky-400/90 underline decoration-sky-500/35 underline-offset-2 hover:text-sky-300"
							>
								Open content
							</a>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
