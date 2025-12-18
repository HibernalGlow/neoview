/**
 * Thumbnail Service
 *
 * 独立缩略图管理服务
 *
 * 策略：后端推送模式 + 后台持续加载
 * - 使用后端 API 生成缩略图
 * - 通过 Tauri 事件接收缩略图推送
 * - 支持中央优先加载策略
 * - 快速翻页取消机制
 * - 停留时后台持续加载剩余缩略图
 */

import { listen, type UnlistenFn } from '$lib/api/window';
import { preloadThumbnails, type ThumbnailReadyEvent } from '$lib/api/pageManager';
import { thumbnailCacheStore } from '$lib/stores/thumbnailCache.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';
import { getThumbnailUrl } from '$lib/stores/thumbnailStoreV3.svelte';

// ===========================================================================
// 配置
// ===========================================================================

// 初始预加载范围：前后各 10 页（快速响应，覆盖可见区域）
const INITIAL_PRELOAD_RANGE = 10;
// 后台加载批次大小：每次加载 20 页
const BACKGROUND_BATCH_SIZE = 20;
// 后台加载间隔：200ms（更快的后台加载）
const BACKGROUND_LOAD_INTERVAL_MS = 200;
// 缩略图最大尺寸
const THUMBNAIL_MAX_SIZE = 256;
// 切书后的初始延迟：100ms（更快响应）
const INITIAL_DELAY_MS = 100;
// 防抖时间：50ms（更快响应翻页）
const DEBOUNCE_MS = 50;

// ===========================================================================
// 状态
// ===========================================================================

let currentBookPath: string | null = null;
const loadingIndices = new Set<number>();
let isInitialized = false;

// 事件监听器
let eventUnlisten: UnlistenFn | null = null;

// 当前预加载请求版本（用于取消旧请求）
let preloadVersion = 0;

// 后台加载状态
let backgroundLoadTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundLoadCenter: number = 0;
let backgroundLoadRadius: number = INITIAL_PRELOAD_RANGE;

// ===========================================================================
// 事件监听
// ===========================================================================

/**
 * 处理缩略图就绪事件
 */
function handleThumbnailReady(event: ThumbnailReadyEvent): void {
	const { index, data, width, height } = event;

	console.log(`🖼️ ThumbnailService: Received thumbnail for page ${index}, ${width}x${height}`);

	// 写入缓存
	thumbnailCacheStore.setThumbnail(index, data, width, height);

	// 清除加载状态
	loadingIndices.delete(index);
}

// ===========================================================================
// 核心加载逻辑
// ===========================================================================

// 防抖计时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 尝试从 FileBrowser 缓存复用缩略图
 */
function tryReuseFromFileBrowser(index: number): boolean {
	const currentBook = bookStore.currentBook;
	if (!currentBook) return false;

	const page = currentBook.pages?.[index];
	if (!page) return false;

	// 对于压缩包内的文件，需要传递压缩包路径
	const archivePath = currentBook.type === 'archive' ? currentBook.path : undefined;
	const existingThumb = getThumbnailUrl(page.path, archivePath);
	if (existingThumb) {
		// 复用已有缩略图，不需要重新生成
		thumbnailCacheStore.setThumbnail(index, existingThumb, 120, 120);
		return true;
	}
	return false;
}

/**
 * 检查页面是否需要加载
 */
function needsLoading(index: number): boolean {
	const currentBook = bookStore.currentBook;
	if (!currentBook) return false;

	// 已缓存或正在加载
	if (thumbnailCacheStore.hasThumbnail(index) || loadingIndices.has(index)) {
		return false;
	}

	// 尝试复用 FileBrowser 缩略图
	if (tryReuseFromFileBrowser(index)) {
		return false;
	}

	// 视频文件跳过（后端不能直接生成视频缩略图）
	const page = currentBook.pages?.[index];
	const filename = page?.name || page?.path || '';
	if (isVideoFile(filename)) {
		return false;
	}

	return true;
}

/**
 * 收集需要加载的索引（中央优先）
 */
function collectIndicesToLoad(centerIndex: number, radius: number, maxCount: number): number[] {
	const currentBook = bookStore.currentBook;
	if (!currentBook) return [];

	const totalPages = currentBook.pages?.length || 0;
	const needLoad: number[] = [];

	for (let offset = 0; offset <= radius && needLoad.length < maxCount; offset++) {
		if (offset === 0) {
			if (needsLoading(centerIndex)) {
				needLoad.push(centerIndex);
			}
		} else {
			const before = centerIndex - offset;
			const after = centerIndex + offset;

			// 处理 before 页
			if (before >= 0 && needLoad.length < maxCount && needsLoading(before)) {
				needLoad.push(before);
			}

			// 处理 after 页
			if (after < totalPages && needLoad.length < maxCount && needsLoading(after)) {
				needLoad.push(after);
			}
		}
	}

	return needLoad;
}

/**
 * 加载缩略图（中央优先策略）
 *
 * 使用后端 API 生成缩略图，结果通过事件推送
 * 内置防抖和去重逻辑
 */
async function loadThumbnails(centerIndex: number): Promise<void> {
	const currentBook = bookStore.currentBook;
	if (!currentBook) return;

	// 清除之前的防抖计时器
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}

	// 停止后台加载（翻页时重新开始）
	stopBackgroundLoad();

	// 增加版本号，取消之前的预加载
	const currentVersion = ++preloadVersion;

	// 更新后台加载中心
	backgroundLoadCenter = centerIndex;
	backgroundLoadRadius = INITIAL_PRELOAD_RANGE;

	// 防抖
	debounceTimer = setTimeout(async () => {
		debounceTimer = null;

		// 版本检查
		if (currentVersion !== preloadVersion) {
			return;
		}

		// 收集初始需要加载的索引
		const needLoad = collectIndicesToLoad(centerIndex, INITIAL_PRELOAD_RANGE, BACKGROUND_BATCH_SIZE);

		// 没有需要加载的，启动后台加载
		if (needLoad.length === 0) {
			startBackgroundLoad();
			return;
		}

		try {
			// 标记为加载中
			for (const idx of needLoad) {
				loadingIndices.add(idx);
			}

			// 传递 centerIndex 给后端，让后端按距离排序（中央优先策略）
			const indices = await preloadThumbnails(needLoad, centerIndex, THUMBNAIL_MAX_SIZE);

			// 检查版本，如果已被取消则忽略
			if (currentVersion !== preloadVersion) {
				return;
			}

			if (indices.length > 0) {
				console.debug(
					`🖼️ ThumbnailService: Preloading ${indices.length} thumbnails from center ${centerIndex}`
				);
			}

			// 初始加载完成后，启动后台持续加载
			startBackgroundLoad();
		} catch (error) {
			console.error('Failed to preload thumbnails:', error);
			// 即使失败也启动后台加载
			startBackgroundLoad();
		}
	}, DEBOUNCE_MS);
}

/**
 * 启动后台持续加载
 * 每隔一段时间加载一批缩略图，直到全部加载完成
 */
function startBackgroundLoad(): void {
	// 如果已经在运行，不重复启动
	if (backgroundLoadTimer) return;

	const currentBook = bookStore.currentBook;
	if (!currentBook) return;

	const totalPages = currentBook.pages?.length || 0;
	const currentVersion = preloadVersion;

	console.debug(`🖼️ ThumbnailService: Starting background load from center ${backgroundLoadCenter}`);

	const loadNextBatch = async () => {
		// 版本检查（翻页时会取消）
		if (currentVersion !== preloadVersion) {
			backgroundLoadTimer = null;
			return;
		}

		// 扩大加载范围
		backgroundLoadRadius += BACKGROUND_BATCH_SIZE;

		// 收集需要加载的索引
		const needLoad = collectIndicesToLoad(backgroundLoadCenter, backgroundLoadRadius, BACKGROUND_BATCH_SIZE);

		// 检查是否已加载完所有页面（没有需要加载的且范围已覆盖全部）
		if (needLoad.length === 0) {
			// 检查是否真的全部加载完成（范围已覆盖所有页面）
			const maxRadius = Math.max(backgroundLoadCenter, totalPages - 1 - backgroundLoadCenter);
			if (backgroundLoadRadius >= maxRadius) {
				console.debug(`🖼️ ThumbnailService: Background load complete (all ${totalPages} pages covered)`);
				backgroundLoadTimer = null;
				return;
			}
			// 当前范围没有需要加载的，立即扩大范围（不等待）
			backgroundLoadTimer = setTimeout(loadNextBatch, 50);
			return;
		}

		try {
			// 标记为加载中
			for (const idx of needLoad) {
				loadingIndices.add(idx);
			}

			// 调用后端加载
			await preloadThumbnails(needLoad, backgroundLoadCenter, THUMBNAIL_MAX_SIZE);

			console.debug(
				`🖼️ ThumbnailService: Background loaded ${needLoad.length} thumbnails, radius=${backgroundLoadRadius}`
			);
		} catch (error) {
			console.error('Background load failed:', error);
		}

		// 继续加载下一批
		if (currentVersion === preloadVersion) {
			backgroundLoadTimer = setTimeout(loadNextBatch, BACKGROUND_LOAD_INTERVAL_MS);
		}
	};

	// 延迟启动后台加载，让初始加载先完成（100ms 后开始）
	backgroundLoadTimer = setTimeout(loadNextBatch, 100);
}

/**
 * 停止后台加载
 */
function stopBackgroundLoad(): void {
	if (backgroundLoadTimer) {
		clearTimeout(backgroundLoadTimer);
		backgroundLoadTimer = null;
	}
}

/**
 * 加载单个页面的缩略图（兼容旧接口）
 */
async function loadThumbnail(pageIndex: number): Promise<void> {
	await loadThumbnails(pageIndex);
}

/**
 * 取消当前预加载
 */
function cancelLoading(): void {
	preloadVersion++;
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	stopBackgroundLoad();
}

// ===========================================================================
// 服务初始化和事件监听
// ===========================================================================

/**
 * 处理书籍变化
 */
function handleBookChange(bookPath: string): void {
	if (currentBookPath === bookPath) return;

	console.log(`🖼️ ThumbnailService: Book changed to ${bookPath}`);
	currentBookPath = bookPath;

	// 取消旧的加载任务
	cancelLoading();
	loadingIndices.clear();

	// 设置 imagePool 当前书籍
	imagePool.setCurrentBook(bookPath);

	// 设置 thumbnailCacheStore 当前书籍（清空旧缓存）
	thumbnailCacheStore.setBook(bookPath);

	// 延迟加载缩略图，让主页面先加载
	setTimeout(() => {
		const centerIndex = bookStore.currentPageIndex;
		void loadThumbnails(centerIndex);
	}, INITIAL_DELAY_MS);
}

/**
 * 处理页面变化
 */
function handlePageChange(pageIndex: number): void {
	// 当前页变化时，加载附近的缩略图
	void loadThumbnails(pageIndex);
}

/**
 * 初始化服务
 *
 * 设置 Tauri 事件监听，接收后端推送的缩略图
 */
export async function initThumbnailService(): Promise<void> {
	if (isInitialized) return;

	try {
		eventUnlisten = await listen<ThumbnailReadyEvent>('thumbnail-ready', (event) => {
			handleThumbnailReady(event.payload);
		});

		isInitialized = true;
		console.log('🖼️ ThumbnailService: Initialized with backend event listener');
	} catch (error) {
		console.error('Failed to initialize ThumbnailService:', error);
	}
}

/**
 * 销毁服务
 */
export function destroyThumbnailService(): void {
	if (eventUnlisten) {
		eventUnlisten();
		eventUnlisten = null;
	}
	cancelLoading();
	loadingIndices.clear();
	currentBookPath = null;
	isInitialized = false;
	preloadVersion = 0;
	console.log('🖼️ ThumbnailService: Destroyed');
}

// ===========================================================================
// 导出 API
// ===========================================================================

export const thumbnailService = {
	init: initThumbnailService,
	destroy: destroyThumbnailService,
	loadThumbnails,
	loadThumbnail,
	handleBookChange,
	handlePageChange,
	cancelLoading,

	/** 获取加载状态 */
	isLoading: (pageIndex: number) => loadingIndices.has(pageIndex),

	/** 获取统计信息 */
	getStats: () => ({
		loadingCount: loadingIndices.size,
		backgroundLoadRadius,
		...thumbnailCacheStore.getStats()
	})
};
