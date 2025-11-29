/**
 * ImageLoaderAdapter - 适配器层
 * 将新的 ImageLoaderCore 适配到现有的 ImageLoader 接口
 * 保持与 preloadManager 的兼容性
 */

import { ImageLoaderCore, getImageLoaderCore, LoadPriority } from './imageLoaderCore';
import { bookStore } from '$lib/stores/book.svelte';
import { invoke } from '@tauri-apps/api/core';
import { logImageTrace, createImageTraceId } from '$lib/utils/imageTrace';
import {
	triggerAutoUpscale,
	checkUpscaleCache,
	getImageDataWithHash,
	getAutoUpscaleEnabled,
	type ImageDataWithHash,
	enqueuePreloadBatchJobs,
	type PreloadBatchJobInput
} from './preloadRuntime';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
import { evaluateConditions, collectPageMetadata } from '$lib/utils/upscale/conditions';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
import { taskScheduler } from '$lib/core/tasks/taskScheduler';
import { settingsManager } from '$lib/settings/settingsManager';

export interface ImageLoaderAdapterOptions {
	performancePreloadPages: number;
	performanceMaxThreads: number;
	viewMode?: 'single' | 'double' | 'panorama';
	onImageLoaded?: (objectUrl: string, objectUrl2?: string) => void;
	onImageMetadataReady?: (metadata: { width: number; height: number } | null, metadata2?: { width: number; height: number } | null) => void;
	onPreloadProgress?: (progress: number, total: number) => void;
	onError?: (error: string) => void;
	onLoadingStateChange?: (loading: boolean, visible: boolean) => void;
}

/**
 * ImageLoader 适配器
 * 使用新的模块化核心，同时保持与现有系统的兼容
 */
export class ImageLoaderAdapter {
	private core: ImageLoaderCore;
	private options: ImageLoaderAdapterOptions;
	
	// 超分相关状态
	private preloadMemoryCache = new Map<string, { url: string; blob: Blob }>();
	private pendingPreloadTasks = new Set<string>();
	private lastAutoUpscalePageIndex: number | null = null;
	private totalPreUpscalePages = 0;
	private preUpscaleProgress = 0;
	
	// 加载状态
	private loading = false;
	private loadingVisible = false;
	private loadingTimeout: number | null = null;
	private pendingPreloadJobId: string | null = null;

	constructor(options: ImageLoaderAdapterOptions) {
		this.options = options;
		this.core = getImageLoaderCore({
			maxConcurrentLoads: options.performanceMaxThreads,
			maxCacheSizeMB: settingsManager.getSettings().performance.cacheMemorySize || 500
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
		console.log('ImageLoaderAdapter 初始化');
	}

	/**
	 * 加载当前页面图片（核心方法）
	 */
	async loadCurrentImage(): Promise<void> {
		const currentPageIndex = bookStore.currentPageIndex;
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		// 取消上一页的超分任务
		if (this.lastAutoUpscalePageIndex !== null && this.lastAutoUpscalePageIndex !== currentPageIndex) {
			try {
				await invoke('cancel_upscale_jobs_for_page', {
					bookPath: currentBook.path ?? undefined,
					pageIndex: this.lastAutoUpscalePageIndex
				});
			} catch (error) {
				console.warn('取消上一页超分任务失败:', error);
			} finally {
				this.lastAutoUpscalePageIndex = null;
			}
		}

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
			
			// 获取 Object URL
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

			// 处理超分逻辑
			await this.handleUpscaleLogic(currentPageIndex, currentBook);

			// 调用回调
			this.options.onImageLoaded?.(objectUrl, objectUrl2);
			this.options.onImageMetadataReady?.(result.dimensions, undefined);

			// 触发预加载
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
	 * 处理超分逻辑
	 */
	private async handleUpscaleLogic(pageIndex: number, currentBook: any): Promise<void> {
		const imageHash = bookStore.getPageHash(pageIndex);
		if (!imageHash) return;

		// 检查是否应该跳过超分
		const pageInfo = currentBook.pages[pageIndex];
		const panelSettings = loadUpscalePanelSettings();
		let shouldSkipUpscale = false;

		if (panelSettings.conditionalUpscaleEnabled && pageInfo) {
			const pageMetadata = collectPageMetadata(pageInfo, currentBook.path);
			const conditionResult = evaluateConditions(pageMetadata, panelSettings.conditionsList);
			shouldSkipUpscale = conditionResult.action?.skip === true;
		}

		if (shouldSkipUpscale) {
			bookStore.setPageUpscaleStatus(pageIndex, 'none');
			return;
		}

		// 检查内存缓存
		const memCache = this.preloadMemoryCache.get(imageHash);
		if (memCache && memCache.blob && memCache.blob.size > 0) {
			console.log('✅ 使用内存超分缓存，页码:', pageIndex + 1);
			bookStore.setUpscaledImage(memCache.url);
			bookStore.setUpscaledImageBlob(memCache.blob);
			bookStore.setPageUpscaleStatus(pageIndex, 'done');
			this.dispatchUpscaleComplete(memCache.url, memCache.blob, imageHash, pageIndex);
			return;
		}

		// 尝试从磁盘加载
		const diskLoaded = await this.loadDiskUpscaleToMemory(imageHash);
		if (diskLoaded) {
			const diskCache = this.preloadMemoryCache.get(imageHash);
			if (diskCache) {
				console.log('✅ 从磁盘加载超分结果，页码:', pageIndex + 1);
				bookStore.setUpscaledImage(diskCache.url);
				bookStore.setUpscaledImageBlob(diskCache.blob);
				bookStore.setPageUpscaleStatus(pageIndex, 'done');
				this.dispatchUpscaleComplete(diskCache.url, diskCache.blob, imageHash, pageIndex);
				return;
			}
		}

		// 执行现场超分
		const autoUpscaleEnabled = await getAutoUpscaleEnabled();
		if (autoUpscaleEnabled) {
			const blob = this.core.getCachedBlob(pageIndex);
			if (blob) {
				try {
					await triggerAutoUpscale({
						blob,
						hash: imageHash,
						pageIndex
					});
					this.lastAutoUpscalePageIndex = pageIndex;
				} catch (error) {
					console.error('现场超分失败:', error);
				}
			}
		}
	}

	/**
	 * 分发超分完成事件
	 */
	private dispatchUpscaleComplete(url: string, blob: Blob, hash: string, pageIndex: number): void {
		window.dispatchEvent(new CustomEvent('upscale-complete', {
			detail: {
				imageData: url,
				imageBlob: blob,
				originalImageHash: hash,
				background: false,
				pageIndex
			}
		}));
	}

	/**
	 * 从磁盘加载超分结果到内存
	 */
	private async loadDiskUpscaleToMemory(imageHash: string): Promise<boolean> {
		try {
			// checkUpscaleCache 返回 boolean 或包含 data 的对象
			const cacheResult = await checkUpscaleCache(imageHash);
			
			// 如果返回的是字符串（base64 数据）
			if (typeof cacheResult === 'string' && cacheResult.length > 0) {
				const response = await fetch(cacheResult);
				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				this.preloadMemoryCache.set(imageHash, { url, blob });
				return true;
			}
			
			// 如果返回的是对象，检查 exists 和 data
			if (cacheResult && typeof cacheResult === 'object' && 'exists' in cacheResult) {
				const result = cacheResult as { exists: boolean; data?: string };
				if (result.exists && result.data) {
					const response = await fetch(result.data);
					const blob = await response.blob();
					const url = URL.createObjectURL(blob);
					this.preloadMemoryCache.set(imageHash, { url, blob });
					return true;
				}
			}
		} catch (error) {
			console.warn('从磁盘加载超分结果失败:', error);
		}
		return false;
	}

	/**
	 * 预加载后续页面
	 */
	async preloadNextPages(): Promise<void> {
		const preloadPages = this.options.performancePreloadPages;
		if (preloadPages <= 0) return;

		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		const currentPageIndex = bookStore.currentPageIndex;
		await this.core.preloadRange(currentPageIndex, preloadPages);
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
	 * 读取页面 Blob（兼容旧接口）
	 */
	async readPageBlob(pageIndex: number): Promise<Blob> {
		return this.getBlob(pageIndex);
	}

	/**
	 * 计算 Blob Hash（兼容旧接口）
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
	getPreUpscaleProgress(): { total: number; completed: number } {
		return { total: this.totalPreUpscalePages, completed: this.preUpscaleProgress };
	}

	/**
	 * 获取预加载内存缓存
	 */
	getPreloadMemoryCache(hash: string): { url: string; blob: Blob } | undefined {
		return this.preloadMemoryCache.get(hash);
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
	 * 书籍切换时重置
	 */
	resetForBookChange(options: { preservePreloadCache?: boolean } = {}): void {
		// 清理内存缓存
		if (!options.preservePreloadCache) {
			for (const [, item] of this.preloadMemoryCache) {
				URL.revokeObjectURL(item.url);
			}
			this.preloadMemoryCache.clear();
		}

		this.pendingPreloadTasks.clear();
		this.resetPreUpscaleProgress();
		this.core.clearCache();
	}

	/**
	 * 清理资源
	 */
	cleanup(): void {
		if (this.loadingTimeout) {
			clearTimeout(this.loadingTimeout);
		}
		this.core.reset();
		this.preloadMemoryCache.clear();
	}

	/**
	 * 整理缓存
	 */
	trimCaches(): void {
		// 核心模块自动管理缓存
	}
}

// 工厂函数（兼容旧的 ImageLoader 接口）
export function createImageLoaderAdapter(options: ImageLoaderAdapterOptions): ImageLoaderAdapter {
	return new ImageLoaderAdapter(options);
}
