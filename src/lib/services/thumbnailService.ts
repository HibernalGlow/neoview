/**
 * Thumbnail Service
 * 
 * 独立缩略图管理服务
 * 
 * 策略：主动推送模式
 * - 监听 imagePool 的图片加载
 * - 自动生成缩略图并写入 thumbnailCacheStore
 * - 支持中央优先加载策略
 */

import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import { thumbnailCacheStore } from '$lib/stores/thumbnailCache.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// 配置
// ============================================================================

const THUMBNAIL_HEIGHT = 120;
const PRELOAD_RANGE = 20;  // 前后各预加载 20 页
const BATCH_SIZE = 2;      // 每批次加载数量（减小以降低卡顿）
const BATCH_DELAY_MS = 100; // 每批次之间的延迟（毫秒）
const INITIAL_DELAY_MS = 500; // 切书后的初始延迟（让主页面先加载）

// ============================================================================
// 状态
// ============================================================================

let currentBookPath: string | null = null;
const loadingIndices = new Set<number>();
let isInitialized = false;

// ============================================================================
// 缩略图生成
// ============================================================================

/**
 * 从 Blob 创建缩略图 Data URL（canvas 缩放）
 */
async function createThumbnailFromBlob(blob: Blob): Promise<{ url: string; width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(blob);
		const img = new Image();

		img.onload = () => {
			URL.revokeObjectURL(objectUrl);

			// 计算缩放尺寸
			const scale = THUMBNAIL_HEIGHT / img.naturalHeight;
			const thumbWidth = Math.round(img.naturalWidth * scale);
			const thumbHeight = THUMBNAIL_HEIGHT;

			// 使用 canvas 缩放
			const canvas = document.createElement('canvas');
			canvas.width = thumbWidth;
			canvas.height = thumbHeight;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Failed to get canvas context'));
				return;
			}

			ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

			// 转换为 data URL（使用 webp 格式）
			const dataUrl = canvas.toDataURL('image/webp', 0.8);
			resolve({ url: dataUrl, width: thumbWidth, height: thumbHeight });
		};

		img.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error('Failed to load image'));
		};

		img.src = objectUrl;
	});
}

// ============================================================================
// 中央优先加载策略
// ============================================================================

/**
 * 生成中央优先加载顺序
 * 从中心页开始，交替向前后方向扩展
 */
function generateCentralPriorityOrder(center: number, totalPages: number, range: number): number[] {
	const indices: number[] = [];

	// 先加载中心页
	if (center >= 0 && center < totalPages) {
		indices.push(center);
	}

	// 交替向前后方向扩展
	for (let offset = 1; offset <= range; offset++) {
		// 向后
		if (center + offset < totalPages) {
			indices.push(center + offset);
		}
		// 向前
		if (center - offset >= 0) {
			indices.push(center - offset);
		}
	}

	return indices;
}

// ============================================================================
// 核心加载逻辑
// ============================================================================

/**
 * 加载单个页面的缩略图
 */
async function loadThumbnail(pageIndex: number): Promise<void> {
	// 检查是否已有缓存或正在加载
	if (thumbnailCacheStore.hasThumbnail(pageIndex) || loadingIndices.has(pageIndex)) {
		return;
	}

	loadingIndices.add(pageIndex);

	try {
		// 优先从 imagePool 缓存获取 Blob
		let blob: Blob | undefined;

		const cached = imagePool.getSync(pageIndex);
		if (cached?.blob) {
			blob = cached.blob;
		} else {
			// 缓存未命中：异步加载
			const pooled = await imagePool.get(pageIndex);
			blob = pooled?.blob;
		}

		if (!blob) {
			console.debug(`No blob for page ${pageIndex}`);
			return;
		}

		// 检查blob类型，视频文件使用系统缩略图
		if (blob.type.startsWith('video/')) {
			console.debug(`Using system thumbnail for video page ${pageIndex}`);
			// 获取视频文件路径
			const page = bookStore.currentBook?.pages[pageIndex];
			if (!page?.path) {
				console.warn(`No path for video page ${pageIndex}`);
				return;
			}

			// 调用后端系统缩略图API
			try {
				const blobKey = await invoke<string>('generate_file_thumbnail_new', { filePath: page.path });
				const thumbnailUrl = `neoview://${blobKey}`;
				// 写入缓存（视频缩略图尺寸未知，使用默认值）
				thumbnailCacheStore.setThumbnail(pageIndex, thumbnailUrl, 120, 120);
				console.debug(`✅ Video thumbnail loaded for page ${pageIndex}`);
			} catch (error) {
				console.error(`Failed to generate system thumbnail for video page ${pageIndex}:`, error);
			}
			return;
		}

		// 生成缩略图
		const thumb = await createThumbnailFromBlob(blob);

		// 写入缓存
		thumbnailCacheStore.setThumbnail(pageIndex, thumb.url, thumb.width, thumb.height);
	} catch (error) {
		console.debug(`Failed to load thumbnail for page ${pageIndex}:`, error);
	} finally {
		loadingIndices.delete(pageIndex);
	}
}

// 当前加载版本号（用于取消过期请求）
let loadVersion = 0;

/**
 * 加载缩略图（中央优先策略）
 * 
 * 特点：
 * - 完全异步，不阻塞主线程
 * - 支持取消过期请求（翻页时自动取消旧请求）
 * - 每批次之间让出控制权
 */
async function loadThumbnails(centerIndex: number): Promise<void> {
	const currentBook = bookStore.currentBook;
	if (!currentBook) return;

	// 增加版本号，取消旧的加载任务
	const thisVersion = ++loadVersion;

	const totalPages = currentBook.totalPages;

	// 使用中央优先策略生成加载顺序
	const loadOrder = generateCentralPriorityOrder(centerIndex, totalPages, PRELOAD_RANGE);

	// 过滤已缓存和正在加载的
	const toLoad = loadOrder.filter(
		(i) => !thumbnailCacheStore.hasThumbnail(i) && !loadingIndices.has(i)
	);

	if (toLoad.length === 0) {
		return;
	}

	console.log(`🖼️ ThumbnailService: Loading ${toLoad.length} thumbnails (center: ${centerIndex}, v${thisVersion})`);

	// 分批加载，每批之间延迟以避免卡顿
	for (let i = 0; i < toLoad.length; i += BATCH_SIZE) {
		// 检查是否被取消
		if (loadVersion !== thisVersion) {
			console.log(`🖼️ ThumbnailService: Cancelled (v${thisVersion} -> v${loadVersion})`);
			return;
		}

		const batch = toLoad.slice(i, i + BATCH_SIZE);

		// 加载当前批次
		await Promise.all(batch.map(loadThumbnail));

		// 批次之间延迟，让出控制权给主页面加载
		if (i + BATCH_SIZE < toLoad.length) {
			await new Promise<void>((resolve) => {
				setTimeout(resolve, BATCH_DELAY_MS);
			});
		}
	}
}

/**
 * 取消当前加载任务
 */
function cancelLoading(): void {
	loadVersion++;
}

// ============================================================================
// 服务初始化和事件监听
// ============================================================================

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
 */
export function initThumbnailService(): void {
	if (isInitialized) return;

	console.log('🖼️ ThumbnailService: Initializing...');

	// 监听书籍和页面变化（使用 $effect 在组件中调用）
	isInitialized = true;
}

/**
 * 销毁服务
 */
export function destroyThumbnailService(): void {
	loadingIndices.clear();
	currentBookPath = null;
	isInitialized = false;
	console.log('🖼️ ThumbnailService: Destroyed');
}

// ============================================================================
// 导出 API
// ============================================================================

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
