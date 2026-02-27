import { getFileMetadata } from '$lib/api';
import { appState } from '$lib/core/state/appState';

interface FolderSizeCacheEntry {
	size: number;
	fetchedAt: number;
	modifiedHint?: number;
	lastAccessAt: number;
}

const STORAGE_KEY = 'neoview-folder-size-cache-v1';
const MAX_CACHE_ENTRIES = 800;
const FRESH_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 6 * 60 * 60 * 1000;
const NAVIGATION_DEFER_MS = 260;
const CONCURRENCY_LIMIT = 2;

const cache = new Map<string, FolderSizeCacheEntry>();
const inFlight = new Map<string, Promise<number>>();
const taskQueue: Array<() => void> = [];

let runningCount = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastPathChangeAt = 0;
let readingActive = false;

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

function scheduleSave() {
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveToStorage();
	}, 400);
}

function saveToStorage() {
	try {
		if (typeof localStorage === 'undefined') return;
		const payload = Array.from(cache.entries()).map(([path, entry]) => ({ path, ...entry }));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// ignore persistence errors
	}
}

function loadFromStorage() {
	try {
		if (typeof localStorage === 'undefined') return;
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return;

		const now = Date.now();
		for (const item of parsed) {
			if (!item || typeof item.path !== 'string' || typeof item.size !== 'number') continue;
			if (typeof item.fetchedAt !== 'number') continue;
			if (now - item.fetchedAt > STALE_TTL_MS) continue;

			cache.set(item.path, {
				size: item.size,
				fetchedAt: item.fetchedAt,
				modifiedHint: typeof item.modifiedHint === 'number' ? item.modifiedHint : undefined,
				lastAccessAt: typeof item.lastAccessAt === 'number' ? item.lastAccessAt : item.fetchedAt
			});
		}
	} catch {
		// ignore parse errors
	}
}

function pruneCache() {
	if (cache.size <= MAX_CACHE_ENTRIES) return;
	const entries = Array.from(cache.entries());
	entries.sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
	const removeCount = cache.size - MAX_CACHE_ENTRIES;
	for (let index = 0; index < removeCount; index += 1) {
		cache.delete(entries[index][0]);
	}
}

function isNavigationHot(): boolean {
	return Date.now() - lastPathChangeAt < NAVIGATION_DEFER_MS;
}

function runQueue() {
	while (runningCount < CONCURRENCY_LIMIT && taskQueue.length > 0) {
		const task = taskQueue.shift();
		if (!task) break;
		runningCount += 1;
		task();
	}
}

function enqueue<T>(taskFactory: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		taskQueue.push(() => {
			taskFactory()
				.then(resolve)
				.catch(reject)
				.finally(() => {
					runningCount = Math.max(0, runningCount - 1);
					runQueue();
				});
		});
		runQueue();
	});
}

function getEntryIfValid(path: string, modifiedHint?: number): FolderSizeCacheEntry | null {
	const key = normalizePath(path);
	const entry = cache.get(key);
	if (!entry) return null;

	const age = Date.now() - entry.fetchedAt;
	if (age > STALE_TTL_MS) {
		cache.delete(key);
		return null;
	}

	if (typeof modifiedHint === 'number' && typeof entry.modifiedHint === 'number') {
		if (modifiedHint !== entry.modifiedHint) {
			return null;
		}
	}

	entry.lastAccessAt = Date.now();
	return entry;
}

function setEntry(path: string, size: number, modifiedHint?: number) {
	const key = normalizePath(path);
	cache.set(key, {
		size,
		fetchedAt: Date.now(),
		modifiedHint,
		lastAccessAt: Date.now()
	});
	pruneCache();
	scheduleSave();
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

appState.subscribe(
	(state) => state.book.currentBookPath,
	(currentBookPath) => {
		readingActive = !!currentBookPath;
	}
);

loadFromStorage();

export function getCachedFolderSize(path: string, modifiedHint?: number): number | null {
	const entry = getEntryIfValid(path, modifiedHint);
	if (!entry) return null;

	const age = Date.now() - entry.fetchedAt;
	if (age > FRESH_TTL_MS) return null;

	return entry.size;
}

export function notifyFolderSizeNavigation(path: string): void {
	if (!path) return;
	lastPathChangeAt = Date.now();
}

export function setFolderSizeCache(path: string, size: number, modifiedHint?: number): void {
	setEntry(path, size, modifiedHint);
}

export async function getFolderSizeSmart(
	path: string,
	options?: { modifiedHint?: number; allowStale?: boolean }
): Promise<number> {
	const modifiedHint = options?.modifiedHint;
	const allowStale = options?.allowStale ?? true;

	const key = normalizePath(path);
	const fresh = getCachedFolderSize(path, modifiedHint);
	if (fresh !== null) return fresh;

	const staleEntry = getEntryIfValid(path, modifiedHint);

	// 阅读过程中禁止触发新的目录大小扫描，避免影响阅读流畅性。
	if (readingActive) {
		if (staleEntry) return staleEntry.size;
		return 0;
	}

	const existing = inFlight.get(key);
	if (existing) return existing;

	const request = enqueue(async () => {
		if (isNavigationHot()) {
			const remain = Math.max(0, NAVIGATION_DEFER_MS - (Date.now() - lastPathChangeAt));
			if (remain > 0) {
				await delay(remain);
			}
		}

		const metadata = await getFileMetadata(path);
		const size = metadata.size ?? 0;
		setEntry(path, size, metadata.modified ?? modifiedHint);
		return size;
	})
		.catch((error) => {
			if (allowStale && staleEntry) {
				return staleEntry.size;
			}
			throw error;
		})
		.finally(() => {
			inFlight.delete(key);
		});

	inFlight.set(key, request);
	return request;
}
