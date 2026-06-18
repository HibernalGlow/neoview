type ImageFetchPriority = 'high' | 'low' | 'auto';
type DecodeStatus = 'pending' | 'decoded' | 'error';

export interface DecodedImageEntry {
	url: string;
	image: HTMLImageElement;
	status: DecodeStatus;
	width: number;
	height: number;
	pixels: number;
	lastUsed: number;
	promise: Promise<DecodedImageEntry>;
	error?: unknown;
}

interface PredecodeOptions {
	priority?: ImageFetchPriority;
}

const MAX_DECODED_ITEMS = 8;
const MAX_DECODED_PIXELS = 90_000_000;
const BACKGROUND_DECODE_CONCURRENCY = 2;

const decodedImageCache = new Map<string, DecodedImageEntry>();
const backgroundQueue: Array<{ url: string; priority: ImageFetchPriority }> = [];
const backgroundQueueSet = new Set<string>();
let activeBackgroundDecodes = 0;

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function setFetchPriority(image: HTMLImageElement, priority: ImageFetchPriority): void {
	(image as HTMLImageElement & { fetchPriority?: ImageFetchPriority }).fetchPriority = priority;
}

function releaseEntry(entry: DecodedImageEntry): void {
	entry.image.onload = null;
	entry.image.onerror = null;
	entry.image.src = '';
}

function trimDecodedImageCache(): void {
	const decodedEntries = Array.from(decodedImageCache.values()).filter(
		(entry) => entry.status === 'decoded'
	);
	let decodedPixels = decodedEntries.reduce((total, entry) => total + entry.pixels, 0);

	const oldestFirst = decodedEntries.sort((a, b) => a.lastUsed - b.lastUsed);
	for (const entry of oldestFirst) {
		if (decodedImageCache.size <= MAX_DECODED_ITEMS && decodedPixels <= MAX_DECODED_PIXELS) {
			break;
		}
		if (!decodedImageCache.delete(entry.url)) {
			continue;
		}
		decodedPixels -= entry.pixels;
		releaseEntry(entry);
	}

	for (const entry of Array.from(decodedImageCache.values())) {
		if (entry.status === 'error') {
			decodedImageCache.delete(entry.url);
			releaseEntry(entry);
		}
	}
}

async function decodeImageElement(image: HTMLImageElement, url: string): Promise<void> {
	image.src = url;

	if (typeof image.decode === 'function') {
		try {
			await image.decode();
			return;
		} catch (error) {
			if (image.complete && image.naturalWidth > 0) {
				return;
			}
			throw error;
		}
	}

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
	});
}

export function getDecodedImageEntry(url: string): DecodedImageEntry | null {
	const entry = decodedImageCache.get(url);
	if (!entry || entry.status !== 'decoded') {
		return null;
	}
	entry.lastUsed = now();
	return entry;
}

export function predecodeImage(
	url: string,
	options: PredecodeOptions = {}
): Promise<DecodedImageEntry> {
	const cached = decodedImageCache.get(url);
	if (cached) {
		cached.lastUsed = now();
		return cached.promise;
	}

	if (typeof Image === 'undefined') {
		return Promise.reject(new Error('Image predecode is only available in the browser'));
	}

	const image = new Image();
	image.decoding = 'async';
	setFetchPriority(image, options.priority ?? 'auto');

	const entry: DecodedImageEntry = {
		url,
		image,
		status: 'pending',
		width: 0,
		height: 0,
		pixels: 0,
		lastUsed: now(),
		promise: Promise.resolve(null as unknown as DecodedImageEntry)
	};

	entry.promise = decodeImageElement(image, url)
		.then(() => {
			entry.status = 'decoded';
			entry.width = image.naturalWidth || image.width || 0;
			entry.height = image.naturalHeight || image.height || 0;
			entry.pixels = entry.width * entry.height;
			entry.lastUsed = now();
			trimDecodedImageCache();
			return entry;
		})
		.catch((error) => {
			entry.status = 'error';
			entry.error = error;
			trimDecodedImageCache();
			throw error;
		});

	decodedImageCache.set(url, entry);
	return entry.promise;
}

function pumpBackgroundQueue(): void {
	if (activeBackgroundDecodes >= BACKGROUND_DECODE_CONCURRENCY) {
		return;
	}

	const next = backgroundQueue.shift();
	if (!next) {
		return;
	}

	backgroundQueueSet.delete(next.url);
	if (decodedImageCache.has(next.url)) {
		pumpBackgroundQueue();
		return;
	}

	activeBackgroundDecodes++;
	void predecodeImage(next.url, { priority: next.priority })
		.catch(() => {})
		.finally(() => {
			activeBackgroundDecodes--;
			pumpBackgroundQueue();
		});

	pumpBackgroundQueue();
}

export function enqueueImagePredecode(url: string, priority: ImageFetchPriority = 'low'): void {
	if (!url || decodedImageCache.has(url) || backgroundQueueSet.has(url)) {
		return;
	}

	backgroundQueue.push({ url, priority });
	backgroundQueueSet.add(url);
	pumpBackgroundQueue();
}

export function clearImageDecodeCache(): void {
	for (const entry of decodedImageCache.values()) {
		releaseEntry(entry);
	}
	decodedImageCache.clear();
	backgroundQueue.length = 0;
	backgroundQueueSet.clear();
	activeBackgroundDecodes = 0;
}
