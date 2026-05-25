<script lang="ts">
	import PlatformFilter from '$lib/components/filters/PlatformFilter.svelte';
	import DateRangeFilter from '$lib/components/filters/DateRangeFilter.svelte';
import type { PlatformId, ScanMode } from '$lib/types/analysis';
	import { DEFAULT_PLATFORM } from '$lib/types/analysis';
	import type { DateRangePreset } from '$lib/types/dateRange';
	import { isAnalysisAvailable } from '$lib/types/platform';

	let {
		query = $bindable(''),
		subKeywords = $bindable<string[]>([]),
		selected = $bindable<PlatformId>(DEFAULT_PLATFORM),
		scanMode = $bindable<ScanMode>('all_relevant'),
		datePreset = $bindable<DateRangePreset>('all'),
		customDateStart = $bindable(''),
		customDateEnd = $bindable(''),
		loading = false,
		onAnalyze,
		error = null,
		wrapperClass = '',
	}: {
		query?: string;
		subKeywords?: string[];
		selected?: PlatformId;
		scanMode?: ScanMode;
		datePreset?: DateRangePreset;
		customDateStart?: string;
		customDateEnd?: string;
		loading?: boolean;
		onAnalyze: () => void;
		error?: string | null;
		wrapperClass?: string;
	} = $props();

	const inputId = 'dashboard-search-query';
	const subInputId = 'dashboard-sub-keywords';

	let subDraft = $state('');

	function dedupeSubs(list: string[]): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const x of list) {
			const t = x.trim().slice(0, 200);
			if (!t) continue;
			const k = t.toLowerCase();
			if (seen.has(k)) continue;
			seen.add(k);
			out.push(t);
		}
		return out;
	}

	function addSubTokens(raw: string) {
		const parts = raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (parts.length === 0) return;
		subKeywords = dedupeSubs([...subKeywords, ...parts]);
		subDraft = '';
	}

	function removeSub(i: number) {
		subKeywords = subKeywords.filter((_, j) => j !== i);
	}

	function onSubKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addSubTokens(subDraft);
		} else if (e.key === 'Backspace' && !subDraft && subKeywords.length > 0) {
			subKeywords = subKeywords.slice(0, -1);
		}
	}

	function submitForm(e: Event) {
		e.preventDefault();
		if (subDraft.trim()) addSubTokens(subDraft);
		onAnalyze();
	}

	const analyzeDisabled = $derived(
		!isAnalysisAvailable(selected) || loading || !query.trim(),
	);

	const scanModeOptions: Array<{ value: ScanMode; label: string; help: string }> = [
		{
			value: 'all_relevant',
			label: 'All Relevant',
			help: 'Use current relevance ranking before the 15-item cap.',
		},
		{
			value: 'recent_first',
			label: 'Recent First',
			help: 'Prioritize newest matching items before the 15-item cap.',
		},
		{
			value: 'trend_catcher',
			label: 'Trend Catcher',
			help: 'Only include items with trend score 70+; sort by trend score (highest first).',
		},
	];

	const matchHint = $derived(
		subKeywords.length > 0
			? 'Results must match the main keyword and at least one sub keyword.'
			: 'Results must match the main keyword.',
	);
</script>

<form
	class="rounded-2xl border border-white/[0.06] bg-[#121820]/92 p-7 shadow-[0_12px_46px_-16px_rgba(0,0,0,0.62),0_0_0_1px_rgba(255,255,255,0.05),0_1px_0_0_rgba(255,255,255,0.04)_inset] backdrop-blur-md sm:p-9 {wrapperClass}"
	onsubmit={submitForm}
	aria-labelledby="search-bar-title"
	aria-busy={loading}
>
	<h2 id="search-bar-title" class="sr-only">Search YouTube and analyze viewer feedback</h2>

	<fieldset class="min-w-0 border-0 p-0">
		<legend
			class="mb-4 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"
		>
			Platform
		</legend>
		<div role="group" aria-label="Choose a social platform">
			<PlatformFilter bind:selected />
		</div>
	</fieldset>

	<div class="mt-9 border-t border-zinc-800/50 pt-9">
		<div class="grid gap-5 md:grid-cols-2 md:items-start">
			<DateRangeFilter
				bind:preset={datePreset}
				bind:customStart={customDateStart}
				bind:customEnd={customDateEnd}
				disabled={loading}
			/>
			<fieldset class="min-w-0 border-0 p-0">
				<legend class="mb-3 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
					Scan mode
				</legend>
				<div
					role="tablist"
					aria-label="Scan mode"
					class="flex flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-[#121820] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
				>
					{#each scanModeOptions as opt (opt.value)}
						<button
							type="button"
							role="tab"
							id="scan-tab-{opt.value}"
							aria-selected={scanMode === opt.value}
							aria-controls="scan-mode-help"
							disabled={loading}
							onclick={() => {
								scanMode = opt.value;
							}}
							class="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-center text-xs font-medium transition sm:px-4 sm:text-[13px] {scanMode === opt.value
								? 'bg-sky-500/28 text-sky-50 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.6),0_0_22px_-10px_rgba(56,189,248,0.55)]'
								: 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300'}"
						>
							{opt.label}
						</button>
					{/each}
				</div>
				<p id="scan-mode-help" class="mt-2.5 text-[11px] leading-relaxed text-zinc-500">
					{scanModeOptions.find((x) => x.value === scanMode)?.help}
				</p>
			</fieldset>
		</div>
	</div>

	<div class="mt-9 border-t border-zinc-800/50 pt-9">
		<fieldset class="min-w-0 border-0 p-0">
			<legend
				class="mb-4 block text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"
			>
				Query
			</legend>
			<div class="grid grid-cols-1 gap-4">
				<div class="min-w-0">
					<label
						for={inputId}
						class="mb-2 block text-xs font-medium text-zinc-500"
					>
						Main keyword
					</label>
					<input
						id={inputId}
						name="query"
						type="search"
						autocomplete="off"
						placeholder="Brand or main topic"
						bind:value={query}
						disabled={loading}
						class="w-full rounded-xl border border-white/[0.08] bg-[#0b0f14]/60 px-4 py-3.5 text-sm text-zinc-100 shadow-inner placeholder:text-zinc-600 transition-colors duration-150 placeholder:transition-opacity focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/15 disabled:opacity-50"
					/>
				</div>
				<div class="min-w-0">
					<label for={subInputId} class="mb-2 block text-xs font-medium text-zinc-500">
						Sub-keywords <span class="font-normal text-zinc-600">(optional)</span>
					</label>
					<div
						class="flex min-h-[46px] flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-[#0b0f14]/60 px-2 py-2 shadow-inner focus-within:border-sky-500/40 focus-within:ring-2 focus-within:ring-sky-500/15"
					>
						{#each subKeywords as tag, i (tag + i)}
							<button
								type="button"
								class="inline-flex max-w-full items-center gap-1 rounded-lg bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-200 ring-1 ring-zinc-700/60"
								onclick={() => removeSub(i)}
								title="Remove"
							>
								<span class="truncate">{tag}</span>
								<span class="text-zinc-500" aria-hidden="true">×</span>
							</button>
						{/each}
						<input
							id={subInputId}
							name="subKeywords"
							type="text"
							autocomplete="off"
							placeholder="Type and press Enter or comma…"
							bind:value={subDraft}
							onkeydown={onSubKeydown}
							disabled={loading}
							class="min-w-[8rem] flex-1 border-0 bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
						/>
					</div>
					<p class="mt-2 text-[11px] leading-relaxed text-zinc-600">{matchHint}</p>
				</div>
				<div class="flex justify-end">
					<button
						type="submit"
						disabled={analyzeDisabled}
						class="h-[50px] w-full shrink-0 rounded-xl bg-[#1d9bf0] px-8 text-sm font-semibold text-white shadow-[0_10px_28px_-10px_rgba(29,155,240,0.68)] transition-all duration-150 hover:-translate-y-[1px] hover:bg-[#35a8f3] hover:shadow-[0_14px_34px_-10px_rgba(29,155,240,0.72)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400/70 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[10.5rem]"
					>
						{loading ? 'Analyzing…' : 'Run analysis'}
					</button>
				</div>
			</div>
		</fieldset>
	</div>

	{#if error}
		<div
			class="mt-8 rounded-xl border border-rose-500/20 bg-rose-950/15 px-4 py-3.5 text-sm leading-snug text-rose-100/95"
			role="alert"
			aria-live="polite"
		>
			{error}
		</div>
	{/if}
</form>
