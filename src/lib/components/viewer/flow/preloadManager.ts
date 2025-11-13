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
	// 新增回调
	onUpscaleStart?: () => void;
	onCacheHit?: (detail: any) => void;
	onCheckPreloadCache?: (detail: any) => void;
}

export class PreloadManager {
	private imageLoader: ImageLoader;
	private performancePreloadPages: number;
	private performanceMaxThreads: number;
	private performanceSettingsListener: (preLoadSize: number, maxThreads: number) => void;
	private eventListeners: ReturnType<typeof createEventListeners>;
	private cleanupEventListeners: () => void;
	private bookUnsubscribe: () => void;

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

		// 取消书籍切换监听
		if (this.bookUnsubscribe) {
			this.bookUnsubscribe();
		}

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
		// 调用 ImageLoader 的 updateConfig 方法
		this.imageLoader.updateConfig({
			preloadPages: this.performancePreloadPages,
			maxThreads: this.performanceMaxThreads
		});
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
	 * 设置书籍切换监听器
	 */
	private setupBookChangeListener(): void {
		let currentBookPath: string | undefined;
		
		// 监听书籍切换
		const unsubscribe = bookStore.subscribe((state) => {
			const newBookPath = state.currentBook?.path;
			
			// 如果书籍路径发生变化
			if (newBookPath !== currentBookPath) {
				// 清理上一本书的缓存
				this.imageLoader.cleanup();
				
				// 重置预超分进度
				this.resetPreUpscaleProgress();
				
				// 重新初始化以加载新书的缓存
				if (newBookPath) {
					this.imageLoader.initialize();
				}
				
				currentBookPath = newBookPath;
				console.log('书籍已切换:', newBookPath);
			}
		});
		
		// 保存取消订阅函数
		this.bookUnsubscribe = unsubscribe;
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