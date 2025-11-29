/**
 * ImageLoaderFacade - 图片加载门面
 * 组合 ImageLoaderCore 和 UpscaleHandler
 * 当全局超分开关关闭时，完全跳过超分逻辑
 */

import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import { settingsManager, performanceSettings } from '$lib/settings/settingsManager';
import { taskScheduler } from '$lib/core/tasks/taskScheduler';
import { logImageTrace, createImageTraceId } from '$lib/utils/imageTrace';

import { ImageLoaderCore, getImageLoaderCore, LoadPriority } from './imageLoaderCore';
import { UpscaleHandler, getUpscaleHandler } from './upscaleHandler';
import { getAutoUpscaleEnabled, enqueuePreloadBatchJobs, type PreloadBatchJobInput } from './preloadRuntime';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
import { evaluateConditions, collectPageMetadata } from '$lib/utils/upscale/conditions';

interface ImageDimensions {
	width: number;
	height: number;
}

export interface ImageLoaderOptions {
	performancePreloadPages: number;
	performanceMaxThreads: number;
	viewMode?: 'single' | 'double' | 'panorama';
	onImageLoaded?: (objectUrl: string, objectUrl2?: string) => void;
	onImageMetadataReady?: (metadata: ImageDimensions | null, metadata2?: ImageDimensions | null) => void;
	onPreloadProgress?: (progress: number, total: number) => void;
	onError?: (error: string) => void;
	onLoadingStateChange?: (loading: boolean, visible: boolean) => void;
}

/**
 * ImageLoader - 兼容旧接口的门面类
 * 内部使用模块化的核心组件
 */
export class ImageLoader {
	private core: ImageLoaderCore;
	private upscaleHandler: UpscaleHandler;
	private options: ImageLoaderOptions;
	
	// 加载状态
	private loading = false;
	private loadingVisible = false;
	private loadingTimeout: number | null = null;
	
	// 预加载相关
	private totalPreUpscalePages = 0;
	private preUpscaleProgress = 0;
	private pendingPreloadTasks = new Set<string>();
	private pendingPreloadJobId: string | null = null;
	private pendingCacheTrimJobId: string | null = null;
	private unsubscribeTaskWatcher: (() => void) | null = null;
	private upscaleCompleteListener?: EventListener;

	constructor(options: ImageLoaderOptions) {
		this.options = options;
		
		// 初始化核心加载器
		this.core = getImageLoaderCore({
			maxConcurrentLoads: options.performanceMaxThreads,
			maxCacheSizeMB: settingsManager.getSettings().performance.cacheMemorySize || 500
		});
		
		// 初始化超分处理器
		this.upscaleHandler = getUpscaleHandler();
		
		// 监听超分完成事件
		if (typeof window !== 'undefined') {
			this.upscaleCompleteListener = ((event: CustomEvent) => {
				const detail = event.detail;
				const hash: string | undefined = detail?.originalImageHash;
				if (hash) {
					this.pendingPreloadTasks.delete(hash);
				}
				this.updatePreUpscaleProgress();
			}) as EventListener;
			window.addEventListener('upscale-complete', this.upscaleCompleteListener);
		}
		
		// 监听任务调度器
		this.unsubscribeTaskWatcher = taskScheduler.subscribe((snapshot) => {
			if (snapshot.id === this.pendingPreloadJobId) {
				if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
					this.pendingPreloadJobId = null;
				}
			}
			if (snapshot.id === this.pendingCacheTrimJobId) {
				if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
					this.pendingCacheTrimJobId = null;
				}
			}
		});
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: { preloadPages?: number; maxThreads?: number; viewMode?: 'single' | 'double' | 'panorama' }): void {
		if (config.preloadPages !== undefined) {
			this.options.performancePreloadPages = config.preloadPages;
		}
		if (config.maxThreads !== undefined) {
			this.options.performanceMaxThreads = config.maxThreads;
		}
		if (config.viewMode !== undefined) {
			this.options.viewMode = config.viewMode;
		}
	}

	/**
	 * 初始化
	 */
	initialize(): void {
		console.log('ImageLoader (Facade) 初始化');
	}

	/**
	 * 加载当前页面图片（核心方法）
	 */
	async loadCurrentImage(): Promise<void> {
		const currentPageIndex = bookStore.currentPageIndex;
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		// 取消上一页的超分任务
		await this.upscaleHandler.cancelPreviousUpscale(currentPageIndex);

		this.loading = true;
		this.loadingVisible = false;
		this.options.onError?.('');

		// 【渐进式加载】如果缓存中有图片，立即显示
		if (this.core.hasCache(currentPageIndex)) {
			const cachedUrl = this.core.getCachedUrl(currentPageIndex)!;
			console.log(`⚡ 快速显示缓存: 页码 ${currentPageIndex + 1}`);
			this.options.onImageLoaded?.(cachedUrl);
		}

		// 延迟显示 loading
		this.loadingTimeout = window.setTimeout(() => {
			if (this.loading && !this.core.hasCache(currentPageIndex)) {
				this.loadingVisible = true;
				this.options.onLoadingStateChange?.(this.loading, this.loadingVisible);
			}
		}, 300);

		try {
			// 使用最高优先级加载当前页
			const result = await this.core.loadPage(currentPageIndex, LoadPriority.CRITICAL);
			const objectUrl = result.url;

			// 双页模式：加载下一页
			let objectUrl2: string | undefined;
			if (this.options.viewMode === 'double' && bookStore.canNextPage) {
				const nextPageIndex = currentPageIndex + 1;
				if (nextPageIndex < currentBook.pages.length) {
					const result2 = await this.core.loadPage(nextPageIndex, LoadPriority.HIGH);
					objectUrl2 = result2.url;
				}
			}

			// 【关键】只在全局开关开启时处理超分
			const upscaleEnabled = await getAutoUpscaleEnabled();
			if (upscaleEnabled) {
				const imageHash = bookStore.getPageHash(currentPageIndex);
				if (imageHash && result.blob) {
					await this.upscaleHandler.handlePageUpscale(currentPageIndex, result.blob, imageHash);
				}
			}

			// 调用回调
			this.options.onImageLoaded?.(objectUrl, objectUrl2);
			this.options.onImageMetadataReady?.(result.dimensions, undefined);

			// 触发预加载（只在超分开启时预超分）
			setTimeout(() => this.preloadNextPages(), 500);

		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to load image';
			console.error('Failed to load image:', err);
			this.options.onError?.(errorMessage);
		} finally {
			this.loading = false;
			this.loadingVisible = false;
			this.options.onLoadingStateChange?.(this.loading, this.loadingVisible);

			if (this.loadingTimeout) {
				clearTimeout(this.loadingTimeout);
				this.loadingTimeout = null;
			}
		}
	}

	/**
	 * 预加载后续页面
	 */
	async preloadNextPages(): Promise<void> {
		if (this.pendingPreloadJobId) {
			return;
		}

		const snapshot = taskScheduler.enqueue({
			type: 'preload-next-pages',
			priority: 'normal',
			bucket: 'forward',
			source: 'imageLoader',
			executor: () => this.processPreloadNextPages()
		});
		this.pendingPreloadJobId = snapshot.id;
	}

	private async processPreloadNextPages(): Promise<void> {
		const preloadPages = this.options.performancePreloadPages;
		if (preloadPages <= 0) return;

		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		const currentPageIndex = bookStore.currentPageIndex;
		
		// 【优化】使用智能双向预加载替代简单的范围预加载
		await this.core.smartPreload({
			preloadSize: preloadPages,
			isDoublePage: this.options.viewMode === 'double',
			forwardRatio: 0.7 // 70% 前向预加载
		});

		// 【关键】只在全局开关开启时预超分
		const upscaleEnabled = await getAutoUpscaleEnabled();
		if (!upscaleEnabled) {
			console.log('自动超分已关闭，跳过预超分');
			return;
		}

		// 执行预超分逻辑
		await this.processPreUpscale(currentPageIndex, preloadPages, currentBook);
	}

	/**
	 * 预超分逻辑（只在开关开启时调用）
	 */
	private async processPreUpscale(currentPageIndex: number, preloadPages: number, currentBook: any): Promise<void> {
		const totalPages = currentBook.pages.length;
		const start = Math.max(0, currentPageIndex + 1);
		const end = Math.min(totalPages - 1, currentPageIndex + preloadPages);

		const jobs: PreloadBatchJobInput[] = [];

		for (let i = start; i <= end; i++) {
			const imageHash = bookStore.getPageHash(i);
			if (!imageHash || this.pendingPreloadTasks.has(imageHash)) {
				continue;
			}

			// 检查条件
			const pageInfo = currentBook.pages[i];
			const panelSettings = loadUpscalePanelSettings();
			let conditionId: string | undefined;
			let shouldSkip = false;

			if (panelSettings.conditionalUpscaleEnabled && pageInfo) {
				const pageMetadata = collectPageMetadata(pageInfo, currentBook.path);
				const conditionResult = evaluateConditions(pageMetadata, panelSettings.conditionsList);
				conditionId = conditionResult.conditionId ?? undefined;
				shouldSkip = conditionResult.action?.skip === true;
			}

			if (shouldSkip) continue;

			// 确保 blob 已缓存
			if (!this.core.hasCache(i)) continue;

			jobs.push({
				pageIndex: i,
				imageHash,
				conditionId
			});

			this.pendingPreloadTasks.add(imageHash);
		}

		if (jobs.length > 0 && currentBook.path) {
			this.totalPreUpscalePages = jobs.length;
			await enqueuePreloadBatchJobs(currentBook.path, jobs);
		}
	}

	/**
	 * 获取缩略图
	 */
	async getThumbnail(pageIndex: number): Promise<string> {
		return this.core.getThumbnail(pageIndex);
	}

	/**
	 * 获取 Blob
	 */
	async getBlob(pageIndex: number): Promise<Blob> {
		const result = await this.core.loadPage(pageIndex, LoadPriority.NORMAL);
		return result.blob;
	}

	/**
	 * 获取 Object URL
	 */
	async getObjectUrl(pageIndex: number): Promise<string> {
		const result = await this.core.loadPage(pageIndex, LoadPriority.NORMAL);
		return result.url;
	}

	/**
	 * 读取页面 Blob
	 */
	async readPageBlob(pageIndex: number): Promise<Blob> {
		return this.getBlob(pageIndex);
	}

	/**
	 * 计算 Blob Hash
	 */
	async calculateBlobHash(blob: Blob): Promise<string> {
		const arrayBuffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);

		try {
			return await invoke<string>('calculate_blob_md5', {
				bytes: Array.from(bytes)
			});
		} catch (error) {
			const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		}
	}

	/**
	 * 获取加载状态
	 */
	getLoadingState(): { loading: boolean; visible: boolean } {
		return { loading: this.loading, visible: this.loadingVisible };
	}

	/**
	 * 获取预超分进度
	 */
	getPreUpscaleProgress(): { progress: number; total: number; pages: Set<number> } {
		return {
			progress: this.preUpscaleProgress,
			total: this.totalPreUpscalePages,
			pages: new Set()
		};
	}

	/**
	 * 获取预加载内存缓存
	 */
	getPreloadMemoryCache(): Map<string, { url: string; blob: Blob }> {
		// 返回超分处理器的缓存
		const cache = new Map<string, { url: string; blob: Blob }>();
		// 注意：这里简化处理，实际应该返回真实的缓存
		return cache;
	}

	/**
	 * 更新预超分进度
	 */
	private updatePreUpscaleProgress(): void {
		if (this.totalPreUpscalePages > 0) {
			this.preUpscaleProgress = this.totalPreUpscalePages - this.pendingPreloadTasks.size;
			this.options.onPreloadProgress?.(this.preUpscaleProgress, this.totalPreUpscalePages);
		}
	}

	/**
	 * 重置预超分进度
	 */
	resetPreUpscaleProgress(): void {
		this.totalPreUpscalePages = 0;
		this.preUpscaleProgress = 0;
		this.pendingPreloadTasks.clear();
	}

	/**
	 * 书籍切换时重置（异步执行，不阻塞切换）
	 */
	resetForBookChange(options: { preservePreloadCache?: boolean } = {}): void {
		// 【优化】使用 queueMicrotask 异步清理，避免阻塞 UI
		queueMicrotask(() => {
			if (!options.preservePreloadCache) {
				this.upscaleHandler.clearMemoryCache();
			}
			this.pendingPreloadTasks.clear();
			this.resetPreUpscaleProgress();
			
			// 【优化】延迟清理 blob 缓存，让新书籍的加载先开始
			setTimeout(() => {
				this.core.clearCache();
				console.log('📦 旧书籍缓存清理完成');
			}, 100);
		});
	}

	/**
	 * 整理缓存
	 */
	trimCaches(): void {
		// 核心模块自动管理缓存
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		if (this.loadingTimeout) {
			clearTimeout(this.loadingTimeout);
		}
		if (this.upscaleCompleteListener && typeof window !== 'undefined') {
			window.removeEventListener('upscale-complete', this.upscaleCompleteListener);
		}
		if (this.unsubscribeTaskWatcher) {
			this.unsubscribeTaskWatcher();
		}
		this.core.reset();
		this.upscaleHandler.reset();
	}
}
