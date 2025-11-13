/**
 * Preload Manager
 * 预加载管理器，提供高级的预加载控制接口
 */

import { performanceSettings } from '$lib/settings/settingsManager';
import { bookStore } from '$lib/stores/book.svelte';
import { ImageLoader, type ImageLoaderOptions } from './imageLoader';
import { createEventListeners, type EventListenersOptions } from './eventListeners';

export interface PreloadManagerOptions {
	onImageLoaded?: (imageData: string, imageData2?: string) => void;
	onPreloadProgress?: (progress: number, total: number) => void;
	onError?: (error: string) => void;
	onLoadingStateChange?: (loading: boolean, visible: boolean) => void;
	onUpscaleComplete?: (detail: any) => void;
	onUpscaleSaved?: (detail: any) => void;
	onRequestCurrentImageData?: (detail: any) => void;
	onResetPreUpscaleProgress?: () => void;
	onComparisonModeChanged?: (detail: any) => void;
	onProgressBarStateChange?: (detail: any) => void;
}

export class PreloadManager {
	private imageLoader: ImageLoader;
	private performancePreloadPages: number;
	private performanceMaxThreads: number;
	private performanceSettingsListener: (preLoadSize: number, maxThreads: number) => void;
	private eventListeners: ReturnType<typeof createEventListeners>;
	private cleanupEventListeners: () => void;

	constructor(options: PreloadManagerOptions = {}) {
		// 初始化性能配置
		this.performancePreloadPages = performanceSettings.preLoadSize;
		this.performanceMaxThreads = performanceSettings.maxThreads;

		// 创建图片加载器
		this.imageLoader = new ImageLoader({
			performancePreloadPages: this.performancePreloadPages,
			performanceMaxThreads: this.performanceMaxThreads,
			onImageLoaded: options.onImageLoaded,
			onPreloadProgress: options.onPreloadProgress,
			onError: options.onError,
			onLoadingStateChange: options.onLoadingStateChange
		});

		// 创建事件监听器
		this.eventListeners = createEventListeners({
			bookStore,
			onUpscaleComplete: options.onUpscaleComplete,
			onUpscaleSaved: options.onUpscaleSaved,
			onRequestCurrentImageData: options.onRequestCurrentImageData,
			onResetPreUpscaleProgress: options.onResetPreUpscaleProgress,
			onComparisonModeChanged: options.onComparisonModeChanged,
			onProgressBarStateChange: options.onProgressBarStateChange,
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
			this.updateImageLoaderConfig();
		};
		
		performanceSettings.addListener(this.performanceSettingsListener);
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

	/**
	 * 清理管理器（在组件onDestroy时调用）
	 */
	cleanup(): void {
		// 清理事件监听器
		this.cleanupEventListeners();

		// 清理性能配置监听器
		performanceSettings.removeListener(this.performanceSettingsListener);

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
	 * 更新图片加载器配置
	 */
	private updateImageLoaderConfig(): void {
		// 这里可以添加更新配置的逻辑
		// 由于ImageLoader的构造函数参数，可能需要重新创建实例或添加更新方法
		console.log('更新图片加载器配置:', {
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads
		});
	}

	/**
	 * 设置书籍切换监听器
	 */
	private setupBookChangeListener(): void {
		// 这里可以添加书籍切换的监听逻辑
		// 当书籍切换时清理缓存
		console.log('设置书籍切换监听器');
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

	/**
	 * 处理缓存命中事件
	 */
	private handleCacheHit(detail: any): void {
		const { imageHash, url, blob, preview } = detail;
		
		if (preview) {
			bookStore.setUpscaledImage(url);
			bookStore.setUpscaledImageBlob(blob);
		}
		
		// 更新内存索引，便于后续快速命中
		// 这里可以添加更多逻辑
		console.log('缓存命中，hash:', imageHash);
	}

	/**
	 * 触发预加载（外部调用接口）
	 */
	async triggerPreload(): Promise<void> {
		return this.imageLoader.preloadNextPages();
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
}

/**
 * 创建预加载管理器的便捷函数
 */
export function createPreloadManager(options: PreloadManagerOptions = {}): PreloadManager {
	return new PreloadManager(options);
}