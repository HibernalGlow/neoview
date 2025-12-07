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

// ===========================================================================
// 配置
// ===========================================================================

const PRELOAD_RANGE = 3; // 前后各预加载 20 页
const THUMBNAIL_MAX_SIZE = 256; // 缩略图最大尺寸
const INITIAL_DELAY_MS = 300; // 切书后的初始延迟（让主页面先加载）

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

/**
 * 加载缩略图（中央优先策略）
 *
 * 使用后端 API 生成缩略图，结果通过事件推送
 */
async function loadThumbnails(centerIndex: number): Promise<void> {
	const currentBook = bookStore.currentBook;
	if (!currentBook) return;

	// 增加版本号，取消之前的预加载
	const currentVersion = ++preloadVersion;

	try {
		const indices = await preloadThumbnails(centerIndex, PRELOAD_RANGE, THUMBNAIL_MAX_SIZE);

		// 检查版本，如果已被取消则忽略
		if (currentVersion !== preloadVersion) {
			console.log('🖼️ ThumbnailService: Preload cancelled (version mismatch)');
			return;
		}

		// 标记为加载中
		for (const idx of indices) {
			loadingIndices.add(idx);
		}

		if (indices.length > 0) {
			console.log(
				`🖼️ ThumbnailService: Preloading ${indices.length} thumbnails from center ${centerIndex}`
			);
		}
	} catch (error) {
		console.error('Failed to preload thumbnails:', error);
	}
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
