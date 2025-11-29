/**
 * ImageLoaderCore - 核心图片加载器
 * 职责：协调缓存、队列、读取模块完成图片加载
 * 设计原则：单一职责、模块化组合
 */

import { bookStore } from '$lib/stores/book.svelte';
import { logImageTrace } from '$lib/utils/imageTrace';
import { BlobCache, getBlobCache } from './blobCache';
import { getLoadQueue, LoadPriority, type LoadQueueManager } from './loadQueue';
import { readPageBlob, getImageDimensions, createThumbnailDataURL } from './imageReader';

export interface ImageLoaderCoreOptions {
	maxConcurrentLoads?: number;
	maxCacheSizeMB?: number;
	onImageReady?: (pageIndex: number, url: string, blob: Blob) => void;
	onError?: (pageIndex: number, error: Error) => void;
}

export interface LoadResult {
	url: string;
	blob: Blob;
	dimensions: { width: number; height: number } | null;
	fromCache: boolean;
}

/**
 * 核心图片加载器
 */
export class ImageLoaderCore {
	private blobCache: BlobCache;
	private loadQueue: LoadQueueManager;
	private pendingLoads = new Map<number, Promise<LoadResult>>();
	private thumbnailCache = new Map<number, string>();
	private options: ImageLoaderCoreOptions;

	constructor(options: ImageLoaderCoreOptions = {}) {
		this.options = options;
		this.blobCache = getBlobCache({
			maxSizeBytes: (options.maxCacheSizeMB ?? 500) * 1024 * 1024
		});
		this.loadQueue = getLoadQueue(options.maxConcurrentLoads ?? 4);
	}

	/**
	 * 加载页面图片（带优先级）
	 */
	async loadPage(pageIndex: number, priority: number = LoadPriority.NORMAL): Promise<LoadResult> {
		// 1. 检查缓存
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			const dimensions = await getImageDimensions(item.blob);
			logImageTrace(`cache-${pageIndex}`, 'cache hit', { pageIndex });
			return {
				url: item.url,
				blob: item.blob,
				dimensions,
				fromCache: true
			};
		}

		// 2. 检查是否正在加载
		if (this.pendingLoads.has(pageIndex)) {
			// 提升优先级
			this.loadQueue.boostPriority(pageIndex, priority);
			return this.pendingLoads.get(pageIndex)!;
		}

		// 3. 创建加载任务
		const loadPromise = this.executeLoad(pageIndex, priority);
		this.pendingLoads.set(pageIndex, loadPromise);

		try {
			return await loadPromise;
		} finally {
			this.pendingLoads.delete(pageIndex);
		}
	}

	/**
	 * 执行实际加载
	 */
	private async executeLoad(pageIndex: number, priority: number): Promise<LoadResult> {
		return new Promise((resolve, reject) => {
			this.loadQueue.enqueue(pageIndex, priority, async () => {
				// 再次检查缓存（可能在排队时被加载）
				if (this.blobCache.has(pageIndex)) {
					const item = this.blobCache.get(pageIndex)!;
					const dimensions = await getImageDimensions(item.blob);
					resolve({
						url: item.url,
						blob: item.blob,
						dimensions,
						fromCache: true
					});
					return;
				}

				try {
					// 读取图片
					const { blob, traceId } = await readPageBlob(pageIndex);
					
					// 缓存
					const url = this.blobCache.set(pageIndex, blob);
					logImageTrace(traceId, 'blob cached', { pageIndex, size: blob.size, priority });

					// 获取尺寸
					const dimensions = await getImageDimensions(blob);

					// 通知回调
					this.options.onImageReady?.(pageIndex, url, blob);

					resolve({
						url,
						blob,
						dimensions,
						fromCache: false
					});
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					this.options.onError?.(pageIndex, err);
					reject(err);
				}
			}).catch(reject);
		});
	}

	/**
	 * 快速加载当前页（最高优先级，带渐进式加载）
	 */
	async loadCurrentPage(): Promise<LoadResult> {
		const pageIndex = bookStore.currentPageIndex;
		
		// 如果缓存中有，立即返回
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			console.log(`⚡ 快速显示缓存: 页码 ${pageIndex + 1}`);
			const dimensions = await getImageDimensions(item.blob);
			return {
				url: item.url,
				blob: item.blob,
				dimensions,
				fromCache: true
			};
		}

		// 否则使用最高优先级加载
		return this.loadPage(pageIndex, LoadPriority.CRITICAL);
	}

	/**
	 * 获取缩略图（低优先级）
	 */
	async getThumbnail(pageIndex: number): Promise<string> {
		// 检查缩略图缓存
		if (this.thumbnailCache.has(pageIndex)) {
			return this.thumbnailCache.get(pageIndex)!;
		}

		// 先加载图片（低优先级）
		const result = await this.loadPage(pageIndex, LoadPriority.LOW);
		
		// 创建缩略图
		const dataURL = await createThumbnailDataURL(result.blob);
		this.thumbnailCache.set(pageIndex, dataURL);

		// 限制缩略图缓存大小
		if (this.thumbnailCache.size > 100) {
			const firstKey = this.thumbnailCache.keys().next().value;
			if (firstKey !== undefined) {
				this.thumbnailCache.delete(firstKey);
			}
		}

		return dataURL;
	}

	/**
	 * 预加载页面范围
	 */
	async preloadRange(centerIndex: number, radius: number): Promise<void> {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		const totalPages = currentBook.pages.length;
		const start = Math.max(0, centerIndex - radius);
		const end = Math.min(totalPages - 1, centerIndex + radius);

		const promises: Promise<LoadResult>[] = [];
		for (let i = start; i <= end; i++) {
			if (i !== centerIndex && !this.blobCache.has(i)) {
				promises.push(this.loadPage(i, LoadPriority.NORMAL));
			}
		}

		await Promise.allSettled(promises);
	}

	/**
	 * 检查是否有缓存
	 */
	hasCache(pageIndex: number): boolean {
		return this.blobCache.has(pageIndex);
	}

	/**
	 * 获取缓存的 URL（如果有）
	 */
	getCachedUrl(pageIndex: number): string | undefined {
		return this.blobCache.getUrl(pageIndex);
	}

	/**
	 * 获取缓存的 Blob（如果有）
	 */
	getCachedBlob(pageIndex: number): Blob | undefined {
		return this.blobCache.getBlob(pageIndex);
	}

	/**
	 * 获取缓存统计
	 */
	getCacheStats() {
		return this.blobCache.getStats();
	}

	/**
	 * 获取队列状态
	 */
	getQueueStatus() {
		return this.loadQueue.getStatus();
	}

	/**
	 * 清空缓存
	 */
	clearCache(): void {
		this.blobCache.clear();
		this.thumbnailCache.clear();
	}

	/**
	 * 清空队列
	 */
	clearQueue(): void {
		this.loadQueue.clear();
	}

	/**
	 * 完全重置
	 */
	reset(): void {
		this.clearQueue();
		this.clearCache();
		this.pendingLoads.clear();
	}
}

// 单例实例
let instance: ImageLoaderCore | null = null;

export function getImageLoaderCore(options?: ImageLoaderCoreOptions): ImageLoaderCore {
	if (!instance) {
		instance = new ImageLoaderCore(options);
	}
	return instance;
}

export function resetImageLoaderCore(): void {
	if (instance) {
		instance.reset();
		instance = null;
	}
}

// 导出优先级常量
export { LoadPriority };
