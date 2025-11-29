/**
 * Pipeline 适配器
 * 将新的 ImagePipeline 架构集成到现有的 ImageViewer 和 PreloadManager
 * 提供平滑迁移接口
 */

import { getImagePipeline, type PipelineState, type PageLoadOptions } from '../ImagePipeline';
import { getCacheManager } from '../cache/CacheManager';
import { getJobEngine } from '../job/JobEngine';
import { getUpscaleService } from '../upscale/UpscaleService';
import {
	type PageInfo,
	type PipelineEvent,
	JobPriority,
	JobCategory
} from '../types';

/** 加载请求 */
interface LoadRequest {
	pageIndex: number;
	priority: JobPriority;
	resolve: (url: string) => void;
	reject: (error: Error) => void;
}

/** 缩略图请求 */
interface ThumbnailRequest {
	pageIndex: number;
	source?: string;
	resolve: (dataUrl: string) => void;
	reject: (error: Error) => void;
}

/** 适配器配置 */
export interface AdapterConfig {
	maxConcurrentLoads: number;
	thumbnailHeight: number;
	preloadRadius: number;
	autoUpscale: boolean;
}

/** 事件回调 */
export interface AdapterCallbacks {
	onImageLoaded?: (pageIndex: number, objectUrl: string) => void;
	onThumbnailReady?: (pageIndex: number, dataUrl: string, source?: string) => void;
	onPreloadProgress?: (loaded: number, total: number) => void;
	onUpscaleComplete?: (pageIndex: number, url: string) => void;
	onError?: (error: string) => void;
}

/**
 * Pipeline 适配器
 * 兼容现有接口，内部使用新架构
 */
export class PipelineAdapter {
	private static instance: PipelineAdapter | null = null;

	private config: AdapterConfig;
	private callbacks: AdapterCallbacks = {};
	private initialized = false;
	
	// 请求队列
	private loadQueue: LoadRequest[] = [];
	private thumbnailQueue: ThumbnailRequest[] = [];
	private activeLoads = 0;
	private activeThumbnails = 0;
	
	// 缓存
	private thumbnailCache = new Map<number, string>();
	private pendingThumbnails = new Map<number, Promise<string>>();
	
	// 当前书籍上下文
	private currentBookPath: string | null = null;
	private currentPages: PageInfo[] = [];
	
	// 事件清理
	private unsubscribePipeline: (() => void) | null = null;

	private constructor(config?: Partial<AdapterConfig>) {
		this.config = {
			maxConcurrentLoads: 4,
			thumbnailHeight: 120,
			preloadRadius: 5,
			autoUpscale: true,
			...config
		};
	}

	/** 获取单例 */
	static getInstance(config?: Partial<AdapterConfig>): PipelineAdapter {
		if (!PipelineAdapter.instance) {
			PipelineAdapter.instance = new PipelineAdapter(config);
		}
		return PipelineAdapter.instance;
	}

	/** 重置单例 */
	static resetInstance(): void {
		if (PipelineAdapter.instance) {
			PipelineAdapter.instance.dispose();
			PipelineAdapter.instance = null;
		}
	}

	/** 初始化适配器 */
	async initialize(callbacks?: AdapterCallbacks): Promise<boolean> {
		if (this.initialized) return true;

		if (callbacks) {
			this.callbacks = callbacks;
		}

		try {
			// 初始化管道
			const pipeline = getImagePipeline({
				preloadPages: this.config.preloadRadius,
				maxWorkers: this.config.maxConcurrentLoads,
				autoUpscale: this.config.autoUpscale
			});

			await pipeline.initialize();

			// 监听管道事件
			this.unsubscribePipeline = pipeline.addEventListener((event) => {
				this.handlePipelineEvent(event);
			});

			this.initialized = true;
			return true;
		} catch (error) {
			console.error('Pipeline adapter initialization failed:', error);
			return false;
		}
	}

	/** 处理管道事件 */
	private handlePipelineEvent(event: PipelineEvent): void {
		switch (event.type) {
			case 'page-load':
				if (event.pageIndex !== undefined && event.objectUrl) {
					this.callbacks.onImageLoaded?.(event.pageIndex, event.objectUrl);
				}
				break;

			case 'upscale-complete':
				if (event.pageIndex !== undefined && event.outputUrl) {
					this.callbacks.onUpscaleComplete?.(event.pageIndex, event.outputUrl);
				}
				break;

			case 'preload-progress':
				if (event.loaded !== undefined && event.total !== undefined) {
					this.callbacks.onPreloadProgress?.(event.loaded, event.total);
				}
				break;

			case 'error':
				if (event.message) {
					this.callbacks.onError?.(event.message);
				}
				break;
		}
	}

	/** 设置书籍上下文 */
	setBookContext(bookPath: string, pages: PageInfo[]): void {
		// 清理旧书籍缓存
		if (this.currentBookPath && this.currentBookPath !== bookPath) {
			this.thumbnailCache.clear();
			this.pendingThumbnails.clear();
		}

		this.currentBookPath = bookPath;
		this.currentPages = pages;

		// 更新管道上下文
		const pipeline = getImagePipeline();
		pipeline.setBookContext(bookPath, pages, 0);
	}

	/**
	 * 加载页面 - 兼容旧接口
	 * 返回 Object URL
	 */
	async loadPage(pageIndex: number, priority: JobPriority = JobPriority.Normal): Promise<string> {
		if (!this.initialized) {
			throw new Error('Adapter not initialized');
		}

		const pipeline = getImagePipeline();
		const cacheManager = getCacheManager();

		// 检查缓存
		if (cacheManager.hasBlob(pageIndex, this.currentBookPath ?? undefined)) {
			const url = cacheManager.getBlobUrl(pageIndex, this.currentBookPath ?? undefined);
			if (url) {
				cacheManager.touchBlob(pageIndex, this.currentBookPath ?? undefined);
				return url;
			}
		}

		// 使用管道加载
		const result = await pipeline.loadPage(pageIndex, {
			priority,
			autoUpscale: this.config.autoUpscale
		});

		return result.source.source.objectUrl ?? '';
	}

	/**
	 * 获取缩略图 - 兼容旧接口
	 * 异步生成，不阻塞原图加载
	 */
	async getThumbnail(pageIndex: number, source?: string): Promise<string> {
		// 检查缓存
		const cached = this.thumbnailCache.get(pageIndex);
		if (cached) {
			return cached;
		}

		// 检查是否正在生成
		const pending = this.pendingThumbnails.get(pageIndex);
		if (pending) {
			return pending;
		}

		// 创建生成 Promise
		const generatePromise = this.generateThumbnail(pageIndex, source);
		this.pendingThumbnails.set(pageIndex, generatePromise);

		try {
			const dataUrl = await generatePromise;
			this.thumbnailCache.set(pageIndex, dataUrl);
			this.callbacks.onThumbnailReady?.(pageIndex, dataUrl, source);
			return dataUrl;
		} finally {
			this.pendingThumbnails.delete(pageIndex);
		}
	}

	/** 生成缩略图 */
	private async generateThumbnail(pageIndex: number, source?: string): Promise<string> {
		const cacheManager = getCacheManager();
		
		// 优先从缓存获取 Blob
		let blob = cacheManager.getBlob(pageIndex, this.currentBookPath ?? undefined);
		
		// 如果没有缓存，先加载（使用低优先级，不阻塞当前页）
		if (!blob) {
			const pipeline = getImagePipeline();
			await pipeline.loadPage(pageIndex, {
				priority: JobPriority.Low,
				autoUpscale: false
			});
			blob = cacheManager.getBlob(pageIndex, this.currentBookPath ?? undefined);
		}

		if (!blob) {
			throw new Error(`Failed to get blob for page ${pageIndex}`);
		}

		// 生成缩略图
		return this.createThumbnailFromBlob(blob);
	}

	/** 从 Blob 创建缩略图 */
	private createThumbnailFromBlob(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(blob);
			const img = new Image();

			img.onload = () => {
				try {
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d');
					
					if (!ctx) {
						URL.revokeObjectURL(url);
						reject(new Error('Cannot get canvas context'));
						return;
					}

					// 计算缩略图尺寸
					const maxHeight = this.config.thumbnailHeight;
					let width = img.naturalWidth;
					let height = img.naturalHeight;

					if (height > maxHeight) {
						width = (width * maxHeight) / height;
						height = maxHeight;
					}

					canvas.width = width;
					canvas.height = height;
					ctx.drawImage(img, 0, 0, width, height);

					const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
					URL.revokeObjectURL(url);
					resolve(dataUrl);
				} catch (error) {
					URL.revokeObjectURL(url);
					reject(error);
				}
			};

			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image for thumbnail'));
			};

			img.src = url;
		});
	}

	/**
	 * 预加载范围 - 兼容旧接口
	 */
	async preloadRange(centerIndex: number, radius?: number): Promise<void> {
		const pipeline = getImagePipeline();
		await pipeline.preloadRange(centerIndex, radius ?? this.config.preloadRadius);
	}

	/**
	 * 获取 Blob - 兼容旧接口
	 */
	async getBlob(pageIndex: number): Promise<Blob> {
		const cacheManager = getCacheManager();
		
		// 检查缓存
		let blob = cacheManager.getBlob(pageIndex, this.currentBookPath ?? undefined);
		if (blob) {
			return blob;
		}

		// 加载页面
		await this.loadPage(pageIndex, JobPriority.Normal);
		
		blob = cacheManager.getBlob(pageIndex, this.currentBookPath ?? undefined);
		if (!blob) {
			throw new Error(`Failed to load blob for page ${pageIndex}`);
		}

		return blob;
	}

	/**
	 * 获取 Object URL - 兼容旧接口
	 */
	async getObjectUrl(pageIndex: number): Promise<string> {
		const cacheManager = getCacheManager();
		
		// 检查缓存
		let url = cacheManager.getBlobUrl(pageIndex, this.currentBookPath ?? undefined);
		if (url) {
			return url;
		}

		// 加载页面
		return this.loadPage(pageIndex, JobPriority.Normal);
	}

	/**
	 * 检查是否有缓存
	 */
	hasCache(pageIndex: number): boolean {
		const cacheManager = getCacheManager();
		return cacheManager.hasBlob(pageIndex, this.currentBookPath ?? undefined);
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<AdapterConfig>): void {
		Object.assign(this.config, config);

		const pipeline = getImagePipeline();
		pipeline.updateConfig({
			preloadPages: this.config.preloadRadius,
			maxWorkers: this.config.maxConcurrentLoads,
			autoUpscale: this.config.autoUpscale
		});
	}

	/**
	 * 清理书籍缓存
	 */
	clearBookCache(): void {
		this.thumbnailCache.clear();
		this.pendingThumbnails.clear();

		const pipeline = getImagePipeline();
		pipeline.clearBookCache();
	}

	/**
	 * 清理所有缓存
	 */
	clearAllCache(): void {
		this.thumbnailCache.clear();
		this.pendingThumbnails.clear();

		const pipeline = getImagePipeline();
		pipeline.clearAllCache();
	}

	/**
	 * 获取状态
	 */
	getState(): PipelineState {
		const pipeline = getImagePipeline();
		return pipeline.getState();
	}

	/**
	 * 取消页面加载
	 */
	cancelPageLoad(pageIndex: number): void {
		const pipeline = getImagePipeline();
		pipeline.cancelPageLoad(pageIndex);
	}

	/**
	 * 销毁适配器
	 */
	dispose(): void {
		this.unsubscribePipeline?.();
		this.thumbnailCache.clear();
		this.pendingThumbnails.clear();
		this.loadQueue = [];
		this.thumbnailQueue = [];
		this.initialized = false;
	}
}

/** 获取适配器实例 */
export function getPipelineAdapter(config?: Partial<AdapterConfig>): PipelineAdapter {
	return PipelineAdapter.getInstance(config);
}

/**
 * 兼容层：提供与旧 ImageLoader 相似的接口
 */
export class ImageLoaderCompat {
	private adapter: PipelineAdapter;

	constructor(config?: Partial<AdapterConfig>) {
		this.adapter = getPipelineAdapter(config);
	}

	async initialize(callbacks?: AdapterCallbacks): Promise<void> {
		await this.adapter.initialize(callbacks);
	}

	async loadCurrentImage(pageIndex: number): Promise<string> {
		return this.adapter.loadPage(pageIndex, JobPriority.Critical);
	}

	async getThumbnail(pageIndex: number): Promise<string> {
		return this.adapter.getThumbnail(pageIndex);
	}

	async getBlob(pageIndex: number): Promise<Blob> {
		return this.adapter.getBlob(pageIndex);
	}

	async getObjectUrl(pageIndex: number): Promise<string> {
		return this.adapter.getObjectUrl(pageIndex);
	}

	async preloadRange(range: number[]): Promise<void> {
		if (range.length === 0) return;
		const center = range[Math.floor(range.length / 2)];
		const radius = Math.floor(range.length / 2);
		await this.adapter.preloadRange(center, radius);
	}

	setBookContext(bookPath: string, pages: PageInfo[]): void {
		this.adapter.setBookContext(bookPath, pages);
	}

	clearCache(): void {
		this.adapter.clearBookCache();
	}

	dispose(): void {
		// 适配器是单例，不在这里销毁
	}
}
