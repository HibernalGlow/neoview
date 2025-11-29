/**
 * 图片管道总控制器
 * 整合作业引擎、缓存管理、预加载、超分等模块
 * 提供统一的图片加载接口
 */

import { getJobEngine, type EngineConfig } from './job/JobEngine';
import { getCacheManager, type CacheManagerConfig } from './cache/CacheManager';
import { PreloadManager, type PreloadConfig, type PreloadContext } from './preload/PreloadManager';
import { getUpscaleService, type UpscaleServiceConfig } from './upscale/UpscaleService';
import { loadPageData } from './source/SourceStrategy';
import {
	type PageInfo,
	type ImageSize,
	type PipelineConfig,
	type PipelineEvent,
	type PipelineEventListener,
	type LoadResult,
	PageContentState,
	UpscaleState,
	JobPriority,
	createPageRange
} from './types';

/** 管道状态 */
export interface PipelineState {
	initialized: boolean;
	currentBookPath: string | null;
	currentPageIndex: number;
	totalPages: number;
	isLoading: boolean;
	isPreloading: boolean;
	cacheStats: {
		blobCount: number;
		blobSize: number;
		upscaleCount: number;
		upscaleSize: number;
	};
}

/** 页面加载选项 */
export interface PageLoadOptions {
	priority?: JobPriority;
	skipCache?: boolean;
	autoUpscale?: boolean;
}

/**
 * 图片管道
 * 统一管理图片加载流程
 */
export class ImagePipeline {
	private static instance: ImagePipeline | null = null;

	private config: PipelineConfig;
	private preloadManager: PreloadManager;
	private eventListeners: PipelineEventListener[] = [];
	private currentContext: PreloadContext | null = null;
	private disposed = false;
	private loadingPages = new Set<number>();

	private constructor(config?: Partial<PipelineConfig>) {
		this.config = {
			preloadPages: 5,
			maxWorkers: 4,
			cacheConfig: {
				maxMemorySize: 512 * 1024 * 1024,
				maxItems: 50,
				ttl: 5 * 60 * 1000,
				cleanupInterval: 60 * 1000
			},
			upscaleConfig: {
				modelName: '2x_MangaJaNai_1200p_V1_ESRGAN_70k',
				scaleFactor: 2,
				tileSize: 256,
				noiseLevel: 0,
				useTTA: false,
				gpuId: 0
			},
			autoUpscale: true,
			viewMode: 'single',
			...config
		};

		this.preloadManager = new PreloadManager({
			preloadSize: this.config.preloadPages,
			enableAhead: true,
			concurrentLoads: 3
		});

		// 监听预加载事件
		this.preloadManager.addEventListener((event) => {
			this.emitEvent({
				type: 'preload-progress',
				loaded: event.loaded ?? 0,
				total: event.total ?? 0,
				currentIndex: event.pageIndex ?? 0
			});
		});
	}

	/** 获取单例 */
	static getInstance(config?: Partial<PipelineConfig>): ImagePipeline {
		if (!ImagePipeline.instance) {
			ImagePipeline.instance = new ImagePipeline(config);
		}
		return ImagePipeline.instance;
	}

	/** 重置单例 */
	static resetInstance(): void {
		if (ImagePipeline.instance) {
			ImagePipeline.instance.dispose();
			ImagePipeline.instance = null;
		}
	}

	/** 初始化管道 */
	async initialize(): Promise<boolean> {
		try {
			// 初始化作业引擎
			getJobEngine({
				maxWorkerSize: this.config.maxWorkers,
				initialWorkerSize: 2,
				primaryWorkerCount: 1
			});

			// 初始化缓存管理器
			getCacheManager({
				memoryLimit: this.config.cacheConfig.maxMemorySize,
				enableAutoCleanup: true
			});

			// 初始化超分服务
			if (this.config.autoUpscale) {
				const upscaleService = getUpscaleService({
					autoUpscaleEnabled: true,
					defaultConfig: this.config.upscaleConfig
				});
				await upscaleService.initialize();
			}

			return true;
		} catch (error) {
			console.error('Failed to initialize pipeline:', error);
			return false;
		}
	}

	/** 设置书籍上下文 */
	setBookContext(
		bookPath: string,
		pages: PageInfo[],
		currentIndex: number = 0
	): void {
		// 如果书籍变更，清理旧缓存
		if (this.currentContext?.bookPath !== bookPath) {
			this.clearBookCache();
		}

		this.currentContext = {
			bookPath,
			currentIndex,
			totalPages: pages.length,
			direction: 1,
			pages
		};

		this.preloadManager.setContext(this.currentContext);
	}

	/** 更新配置 */
	updateConfig(config: Partial<PipelineConfig>): void {
		Object.assign(this.config, config);

		if (config.preloadPages !== undefined) {
			this.preloadManager.updateConfig({
				preloadSize: config.preloadPages
			});
		}

		if (config.maxWorkers !== undefined) {
			const jobEngine = getJobEngine();
			jobEngine.changeWorkerSize(config.maxWorkers);
		}
	}

	/** 加载当前页面 */
	async loadPage(
		pageIndex: number,
		options?: PageLoadOptions
	): Promise<LoadResult> {
		if (!this.currentContext) {
			throw new Error('No book context set');
		}

		const startTime = Date.now();
		const page = this.currentContext.pages[pageIndex];
		if (!page) {
			throw new Error(`Page ${pageIndex} not found`);
		}

		const cacheManager = getCacheManager();
		const priority = options?.priority ?? JobPriority.Critical;

		// 标记正在加载
		this.loadingPages.add(pageIndex);

		try {
			// 1. 检查缓存
			if (!options?.skipCache && cacheManager.hasBlob(pageIndex, this.currentContext.bookPath)) {
				const blob = cacheManager.getBlob(pageIndex, this.currentContext.bookPath)!;
				const objectUrl = cacheManager.getBlobUrl(pageIndex, this.currentContext.bookPath)!;
				
				cacheManager.touchBlob(pageIndex, this.currentContext.bookPath);

				this.emitEvent({
					type: 'page-load',
					pageIndex,
					objectUrl,
					fromCache: true
				});

				// 触发预加载
				this.triggerPreload(pageIndex);

				// 检查并触发超分
				if (this.config.autoUpscale && (options?.autoUpscale ?? true)) {
					await this.checkAndTriggerUpscale(pageIndex, blob, page.hash);
				}

				return {
					pageIndex,
					source: {
						pageIndex,
						source: {
							data: blob,
							dataUrl: null,
							objectUrl,
							dataSize: blob.size,
							pictureInfo: null,
							errorMessage: null
						},
						state: PageContentState.View,
						upscaleState: UpscaleState.None,
						lastAccessed: Date.now(),
						memorySize: blob.size
					},
					duration: Date.now() - startTime,
					fromCache: true
				};
			}

			// 2. 加载页面数据
			const result = await loadPageData(page);
			
			if (result.errorMessage || !result.data) {
				throw new Error(result.errorMessage || 'Failed to load page');
			}

			// 3. 缓存数据
			const objectUrl = cacheManager.setBlob(
				pageIndex,
				result.data,
				this.currentContext.bookPath,
				page.hash
			);

			this.emitEvent({
				type: 'page-load',
				pageIndex,
				objectUrl,
				metadata: result.pictureInfo?.size,
				fromCache: false
			});

			// 4. 触发预加载
			this.triggerPreload(pageIndex);

			// 5. 检查并触发超分
			if (this.config.autoUpscale && (options?.autoUpscale ?? true)) {
				await this.checkAndTriggerUpscale(pageIndex, result.data, page.hash);
			}

			return {
				pageIndex,
				source: {
					pageIndex,
					source: result,
					state: PageContentState.View,
					upscaleState: UpscaleState.None,
					lastAccessed: Date.now(),
					memorySize: result.dataSize
				},
				duration: Date.now() - startTime,
				fromCache: false
			};
		} finally {
			this.loadingPages.delete(pageIndex);
		}
	}

	/** 触发预加载 */
	private triggerPreload(currentIndex: number): void {
		if (!this.currentContext) return;

		const direction = this.currentContext.direction;
		const range = createPageRange(currentIndex, currentIndex);

		// 异步触发预加载
		this.preloadManager.requestLoad(range, direction).catch(error => {
			console.error('Preload error:', error);
		});
	}

	/** 检查并触发超分 */
	private async checkAndTriggerUpscale(
		pageIndex: number,
		blob: Blob,
		hash?: string
	): Promise<void> {
		if (!hash) return;

		const upscaleService = getUpscaleService();
		
		// 检查缓存
		const hasCache = await upscaleService.checkCache(hash);
		if (hasCache) {
			// 从缓存加载
			const result = await upscaleService.loadFromCache(hash);
			if (result?.success) {
				this.emitEvent({
					type: 'upscale-complete',
					pageIndex,
					originalHash: hash,
					outputUrl: result.outputUrl!,
					outputBlob: result.outputBlob!,
					background: false
				});
			}
			return;
		}

		// 提交超分任务
		await upscaleService.submitTask(
			pageIndex,
			hash,
			blob,
			this.config.upscaleConfig,
			JobPriority.High
		);
	}

	/** 获取页面 Object URL */
	getPageUrl(pageIndex: number): string | null {
		if (!this.currentContext) return null;
		
		const cacheManager = getCacheManager();
		return cacheManager.getBlobUrl(pageIndex, this.currentContext.bookPath);
	}

	/** 获取超分后的 URL */
	getUpscaledUrl(hash: string): string | null {
		const cacheManager = getCacheManager();
		return cacheManager.getUpscaleUrl(hash);
	}

	/** 获取页面 Blob */
	getPageBlob(pageIndex: number): Blob | null {
		if (!this.currentContext) return null;
		
		const cacheManager = getCacheManager();
		return cacheManager.getBlob(pageIndex, this.currentContext.bookPath);
	}

	/** 检查页面是否已缓存 */
	hasPageCached(pageIndex: number): boolean {
		if (!this.currentContext) return false;
		
		const cacheManager = getCacheManager();
		return cacheManager.hasBlob(pageIndex, this.currentContext.bookPath);
	}

	/** 预加载指定范围 */
	async preloadRange(centerIndex: number, radius: number): Promise<void> {
		if (!this.currentContext) return;

		const start = Math.max(0, centerIndex - radius);
		const end = Math.min(this.currentContext.totalPages - 1, centerIndex + radius);
		const range = createPageRange(start, end);

		await this.preloadManager.requestLoad(range, this.currentContext.direction);
	}

	/** 取消页面加载 */
	cancelPageLoad(pageIndex: number): void {
		const jobEngine = getJobEngine();
		jobEngine.cancelPageJobs(pageIndex, this.currentContext?.bookPath);
	}

	/** 清理当前书籍缓存 */
	clearBookCache(): void {
		if (this.currentContext) {
			const cacheManager = getCacheManager();
			cacheManager.clearBook(this.currentContext.bookPath);
		}
	}

	/** 清理所有缓存 */
	clearAllCache(): void {
		const cacheManager = getCacheManager();
		cacheManager.clearAll();
	}

	/** 添加事件监听器 */
	addEventListener(listener: PipelineEventListener): () => void {
		this.eventListeners.push(listener);
		return () => {
			const index = this.eventListeners.indexOf(listener);
			if (index !== -1) {
				this.eventListeners.splice(index, 1);
			}
		};
	}

	/** 触发事件 */
	private emitEvent(event: PipelineEvent): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('Pipeline event listener error:', error);
			}
		}
	}

	/** 获取状态 */
	getState(): PipelineState {
		const cacheManager = getCacheManager();
		const stats = cacheManager.getStats();

		return {
			initialized: true,
			currentBookPath: this.currentContext?.bookPath ?? null,
			currentPageIndex: this.currentContext?.currentIndex ?? 0,
			totalPages: this.currentContext?.totalPages ?? 0,
			isLoading: this.loadingPages.size > 0,
			isPreloading: this.preloadManager.loading,
			cacheStats: {
				blobCount: stats.blob.count,
				blobSize: stats.blob.size,
				upscaleCount: stats.upscale.count,
				upscaleSize: stats.upscale.size
			}
		};
	}

	/** 销毁管道 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		this.preloadManager.dispose();
		this.eventListeners = [];
		this.currentContext = null;
		this.loadingPages.clear();
	}
}

/** 获取图片管道实例 */
export function getImagePipeline(config?: Partial<PipelineConfig>): ImagePipeline {
	return ImagePipeline.getInstance(config);
}
