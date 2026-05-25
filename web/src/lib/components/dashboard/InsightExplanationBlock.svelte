<script lang="ts">
	import type { InsightDrivers } from '$lib/types/analysis';

	let {
		drivers,
		topComplaints = [],
		topPositiveMentions = [],
	}: { drivers: InsightDrivers; topComplaints?: string[]; topPositiveMentions?: string[] } = $props();

	type DriverItem = { title: string; explanation: string };

	function parseDriver(line: string): DriverItem {
		const raw = String(line || '').trim();
		if (!raw) return { title: '', explanation: '' };
		const dashed = raw.match(/^(.+?)\s+[—-]\s+(.+)$/);
		if (dashed) return { title: dashed[1].trim(), explanation: dashed[2].trim() };
		const colon = raw.match(/^(.+?):\s+(.+)$/);
		if (colon) return { title: colon[1].trim(), explanation: colon[2].trim() };
		const sentenceSplit = raw.split(/(?<=[.!?])\s+/);
		if (sentenceSplit.length > 1) {
			return { title: sentenceSplit[0].trim(), explanation: sentenceSplit.slice(1).join(' ').trim() };
		}
		return { title: raw, explanation: 'Recurring signal in current matching feedback.' };
	}

	function mergeDriverEntries(driverLines: string[], themes: string[]): DriverItem[] {
		const out: DriverItem[] = [];
		const seen = new Set<string>();

		for (const d of driverLines) {
			const parsed = parseDriver(d);
			if (!parsed.title) continue;
			const k = parsed.title.toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			out.push(parsed);
		}

		for (const t of themes) {
			const title = String(t || '').trim();
			if (!title) continue;
			const k = title.toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			out.push({
				title,
				explanation: 'Frequent theme in matched content and comments for this scan.',
			});
		}

		return out.slice(0, 5);
	}

	const neg = $derived(mergeDriverEntries(drivers.whyNegative.filter(Boolean), topComplaints));
	const pos = $derived(mergeDriverEntries(drivers.whyPositive.filter(Boolean), topPositiveMentions));
	const show = $derived(neg.length > 0 || pos.length > 0);
</script>

{#if show}
	<div class="rounded-2xl border border-zinc-800/70 bg-zinc-900/35 px-5 py-5 sm:px-6 sm:py-6">
		<h3 class="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
			Sentiment Drivers
		</h3>
		<div class="mt-4 grid gap-6 md:grid-cols-2 md:gap-8">
			<div class="rounded-xl border border-rose-500/15 bg-rose-950/[0.1] p-4">
				<p class="text-[11px] font-medium uppercase tracking-[0.14em] text-rose-200/85">
					Negative Drivers
				</p>
				{#if neg.length > 0}
					<ul class="mt-3 list-none space-y-3">
						{#each neg as item (item.title)}
							<li>
								<p class="text-sm font-medium leading-snug text-zinc-100">{item.title}</p>
								<p class="mt-1 text-xs leading-relaxed text-zinc-400">{item.explanation}</p>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-3 text-xs text-zinc-500">No clear negative drivers in this scan.</p>
				{/if}
			</div>
			<div class="rounded-xl border border-emerald-500/15 bg-emerald-950/[0.08] p-4">
				<p class="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-200/85">
					Positive Drivers
				</p>
				{#if pos.length > 0}
					<ul class="mt-3 list-none space-y-3">
						{#each pos as item (item.title)}
							<li>
								<p class="text-sm font-medium leading-snug text-zinc-100">{item.title}</p>
								<p class="mt-1 text-xs leading-relaxed text-zinc-400">{item.explanation}</p>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-3 text-xs text-zinc-500">No clear positive drivers in this scan.</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
