<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		postDashboardChat,
		fetchHistoryGroups,
		ReviewsApiError,
		type DashboardChatHistoryItem,
	} from '$lib/services/api';
	import type { AnalysisResult, PlatformId } from '$lib/types/analysis';
	import type { KeywordHistoryGroup } from '$lib/types/searchHistory';
	import {
		analysisResultToChatPayload,
		buildOpeningMessageFromAnalysis,
		buildOpeningMessageHistoryKeyword,
		buildOpeningMessageHistoryOrSearch,
		buildOpeningMessageNoResult,
		getDefaultSuggestedChips,
		pickSuggestedChipsAfterResponse,
		sanitizeAssistantAnswer,
	} from '$lib/utils/dashboardChatContext';

	type ChatMsg = {
		id: string;
		role: 'user' | 'assistant';
		content: string;
	};

	type Props = {
		result: AnalysisResult | null;
		query: string;
		subKeywords: string[];
		platform: PlatformId;
	};

	let { result, query, subKeywords, platform }: Props = $props();

	let panelOpen = $state(false);
	let draft = $state('');
	let messages = $state<ChatMsg[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let lastFailedQuestion = $state<string | null>(null);
	let suggestedChips = $state<string[]>([]);
	/** When true, chip row is hidden; header + toggle stay visible. */
	let suggestionsCollapsed = $state(false);
	let messagesEl = $state<HTMLDivElement | null>(null);
	let panelSize = $state<{ width: number; height: number } | null>(null);
	const PANEL_MIN_W = 340;
	const PANEL_MIN_H = 380;
	const PANEL_MAX_W = 900;
	const PANEL_MAX_H_VH = 0.9;
	type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

	let historyGroups = $state<KeywordHistoryGroup[]>([]);
	let historyGroupsError = $state<string | null>(null);
	/** When set, chat uses saved history for this keyword instead of the current dashboard payload. */
	let selectedHistoryGroup = $state<KeywordHistoryGroup | null>(null);

	const chatAvatarSrc = '/branding/chat-avatar.png';

	onMount(() => {
		void fetchHistoryGroups()
			.then((g) => {
				historyGroups = g;
			})
			.catch(() => {
				historyGroupsError = 'Could not load saved keywords.';
			});

		const key = 'ai-chat-panel-size-v1';
		try {
			const raw = sessionStorage.getItem(key);
			if (raw) {
				const parsed = JSON.parse(raw) as { width?: number; height?: number };
				if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
					panelSize = normalizePanelSize(parsed.width, parsed.height);
					return;
				}
			}
		} catch {
			/* noop */
		}
		panelSize = defaultPanelSize();
	});

	const panelInlineStyle = $derived.by(() => {
		const size = panelSize ?? defaultPanelSize();
		return [
			`width:${size.width}px`,
			`height:${size.height}px`,
			`min-width:${PANEL_MIN_W}px`,
			`min-height:${PANEL_MIN_H}px`,
			`max-width:min(calc(100vw - 2rem), ${PANEL_MAX_W}px)`,
			`max-height:${Math.round(PANEL_MAX_H_VH * 100)}vh`,
			'overflow:hidden',
		].join(';');
	});

	$effect(() => {
		if (!panelOpen) return;
		if (!panelSize) panelSize = defaultPanelSize();
	});

	function defaultPanelSize(): { width: number; height: number } {
		const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
		const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
		const width = Math.min(Math.max(vw - 32, PANEL_MIN_W), 420);
		const height = Math.min(560, Math.floor(vh * 0.85));
		return normalizePanelSize(width, height);
	}

	function normalizePanelSize(width: number, height: number): { width: number; height: number } {
		const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
		const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
		const maxW = Math.min(vw - 32, PANEL_MAX_W);
		const maxH = Math.floor(vh * PANEL_MAX_H_VH);
		return {
			width: Math.max(PANEL_MIN_W, Math.min(Math.round(width), Math.max(PANEL_MIN_W, maxW))),
			height: Math.max(PANEL_MIN_H, Math.min(Math.round(height), Math.max(PANEL_MIN_H, maxH))),
		};
	}

	function savePanelSize(size: { width: number; height: number }) {
		try {
			sessionStorage.setItem('ai-chat-panel-size-v1', JSON.stringify(size));
		} catch {
			/* noop */
		}
	}

	function resetPanelSize() {
		const next = defaultPanelSize();
		panelSize = next;
		savePanelSize(next);
	}

	function startResize(ev: MouseEvent, edge: ResizeEdge) {
		ev.preventDefault();
		ev.stopPropagation();
		const base = panelSize ?? defaultPanelSize();
		const startX = ev.clientX;
		const startY = ev.clientY;
		const startW = base.width;
		const startH = base.height;

		const onMove = (moveEv: MouseEvent) => {
			const dx = moveEv.clientX - startX;
			const dy = moveEv.clientY - startY;
			let nextW = startW;
			let nextH = startH;

			if (edge.includes('e')) nextW = startW + dx;
			if (edge.includes('w')) nextW = startW - dx;
			if (edge.includes('s')) nextH = startH + dy;
			if (edge.includes('n')) nextH = startH - dy;

			const next = normalizePanelSize(nextW, nextH);
			panelSize = next;
			savePanelSize(next);
		};

		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	const contextKey = $derived(
		`${result ? `${result.query}::${result.platform}::${result.totalCommentsAnalyzed}::${result.summary?.length ?? 0}` : 'no-result'}::hist:${selectedHistoryGroup?.groupKey ?? 'none'}`,
	);

	let prevContextKey = $state<string | null>(null);
	const resultSig = $derived(
		result ? `${result.query}|${result.totalContentItems}|${(result.summary ?? '').slice(0, 48)}` : '',
	);
	let prevResultSig = $state<string | null>(null);

	$effect(() => {
		if (prevResultSig !== null && resultSig !== prevResultSig && result) {
			selectedHistoryGroup = null;
		}
		prevResultSig = resultSig;
	});

	$effect(() => {
		const key = contextKey;
		const defaults = getDefaultSuggestedChips({
			hasDashboardResult: result != null,
			historyKeywordSelected: selectedHistoryGroup != null,
		});
		if (prevContextKey === null) {
			suggestedChips = defaults;
		} else if (prevContextKey !== key) {
			messages = [];
			error = null;
			lastFailedQuestion = null;
			suggestedChips = defaults;
			suggestionsCollapsed = false;
		}
		prevContextKey = key;
	});

	const canChat = $derived(selectedHistoryGroup != null || result != null);

	function openingAssistantCopy(): string {
		if (selectedHistoryGroup) {
			return buildOpeningMessageHistoryKeyword(selectedHistoryGroup);
		}
		if (result) {
			return buildOpeningMessageFromAnalysis(result);
		}
		return historyGroups.length > 0 ? buildOpeningMessageHistoryOrSearch() : buildOpeningMessageNoResult();
	}

	$effect(() => {
		if (!panelOpen) return;
		if (messages.length > 0) return;
		const copy = openingAssistantCopy().trim();
		if (!copy) return;
		messages = [{ id: uid(), role: 'assistant', content: copy }];
		suggestionsCollapsed = false;
	});

	$effect(() => {
		if (!messages.length && !loading) return;
		void scrollToBottom();
	});

	function uid(): string {
		return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	async function scrollToBottom() {
		await tick();
		messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
	}

	function historyForRequest(msgs: ChatMsg[]): DashboardChatHistoryItem[] {
		return msgs
			.filter((m) => m.role === 'user' || m.role === 'assistant')
			.slice(-8)
			.map((m) => ({ role: m.role, content: m.content }));
	}

	async function sendQuestion(text: string) {
		const trimmed = text.trim();
		if (!trimmed || loading) return;
		if (!selectedHistoryGroup && !result) {
			error =
				'Run a search for a live snapshot, or choose a saved keyword below to chat from history.';
			return;
		}

		error = null;
		lastFailedQuestion = null;
		suggestionsCollapsed = true;
		messages = [...messages, { id: uid(), role: 'user', content: trimmed }];
		draft = '';
		loading = true;

		const prior = messages.slice(0, -1);
		const historyPayload = historyForRequest(prior);

		try {
			const res = selectedHistoryGroup
				? await postDashboardChat({
						question: trimmed,
						contextMode: 'history_keyword',
						groupKey: selectedHistoryGroup.groupKey,
						keyword: selectedHistoryGroup.groupKey,
						history: historyPayload,
						options: {
							keyword: selectedHistoryGroup.displayLabel,
							platformHint: platform,
						},
					})
				: await postDashboardChat({
						question: trimmed,
						contextMode: 'dashboard',
						analysis: analysisResultToChatPayload(result!),
						history: historyPayload,
						options: {
							keyword:
								result!.displayQuery?.trim() || query.trim() || result!.query,
							platformHint: platform,
							subKeywords: subKeywords.map((s) => s.trim()).filter(Boolean),
						},
					});
			const answer = sanitizeAssistantAnswer(res.answer, res.mode);
			messages = [
				...messages,
				{ id: uid(), role: 'assistant', content: answer || 'No answer returned.' },
			];
			suggestedChips = pickSuggestedChipsAfterResponse({
				followupSuggestions: res.followupSuggestions,
				usedComparisonContext: res.usedComparisonContext,
				hasDashboardResult: result != null,
				historyKeywordSelected: selectedHistoryGroup != null,
			});
			if (res.usedComparisonContext) {
				suggestionsCollapsed = false;
			}
		} catch (e) {
			lastFailedQuestion = trimmed;
			if (e instanceof ReviewsApiError) {
				error = e.message;
			} else if (e instanceof Error) {
				error = e.message;
			} else {
				error = 'Something went wrong.';
			}
		} finally {
			loading = false;
		}
	}

	async function retryLast() {
		const q = lastFailedQuestion;
		if (!q || (!result && !selectedHistoryGroup)) return;
		error = null;
		const last = messages[messages.length - 1];
		if (last?.role === 'user' && last.content === q) {
			messages = messages.slice(0, -1);
		}
		lastFailedQuestion = null;
		await sendQuestion(q);
	}

	function onChipClick(chip: string) {
		if (!canChat) return;
		void sendQuestion(chip);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.shiftKey) return;
		e.preventDefault();
		void sendQuestion(draft);
	}

	function togglePanel() {
		panelOpen = !panelOpen;
	}

	function selectDashboardContext() {
		selectedHistoryGroup = null;
	}

	function selectHistoryGroup(g: KeywordHistoryGroup) {
		selectedHistoryGroup = g;
	}

	function closePanel() {
		panelOpen = false;
	}
</script>

<!-- Floating assistant — below Insights (200) / Alerts drawer (196) -->
<div
	class="pointer-events-none fixed bottom-0 right-0 z-[90]"
	aria-hidden={!panelOpen}
>
	<div class="pointer-events-auto flex flex-col items-end gap-3 p-4 pb-5 md:p-5 md:pb-6">
		{#if panelOpen}
			<div
				class="relative flex flex-col overflow-hidden rounded-3xl border border-sky-500/15 bg-gradient-to-b from-[#121a24]/98 to-[#0c1018]/98 shadow-[0_24px_64px_-20px_rgba(0,0,0,0.75),0_0_0_1px_rgba(56,189,248,0.08)] backdrop-blur-xl"
				style={panelInlineStyle}
				role="dialog"
				aria-label="Dashboard assistant chat"
				aria-modal="false"
			>
				<header
					class="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0f141c]/80 px-4 py-3.5"
				>
					<div class="flex min-w-0 flex-1 items-center gap-3">
						<div
							class="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-sky-500/20 to-sky-900/30 p-[2px] ring-2 ring-sky-400/30 shadow-[0_10px_22px_-6px_rgba(0,0,0,0.65),0_0_20px_-8px_rgba(56,189,248,0.35)]"
							aria-hidden="true"
						>
							<div class="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#0a1018]">
								<img
									src={chatAvatarSrc}
									alt=""
									width="112"
									height="112"
									class="h-[88%] w-[88%] object-contain object-center [filter:drop-shadow(0_6px_10px_rgba(0,0,0,0.55))]"
									draggable="false"
								/>
							</div>
						</div>
						<div class="min-w-0">
							<h2 class="text-[15px] font-semibold tracking-tight text-zinc-50">Brand Assistant</h2>
							<p class="mt-0.5 text-[11px] leading-snug text-zinc-500">
								{#if result}
									<span class="text-emerald-400/85">●</span> Online · Ready
									<span class="text-zinc-600"> · </span>
									<span class="text-zinc-500">Live snapshot</span>
								{:else if selectedHistoryGroup}
									<span class="text-emerald-400/85">●</span> Online · History · {selectedHistoryGroup.displayLabel}
								{:else}
									<span class="text-emerald-400/85">●</span> Online · Pick a saved keyword or run a search
								{/if}
							</p>
						</div>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<button
							type="button"
							class="rounded-lg px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
							onclick={resetPanelSize}
							aria-label="Reset panel size"
						>
							Reset
						</button>
						<button
							type="button"
							class="rounded-xl p-2 text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
							onclick={closePanel}
							aria-label="Minimize chat"
						>
							<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M6 12h12"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
							</svg>
						</button>
					</div>
				</header>

				{#if historyGroupsError}
					<p class="border-b border-white/[0.05] px-4 py-2 text-[11px] text-amber-200/90">
						{historyGroupsError}
					</p>
				{:else if historyGroups.length > 0}
					<div
						class="shrink-0 border-b border-white/[0.05] bg-black/20 px-4 py-2.5"
						aria-label="Chat context source"
					>
						<p class="text-[10px] font-medium uppercase tracking-wide text-zinc-600">Context</p>
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#if result}
								<button
									type="button"
									class="rounded-lg border px-2.5 py-1 text-[11px] transition {selectedHistoryGroup ===
									null
										? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
										: 'border-zinc-800/90 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'}"
									onclick={selectDashboardContext}
								>
									Current results
								</button>
							{/if}
							{#each historyGroups as g (g.groupKey)}
								<button
									type="button"
									class="max-w-[11rem] truncate rounded-lg border px-2.5 py-1 text-left text-[11px] transition {selectedHistoryGroup
										?.groupKey === g.groupKey
										? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
										: 'border-zinc-800/90 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'}"
									onclick={() => selectHistoryGroup(g)}
									title="{g.runCount} run(s) — {g.displayLabel}"
								>
									{g.displayLabel}
									<span class="text-zinc-600"> · {g.runCount}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<div
					bind:this={messagesEl}
					class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#0a0e14]/50 px-4 py-4"
				>
					{#each messages as m (m.id)}
						<div
							class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}"
						>
							<div
								class="max-w-[88%] rounded-[1.15rem] px-3.5 py-2.5 text-[13px] leading-relaxed {m.role ===
								'user'
									? 'rounded-br-md bg-sky-600/35 text-sky-50 ring-1 ring-sky-400/25 shadow-sm'
									: 'rounded-bl-md bg-[#151c28]/95 text-zinc-200 ring-1 ring-white/[0.08] shadow-sm'}"
							>
								{#each m.content.split('\n') as line, i (i)}
									<p
										class="whitespace-pre-wrap break-words [word-break:break-word] last:mb-0 {line.trim() === ''
											? 'min-h-[0.5rem]'
											: ''}"
									>
										{line}
									</p>
								{/each}
							</div>
						</div>
					{/each}

					{#if loading}
						<div class="flex justify-start">
							<div
								class="flex items-center gap-2 rounded-[1.15rem] rounded-bl-md bg-[#151c28]/95 px-3.5 py-2.5 ring-1 ring-white/[0.08]"
								role="status"
								aria-live="polite"
							>
								<span class="inline-flex gap-1" aria-hidden="true">
									<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/70"></span>
									<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/70 [animation-delay:150ms]"></span>
									<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/70 [animation-delay:300ms]"></span>
								</span>
								<span class="text-xs text-zinc-500">Thinking…</span>
							</div>
						</div>
					{/if}

					{#if error}
						<div
							class="rounded-xl border border-red-500/25 bg-red-950/40 px-3.5 py-2.5 text-[13px] text-red-200/95"
							role="alert"
						>
							<p>{error}</p>
							{#if lastFailedQuestion}
								<button
									type="button"
									class="mt-2 text-xs font-medium text-emerald-400/90 underline-offset-2 hover:underline"
									onclick={() => void retryLast()}
								>
									Retry
								</button>
							{/if}
						</div>
					{/if}
				</div>

				{#if suggestedChips.length > 0 && !loading}
					<div class="shrink-0 border-t border-white/[0.06] bg-[#0f141c]/60 px-3 py-2.5">
						<button
							type="button"
							id="suggested-questions-toggle"
							class="group flex w-full min-h-[28px] items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-zinc-900/50"
							onclick={() => (suggestionsCollapsed = !suggestionsCollapsed)}
							aria-expanded={!suggestionsCollapsed}
							aria-controls="suggested-chips-region"
						>
							<span
								class="text-[11px] font-medium text-zinc-500 group-hover:text-zinc-400"
							>
								Suggested questions
								<span class="tabular-nums text-zinc-600" aria-hidden="true"> ↑</span>
							</span>
							<span class="flex h-7 w-7 shrink-0 items-center justify-center text-zinc-500 transition-colors group-hover:text-zinc-400" aria-hidden="true">
								<svg
									class="h-3.5 w-3.5 transition-transform duration-200 ease-out {suggestionsCollapsed
										? ''
										: 'rotate-90'}"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M9 18l6-6-6-6"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</span>
						</button>
						<div
							id="suggested-chips-region"
							class="grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out {suggestionsCollapsed
								? 'grid-rows-[0fr]'
								: 'grid-rows-[1fr]'}"
						>
							<div class="min-h-0">
								<div
									class="flex flex-wrap gap-1.5 pt-1.5 transition-opacity duration-200 ease-out {suggestionsCollapsed
										? 'pointer-events-none opacity-0'
										: 'opacity-100'}"
								>
									{#each suggestedChips as chip (chip)}
										<button
											type="button"
											class="max-w-full rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-3.5 py-2 text-left text-[11px] font-medium leading-snug text-sky-100/95 shadow-sm transition hover:border-sky-400/35 hover:bg-sky-500/15 hover:shadow-[0_0_16px_-8px_rgba(56,189,248,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
											disabled={loading || !canChat}
											onclick={() => onChipClick(chip)}
										>
											{chip}
										</button>
									{/each}
								</div>
							</div>
						</div>
					</div>
				{/if}

				<div class="shrink-0 border-t border-white/[0.06] bg-[#0c1018]/90 p-3">
					<div class="flex items-end gap-2">
						<textarea
							bind:value={draft}
							onkeydown={onKeydown}
							rows="2"
							placeholder={selectedHistoryGroup
								? 'Ask what changed, what improved, or what to fix…'
								: result
									? 'Message…'
									: historyGroups.length > 0
										? 'Select a keyword above, then ask…'
										: 'Run a search to enable chat…'}
							disabled={loading}
							class="min-h-[48px] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-[#121820]/90 px-3.5 py-2.5 text-[13px] leading-snug text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none focus:ring-2 focus:ring-sky-500/15 disabled:opacity-50"
						></textarea>
						<button
							type="button"
							class="shrink-0 rounded-2xl bg-gradient-to-b from-sky-500 to-sky-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(56,189,248,0.55)] transition hover:from-sky-400 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={loading ||
								!draft.trim() ||
								(!selectedHistoryGroup && !result)}
							onclick={() => void sendQuestion(draft)}
						>
							Send
						</button>
					</div>
					<p class="mt-2 text-[10px] text-zinc-600">
						Enter to send · Shift+Enter for a new line · Session only
					</p>
				</div>
				<!-- Resize hit areas (inside panel edges for better usability near viewport boundary). -->
				<div role="presentation" aria-hidden="true" class="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize" onmousedown={(e) => startResize(e, 'e')}></div>
				<div role="presentation" aria-hidden="true" class="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize" onmousedown={(e) => startResize(e, 'w')}></div>
				<div role="presentation" aria-hidden="true" class="absolute inset-x-0 bottom-0 z-20 h-2 cursor-ns-resize" onmousedown={(e) => startResize(e, 's')}></div>
				<div role="presentation" aria-hidden="true" class="absolute inset-x-0 top-0 z-20 h-2 cursor-ns-resize" onmousedown={(e) => startResize(e, 'n')}></div>
				<div role="presentation" aria-hidden="true" class="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-nwse-resize" onmousedown={(e) => startResize(e, 'se')}></div>
				<div role="presentation" aria-hidden="true" class="absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize" onmousedown={(e) => startResize(e, 'sw')}></div>
				<div role="presentation" aria-hidden="true" class="absolute top-0 right-0 z-20 h-3 w-3 cursor-nesw-resize" onmousedown={(e) => startResize(e, 'ne')}></div>
				<div role="presentation" aria-hidden="true" class="absolute top-0 left-0 z-20 h-3 w-3 cursor-nwse-resize" onmousedown={(e) => startResize(e, 'nw')}></div>
			</div>
		{/if}

		<div class="flex max-w-[min(100vw-2rem,22rem)] items-end justify-end gap-3">
			{#if !panelOpen}
				<div
					class="pointer-events-none mb-3 max-w-[11rem] rounded-2xl rounded-br-md border border-sky-500/15 bg-[#121a24]/95 px-3.5 py-2.5 text-xs leading-snug text-zinc-300 shadow-lg shadow-black/50 ring-1 ring-white/[0.06]"
					aria-hidden="true"
				>
					I’m here to help
				</div>
			{/if}
			<button
				type="button"
				class="group relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-[#1a2433] to-[#121820] text-sky-200 shadow-[0_14px_36px_-8px_rgba(0,0,0,0.75),0_8px_24px_-6px_rgba(56,189,248,0.18)] ring-2 ring-sky-500/35 transition hover:ring-sky-400/50 animate-[fabBreathe_4s_ease-in-out_infinite]"
				onclick={togglePanel}
				aria-label={panelOpen ? 'Close assistant' : 'Open assistant'}
				aria-expanded={panelOpen}
			>
				<span
					class="pointer-events-none absolute inset-0 rounded-full bg-sky-400/10 opacity-0 transition group-hover:opacity-100"
					aria-hidden="true"
				></span>
				{#if panelOpen}
					<svg class="relative z-[1] h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M6 18L18 6M6 6l12 12"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				{:else}
					<img
						src={chatAvatarSrc}
						alt=""
						width="144"
						height="144"
						class="relative z-[1] h-[78%] w-[78%] object-contain object-center [filter:drop-shadow(0_10px_18px_rgba(0,0,0,0.6))_drop-shadow(0_4px_10px_rgba(56,189,248,0.12))]"
						draggable="false"
					/>
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	@keyframes fabBreathe {
		0%,
		100% {
			box-shadow:
				0 12px 40px -12px rgba(0, 0, 0, 0.7),
				0 0 0 1px rgba(56, 189, 248, 0.2);
		}
		50% {
			box-shadow:
				0 14px 44px -10px rgba(0, 0, 0, 0.65),
				0 0 28px -8px rgba(56, 189, 248, 0.35);
		}
	}
</style>

