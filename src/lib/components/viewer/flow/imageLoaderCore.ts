/**
 * ImageLoaderCore - 核心图片加载器
 * 职责：协调缓存、队列、读取模块完成图片加载
 * 设计原则：单一职责、模块化组合
 */

import { bookStore } from '$lib/stores/book.svelte';
import { logImageTrace } from '$lib/utils/imageTrace';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';
import { animatedVideoModeStore } from '$lib/stores/animatedVideoMode.svelte';
import { isAnimatedImageVideoCandidate } from '$lib/utils/animatedVideoModeUtils';
import { BlobCache } from './blobCache';
import { LoadQueueManager, LoadPriority, QueueClearedError, TaskCancelledError } from './loadQueue';
import { readPageSourceV2, getImageDimensions, createThumbnailDataURL, clearExtractCache } from './imageReader';
import { pipelineLatencyStore } from '$lib/stores/pipelineLatency.svelte';
import { calculatePreloadPlan, trackPageDirection, planToQueue, type PreloadConfig } from './preloadStrategy';
import { thumbnailService } from '$lib/services/thumbnailService';

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
	onImageReady?: (pageIndex: number, url: string, blob?: Blob) => void;
	onDimensionsReady?: (pageIndex: number, dimensions: { width: number; height: number } | null) => void;
	onError?: (pageIndex: number, error: Error) => void;
}

export interface LoadResult {
	url: string;
	blob?: Blob;
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
	private directUrlCache = new Map<number, string>();
	private options: ImageLoaderCoreOptions;
	// 【架构优化】标记实例是否已失效（切书后旧实例失效）
	private invalidated = false;

	constructor(options: ImageLoaderCoreOptions = {}) {
		this.options = options;
		// 【关键】每个实例创建独立的 BlobCache 和 LoadQueue，避免切书时数据污染
		this.blobCache = new BlobCache({
			maxSizeBytes: (options.maxCacheSizeMB ?? 500) * 1024 * 1024
		});
		// 【优化】提高默认并发数从 4 到 6，充分利用现代多核 CPU
		this.loadQueue = new LoadQueueManager(options.maxConcurrentLoads ?? 6);
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
	 * 【性能优化】注册尺寸就绪回调
	 * 用于在预加载时缓存尺寸，避免翻页时重新计算
	 */
	setOnDimensionsReady(callback: (pageIndex: number, dimensions: { width: number; height: number } | null) => void): void {
		this.options.onDimensionsReady = callback;
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
	async loadPage(pageIndex: number, priority: number = LoadPriority.NORMAL, signal?: AbortSignal): Promise<LoadResult> {
		// 0. 检查已取消
		if (signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}

		// 1. 检查缓存
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			
			// 【性能优化】优先使用已缓存的尺寸，避免重复解码
			let dimensions = this.blobCache.getDimensions(pageIndex);
			if (dimensions === undefined) {
				// 尚未缓存尺寸，异步获取并缓存
				getImageDimensions(item.blob).then(dims => {
					this.blobCache.setDimensions(pageIndex, dims);
					this.options.onDimensionsReady?.(pageIndex, dims);
				});
				dimensions = null; // 稍后通过回调提供
			} else if (dimensions !== null) {
				// 已有缓存，直接通知
				this.options.onDimensionsReady?.(pageIndex, dimensions);
			}
			
			logImageTrace(`cache-${pageIndex}`, 'cache hit', { pageIndex, hasDimensions: dimensions !== null });
			return {
				url: item.url,
				blob: item.blob,
				dimensions: dimensions ?? null,
				fromCache: true
			};
		}

		if (this.directUrlCache.has(pageIndex)) {
			const url = this.directUrlCache.get(pageIndex)!;
			this.options.onDimensionsReady?.(pageIndex, null);
			return { url, blob: undefined, dimensions: null, fromCache: true };
		}

		// 2. 检查是否正在加载
		if (this.pendingLoads.has(pageIndex)) {
			// 提升优先级
			this.loadQueue.boostPriority(pageIndex, priority);
			return this.pendingLoads.get(pageIndex)!;
		}

		// 3. 创建加载任务
		const loadPromise = this.executeLoad(pageIndex, priority, signal);
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
			// 视频文件跳过是正常行为，不打印警告
			if (error instanceof Error && error.message.includes('Video file skipped')) {
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
	private async executeLoad(pageIndex: number, priority: number, signal?: AbortSignal): Promise<LoadResult> {
		return new Promise((resolve, reject) => {
			this.loadQueue.enqueue(pageIndex, priority, async () => {
				// 检查取消
				if (signal?.aborted) {
					reject(new DOMException('Aborted', 'AbortError'));
					return;
				}
				
				// 【架构优化】检查实例是否已失效
				if (this.invalidated) {
					reject(new Error('Loader invalidated'));
					return;
				}
				
				// 再次检查缓存（可能在排队时被加载）
				if (this.blobCache.has(pageIndex)) {
					const item = this.blobCache.get(pageIndex)!;
					const isCurrentPage = priority === LoadPriority.CRITICAL;
					
					// 记录前端缓存命中到监控
					if (isCurrentPage) {
						pipelineLatencyStore.record({
							timestamp: Date.now(),
							pageIndex,
							traceId: `cache-${pageIndex}`,
							bookSyncMs: 0,
							backendLoadMs: 0,
							ipcTransferMs: 0,
							blobCreateMs: 0,
							totalMs: 0,
							dataSize: item.blob.size,
							cacheHit: true,  // 前端缓存命中
							isCurrentPage: true,
							source: 'cache'
						});
					}
					
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
					// 【关键】检查是否为视频页，视频不走这个加载流程（避免大文件通过 IPC 传输卡死）
					const currentBook = bookStore.currentBook;
					const page = currentBook?.pages?.[pageIndex];
					const mediaName = page?.name || page?.innerPath || page?.path || '';
					const isAnimatedVideoPage =
						animatedVideoModeStore.canUse && isAnimatedImageVideoCandidate(mediaName);
					if (page && (isVideoFile(mediaName) || isAnimatedVideoPage)) {
						// 视频文件跳过预加载，由 VideoContainer 使用 convertFileSrc 加载
						reject(new Error(`Video file skipped from preload: ${page.path}`));
						return;
					}

					// 读取图片（使用 PageManager，后端自动缓存和预加载）
					const isCurrentPage = priority === LoadPriority.CRITICAL;
					const source = await readPageSourceV2(pageIndex, { 
						updateLatencyTrace: isCurrentPage,
						isCurrentPage  // 当前页触发后端预加载
					});
					
					// 【架构优化】再次检查（读取可能耗时较长）
					if (this.invalidated || signal?.aborted) {
						reject(new DOMException('Aborted', 'AbortError'));
						return;
					}
					
					if (source.kind === 'url') {
						this.directUrlCache.set(pageIndex, source.url);
						logImageTrace(source.traceId, 'url cached', { pageIndex, priority });
						this.options.onImageReady?.(pageIndex, source.url);
						resolve({
							url: source.url,
							blob: undefined,
							dimensions: null,
							fromCache: false
						});
						this.options.onDimensionsReady?.(pageIndex, null);
						return;
					}

					const url = this.blobCache.set(pageIndex, source.blob);
					logImageTrace(source.traceId, 'blob cached', { pageIndex, size: source.blob.size, priority });

					this.options.onImageReady?.(pageIndex, url, source.blob);

					resolve({
						url,
						blob: source.blob,
						dimensions: null,
						fromCache: false
					});

					if (!this.invalidated) {
						getImageDimensions(source.blob).then(dimensions => {
							if (!this.invalidated) {
								this.blobCache.setDimensions(pageIndex, dimensions);
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
	 * 【优化】使用缓存的尺寸，异步预解码 ImageBitmap
	 * 【关键】加载完成后通知 thumbnailService 开始加载缩略图
	 */
	async loadCurrentPage(): Promise<LoadResult> {
		const pageIndex = bookStore.currentPageIndex;
		
		// 如果缓存中有，立即返回
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			console.log(`⚡ 快速显示缓存: 页码 ${pageIndex + 1}`);
			// 更新延迟追踪（缓存命中）
			updateCacheHitLatencyTrace(item.blob, pageIndex);
			
			// 【性能优化】使用缓存的尺寸，避免重复解码
			let dimensions = this.blobCache.getDimensions(pageIndex);
			if (dimensions === undefined) {
				// 尚未缓存尺寸，触发预解码
				this.schedulePreDecode(pageIndex);
			} else if (dimensions !== null) {
				this.options.onDimensionsReady?.(pageIndex, dimensions);
			}
			
			// 【关键】通知缩略图服务主图已就绪
			thumbnailService.notifyMainImageReady();
			return {
				url: item.url,
				blob: item.blob,
				dimensions: dimensions ?? null,
				fromCache: true
			};
		}

		// 否则使用最高优先级加载
		const result = await this.loadPage(pageIndex, LoadPriority.CRITICAL);
		// 【关键】主图加载完成，通知缩略图服务开始加载
		thumbnailService.notifyMainImageReady();
		// 触发预解码
		this.schedulePreDecode(pageIndex);
		return result;
	}

	/**
	 * 【性能优化】调度 ImageBitmap 预解码
	 * 预解码后可直接绘制到 Canvas，避免渲染时阻塞
	 */
	private async schedulePreDecode(pageIndex: number): Promise<void> {
		// 检查是否已有 bitmap
		if (this.blobCache.getBitmap(pageIndex)) return;
		
		const blob = this.blobCache.getBlob(pageIndex);
		if (!blob) return;
		
		try {
			const bitmap = await createImageBitmap(blob);
			if (!this.invalidated && this.blobCache.has(pageIndex)) {
				this.blobCache.setBitmap(pageIndex, bitmap);
				// setBitmap 会同时更新尺寸
				const dimensions = { width: bitmap.width, height: bitmap.height };
				this.options.onDimensionsReady?.(pageIndex, dimensions);
			} else {
				// 实例已失效或页面已被清除
				bitmap.close();
			}
		} catch (error) {
			console.warn(`预解码页面 ${pageIndex} 失败:`, error);
		}
	}

	/**
	 * 获取缩略图
	 * 优先从 Blob 缓存生成（不经过队列），如果缓存中没有才加载
	 */
	async getThumbnail(pageIndex: number): Promise<string> {
		// 检查缩略图缓存
		if (this.thumbnailCache.has(pageIndex)) {
			return this.thumbnailCache.get(pageIndex)!;
		}

		let blob: Blob;
		
		// 【优化】如果 Blob 已在缓存中，直接使用，不经过队列
		if (this.blobCache.has(pageIndex)) {
			const cached = this.blobCache.get(pageIndex);
			if (cached) {
				blob = cached.blob;
			} else {
				// 缓存异常，走正常加载流程
				const result = await this.loadPage(pageIndex, LoadPriority.LOW);
				if (!result.blob) {
					throw new Error(`页面 ${pageIndex} 缺少可用 Blob`);
				}
				blob = result.blob;
			}
		} else {
			// 缓存中没有，需要加载（低优先级）
			const result = await this.loadPage(pageIndex, LoadPriority.LOW);
			if (!result.blob) {
				throw new Error(`页面 ${pageIndex} 缺少可用 Blob`);
			}
			blob = result.blob;
		}
		
		// 创建缩略图（前端 canvas 缩放）
		const dataURL = await createThumbnailDataURL(blob);
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
					// 视频文件跳过是正常行为，不打印警告
					if (!(e instanceof Error && e.message.includes('Video file skipped'))) {
						console.warn(`预加载页面 ${pageIndex} 失败:`, e);
					}
				}
			} else {
				loadPromises.push(
					this.loadPage(pageIndex, priority).catch((e) => {
						// 视频文件跳过是正常行为，不打印警告
						if (!(e instanceof Error && e.message.includes('Video file skipped'))) {
							console.warn(`预加载页面 ${pageIndex} 失败:`, e);
						}
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
		return this.blobCache.has(pageIndex) || this.directUrlCache.has(pageIndex);
	}

	/**
	 * 获取缓存的 URL（如果有）
	 */
	getCachedUrl(pageIndex: number): string | undefined {
		return this.blobCache.getUrl(pageIndex) ?? this.directUrlCache.get(pageIndex);
	}

	/**
	 * 获取缓存的 Blob（如果有）
	 */
	getCachedBlob(pageIndex: number): Blob | undefined {
		return this.blobCache.getBlob(pageIndex);
	}

	/**
	 * 【性能优化】获取缓存的 ImageBitmap（如果有）
	 * 用于直接绘制到 Canvas，避免渲染时解码
	 */
	getCachedBitmap(pageIndex: number): ImageBitmap | undefined {
		return this.blobCache.getBitmap(pageIndex);
	}

	/**
	 * 【性能优化】获取缓存的尺寸（如果有）
	 * 避免重复解码获取尺寸
	 */
	getCachedDimensions(pageIndex: number): { width: number; height: number } | null | undefined {
		return this.blobCache.getDimensions(pageIndex);
	}

	/**
	 * 获取缓存统计
	 */
	getCacheStats() {
		return this.blobCache.getStats();
	}

	/**
	 * 【性能优化】获取缓存数量（O(1)）
	 */
	getCacheSize(): number {
		return this.blobCache.getStats().count + this.directUrlCache.size;
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
		this.directUrlCache.clear();
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
		// 【修复】重置 imageReader 的书籍同步状态，避免切书后显示旧书内容
		clearExtractCache();
		// 重置 invalidated 标记，允许新的加载
		this.invalidated = false;
		console.log('📦 ImageLoaderCore 已重置');
	}
}

// 【架构优化】实例池轮换，避免竞争
const POOL_SIZE = 2;
const instancePool: ImageLoaderCore[] = [];
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
