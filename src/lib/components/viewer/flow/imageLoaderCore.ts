/**
 * ImageLoaderCore - 核心图片加载器
 * 职责：协调缓存、队列、读取模块完成图片加载
 * 设计原则：单一职责、模块化组合
 */

import { bookStore } from '$lib/stores/book.svelte';
import { logImageTrace } from '$lib/utils/imageTrace';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { BlobCache, getBlobCache } from './blobCache';
import { LoadQueueManager, LoadPriority, QueueClearedError, TaskCancelledError } from './loadQueue';
import { readPageBlob, readPageBlobV2, getImageDimensions, createThumbnailDataURL } from './imageReader';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { calculatePreloadPlan, trackPageDirection, planToQueue, type PreloadConfig } from './preloadStrategy';

/**
 * 更新缓存命中时的延迟追踪
 */
function updateCacheHitLatencyTrace(blob: Blob, pageIndex: number): void {
	const latencyTrace: LatencyTrace = {
		dataSource: loadModeStore.isTempfileMode ? 'tempfile' : 'blob',
		renderMode: loadModeStore.isImgMode ? 'img' : 'canvas',
		loadMs: 0,
		totalMs: 0,
		cacheHit: true,
		dataSize: blob.size,
		traceId: `cache-hit-${pageIndex}`
	};
	infoPanelStore.setLatencyTrace(latencyTrace);
}

export interface ImageLoaderCoreOptions {
	maxConcurrentLoads?: number;
	maxCacheSizeMB?: number;
	onImageReady?: (pageIndex: number, url: string, blob: Blob) => void;
	onDimensionsReady?: (pageIndex: number, dimensions: { width: number; height: number } | null) => void;
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
	// 【架构优化】标记实例是否已失效（切书后旧实例失效）
	private invalidated = false;

	constructor(options: ImageLoaderCoreOptions = {}) {
		this.options = options;
		// 【关键】每个实例创建独立的 BlobCache 和 LoadQueue，避免切书时数据污染
		this.blobCache = new BlobCache({
			maxSizeBytes: (options.maxCacheSizeMB ?? 500) * 1024 * 1024
		});
		// 每个实例独立的队列，切书后旧队列任务不会执行到新实例
		this.loadQueue = new LoadQueueManager(options.maxConcurrentLoads ?? 4);
	}
	
	/**
	 * 标记实例失效（切书时调用）
	 */
	invalidate(): void {
		this.invalidated = true;
		this.clearQueue();
		console.log('📦 ImageLoaderCore 实例已失效');
	}
	
	/**
	 * 检查实例是否有效
	 */
	isValid(): boolean {
		return !this.invalidated;
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
			const result = await loadPromise;
			return result;
		} catch (error) {
			// 【优化】区分正常取消和真正的错误
			if (error instanceof QueueClearedError || error instanceof TaskCancelledError) {
				// 正常取消（切书、清理队列等），静默处理
				throw error;
			}
			// 【关键】真正的错误才打印警告
			console.warn(`加载页面 ${pageIndex} 失败:`, error);
			throw error;
		} finally {
			this.pendingLoads.delete(pageIndex);
		}
	}

	/**
	 * 执行实际加载
	 * 【优化】先返回图片，异步获取尺寸，不阻塞显示
	 */
	private async executeLoad(pageIndex: number, priority: number): Promise<LoadResult> {
		return new Promise((resolve, reject) => {
			this.loadQueue.enqueue(pageIndex, priority, async () => {
				// 【架构优化】检查实例是否已失效
				if (this.invalidated) {
					reject(new Error('Loader invalidated'));
					return;
				}
				
				// 再次检查缓存（可能在排队时被加载）
				if (this.blobCache.has(pageIndex)) {
					const item = this.blobCache.get(pageIndex)!;
					// 先返回，异步获取尺寸
					resolve({
						url: item.url,
						blob: item.blob,
						dimensions: null, // 先返回 null，异步获取
						fromCache: true
					});
					// 异步获取尺寸并回调
					if (!this.invalidated) {
						getImageDimensions(item.blob).then(dimensions => {
							if (!this.invalidated) {
								this.options.onDimensionsReady?.(pageIndex, dimensions);
							}
						});
					}
					return;
				}

				try {
					// 读取图片（仅当前页更新延迟追踪，避免预加载干扰）
					const isCurrentPage = priority === LoadPriority.CRITICAL;
					const { blob, traceId } = await readPageBlob(pageIndex, { 
						updateLatencyTrace: isCurrentPage 
					});
					
					// 【架构优化】再次检查（读取可能耗时较长）
					if (this.invalidated) {
						reject(new Error('Loader invalidated during load'));
						return;
					}
					
					// 缓存
					const url = this.blobCache.set(pageIndex, blob);
					logImageTrace(traceId, 'blob cached', { pageIndex, size: blob.size, priority });

					// 通知回调（立即显示）
					this.options.onImageReady?.(pageIndex, url, blob);

					// 先返回，异步获取尺寸
					resolve({
						url,
						blob,
						dimensions: null, // 先返回 null，异步获取
						fromCache: false
					});

					// 异步获取尺寸并回调（不阻塞）
					if (!this.invalidated) {
						getImageDimensions(blob).then(dimensions => {
							if (!this.invalidated) {
								this.options.onDimensionsReady?.(pageIndex, dimensions);
							}
						});
					}
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
	 * 【优化】先返回图片，异步获取尺寸
	 */
	async loadCurrentPage(): Promise<LoadResult> {
		const pageIndex = bookStore.currentPageIndex;
		
		// 如果缓存中有，立即返回（不等待尺寸）
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			console.log(`⚡ 快速显示缓存: 页码 ${pageIndex + 1}`);
			// 更新延迟追踪（缓存命中）
			updateCacheHitLatencyTrace(item.blob, pageIndex);
			// 异步获取尺寸
			getImageDimensions(item.blob).then(dimensions => {
				this.options.onDimensionsReady?.(pageIndex, dimensions);
			});
			return {
				url: item.url,
				blob: item.blob,
				dimensions: null, // 不阻塞，异步获取
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
	 * 预加载页面范围（简单版本）
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
	 * 智能双向预加载（参考 NeeView 策略）
	 * 根据翻页方向优化预加载顺序
	 */
	async smartPreload(config: Partial<PreloadConfig> = {}): Promise<void> {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		const currentIndex = bookStore.currentPageIndex;
		const totalPages = currentBook.pages.length;

		// 追踪翻页方向
		const direction = trackPageDirection(currentIndex);

		// 计算预加载计划
		const plan = calculatePreloadPlan(currentIndex, totalPages, {
			...config,
			direction
		});

		// 转换为优先级队列
		const queue = planToQueue(plan);

		console.log(`📦 智能预加载: 方向=${direction > 0 ? '前进' : '后退'}, 计划=`, {
			immediate: plan.immediate,
			nextHigh: plan.nextHigh,
			prevHigh: plan.prevHigh,
			normalCount: plan.normal.length
		});

		// 按优先级顺序加载
		const loadPromises: Promise<LoadResult | void>[] = [];

		for (const { pageIndex, priority } of queue) {
			// 跳过已缓存的页面
			if (this.blobCache.has(pageIndex)) {
				continue;
			}

			// 立即页面同步等待，其他页面异步加载
			if (priority >= 100) {
				try {
					await this.loadPage(pageIndex, priority);
				} catch (e) {
					console.warn(`预加载页面 ${pageIndex} 失败:`, e);
				}
			} else {
				loadPromises.push(
					this.loadPage(pageIndex, priority).catch((e) => {
						console.warn(`预加载页面 ${pageIndex} 失败:`, e);
					})
				);
			}
		}

		// 等待所有预加载完成（不阻塞）
		if (loadPromises.length > 0) {
			Promise.allSettled(loadPromises).then(() => {
				console.log(`✅ 预加载完成: ${loadPromises.length} 页`);
			});
		}
	}

	/**
	 * 批量预热缓存（用于书籍切换后的预加载）
	 */
	async warmupCache(pageIndices: number[]): Promise<void> {
		const missing = this.blobCache.getMissingPages(pageIndices);
		if (missing.length === 0) return;

		console.log(`🔥 预热缓存: ${missing.length} 页`);

		// 并行加载（限制并发）
		const concurrency = Math.min(4, missing.length);
		const chunks: number[][] = [];
		
		for (let i = 0; i < missing.length; i += concurrency) {
			chunks.push(missing.slice(i, i + concurrency));
		}

		for (const chunk of chunks) {
			await Promise.allSettled(
				chunk.map(idx => this.loadPage(idx, LoadPriority.NORMAL))
			);
		}
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
		this.invalidate();
		this.clearCache();
		this.pendingLoads.clear();
		// 重置 invalidated 标记，允许新的加载
		this.invalidated = false;
		console.log('📦 ImageLoaderCore 已重置');
	}
}

// 【架构优化】实例池轮换，避免竞争
const POOL_SIZE = 2;
let instancePool: ImageLoaderCore[] = [];
let currentIndex = 0;
let savedOptions: ImageLoaderCoreOptions | undefined;

/**
 * 获取当前活跃的 ImageLoaderCore 实例
 */
export function getImageLoaderCore(options?: ImageLoaderCoreOptions): ImageLoaderCore {
	if (options) {
		savedOptions = options;
	}
	
	// 初始化实例池
	if (instancePool.length === 0) {
		for (let i = 0; i < POOL_SIZE; i++) {
			instancePool.push(new ImageLoaderCore(savedOptions));
		}
	}
	
	return instancePool[currentIndex];
}

/**
 * 切换到下一个实例（切书时调用）
 * 旧实例异步清理，新实例立即可用
 */
export function switchToNextInstance(): ImageLoaderCore {
	const oldInstance = instancePool[currentIndex];
	
	// 标记旧实例失效
	oldInstance.invalidate();
	
	// 切换到下一个实例
	currentIndex = (currentIndex + 1) % POOL_SIZE;
	const newInstance = instancePool[currentIndex];
	
	// 确保新实例是干净的
	newInstance.reset();
	
	// 异步清理旧实例（不阻塞）
	setTimeout(() => {
		oldInstance.clearCache();
		console.log('📦 旧实例缓存已清理');
	}, 100);
	
	console.log(`📦 切换到实例 ${currentIndex}`);
	return newInstance;
}

/**
 * 重置当前实例
 */
export function resetImageLoaderCore(): void {
	const current = instancePool[currentIndex];
	if (current) {
		current.reset();
	}
}

// 导出优先级常量
export { LoadPriority };
