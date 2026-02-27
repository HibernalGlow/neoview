import { writable } from 'svelte/store';

const STORAGE_KEY = 'neoview-folder-tree-pins';

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

function loadPinnedPaths(): string[] {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((path): path is string => typeof path === 'string');
	} catch {
		return [];
	}
}

const { subscribe, set, update } = writable<string[]>(loadPinnedPaths());

function saveToStorage(paths: string[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
	} catch {
		// ignore storage errors
	}
}

export const folderTreePinStore = {
	subscribe,

	toggle(path: string): boolean {
		const key = normalizePath(path);
		let nextPinned = false;

		update((paths) => {
			const exists = paths.some((p) => p === key);
			nextPinned = !exists;
			const next = exists ? paths.filter((p) => p !== key) : [...paths, key];
			saveToStorage(next);
			return next;
		});

		return nextPinned;
	},

	isPinned(path: string): boolean {
		const key = normalizePath(path);
		let pinned = false;
		subscribe((paths) => {
			pinned = paths.some((p) => p === key);
		})();
		return pinned;
	},

	getPinnedPathSet(): Set<string> {
		let setValue = new Set<string>();
		subscribe((paths) => {
			setValue = new Set(paths);
		})();
		return setValue;
	},

	clear() {
		set([]);
		saveToStorage([]);
	}
};
