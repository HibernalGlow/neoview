/**
 * Preload Manager
 * 预加载管理器，提供高级的预加载控制接口
 */

import { performanceSettings } from '$lib/settings/settingsManager';
import { bookStore } from '$lib/stores/book.svelte';
import { invoke } from '@tauri-apps/api/core';
import { ImageLoader, type ImageLoaderOptions } from './imageLoaderFacade';
import { createEventListeners, type EventListenersOptions } from './eventListeners';
import { createPreloadWorker } from './preloadWorker';
import { triggerAutoUpscale, getAutoUpscaleEnabled } from './preloadRuntime';
import { evaluateConditions, collectPageMetadata } from '$lib/utils/upscale/conditions';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';

// 扩展缓存类型以包含 sessionId
interface CacheEntry {
	url: string;
	blob: Blob;
	sessionId?: string;
}

// 扩展预加载任务以包含条件ID
export interface PreloadTaskWithCondition {
	blob: Blob;
	hash: string;
	pageIndex: number;
	conditionId?: string;
}

export interface PreloadManagerOptions {
	onImageLoaded?: (objectUrl: string, objectUrl2?: string) => void;
	onImageMetadataReady?: (metadata: { width: number; height: number } | null, metadata2?: { width: number; height: number } | null) => void;
	onPreloadProgress?: (progress: number, total: number) => void;
	onError?: (error: string) => void;
	onLoadingStateChange?: (loading: boolean, visible: boolean) => void;
	onUpscaleComplete?: (detail: any) => void;
	onUpscaleSaved?: (detail: any) => void;
	onRequestCurrentImageData?: (detail: any) => void;
	onResetPreUpscaleProgress?: () => void;
	onComparisonModeChanged?: (detail: any) => void;
	onProgressBarStateChange?: (detail: any) => void;
	// 新增回调
	onUpscaleStart?: () => void;
	onCacheHit?: (detail: any) => void;
	onCheckPreloadCache?: (detail: any) => void;
	onThumbnailReady?: (pageIndex: number, dataURL: string, source?: string) => void;
	// 初始配置
	initialPreloadPages?: number;
	initialMaxThreads?: number;
}

export class PreloadManager {
	private imageLoader: ImageLoader;
	private performancePreloadPages: number;
	private performanceMaxThreads: number;
	private performanceSettingsListener: (preLoadSize: number, maxThreads: number) => void;
	private eventListeners: ReturnType<typeof createEventListeners>;
	private cleanupEventListeners: () => void;
	
	private preloadWorker: ReturnType<typeof createPreloadWorker<any>>;
	private options: PreloadManagerOptions;
	private preUpscaledPages = new Set<number>();
	private thumbnailListeners = new Set<(pageIndex: number, dataURL: string, source?: string) => void>();
	private preloadRampTimer: number | null = null;
	private incrementalPreloadTimer: number | null = null;
	private incrementalPreloadCursor: number | null = null;
	private readonly incrementalPreloadIntervalMs = 5000;
	private readonly incrementalPreloadMaxChunk = 16;

	constructor(options: PreloadManagerOptions = {}) {
		// 保存选项
		this.options = options;
		if (options.onThumbnailReady) {
			this.thumbnailListeners.add(options.onThumbnailReady);
		}
		
		// 初始化性能配置，优先使用面板配置
		this.performancePreloadPages = options.initialPreloadPages ?? performanceSettings.preLoadSize;
		this.performanceMaxThreads = options.initialMaxThreads ?? performanceSettings.maxThreads;
		
		console.log('PreloadManager 初始化:', {
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads,
			source: {
				preloadPages: options.initialPreloadPages ? '面板配置' : '默认设置',
				maxThreads: options.initialMaxThreads ? '面板配置' : '默认设置'
			}
		});

		// 创建图片加载器
		this.imageLoader = new ImageLoader({
			performancePreloadPages: this.performancePreloadPages,
			performanceMaxThreads: this.performanceMaxThreads,
			onImageLoaded: options.onImageLoaded,
			onImageMetadataReady: options.onImageMetadataReady,
			onPreloadProgress: options.onPreloadProgress,
			onError: options.onError,
			onLoadingStateChange: options.onLoadingStateChange
		});
		
		// 创建预加载 worker
		this.preloadWorker = createPreloadWorker({
			concurrency: () => this.performanceMaxThreads,
			runTask: async (task: PreloadTaskWithCondition) => {
				// 调用 triggerAutoUpscale 进行预超分，传递 Blob 和条件ID
				await triggerAutoUpscale({
					blob: task.blob,
					hash: task.hash,
					conditionId: task.conditionId,
					pageIndex: task.pageIndex
				}, true);
				return undefined;
			},
			onTaskSuccess: () => {
				// 具体缓存与进度更新在调度事件回调中处理
			},
			onTaskFailure: (task, error) => {
				console.error('预加载任务失败，hash:', task.hash, error);
			}
		});

		const handleUpscaleComplete = (detail: any) => {
			options.onUpscaleComplete?.(detail);
			const targetIndex =
				typeof detail?.pageIndex === 'number' ? detail.pageIndex : bookStore.currentPageIndex;
			if (typeof targetIndex === 'number' && targetIndex >= 0) {
				this.preUpscaledPages = new Set([...this.preUpscaledPages, targetIndex]);
				this.updatePreUpscaleProgress();
			}
		};

		// 创建事件监听器
		this.eventListeners = createEventListeners({
			bookStore,
			onUpscaleComplete: handleUpscaleComplete,
			onUpscaleSaved: options.onUpscaleSaved,
			onRequestCurrentImageData: options.onRequestCurrentImageData,
			onResetPreUpscaleProgress: options.onResetPreUpscaleProgress,
			onComparisonModeChanged: options.onComparisonModeChanged,
			onProgressBarStateChange: options.onProgressBarStateChange,
			onUpscaleStart: options.onUpscaleStart,
			onCheckPreloadCache: this.handleCheckPreloadCache.bind(this),
			onCacheHit: this.handleCacheHit.bind(this)
		});

		// 保存清理函数
		this.cleanupEventListeners = this.eventListeners.cleanupEventListeners;

		// 监听性能配置变化
		this.performanceSettingsListener = (preLoadSize: number, maxThreads: number) => {
			this.performancePreloadPages = preLoadSize;
			this.performanceMaxThreads = maxThreads;
			
			// 更新图片加载器的配置
			this.updateImageLoaderConfig({
				preloadPages: this.performancePreloadPages,
				maxThreads: this.performanceMaxThreads
			});
		};
		
		performanceSettings.addListener(this.performanceSettingsListener);

		// 首次创建时立即执行预加载降级，确保打开第一本书不会拉满
		this.applyPreloadRamp();
	}

	/**
	 * 预加载阶梯：刚进入书籍时先用较保守的预加载配置，稍后恢复为完整配置
	 */
	private applyPreloadRamp(): void {
		if (typeof window === 'undefined') {
			return;
		}

		// 清理旧的定时器，避免重复叠加
		this.clearPreloadRampTimer();

		// 以当前性能配置作为目标值
		const targetPreload = this.performancePreloadPages;
		const targetThreads = this.performanceMaxThreads;

		// 阶梯阶段使用更保守的参数，避免一开始就拉满
		const rampPreload = Math.max(1, Math.min(targetPreload, 8));
		const rampThreads = Math.max(1, Math.min(targetThreads, 2));

		// 如果目标本身已经很小，就不做阶梯
		if (rampPreload === targetPreload && rampThreads === targetThreads) {
			return;
		}

		// 先应用保守配置
		this.updateImageLoaderConfig({
			preloadPages: rampPreload,
			maxThreads: rampThreads
		});

		// 一段时间后恢复为完整配置
		this.preloadRampTimer = window.setTimeout(() => {
			this.preloadRampTimer = null;
			this.updateImageLoaderConfig({
				preloadPages: targetPreload,
				maxThreads: targetThreads
			});
		}, 5000);
	}

	private clearPreloadRampTimer(): void {
		if (this.preloadRampTimer) {
			clearTimeout(this.preloadRampTimer);
			this.preloadRampTimer = null;
		}
	}

	/**
	 * 初始化管理器（在组件onMount时调用）
	 */
	initialize(): void {
		// 注册事件监听器
		this.eventListeners.registerEventListeners();

		// 监听书籍切换：清理上一本书的内存缓存
		this.setupBookChangeListener();
	}

	addThumbnailListener(listener: (pageIndex: number, dataURL: string, source?: string) => void): () => void {
		this.thumbnailListeners.add(listener);
		return () => {
			this.thumbnailListeners.delete(listener);
		};
	}

	private emitThumbnailReady(pageIndex: number, dataURL: string, source?: string) {
		for (const listener of this.thumbnailListeners) {
			try {
				listener(pageIndex, dataURL, source);
			} catch (error) {
				console.error('Thumbnail listener failed:', error);
			}
		}
	}

	/**
	 * 设置书籍变化监听器
	 */
	private setupBookChangeListener(): void {
		let lastBookPath: string | null = null;
		
		// 使用 $effect 监听书籍切换
		$effect(() => {
			const currentBook = bookStore.currentBook;
			const currentBookPath = currentBook?.path || null;
			
			if (currentBookPath && currentBookPath !== lastBookPath) {
				if (lastBookPath) {
					console.log('书籍路径发生变化，清理预加载缓存:', lastBookPath, '->', currentBookPath);
					invoke('cancel_upscale_jobs_for_book', { bookPath: lastBookPath }).catch((error) => {
						console.warn('取消上一书籍超分任务失败:', error);
					});
					
					// 重置预超分进度
					this.resetPreUpscaleProgress();
					this.preUpscaledPages.clear();
					
					// 重置图片加载器（保留可跨书复用的超分缓存）
					this.imageLoader.resetForBookChange({ preservePreloadCache: true });
				}

				this.applyPreloadRamp();
				this.startIncrementalPreloadForCurrentBook();
				lastBookPath = currentBookPath;
			}

			if (!currentBookPath) {
				lastBookPath = null;
				this.stopIncrementalPreloadLoop();
			}
		});
	}

	/**
	 * 清理管理器（在组件onDestroy时调用）
	 */
	cleanup(): void {
		// 清理事件监听器
		this.cleanupEventListeners();

		// 清理性能配置监听器
		performanceSettings.removeListener(this.performanceSettingsListener);

		this.clearPreloadRampTimer();
		this.stopIncrementalPreloadLoop();
		this.thumbnailListeners.clear();

		// 清理预加载 worker
		this.preloadWorker.clear();

		// 清理图片加载器
		this.imageLoader.cleanup();
	}

	/**
	 * 加载当前页面图片
	 */
	async loadCurrentImage(): Promise<void> {
		return this.imageLoader.loadCurrentImage();
	}

	/**
	 * 获取当前加载状态
	 */
	getLoadingState(): { loading: boolean; visible: boolean } {
		return this.imageLoader.getLoadingState();
	}

	/**
	 * 获取预超分进度
	 */
	getPreUpscaleProgress(): { progress: number; total: number; pages: Set<number> } {
		return this.imageLoader.getPreUpscaleProgress();
	}

	/**
	 * 重置预超分进度
	 */
	resetPreUpscaleProgress(): void {
		this.imageLoader.resetPreUpscaleProgress();
	}

	/**
	 * 获取内存预加载缓存
	 */
	getPreloadMemoryCache(): Map<string, { url: string; blob: Blob }> {
		return this.imageLoader.getPreloadMemoryCache();
	}

	/**
	 * 公开的配置更新方法（支持视图模式）
	 */
	updateImageLoaderConfigWithViewMode(viewMode: 'single' | 'double' | 'panorama'): void {
		this.imageLoader.updateConfig({
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads,
			viewMode
		});
	}

	/**
	 * 更新 ImageLoader 配置
	 */
	updateImageLoaderConfig(config: { preloadPages?: number; maxThreads?: number }): void {
		const nextPreload = config.preloadPages ?? this.performancePreloadPages;
		const nextThreads = config.maxThreads ?? this.performanceMaxThreads;

		if (
			nextPreload === this.performancePreloadPages &&
			nextThreads === this.performanceMaxThreads
		) {
			return;
		}

		this.performancePreloadPages = nextPreload;
		this.performanceMaxThreads = nextThreads;
		
		this.imageLoader.updateConfig({
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads
		});
		
		// 更新 worker 并发数
		this.preloadWorker.updateConcurrency(() => this.performanceMaxThreads);
		
		console.log('PreloadManager 配置已更新:', {
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads
		});
	}

	private startIncrementalPreloadForCurrentBook(): void {
		if (typeof window === 'undefined') {
			return;
		}
		const currentBook = bookStore.currentBook;
		if (!currentBook || currentBook.totalPages <= 0) {
			this.stopIncrementalPreloadLoop();
			return;
		}
		this.incrementalPreloadCursor = null;
		this.scheduleIncrementalPreloadTick();
	}

	private scheduleIncrementalPreloadTick(): void {
		if (typeof window === 'undefined') {
			return;
		}
		if (this.incrementalPreloadTimer) {
			clearTimeout(this.incrementalPreloadTimer);
			this.incrementalPreloadTimer = null;
		}
		this.incrementalPreloadTimer = window.setTimeout(() => {
			void this.runIncrementalPreloadTick();
		}, this.incrementalPreloadIntervalMs);
	}

	private async runIncrementalPreloadTick(): Promise<void> {
		this.incrementalPreloadTimer = null;
		const currentBook = bookStore.currentBook;
		if (!currentBook) {
			this.incrementalPreloadCursor = null;
			return;
		}

		const totalPages = currentBook.totalPages;
		if (totalPages <= 0) {
			this.incrementalPreloadCursor = null;
			return;
		}

		const currentIndex = bookStore.currentPageIndex;
		const minCursor = Math.min(totalPages, currentIndex + 1);

		let cursor = this.incrementalPreloadCursor;
		if (cursor === null || cursor < minCursor) {
			cursor = minCursor;
		}

		if (cursor >= totalPages) {
			this.incrementalPreloadCursor = totalPages;
			return;
		}

		const baseChunk = this.performancePreloadPages > 0 ? this.performancePreloadPages : 8;
		const chunkSize = Math.max(1, Math.min(this.incrementalPreloadMaxChunk, baseChunk));
		const endExclusive = Math.min(totalPages, cursor + chunkSize);

		for (let pageIndex = cursor; pageIndex < endExclusive; pageIndex++) {
			try {
				await this.imageLoader.getBlob(pageIndex);
				await this.requestThumbnail(pageIndex, 'incremental');
			} catch (error) {
				console.debug('增量预加载页面失败:', pageIndex, error);
			}
		}

		this.incrementalPreloadCursor = endExclusive;

		try {
			this.imageLoader.trimCaches();
		} catch (error) {
			console.debug('增量预加载缓存整理失败:', error);
		}

		if (this.incrementalPreloadCursor < totalPages) {
			this.scheduleIncrementalPreloadTick();
		}
	}

	private stopIncrementalPreloadLoop(): void {
		if (this.incrementalPreloadTimer) {
			clearTimeout(this.incrementalPreloadTimer);
			this.incrementalPreloadTimer = null;
		}
		this.incrementalPreloadCursor = null;
	}

	/**
	 * 请求缩略图
	 */
	async requestThumbnail(pageIndex: number, source?: string): Promise<string> {
		const thumb = await this.imageLoader.getThumbnail(pageIndex);
		this.emitThumbnailReady(pageIndex, thumb, source);
		return thumb;
	}
	
	/**
	 * 获取 Blob
	 */
	async getBlob(pageIndex: number): Promise<Blob> {
		return this.imageLoader.getBlob(pageIndex);
	}
	
	/**
	 * 获取 Object URL
	 */
	async getObjectUrl(pageIndex: number): Promise<string> {
		return this.imageLoader.getObjectUrl(pageIndex);
	}
	
	/**
	 * 触发预超分
	 */
	async triggerPreUpscale(range: number[]): Promise<void> {
		const autoUpscaleEnabled = await getAutoUpscaleEnabled();
		if (!autoUpscaleEnabled) {
			console.log('自动超分开关已关闭，跳过预超分');
			return;
		}
		
		for (const index of range) {
			this.enqueueUpscaleTask(index);
		}
	}
	
	/**
	 * 将超分任务加入队列
	 */
	private async enqueueUpscaleTask(pageIndex: number): Promise<void> {
		try {
			const blob = await this.imageLoader.getBlob(pageIndex);
			
			// 使用 bookStore 的统一 hash API
			const hash = bookStore.getPageHash(pageIndex);
			if (!hash) {
				console.warn(`页面 ${pageIndex + 1} 没有 stableHash，跳过预超分任务`);
				return;
			}
			console.log(`PreloadManager 使用稳定哈希，页码: ${pageIndex + 1}/${bookStore.totalPages}, hash: ${hash}`);
			
			// 创建任务 - 直接传递 Blob
			const task = {
				blob,
				hash,
				pageIndex
			};
			
			// 加入队列
			this.preloadWorker.enqueue(task);
		} catch (error) {
			console.error(`加入超分任务失败，页面 ${pageIndex}:`, error);
		}
	}
	
	/**
	 * 更新预超分进度
	 */
	private updatePreUpscaleProgress(): void {
		const total = this.totalPreUpscalePages;
		if (total > 0) {
			const progress = (this.preUpscaledPages.size / total) * 100;
			this.options.onPreloadProgress?.(progress, total);
		}
	}
	
	/**
	 * 获取总预超分页数
	 */
	private get totalPreUpscalePages(): number {
		return this.performancePreloadPages;
	}

	/**
	 * 获取当前性能配置
	 */
	getPerformanceConfig(): { preloadPages: number; maxThreads: number } {
		return {
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads
		};
	}

	/**
	 * 获取当前页面的 Blob 数据
	 */
	async getCurrentPageBlob(): Promise<Blob | null> {
		try {
			const currentPageIndex = bookStore.currentPageIndex;
			return await this.imageLoader.getBlob(currentPageIndex);
		} catch (error) {
			console.error('获取当前页面 Blob 失败:', error);
			return null;
		}
	}

	/**
	 * 处理缓存命中事件（来自磁盘超分缓存）
	 */
	private handleCacheHit(detail: any): void {
		if (!detail) return;
		const { imageHash, url, blob, preview } = detail;
		if (!imageHash || !blob || !url) {
			console.warn('cache-hit 事件缺少必要字段:', detail);
			return;
		}

		const cache = this.imageLoader.getPreloadMemoryCache();
		cache.set(imageHash, { url, blob });

		if (preview) {
			bookStore.setUpscaledImage(url);
			bookStore.setUpscaledImageBlob(blob);
		}

		console.log('从磁盘超分缓存写入内存预加载缓存，MD5:', imageHash);
	}

	/**
	 * 处理检查预加载缓存事件
	 */
	private handleCheckPreloadCache(detail: any): void {
		const { imageHash, preview } = detail;
		const cache = this.imageLoader.getPreloadMemoryCache();
		if (cache.has(imageHash)) {
			const cached = cache.get(imageHash);
			if (cached) {
				if (preview) {
					bookStore.setUpscaledImage(cached.url);
					bookStore.setUpscaledImageBlob(cached.blob);
				}
				console.log('从内存预加载缓存命中 upscaled，MD5:', imageHash);
			}
		}
	}
}

/**
 * 创建预加载管理器的便捷函数
 */
export function createPreloadManager(options: PreloadManagerOptions = {}): PreloadManager {
	return new PreloadManager(options);
}