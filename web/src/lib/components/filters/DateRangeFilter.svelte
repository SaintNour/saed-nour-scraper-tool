<script lang="ts">
	import type { DateRangePreset } from '$lib/types/dateRange';

	let {
		preset = $bindable<DateRangePreset>('all'),
		customStart = $bindable(''),
		customEnd = $bindable(''),
		disabled = false,
		compact = false,
	}: {
		preset?: DateRangePreset;
		customStart?: string;
		customEnd?: string;
		disabled?: boolean;
		/** Single-line toolbar style (no helper text). */
		compact?: boolean;
	} = $props();

	const options: { value: DateRangePreset; label: string }[] = [
		{ value: 'all', label: 'All time' },
		{ value: 'today', label: 'Today' },
		{ value: 'yesterday', label: 'Yesterday' },
		{ value: 'last_7_days', label: 'Last 7 days' },
		{ value: 'last_30_days', label: 'Last 30 days' },
		{ value: 'custom', label: 'Custom…' },
	];

	const selectClass = $derived(
		compact
			? 'w-full min-w-[8rem] cursor-pointer rounded-lg border border-white/[0.1] bg-[#121820]/90 py-2 pl-2.5 pr-7 text-xs text-zinc-200 outline-none transition-colors hover:border-zinc-600 focus:border-sky-500/40 focus:ring-1 focus:ring-sky-500/25 disabled:opacity-50 sm:text-sm'
			: 'w-full max-w-[14rem] cursor-pointer rounded-lg border border-zinc-800/80 bg-zinc-950/50 py-2 pl-3 pr-8 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-emerald-500/35 disabled:opacity-50',
	);
	const dateInputClass = $derived(
		compact
			? 'rounded-lg border border-white/[0.1] bg-[#121820]/90 px-2 py-1.5 text-xs text-zinc-200 outline-none transition-colors focus:border-sky-500/40 disabled:opacity-50'
			: 'rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2.5 py-2 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-700 focus:border-emerald-500/35 disabled:opacity-50',
	);
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
	<div class="min-w-0 {compact ? 'w-full' : 'sm:max-w-[14rem]'}">
		<label
			for="dashboard-date-preset"
			class="{compact ? 'sr-only' : 'mb-2 block text-xs font-medium text-zinc-500'}"
		>
			Time range
		</label>
		<select
			id="dashboard-date-preset"
			bind:value={preset}
			disabled={disabled}
			class={selectClass}
			aria-describedby={compact ? undefined : 'dashboard-date-hint'}
		>
			{#each options as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	</div>
	{#if preset === 'custom'}
		<div class="flex flex-wrap items-end gap-2 {compact ? 'mt-0' : ''}">
			<div>
				<label
					for="dashboard-date-start"
					class="{compact ? 'sr-only' : 'mb-2 block text-xs font-medium text-zinc-500'}"
					>Start</label
				>
				<input
					id="dashboard-date-start"
					type="date"
					bind:value={customStart}
					disabled={disabled}
					class={dateInputClass}
				/>
			</div>
			<div>
				<label
					for="dashboard-date-end"
					class="{compact ? 'sr-only' : 'mb-2 block text-xs font-medium text-zinc-500'}">End</label
				>
				<input
					id="dashboard-date-end"
					type="date"
					bind:value={customEnd}
					disabled={disabled}
					class={dateInputClass}
				/>
			</div>
		</div>
	{/if}
</div>
{#if !compact}
	<p id="dashboard-date-hint" class="mt-2 text-[10px] leading-relaxed text-zinc-600">
		Presets use UTC calendar boundaries. Results filter by content publish time when the source provides it;
		items without a timestamp stay visible (lenient).
	</p>
{/if}
