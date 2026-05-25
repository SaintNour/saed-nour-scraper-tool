import { writable } from 'svelte/store';
import type { PlatformId } from '$lib/types/analysis';
import { DEFAULT_PLATFORM } from '$lib/types/analysis';

/** Shared platform selection (sidebar + dashboard API calls). */
export const dashboardPlatform = writable<PlatformId>(DEFAULT_PLATFORM);
