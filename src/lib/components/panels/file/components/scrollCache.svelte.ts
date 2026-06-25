import { SvelteMap } from 'svelte/reactivity';

/**
 * Shared scroll position cache for virtualized file lists.
 * This is a plain JS Map to avoid Svelte store reactivity overhead during scroll.
 */
export const globalScrollPositions = new Map<string, number>();

/**
 * Shared aspect ratio cache for grid thumbnail layout.
 * Using SvelteMap to enable reactive grid resizing when thumbnails load.
 */
export const globalImageAspectRatios = new SvelteMap<string, number>();
