<script lang="ts">
	import DateRangeFilter from '$lib/components/filters/DateRangeFilter.svelte';
	import { mainScrollY } from '$lib/stores/mainScrollY';
	import type { ScanMode } from '$lib/types/analysis';
	import type { DateRangePreset } from '$lib/types/dateRange';

	let {
		query = $bindable(''),
		subKeywordsDraft = $bindable(''),
		scanMode = $bindable<ScanMode>('all_relevant'),
		datePreset = $bindable<DateRangePreset>('all'),
		customDateStart = $bindable(''),
		customDateEnd = $bindable(''),
		loading = false,
		showInsights = false,
		showAlerts = false,
		alertCount = 0,
		onAnalyze,
		onOpenInsights,
		onOpenAlerts,
		error = null,
	}: {
		query?: string;
		subKeywordsDraft?: string;
		scanMode?: ScanMode;
		datePreset?: DateRangePreset;
		customDateStart?: string;
		customDateEnd?: string;
		loading?: boolean;
		showInsights?: boolean;
		showAlerts?: boolean;
		alertCount?: number;
		onAnalyze: () => void;
		onOpenInsights?: () => void;
		onOpenAlerts?: () => void;
		error?: string | null;
	} = $props();

	const scanModeOptions: Array<{ value: ScanMode; label: string }> = [
		{ value: 'all_relevant', label: 'All Relevant' },
		{ value: 'recent_first', label: 'Recent First' },
		{ value: 'trend_catcher', label: 'Trend Catcher' },
	];

	function submit(e: Event) {
		e.preventDefault();
		onAnalyze();
	}

	const runDisabled = $derived(loading || !query.trim());

	const scrollT = $derived(Math.min(1, $mainScrollY / 128));
	const barOpacity = $derived(Math.max(0.2, 1 - scrollT * 0.78));
	const barTy = $derived(-scrollT * 10);
</script>

<form
	class="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0b0f14]/80 backdrop-blur-lg sm:px-6 lg:px-8"
	onsubmit={submit}
	aria-label="Search controls"
>
	<div
		class="mx-auto max-w-[1600px] px-4 py-3 transition-[opacity,transform] duration-300 ease-out sm:px-0"
		style="opacity: {barOpacity}; transform: translate3d(0, {barTy}px, 0);"
	>
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
			<div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<input
					name="query"
					type="search"
					autocomplete="off"
					placeholder="Enter main keyword"
					bind:value={query}
					disabled={loading}
					class="min-h-[42px] w-full min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#121820]/90 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition focus:border-sky-500/45 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-50 sm:max-w-xl lg:max-w-2xl"
				/>
				<input
					name="subKeywords"
					type="text"
					autocomplete="off"
					placeholder="Sub-keywords (optional)"
					bind:value={subKeywordsDraft}
					disabled={loading}
					class="min-h-[42px] w-full min-w-0 rounded-xl border border-white/[0.08] bg-[#0f141c]/90 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 transition focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/15 disabled:opacity-50 sm:max-w-[220px]"
				/>
			</div>

			<div class="flex flex-wrap items-center gap-2 sm:gap-3">
				<div class="min-w-[140px] flex-1 sm:flex-initial sm:min-w-[160px]">
					<DateRangeFilter
						bind:preset={datePreset}
						bind:customStart={customDateStart}
						bind:customEnd={customDateEnd}
						disabled={loading}
						compact={true}
					/>
				</div>

				<div
					role="tablist"
					aria-label="Scan mode"
					class="flex min-w-0 flex-1 flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-[#121820] p-1 sm:flex-initial"
				>
					{#each scanModeOptions as opt (opt.value)}
						<button
							type="button"
							role="tab"
							aria-selected={scanMode === opt.value}
							disabled={loading}
							onclick={() => {
								scanMode = opt.value;
							}}
							class="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-center text-[11px] font-semibold transition sm:min-w-[5.5rem] sm:px-3 sm:text-xs {scanMode === opt.value
								? 'bg-sky-500/30 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.55),0_0_20px_-8px_rgba(56,189,248,0.55)]'
								: 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300'}"
						>
							{opt.label}
						</button>
					{/each}
				</div>

				<div class="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
					{#if showAlerts && onOpenAlerts}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-xs font-semibold text-amber-100 shadow-[0_0_18px_-10px_rgba(251,191,36,0.35)] transition hover:border-amber-400/35 hover:bg-amber-500/15"
							onclick={() => onOpenAlerts()}
						>
							<svg class="h-4 w-4 opacity-90" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 22a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22zm8-6V11a8 8 0 10-16 0v5l-2 2v1h20v-1l-2-2z"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linejoin="round"
								/>
							</svg>
							Alerts
							{#if alertCount > 0}
								<span
									class="min-w-[1.25rem] rounded-md bg-amber-500/25 px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums text-amber-50"
								>
									{alertCount > 9 ? '9+' : alertCount}
								</span>
							{/if}
						</button>
					{/if}
					{#if showInsights && onOpenInsights}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 shadow-[0_0_18px_-8px_rgba(56,189,248,0.45)] transition hover:border-sky-400/45 hover:bg-sky-500/20"
							onclick={() => onOpenInsights()}
						>
							<svg class="h-4 w-4 opacity-90" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
								<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5" />
							</svg>
							Insights
						</button>
					{/if}
					<button
						type="submit"
						disabled={runDisabled}
						class="inline-flex min-h-[42px] min-w-[9.5rem] items-center justify-center rounded-xl bg-[#1d9bf0] px-5 text-sm font-semibold text-white shadow-[0_10px_28px_-10px_rgba(29,155,240,0.65)] transition hover:-translate-y-px hover:bg-[#35a8f3] hover:shadow-[0_14px_32px_-10px_rgba(29,155,240,0.72)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
					>
						{loading ? 'Analyzing…' : 'Run analysis'}
					</button>
				</div>
			</div>
		</div>

		{#if error}
			<p
				class="mx-auto mt-3 max-w-[1600px] rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2 text-xs text-rose-100/95"
				role="alert"
			>
				{error}
			</p>
		{/if}
	</div>
</form>
