import { decodeImageInWorker, type DecodeResult } from '$lib/workers/imageDecoderManager';

type BitmapStatus = 'pending' | 'ready' | 'error';

export interface BitmapCacheEntry {
	url: string;
	status: BitmapStatus;
	bitmap: ImageBitmap | null;
	width: number;
	height: number;
	pixels: number;
	lastUsed: number;
	promise: Promise<BitmapCacheEntry>;
	error?: unknown;
}

const MAX_BITMAP_ITEMS = 5;
const MAX_BITMAP_PIXELS = 60_000_000;
const BACKGROUND_BITMAP_CONCURRENCY = 1;

const bitmapCache = new Map<string, BitmapCacheEntry>();
const backgroundQueue: string[] = [];
const backgroundQueueSet = new Set<string>();
let activeBackgroundDecodes = 0;

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function closeBitmap(entry: BitmapCacheEntry): void {
	entry.bitmap?.close();
	entry.bitmap = null;
}

function trimBitmapCache(): void {
	const readyEntries = Array.from(bitmapCache.values()).filter((entry) => entry.status === 'ready');
	let readyPixels = readyEntries.reduce((total, entry) => total + entry.pixels, 0);
	const oldestFirst = readyEntries.sort((a, b) => a.lastUsed - b.lastUsed);

	for (const entry of oldestFirst) {
		if (bitmapCache.size <= MAX_BITMAP_ITEMS && readyPixels <= MAX_BITMAP_PIXELS) {
			break;
		}

		if (!bitmapCache.delete(entry.url)) {
			continue;
		}
		readyPixels -= entry.pixels;
		closeBitmap(entry);
	}

	for (const entry of Array.from(bitmapCache.values())) {
		if (entry.status === 'error') {
			bitmapCache.delete(entry.url);
			closeBitmap(entry);
		}
	}
}

async function fetchAndDecodeBitmap(url: string): Promise<DecodeResult> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status}`);
	}
	const blob = await response.blob();
	return decodeImageInWorker(blob);
}

export function getBitmapCacheEntry(url: string): BitmapCacheEntry | null {
	const entry = bitmapCache.get(url);
	if (!entry || entry.status !== 'ready' || !entry.bitmap) {
		return null;
	}
	entry.lastUsed = now();
	return entry;
}

export function preloadBitmap(url: string): Promise<BitmapCacheEntry> {
	const cached = bitmapCache.get(url);
	if (cached) {
		cached.lastUsed = now();
		return cached.promise;
	}

	const entry: BitmapCacheEntry = {
		url,
		status: 'pending',
		bitmap: null,
		width: 0,
		height: 0,
		pixels: 0,
		lastUsed: now(),
		promise: Promise.resolve(null as unknown as BitmapCacheEntry)
	};

	entry.promise = fetchAndDecodeBitmap(url)
		.then((result) => {
			entry.status = 'ready';
			entry.bitmap = result.bitmap;
			entry.width = result.width;
			entry.height = result.height;
			entry.pixels = result.width * result.height;
			entry.lastUsed = now();
			trimBitmapCache();
			return entry;
		})
		.catch((error) => {
			entry.status = 'error';
			entry.error = error;
			trimBitmapCache();
			throw error;
		});

	bitmapCache.set(url, entry);
	return entry.promise;
}

function pumpBackgroundQueue(): void {
	if (activeBackgroundDecodes >= BACKGROUND_BITMAP_CONCURRENCY) {
		return;
	}

	const next = backgroundQueue.shift();
	if (!next) {
		return;
	}

	backgroundQueueSet.delete(next);
	if (bitmapCache.has(next)) {
		pumpBackgroundQueue();
		return;
	}

	activeBackgroundDecodes++;
	void preloadBitmap(next)
		.catch(() => {})
		.finally(() => {
			activeBackgroundDecodes--;
			pumpBackgroundQueue();
		});
}

export function enqueueBitmapPreload(url: string): void {
	if (!url || bitmapCache.has(url) || backgroundQueueSet.has(url)) {
		return;
	}

	backgroundQueue.push(url);
	backgroundQueueSet.add(url);
	pumpBackgroundQueue();
}

export function clearBitmapCache(): void {
	for (const entry of bitmapCache.values()) {
		closeBitmap(entry);
	}
	bitmapCache.clear();
	backgroundQueue.length = 0;
	backgroundQueueSet.clear();
	activeBackgroundDecodes = 0;
}
