import { writable } from 'svelte/store';

/** Vertical scroll offset (window) for command bar fade and sidebar brand scale. */
export const mainScrollY = writable(0);
