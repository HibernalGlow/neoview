/**
 * Shared scroll position cache for virtualized file lists.
 * This is a plain JS Map to avoid Svelte store reactivity overhead during scroll.
 */
export const globalScrollPositions = new Map<string, number>();
