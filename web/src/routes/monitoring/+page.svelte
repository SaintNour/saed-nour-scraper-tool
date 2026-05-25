<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createMonitoringTrack,
		deleteMonitoringTrack,
		fetchMonitoringAlerts,
		fetchMonitoringTracks,
		runMonitoringTrackNow,
		ReviewsApiError,
	} from '$lib/services/api';
	import type { MonitoringAlert, MonitoringTrack, WatchlistIntervalHours } from '$lib/services/api/monitoring';

	let tracks = $state<MonitoringTrack[]>([]);
	let alerts = $state<MonitoringAlert[]>([]);
	let keyword = $state('');
	let subKeywordsRaw = $state('');
	let interval = $state<WatchlistIntervalHours>(3);
	let tracksLoading = $state(true);
	let alertsLoading = $state(true);
	let tracksError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let saving = $state(false);

	async function loadTracks() {
		tracksError = null;
		tracksLoading = true;
		try {
			tracks = await fetchMonitoringTracks();
		} catch (e) {
			tracks = [];
			tracksError =
				e instanceof ReviewsApiError ? e.message : 'Could not load watchlist. Is the API running?';
			console.error('[watchlist] load tracks failed', e);
		} finally {
			tracksLoading = false;
		}
	}

	async function loadAlerts() {
		alertsLoading = true;
		try {
			alerts = await fetchMonitoringAlerts(30);
		} finally {
			alertsLoading = false;
		}
	}

	async function load() {
		await loadTracks();
		await loadAlerts();
	}

	onMount(() => {
		load();
	});

	async function addTrack() {
		const k = keyword.trim();
		if (!k) {
			actionError = 'Enter a keyword to track.';
			return;
		}
		const subs = subKeywordsRaw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		saving = true;
		actionError = null;
		try {
			await createMonitoringTrack(k, interval, subs.length > 0 ? subs : undefined);
			keyword = '';
			subKeywordsRaw = '';
			await load();
		} catch (e) {
			actionError = e instanceof ReviewsApiError ? e.message : 'Could not add to watchlist.';
			console.error('[watchlist] add failed', e);
		} finally {
			saving = false;
		}
	}

	async function remove(id: string) {
		actionError = null;
		try {
			await deleteMonitoringTrack(id);
			await load();
		} catch (e) {
			actionError = e instanceof ReviewsApiError ? e.message : 'Could not remove item.';
			console.error('[watchlist] remove failed', e);
		}
	}

	async function runNow(id: string) {
		actionError = null;
		try {
			await runMonitoringTrackNow(id);
			await load();
		} catch (e) {
			actionError = e instanceof ReviewsApiError ? e.message : 'Run failed.';
			console.error('[watchlist] run failed', e);
		}
	}

	function levelStyle(level: MonitoringAlert['level']): string {
		if (level === 'critical') return 'border-rose-500/25 bg-rose-950/20 text-rose-100/95';
		if (level === 'warning') return 'border-amber-500/20 bg-amber-950/15 text-amber-100/95';
		return 'border-zinc-700/50 bg-zinc-900/30 text-zinc-200';
	}

	function formatTs(iso: string | null | undefined): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleString([], {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}

	function freqLabel(t: MonitoringTrack): string {
		return t.frequencyLabel ?? `${t.intervalHours ?? 3}h`;
	}

	function statusPill(t: MonitoringTrack): { text: string; class: string } {
		if (t.status === 'running') return { text: 'Running…', class: 'bg-sky-500/15 text-sky-100 ring-sky-500/30' };
		if (t.status === 'error') return { text: 'Error', class: 'bg-rose-500/15 text-rose-100 ring-rose-500/30' };
		if (t.status === 'ok') return { text: 'OK', class: 'bg-emerald-500/12 text-emerald-100 ring-emerald-500/25' };
		return { text: 'Scheduled', class: 'bg-zinc-600/25 text-zinc-300 ring-zinc-500/35' };
	}

	function rotationSummary(t: MonitoringTrack): string {
		const subs = t.subKeywords ?? [];
		if (subs.length === 0) return 'Main keyword only (no rotation).';
		const order = t.rotationOrderLabel ?? subs.join(' → ');
		return `Rotating: ${order}`;
	}
</script>

<main class="mx-auto max-w-6xl px-5 pb-28 pt-16 sm:px-8 lg:px-10 lg:pt-20">
	<header class="mb-10 max-w-2xl">
		<h1 class="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Watchlist</h1>
		<p class="mt-2 text-sm leading-relaxed text-zinc-500">
			Track keywords on a schedule. We re-check YouTube, compare against the last run, and surface what
			changed — no new platforms yet, same radar as the home search.
		</p>
	</header>

	{#if tracksError}
		<div
			class="mb-8 rounded-xl border border-rose-500/20 bg-rose-950/15 px-4 py-3 text-sm text-rose-100/95"
			role="alert"
		>
			{tracksError}
		</div>
	{/if}

	{#if actionError}
		<div
			class="mb-6 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-sm text-amber-100/90"
			role="status"
		>
			{actionError}
		</div>
	{/if}

	<section class="mb-14 rounded-2xl border border-white/[0.06] bg-zinc-900/35 p-6 sm:p-8" aria-label="Add track">
		<h2 class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Track a search</h2>
		<p class="mt-2 text-xs text-zinc-600">
			Main keyword is required. Optional sub-keywords use the same match rules as the dashboard. Each scheduled
			run checks <span class="text-zinc-500">one</span> sub-keyword at a time, cycling in order (round-robin).
		</p>
		<form
			class="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end"
			onsubmit={(e) => {
				e.preventDefault();
				addTrack();
			}}
		>
			<div class="min-w-0 flex-1 space-y-3">
				<div>
					<label for="kw" class="mb-1.5 block text-xs font-medium text-zinc-500">Main keyword</label>
					<input
						id="kw"
						bind:value={keyword}
						type="text"
						placeholder="e.g. brand name"
						class="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
					/>
				</div>
				<div>
					<label for="subs" class="mb-1.5 block text-xs font-medium text-zinc-500">
						Sub-keywords <span class="font-normal text-zinc-600">(optional, comma-separated)</span>
					</label>
					<input
						id="subs"
						bind:value={subKeywordsRaw}
						type="text"
						placeholder="e.g. brake pads, struts"
						class="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
					/>
				</div>
			</div>
			<div class="sm:w-52">
				<label for="int" class="mb-1.5 block text-xs font-medium text-zinc-500">Check every</label>
				<select
					id="int"
					bind:value={interval}
					class="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200"
				>
					<option value={3}>Every 3 hours</option>
					<option value={4}>Every 4 hours</option>
					<option value={5}>Every 5 hours</option>
				</select>
			</div>
			<button
				type="submit"
				disabled={saving || !keyword.trim()}
				class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{saving ? 'Adding…' : 'Add to watchlist'}
			</button>
		</form>
	</section>

	<section class="mb-14" aria-label="Alerts">
		<h2 class="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Alerts</h2>
		{#if alertsLoading}
			<p class="text-sm text-zinc-500">Loading alerts…</p>
		{:else if alerts.length === 0}
			<p class="text-sm text-zinc-600">No alerts yet. They appear when a scheduled check finds a big shift.</p>
		{:else}
			<ul class="space-y-3">
				{#each alerts as a (a.id)}
					<li class="rounded-xl border px-4 py-3 text-sm {levelStyle(a.level)}">
						<p class="font-medium">{a.title}</p>
						<p class="mt-1 text-xs opacity-90">{a.body}</p>
						<p class="mt-2 text-[10px] text-zinc-500">{new Date(a.createdAt).toLocaleString()}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-label="Tracked keywords">
		<h2 class="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Tracked</h2>
		{#if tracksLoading}
			<div
				class="rounded-2xl border border-zinc-800/50 bg-zinc-950/20 px-5 py-12 text-center text-sm text-zinc-500"
				role="status"
				aria-busy="true"
			>
				Loading watchlist…
			</div>
		{:else if tracksError}
			<p class="text-sm text-zinc-600">Saved keywords couldn’t be loaded. Check the message above and try again.</p>
		{:else if tracks.length === 0}
			<p class="text-sm text-zinc-600">Nothing on the watchlist yet. Add a keyword above.</p>
		{:else}
			<ul class="space-y-4">
				{#each tracks as t (t.id)}
					<li
						class="rounded-2xl border border-zinc-800/60 bg-zinc-950/30 px-5 py-4 sm:px-6 sm:py-5"
					>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-medium text-zinc-100">
										{t.mainKeyword ?? t.keyword}
									</p>
									<span
										class="inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset {statusPill(t).class}"
									>
										{statusPill(t).text}
									</span>
									{#if t.rotationMode && t.subKeywords && t.subKeywords.length > 0}
										<span
											class="inline-flex rounded-md px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-zinc-500 ring-1 ring-inset ring-zinc-700/60"
										>
											{t.rotationMode === 'round_robin' ? 'Round-robin' : t.rotationMode}
										</span>
									{/if}
								</div>
								{#if t.subKeywords && t.subKeywords.length > 0}
									<p class="mt-1.5 text-xs text-zinc-500">
										<span class="text-zinc-600">Sub-keywords ({t.subKeywords.length}):</span>
										<span class="text-zinc-400">{t.subKeywords.join(', ')}</span>
									</p>
									<p class="mt-1 text-xs text-sky-200/85">{rotationSummary(t)}</p>
									<p class="mt-1 text-xs text-zinc-500">
										<span class="text-zinc-600">Next run:</span>
										{t.nextScheduledQuery ?? '—'}
									</p>
									{#if t.lastExecutedQuery}
										<p class="mt-0.5 text-xs text-zinc-500">
											<span class="text-zinc-600">Last run:</span>
											{t.lastExecutedQuery}
										</p>
									{/if}
								{:else}
									<p class="mt-1.5 text-xs text-zinc-600">No sub-keywords — each run uses the main term only.</p>
								{/if}
								<p class="mt-1.5 text-xs text-zinc-500">
									<span class="text-zinc-400">{freqLabel(t)}</span>
									<span class="text-zinc-700" aria-hidden="true"> · </span>
									{#if !t.lastCheckedAt && !t.lastRunAt}
										<span class="text-amber-200/80">Pending first check</span>
									{:else}
										Last check {formatTs(t.lastCheckedAt ?? t.lastRunAt)}
									{/if}
									{#if t.nextCheckAt || t.nextRunAt}
										<span class="text-zinc-700" aria-hidden="true"> · </span>
										Next ~{formatTs(t.nextCheckAt ?? t.nextRunAt)}
									{/if}
								</p>
								{#if t.newCount != null || t.updatedCount != null || t.unchangedCount != null}
									<p class="mt-2 text-[11px] text-zinc-500">
										Last run counts:
										<span class="text-emerald-400/90">{t.newCount ?? 0} new</span>
										<span class="text-zinc-700"> · </span>
										<span class="text-sky-300/90">{t.updatedCount ?? 0} updated</span>
										<span class="text-zinc-700"> · </span>
										<span class="text-zinc-500">{t.unchangedCount ?? 0} unchanged</span>
									</p>
								{/if}
								{#if t.latestSummary}
									<p class="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-500">
										{t.latestSummary}
									</p>
								{/if}
								{#if t.lastResultCount != null}
									<p class="mt-1 text-[11px] text-zinc-600">
										Sample size: {t.lastResultCount} video(s)
									</p>
								{/if}
								{#if t.lastError}
									<p class="mt-2 rounded-lg border border-rose-500/20 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-100/95">
										{t.lastError}
									</p>
								{/if}
								{#if t.lastSnapshot && typeof t.lastSnapshot === 'object' && t.lastSnapshot !== null && 'sentiment' in t.lastSnapshot}
									{@const snap = t.lastSnapshot as { sentiment?: { negative?: number; positive?: number } }}
									<p class="mt-2 text-xs text-zinc-400">
										Latest sample: neg {Math.round(snap.sentiment?.negative ?? 0)}% · pos
										{Math.round(snap.sentiment?.positive ?? 0)}%
									</p>
								{/if}
								{#if t.lastChangeSummary?.lines?.length}
									<div class="mt-3 border-t border-zinc-800/50 pt-3">
										<p class="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
											What changed since last check
										</p>
										<ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-400">
											{#each t.lastChangeSummary.lines as line}
												<li>{line}</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
							<div class="flex shrink-0 gap-2">
								<button
									type="button"
									disabled={t.status === 'running'}
									class="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
									onclick={() => runNow(t.id)}
								>
									{t.status === 'running' ? 'Running…' : 'Run now'}
								</button>
								<button
									type="button"
									class="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:border-rose-500/30 hover:text-rose-200"
									onclick={() => remove(t.id)}
								>
									Remove
								</button>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
