/**
 * Thumbnail Service
 *
 * 独立缩略图管理服务
 *
 * 策略：后端推送模式
 * - 使用后端 API 生成缩略图
 * - 通过 Tauri 事件接收缩略图推送
 * - 支持中央优先加载策略
 * - 快速翻页取消机制
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { preloadThumbnails, type ThumbnailReadyEvent } from '$lib/api/pageManager';
import { thumbnailCacheStore } from '$lib/stores/thumbnailCache.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';
import { getThumbnailUrl } from '$lib/stores/thumbnailStoreV3.svelte';

// ===========================================================================
// 配置
// ===========================================================================

// 预加载范围：前后各 5 页（保持原值，避免过度加载）
const PRELOAD_RANGE = 5;
const THUMBNAIL_MAX_SIZE = 256; // 缩略图最大尺寸
const INITIAL_DELAY_MS = 200; // 切书后的初始延迟

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
const DEBOUNCE_MS = 100; // 100ms 防抖

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

	// 增加版本号，取消之前的预加载
	const currentVersion = ++preloadVersion;

	// 防抖
	debounceTimer = setTimeout(async () => {
		debounceTimer = null;

		// 版本检查
		if (currentVersion !== preloadVersion) {
			return;
		}

		// 计算需要加载的索引（过滤掉已缓存的）
		const totalPages = currentBook.pages?.length || 0;
		const needLoad: number[] = [];

		// 【优化】尝试从 FileBrowser card 缓存复用缩略图（包括视频缩略图）
		const tryReuseFromFileBrowser = (index: number): boolean => {
			const page = currentBook.pages?.[index];
			if (!page) return false;
			const existingThumb = getThumbnailUrl(page.path);
			if (existingThumb) {
				// 复用已有缩略图，不需要重新生成
				// 使用默认尺寸（后续显示时会自动获取）
				thumbnailCacheStore.setThumbnail(index, existingThumb, 120, 120);
				return true;
			}
			return false;
		};

		for (let offset = 0; offset <= PRELOAD_RANGE; offset++) {
			if (offset === 0) {
				if (!thumbnailCacheStore.hasThumbnail(centerIndex) && !loadingIndices.has(centerIndex)) {
					// 【关键】先尝试复用 FileBrowser 缩略图，失败再加入生成队列
					if (!tryReuseFromFileBrowser(centerIndex)) {
						// 视频文件且没有已有缩略图时跳过（后端不能直接生成视频缩略图）
						const page = currentBook.pages?.[centerIndex];
						const filename = page?.name || page?.path || '';
						if (!isVideoFile(filename)) {
							needLoad.push(centerIndex);
						}
					}
				}
			} else {
				const before = centerIndex - offset;
				const after = centerIndex + offset;
				// 处理 before 页
				if (before >= 0 && !thumbnailCacheStore.hasThumbnail(before) && !loadingIndices.has(before)) {
					if (!tryReuseFromFileBrowser(before)) {
						const page = currentBook.pages?.[before];
						const filename = page?.name || page?.path || '';
						if (!isVideoFile(filename)) {
							needLoad.push(before);
						}
					}
				}
				// 处理 after 页
				if (after < totalPages && !thumbnailCacheStore.hasThumbnail(after) && !loadingIndices.has(after)) {
					if (!tryReuseFromFileBrowser(after)) {
						const page = currentBook.pages?.[after];
						const filename = page?.name || page?.path || '';
						if (!isVideoFile(filename)) {
							needLoad.push(after);
						}
					}
				}
			}
		}

		// 没有需要加载的，直接返回
		if (needLoad.length === 0) {
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
		} catch (error) {
			console.error('Failed to preload thumbnails:', error);
		}
	}, DEBOUNCE_MS);
}

/**
 * 加载单个页面的缩略图（兼容旧接口）
 */
async function loadThumbnail(pageIndex: number): Promise<void> {
	// 单个加载直接使用 loadThumbnails
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
		...thumbnailCacheStore.getStats()
	})
};
