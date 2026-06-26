/**
 * StackView 图片状态管理
 * 【后端主导架构】展示态 store
 *
 * 职责：
 * - 请求后端 frame snapshot
 * - 在 ready 时替换 currentFrame
 * - 保留 previousFrame 直到新 frame ready（双缓冲）
 * - 向 UI 暴露状态
 *
 * 不再负责：
 * - 预解码
 * - ImageBitmap 缓存调度
 * - Blob 缓存调度
 * - dimensions 探测主链
 * - preload 策略
 * - frame 组合逻辑
 * - second page 判断
 * - 后台背景色计算
 */

import { bookStore } from '$lib/stores/book.svelte';
import {
	getFrameSnapshot,
	getReaderWindow,
	reportViewport,
	triggerPreload,
	type FrameSnapshot,
	type FrameImageInfo,
	type GetFrameSnapshotParams,
	type ReaderWindow
} from '$lib/api/frameApi';
import { settingsManager } from '$lib/settings/settingsManager';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import type { Frame, FrameImage, FrameLayout } from '../types/frame';
import { emptyFrame } from '../types/frame';
import {
	clearBitmapCache,
	enqueueBitmapPreload,
	getBitmapCacheEntry,
	preloadBitmap
} from '../utils/bitmapPreloader';
import {
	clearQueuedImagePredecodes,
	clearImageDecodeCache,
	enqueueImagePredecode,
	getDecodedImageEntry,
	prependImagePredecodes,
	predecodeImage,
	setHotImageDecodeUrls,
	type ImageFetchPriority
} from '../utils/imageDecodePreloader';
import { getDisplayProxyCandidate } from '../utils/displayProxyUrl';

// ============================================================================
// URL 平台适配（Windows 需要 http://neoview.localhost）
// ============================================================================

const PROTOCOL_BASE = (() => {
	if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) {
		return 'http://neoview.localhost';
	}
	return 'neoview://localhost';
})();

function fixUrl(url: string): string {
	if (!url) return url;
	if (PROTOCOL_BASE !== 'neoview://localhost' && url.startsWith('neoview://localhost')) {
		return PROTOCOL_BASE + url.slice('neoview://localhost'.length);
	}
	return url;
}

const PRELOAD_WINDOW_CACHE_LIMIT = 96;
const PRELOAD_WINDOW_REFRESH_MS = 5_000;
const FRAME_READY_WAIT_BASE_TIMEOUT_MS = 900;
const FRAME_READY_WAIT_EXTRA_PER_IMAGE_MS = 300;
const FRAME_READY_WAIT_MAX_TIMEOUT_MS = 1_600;
const IMG_READY_WAIT_BASE_TIMEOUT_MS = 220;
const IMG_READY_WAIT_EXTRA_PER_IMAGE_MS = 120;
const IMG_READY_WAIT_MAX_TIMEOUT_MS = 520;
const FRAME_PERF_SAMPLE_LIMIT = 160;
const IMG_PREDECODE_MAX_PIXELS = 6_000_000;
const IMG_HOT_PREDECODE_DISTANCE = 2;
const READER_PERF_DEBUG = false;
const preloadedWindowTimestamps = new Map<string, number>();
const preloadedWindowQueue: string[] = [];

interface DisplayPreloadContext {
	scale: number;
	dpr: number;
}

function debugReaderPerf(getMessage: () => string): void {
	if (READER_PERF_DEBUG) {
		console.debug(getMessage());
	}
}

function rememberWindowPreload(value: string): boolean {
	const timestamp = Date.now();
	const lastTimestamp = preloadedWindowTimestamps.get(value);
	if (typeof lastTimestamp === 'number' && timestamp - lastTimestamp < PRELOAD_WINDOW_REFRESH_MS) {
		return false;
	}

	if (!preloadedWindowTimestamps.has(value)) {
		preloadedWindowQueue.push(value);
	}
	preloadedWindowTimestamps.set(value, timestamp);

	while (preloadedWindowQueue.length > PRELOAD_WINDOW_CACHE_LIMIT) {
		const oldValue = preloadedWindowQueue.shift();
		if (oldValue) preloadedWindowTimestamps.delete(oldValue);
	}

	return true;
}

function makeWindowPreloadKey(
	bookPath: string,
	centerPage: number,
	radius: number,
	params: GetFrameSnapshotParams,
	direction: PreloadDirection,
	displayContext: DisplayPreloadContext
): string {
	return JSON.stringify({
		bookPath,
		centerPage,
		radius,
		direction,
		pageMode: params.pageMode,
		readOrder: params.readOrder,
		splitHorizontal: params.splitHorizontal,
		widePage: params.widePage,
		singleFirst: params.singleFirst,
		singleLast: params.singleLast,
		divideRate: params.divideRate,
		splitHalf: params.splitHalf ?? null,
		displayScale: Math.round(displayContext.scale * 1000),
		dpr: Math.round(displayContext.dpr * 100)
	});
}

function getPreloadRadius(): number {
	const configured = settingsManager.getSettings().performance?.preLoadSize ?? 3;
	return Math.min(8, Math.max(1, Math.round(configured)));
}

interface PreloadUrlEntry {
	url: string;
	priority: ImageFetchPriority;
	distance: number;
	rank: number;
	pixels: number;
	scaledProxy: boolean;
}

type PreloadDirection = 'forward' | 'backward' | 'neutral';

export interface ReaderPreloadStats {
	windowRequests: number;
	queuedScaledProxy: number;
	queuedOriginal: number;
	lastEntryCount: number;
	lastScaledProxyCount: number;
	lastOriginalCount: number;
	lastDirection: PreloadDirection;
	lastDisplayScale: number;
	lastDpr: number;
	lastUpdatedAt: number | null;
}

export interface FramePerformanceSample {
	id: number;
	bookPath: string;
	pageIndex: number;
	layout: FrameSnapshot['layout'];
	imageCount: number;
	direction: PreloadDirection;
	resourceReadyMs: number;
	decodeWaitMs: number;
	commitMs: number;
	totalBeforeCommitMs: number;
	paintAfterCommitMs?: number;
	decodeTotal: number;
	decodeFailed: number;
	decodeTimedOut: boolean;
	decodeSkipped: boolean;
}

export interface FramePerformanceStats {
	count: number;
	resourceReadyP50: number;
	resourceReadyP95: number;
	decodeWaitP50: number;
	decodeWaitP95: number;
	totalBeforeCommitP50: number;
	totalBeforeCommitP95: number;
	paintAfterCommitP95: number;
	timeoutCount: number;
	decodeSkippedCount: number;
	preload: ReaderPreloadStats;
	last?: FramePerformanceSample;
}

function getPreloadRank(
	pageIndex: number,
	centerPage: number,
	direction: PreloadDirection
): number {
	const delta = pageIndex - centerPage;
	const distance = Math.abs(delta);
	if (direction === 'neutral' || delta === 0 || distance <= IMG_HOT_PREDECODE_DISTANCE) {
		return distance;
	}
	const isPreferredDirection = direction === 'forward' ? delta > 0 : delta < 0;
	return distance + (isPreferredDirection ? 0 : 1000);
}

function getImagePreloadEntry(
	img: FrameImageInfo,
	displayContext: DisplayPreloadContext,
	priority: ImageFetchPriority,
	distance: number,
	rank: number
): PreloadUrlEntry | null {
	if (img.isDummy || !img.url) return null;
	const url = fixUrl(img.url);
	const sourceWidth =
		typeof img.width === 'number' && Number.isFinite(img.width) && img.width > 0 ? img.width : 0;
	const sourceHeight =
		typeof img.height === 'number' && Number.isFinite(img.height) && img.height > 0
			? img.height
			: 0;
	const pixels = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth * sourceHeight : 0;
	const frameScale = typeof img.scale === 'number' && Number.isFinite(img.scale) ? img.scale : 1;
	const splitFactor = img.splitHalf ? 2 : 1;
	const cssWidth = sourceWidth * frameScale * displayContext.scale * splitFactor;
	const cssHeight = sourceHeight * frameScale * displayContext.scale;
	const displayProxy = loadModeStore.isCanvasMode
		? null
		: getDisplayProxyCandidate({
				url,
				sourceWidth,
				sourceHeight,
				cssWidth,
				cssHeight,
				dpr: displayContext.dpr
			});

	return {
		url: displayProxy?.url ?? url,
		priority,
		distance,
		rank,
		pixels: displayProxy?.pixels ?? pixels,
		scaledProxy: !!displayProxy
	};
}

function rememberPreloadEntry(byUrl: Map<string, PreloadUrlEntry>, entry: PreloadUrlEntry): void {
	const existing = byUrl.get(entry.url);
	if (!existing || entry.rank < existing.rank || entry.distance < existing.distance) {
		byUrl.set(entry.url, entry);
	}
}

function collectPreloadUrls(
	window: ReaderWindow,
	currentFrameId: string,
	direction: PreloadDirection,
	displayContext: DisplayPreloadContext
): PreloadUrlEntry[] {
	const byUrl = new Map<string, PreloadUrlEntry>();

	for (const frame of window.frames) {
		if (frame.frameId === currentFrameId) continue;
		const distance = Math.abs(frame.pageIndex - window.centerPage);
		const rank = getPreloadRank(frame.pageIndex, window.centerPage, direction);
		const priority: ImageFetchPriority = rank <= 3 ? 'high' : 'low';

		for (const img of frame.images) {
			const entry = getImagePreloadEntry(img, displayContext, priority, distance, rank);
			if (entry) rememberPreloadEntry(byUrl, entry);
		}
	}

	return [...byUrl.values()].sort((a, b) => a.rank - b.rank || a.distance - b.distance);
}

function collectHotPreloadUrls(
	window: ReaderWindow,
	displayContext: DisplayPreloadContext
): PreloadUrlEntry[] {
	const byUrl = new Map<string, PreloadUrlEntry>();

	for (const frame of window.frames) {
		const distance = Math.abs(frame.pageIndex - window.centerPage);
		if (distance > IMG_HOT_PREDECODE_DISTANCE) continue;

		for (const img of frame.images) {
			const entry = getImagePreloadEntry(img, displayContext, 'high', distance, distance);
			if (entry) rememberPreloadEntry(byUrl, entry);
		}
	}

	return [...byUrl.values()].sort((a, b) => a.distance - b.distance || a.rank - b.rank);
}

function collectSnapshotPreloadUrls(
	snapshot: FrameSnapshot,
	displayContext: DisplayPreloadContext
): PreloadUrlEntry[] {
	const byUrl = new Map<string, PreloadUrlEntry>();
	for (const img of snapshot.images) {
		const entry = getImagePreloadEntry(img, displayContext, 'high', 0, 0);
		if (entry) rememberPreloadEntry(byUrl, entry);
	}
	return [...byUrl.values()];
}

function usableImgPredecodeUrls(entries: PreloadUrlEntry[]): string[] {
	if (loadModeStore.isCanvasMode) return [];
	return entries
		.filter((entry) => entry.pixels <= IMG_PREDECODE_MAX_PIXELS)
		.map((entry) => entry.url);
}

function warmHotImageUrls(entries: PreloadUrlEntry[]): void {
	const urls = usableImgPredecodeUrls(entries);
	clearQueuedImagePredecodes();
	setHotImageDecodeUrls(urls);
	prependImagePredecodes(urls, 'high');
}

function preloadImageUrl(url: string, priority: ImageFetchPriority, pixels = 0): void {
	if (loadModeStore.isCanvasMode) {
		enqueueBitmapPreload(url);
	} else {
		if (pixels > IMG_PREDECODE_MAX_PIXELS) return;
		enqueueImagePredecode(url, priority);
	}
}

function getFrameReadyWaitTimeout(
	totalImages: number,
	canvasMode = loadModeStore.isCanvasMode
): number {
	if (!canvasMode) {
		return Math.min(
			IMG_READY_WAIT_MAX_TIMEOUT_MS,
			IMG_READY_WAIT_BASE_TIMEOUT_MS +
				Math.max(0, totalImages - 1) * IMG_READY_WAIT_EXTRA_PER_IMAGE_MS
		);
	}

	return Math.min(
		FRAME_READY_WAIT_MAX_TIMEOUT_MS,
		FRAME_READY_WAIT_BASE_TIMEOUT_MS +
			Math.max(0, totalImages - 1) * FRAME_READY_WAIT_EXTRA_PER_IMAGE_MS
	);
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
	return sorted[index];
}

function roundMs(value: number): number {
	return Number(value.toFixed(1));
}

// ============================================================================
// 类型定义
// ============================================================================

export interface ImageState {
	/** 当前帧快照（后端输出） */
	currentFrame: FrameSnapshot | null;
	/** 上一帧快照（双缓冲，翻页时保留直到新帧 ready） */
	previousFrame: FrameSnapshot | null;
	/** 是否正在加载 */
	loading: boolean;
	/** 错误信息 */
	error: string | null;
}

// ============================================================================
// 创建图片 Store
// ============================================================================

export function createImageStore() {
	const state = $state<ImageState>({
		currentFrame: null,
		previousFrame: null,
		loading: false,
		error: null
	});

	let lastBookPath: string | null = null;
	let pendingRequestToken = 0;
	let framePerformanceSequence = 0;
	let displayPreloadContext: DisplayPreloadContext = { scale: 1, dpr: 1 };
	let lastPreloadQueueDirection: PreloadDirection = 'neutral';
	const framePerformanceSamples: FramePerformanceSample[] = [];
	const preloadStats: ReaderPreloadStats = {
		windowRequests: 0,
		queuedScaledProxy: 0,
		queuedOriginal: 0,
		lastEntryCount: 0,
		lastScaledProxyCount: 0,
		lastOriginalCount: 0,
		lastDirection: 'neutral',
		lastDisplayScale: 1,
		lastDpr: 1,
		lastUpdatedAt: null
	};

	function setDisplayPreloadContext(context: Partial<DisplayPreloadContext>): void {
		const scale =
			Number.isFinite(context.scale) && context.scale && context.scale > 0
				? context.scale
				: displayPreloadContext.scale;
		const dpr =
			Number.isFinite(context.dpr) && context.dpr && context.dpr > 0
				? context.dpr
				: displayPreloadContext.dpr;
		displayPreloadContext = {
			scale: Math.max(0.01, scale),
			dpr: Math.max(1, dpr)
		};
	}

	function recordFramePerformance(sample: Omit<FramePerformanceSample, 'id'>): void {
		const entry: FramePerformanceSample = {
			...sample,
			id: ++framePerformanceSequence
		};
		framePerformanceSamples.push(entry);
		if (framePerformanceSamples.length > FRAME_PERF_SAMPLE_LIMIT) {
			framePerformanceSamples.shift();
		}

		const commitEndTime = performance.now();
		const updatePaintMetric = (paintTime: number) => {
			entry.paintAfterCommitMs = paintTime - commitEndTime;
		};

		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(() => updatePaintMetric(performance.now()));
		}

		const shouldLogSlowFrame =
			entry.decodeTimedOut || entry.totalBeforeCommitMs > 500 || entry.decodeWaitMs > 300;
		if (shouldLogSlowFrame) {
			debugReaderPerf(
				() =>
					`[imageStore][perf] page=${entry.pageIndex} dir=${entry.direction} resource=${entry.resourceReadyMs.toFixed(1)} decode=${entry.decodeWaitMs.toFixed(1)} total=${entry.totalBeforeCommitMs.toFixed(1)}${entry.decodeTimedOut ? ' timedOut=true' : ''}`
			);
		}
	}

	function getPerformanceStats(): FramePerformanceStats {
		const resourceReady = framePerformanceSamples.map((sample) => sample.resourceReadyMs);
		const decodeWait = framePerformanceSamples.map((sample) => sample.decodeWaitMs);
		const totalBeforeCommit = framePerformanceSamples.map((sample) => sample.totalBeforeCommitMs);
		const paintAfterCommit = framePerformanceSamples
			.map((sample) => sample.paintAfterCommitMs)
			.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

		return {
			count: framePerformanceSamples.length,
			resourceReadyP50: roundMs(percentile(resourceReady, 0.5)),
			resourceReadyP95: roundMs(percentile(resourceReady, 0.95)),
			decodeWaitP50: roundMs(percentile(decodeWait, 0.5)),
			decodeWaitP95: roundMs(percentile(decodeWait, 0.95)),
			totalBeforeCommitP50: roundMs(percentile(totalBeforeCommit, 0.5)),
			totalBeforeCommitP95: roundMs(percentile(totalBeforeCommit, 0.95)),
			paintAfterCommitP95: roundMs(percentile(paintAfterCommit, 0.95)),
			timeoutCount: framePerformanceSamples.filter((sample) => sample.decodeTimedOut).length,
			decodeSkippedCount: framePerformanceSamples.filter((sample) => sample.decodeSkipped).length,
			preload: { ...preloadStats },
			last: framePerformanceSamples.at(-1)
		};
	}

	function resolvePageDimensions(pageIndex: number): { width: number; height: number } | null {
		const page = bookStore.currentBook?.pages?.[pageIndex];
		const width = page?.width;
		const height = page?.height;
		if (
			typeof width === 'number' &&
			typeof height === 'number' &&
			Number.isFinite(width) &&
			Number.isFinite(height) &&
			width > 0 &&
			height > 0
		) {
			return { width, height };
		}
		return null;
	}

	function resolveImageDimensions(img: FrameImageInfo): { width: number; height: number } | null {
		if (
			typeof img.width === 'number' &&
			typeof img.height === 'number' &&
			Number.isFinite(img.width) &&
			Number.isFinite(img.height) &&
			img.width > 0 &&
			img.height > 0
		) {
			return { width: img.width, height: img.height };
		}
		return resolvePageDimensions(img.pageIndex);
	}

	function fillSnapshotDimensions(snapshot: FrameSnapshot): FrameSnapshot {
		let changed = false;
		const images = snapshot.images.map((img) => {
			if (img.isDummy) return img;
			const dimensions = resolveImageDimensions(img);
			if (!dimensions || (img.width === dimensions.width && img.height === dimensions.height)) {
				return img;
			}
			changed = true;
			return {
				...img,
				width: dimensions.width,
				height: dimensions.height
			};
		});

		return changed ? { ...snapshot, images } : snapshot;
	}

	function hasMissingImageDimensions(snapshot: FrameSnapshot): boolean {
		return snapshot.images.some((img) => !img.isDummy && !resolveImageDimensions(img));
	}

	async function waitForSnapshotImagesReady(snapshot: FrameSnapshot): Promise<{
		total: number;
		failed: number;
		timedOut: boolean;
		skipped: boolean;
	}> {
		const canvasMode = loadModeStore.isCanvasMode;
		const hasImages = snapshot.images.some((img) => !img.isDummy && img.url);
		const urls = canvasMode
			? [
					...new Set(
						snapshot.images.filter((img) => !img.isDummy && img.url).map((img) => fixUrl(img.url))
					)
				]
			: usableImgPredecodeUrls(collectSnapshotPreloadUrls(snapshot, displayPreloadContext));

		if (urls.length === 0) {
			return { total: 0, failed: 0, timedOut: false, skipped: hasImages && !canvasMode };
		}

		let failed = 0;
		const readyPromise = Promise.all(
			urls.map(async (url) => {
				try {
					if (canvasMode) {
						if (getBitmapCacheEntry(url)) return;
						await preloadBitmap(url);
						return;
					}

					if (getDecodedImageEntry(url)) return;
					await predecodeImage(url, { priority: 'high' });
				} catch (err) {
					failed++;
					console.warn('[imageStore] frame image predecode failed:', err);
				}
			})
		).then(() => 'ready' as const);

		const timeoutMs = getFrameReadyWaitTimeout(urls.length, canvasMode);
		const timeoutPromise = new Promise<'timeout'>((resolve) => {
			setTimeout(() => resolve('timeout'), timeoutMs);
		});

		const result = await Promise.race([readyPromise, timeoutPromise]);

		return { total: urls.length, failed, timedOut: result === 'timeout', skipped: false };
	}

	async function preloadReaderWindow(
		params: GetFrameSnapshotParams,
		snapshot: FrameSnapshot,
		token: number,
		direction: PreloadDirection
	): Promise<void> {
		const book = bookStore.currentBook;
		if (!book) return;

		const radius = getPreloadRadius();
		const preloadKey = makeWindowPreloadKey(
			book.path,
			snapshot.pageIndex,
			radius,
			params,
			direction,
			displayPreloadContext
		);
		if (!rememberWindowPreload(preloadKey)) {
			return;
		}

		try {
			const window = await getReaderWindow(snapshot.pageIndex, radius, params);
			if (token !== pendingRequestToken || bookStore.currentBook?.path !== book.path) {
				return;
			}

			const entries = collectPreloadUrls(
				window,
				snapshot.frameId,
				direction,
				displayPreloadContext
			);
			warmHotImageUrls(collectHotPreloadUrls(window, displayPreloadContext));
			const scaledProxyCount = entries.filter((entry) => entry.scaledProxy).length;
			preloadStats.windowRequests++;
			preloadStats.queuedScaledProxy += scaledProxyCount;
			preloadStats.queuedOriginal += entries.length - scaledProxyCount;
			preloadStats.lastEntryCount = entries.length;
			preloadStats.lastScaledProxyCount = scaledProxyCount;
			preloadStats.lastOriginalCount = entries.length - scaledProxyCount;
			preloadStats.lastDirection = direction;
			preloadStats.lastDisplayScale = displayPreloadContext.scale;
			preloadStats.lastDpr = displayPreloadContext.dpr;
			preloadStats.lastUpdatedAt = Date.now();

			for (const entry of entries) {
				preloadImageUrl(entry.url, entry.priority, entry.pixels);
			}
		} catch (err) {
			console.warn('[imageStore] preload reader window failed:', err);
		}
	}

	function schedulePreload(
		params: GetFrameSnapshotParams,
		snapshot: FrameSnapshot,
		token: number,
		direction: PreloadDirection
	): void {
		const run = () => {
			if (!loadModeStore.isCanvasMode && direction !== lastPreloadQueueDirection) {
				clearQueuedImagePredecodes();
			}
			lastPreloadQueueDirection = direction;
			void triggerPreload().catch((err) => {
				console.warn('[imageStore] backend preload failed:', err);
			});
			void preloadReaderWindow(params, snapshot, token, direction);
		};

		if (typeof queueMicrotask === 'function') {
			queueMicrotask(run);
		} else {
			setTimeout(run, 0);
		}
	}

	/**
	 * 请求当前帧快照
	 * 【双缓冲】旧帧保留直到新帧 ready
	 */
	async function loadCurrentPage(params: GetFrameSnapshotParams, force = false) {
		const book = bookStore.currentBook;
		const page = bookStore.currentPage;

		// 场景：关闭 viewer / 无书 / 无页 → 允许清空
		if (!book || !page) {
			state.currentFrame = null;
			state.previousFrame = null;
			state.loading = false;
			return;
		}

		// 检测书本变化 → 切书时必须清空旧帧
		const bookChanged = lastBookPath !== book.path;
		if (bookChanged) {
			lastBookPath = book.path;
			state.currentFrame = null;
			state.previousFrame = null;
			state.loading = false;
			clearImageDecodeCache();
			clearBitmapCache();
		}

		// 避免重复加载
		if (
			!force &&
			!bookChanged &&
			state.currentFrame &&
			state.currentFrame.pageIndex === bookStore.currentPageIndex
		) {
			return;
		}

		// 递增 token，用于丢弃过期的异步结果
		const myToken = ++pendingRequestToken;
		const flipStartTime = performance.now();

		// 异步请求：旧帧保留，loading=true
		state.loading = true;

		try {
			const rawSnapshot = await getFrameSnapshot(params);
			const resourceReadyMs = performance.now() - flipStartTime;

			if (myToken !== pendingRequestToken || bookStore.currentPageIndex !== rawSnapshot.pageIndex) {
				debugReaderPerf(
					() =>
						`[imageStore] page=${params.pageMode} DROPPED (stale) resourceReadyMs=${resourceReadyMs.toFixed(1)}`
				);
				return;
			}

			// Fix URLs (platform adaptation only, no more per-page IPC registration)
			// Fallback for missing dimensions (backend usually provides them now)
			const snapshot = fillSnapshotDimensions({
				...rawSnapshot,
				images: rawSnapshot.images.map((img) => ({ ...img, url: fixUrl(img.url) }))
			});

			// 【关键】只有 token 匹配且页码未变时才提交新帧
			if (myToken !== pendingRequestToken || bookStore.currentPageIndex !== snapshot.pageIndex) {
				debugReaderPerf(
					() =>
						`[imageStore] page=${params.pageMode} DROPPED (stale) resourceReadyMs=${resourceReadyMs.toFixed(1)}`
				);
				return;
			}

			if (state.currentFrame && hasMissingImageDimensions(snapshot)) {
				console.warn(`[imageStore] page=${snapshot.pageIndex} DROPPED (missing dimensions)`);
				state.loading = false;
				return;
			}

			debugReaderPerf(
				() =>
					`[imageStore] page=${snapshot.pageIndex} layout=${snapshot.layout} images=${snapshot.images.length} resourceReadyMs=${resourceReadyMs.toFixed(1)}`
			);

			const previousPageIndex = state.currentFrame?.pageIndex ?? snapshot.pageIndex;
			const preloadDirection: PreloadDirection =
				snapshot.pageIndex > previousPageIndex
					? 'forward'
					: snapshot.pageIndex < previousPageIndex
						? 'backward'
						: 'neutral';
			warmHotImageUrls(collectSnapshotPreloadUrls(snapshot, displayPreloadContext));
			let decodeWaitMs = 0;
			let decodeResult: Awaited<ReturnType<typeof waitForSnapshotImagesReady>> = {
				total: 0,
				failed: 0,
				timedOut: false,
				skipped: false
			};

			if (state.currentFrame) {
				const decodeStartTime = performance.now();
				decodeResult = await waitForSnapshotImagesReady(snapshot);
				decodeWaitMs = performance.now() - decodeStartTime;

				if (myToken !== pendingRequestToken || bookStore.currentPageIndex !== snapshot.pageIndex) {
					debugReaderPerf(
						() =>
							`[imageStore] page=${params.pageMode} DROPPED (stale after decode) decodeWaitMs=${decodeWaitMs.toFixed(1)}`
					);
					return;
				}

				if (decodeResult.total > 0 && !decodeResult.skipped) {
					debugReaderPerf(
						() =>
							`[imageStore] page=${snapshot.pageIndex} decodeWaitMs=${decodeWaitMs.toFixed(1)} decoded=${decodeResult.total - decodeResult.failed}/${decodeResult.total}${decodeResult.timedOut ? ' timedOut=true' : ''}`
					);
				}
			}

			// 双缓冲：旧帧移到 previousFrame，新帧设为 currentFrame
			if (state.currentFrame && state.currentFrame.frameId !== snapshot.frameId) {
				state.previousFrame = state.currentFrame;
			}
			const commitStartTime = performance.now();
			state.currentFrame = snapshot;
			state.loading = false;
			const commitMs = performance.now() - commitStartTime;
			recordFramePerformance({
				bookPath: snapshot.bookPath,
				pageIndex: snapshot.pageIndex,
				layout: snapshot.layout,
				imageCount: snapshot.images.length,
				direction: preloadDirection,
				resourceReadyMs,
				decodeWaitMs,
				commitMs,
				totalBeforeCommitMs: performance.now() - flipStartTime,
				decodeTotal: decodeResult.total,
				decodeFailed: decodeResult.failed,
				decodeTimedOut: decodeResult.timedOut,
				decodeSkipped: decodeResult.skipped
			});
			schedulePreload(params, snapshot, myToken, preloadDirection);
		} catch (err) {
			if (myToken === pendingRequestToken) {
				state.error = String(err);
				state.loading = false;
			}
		}
	}

	/**
	 * 上报视口尺寸
	 */
	function reportViewportSize(
		width: number,
		height: number,
		dpr: number,
		viewMode: 'single' | 'double' | 'panorama'
	) {
		// Rust 端期望 u32，必须取整
		const safeWidth = Math.max(0, Math.round(width));
		const safeHeight = Math.max(0, Math.round(height));
		reportViewport(safeWidth, safeHeight, dpr, viewMode).catch((err) => {
			console.warn('[imageStore] 上报视口失败:', err);
		});
	}

	/**
	 * 将 FrameSnapshot 转换为前端 Frame（兼容现有渲染层）
	 */
	function snapshotToFrame(snapshot: FrameSnapshot | null): Frame {
		if (!snapshot || snapshot.images.length === 0) {
			return emptyFrame;
		}

		const images: FrameImage[] = snapshot.images
			.filter((img) => !img.isDummy && img.url)
			.map((img: FrameImageInfo): FrameImage => {
				const dimensions = resolveImageDimensions(img);
				return {
					url: img.url,
					physicalIndex: img.pageIndex,
					virtualIndex: img.pageIndex,
					width: dimensions?.width,
					height: dimensions?.height,
					splitHalf: img.splitHalf ?? undefined,
					cropRect: img.cropRect ?? undefined,
					scale: img.scale !== 1.0 ? img.scale : undefined,
					rotation: img.rotation || undefined
				};
			});

		if (images.length === 0) {
			return emptyFrame;
		}

		const layout: FrameLayout = snapshot.layout === 'double' ? 'double' : 'single';

		return {
			id: snapshot.frameId,
			images,
			layout
		};
	}

	/**
	 * 获取当前帧（转换为前端 Frame 格式）
	 */
	function getCurrentFrame(): Frame {
		return snapshotToFrame(state.currentFrame);
	}

	/**
	 * 获取上一帧（双缓冲，用于过渡动画）
	 */
	function getPreviousFrame(): Frame {
		return snapshotToFrame(state.previousFrame);
	}

	/**
	 * 获取当前帧的主图尺寸
	 */
	function getMainImageSize(): { width: number; height: number } {
		const snapshot = state.currentFrame;
		if (!snapshot || snapshot.images.length === 0) {
			return { width: 0, height: 0 };
		}
		const mainImage = snapshot.images[0];
		if (!mainImage || mainImage.isDummy) {
			return { width: 0, height: 0 };
		}
		// 考虑裁剪区域
		const dimensions = resolveImageDimensions(mainImage);
		if (!dimensions) {
			return { width: 0, height: 0 };
		}

		let width = dimensions.width;
		let height = dimensions.height;
		if (mainImage.cropRect) {
			width = Math.round(width * mainImage.cropRect.width);
		}
		return { width, height };
	}

	/**
	 * 重置状态
	 */
	function reset() {
		state.currentFrame = null;
		state.previousFrame = null;
		state.loading = false;
		state.error = null;
		lastBookPath = null;
		pendingRequestToken++;
		preloadedWindowTimestamps.clear();
		preloadedWindowQueue.length = 0;
		framePerformanceSamples.length = 0;
		lastPreloadQueueDirection = 'neutral';
		preloadStats.windowRequests = 0;
		preloadStats.queuedScaledProxy = 0;
		preloadStats.queuedOriginal = 0;
		preloadStats.lastEntryCount = 0;
		preloadStats.lastScaledProxyCount = 0;
		preloadStats.lastOriginalCount = 0;
		preloadStats.lastDirection = 'neutral';
		preloadStats.lastDisplayScale = displayPreloadContext.scale;
		preloadStats.lastDpr = displayPreloadContext.dpr;
		preloadStats.lastUpdatedAt = null;
		clearImageDecodeCache();
		clearBitmapCache();
	}

	return {
		get state() {
			return state;
		},
		loadCurrentPage,
		reportViewportSize,
		setDisplayPreloadContext,
		getCurrentFrame,
		getPreviousFrame,
		getMainImageSize,
		getPerformanceStats,
		snapshotToFrame,
		reset
	};
}

// 单例
let imageStore: ReturnType<typeof createImageStore> | null = null;

export function getImageStore() {
	if (!imageStore) {
		imageStore = createImageStore();
	}
	return imageStore;
}
