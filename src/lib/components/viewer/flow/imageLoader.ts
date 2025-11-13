/**
 * Image Loader
 * 页面加载和预加载逻辑模块
 */

import { invoke } from '@tauri-apps/api/core';
import { loadImage } from '$lib/api/fs';
import { loadImageFromArchive } from '$lib/api/filesystem';
import { bookStore } from '$lib/stores/book.svelte';
import { performanceSettings } from '$lib/settings/settingsManager';
import { 
	triggerAutoUpscale, 
	checkUpscaleCache, 
	getImageDataWithHash,
	getGlobalUpscaleEnabled,
	type ImageDataWithHash 
} from './preloadRuntime';
import { createPreloadWorker, type PreloadTask, type PreloadTaskResult } from './preloadWorker';

export interface ImageLoaderOptions {
	performancePreloadPages: number;
	performanceMaxThreads: number;
	viewMode?: 'single' | 'double' | 'panorama';
	onImageLoaded?: (imageData: string, imageData2?: string) => void;
	onPreloadProgress?: (progress: number, total: number) => void;
	onError?: (error: string) => void;
	onLoadingStateChange?: (loading: boolean, visible: boolean) => void;
}

export interface PreloadWorkerResult extends PreloadTaskResult {
	upscaledImageData?: string;
	upscaledImageBlob?: Blob;
}

export class ImageLoader {
	private options: ImageLoaderOptions;
	private preloadWorker: ReturnType<typeof createPreloadWorker<PreloadWorkerResult>>;
	private preloadMemoryCache = new Map<string, { url: string; blob: Blob }>();
	private preloadedPageImages = new Map<number, { data: string; decoded: boolean }>();
	private preUpscaledPages = new Set<number>();
	private totalPreUpscalePages = 0;
	private preUpscaleProgress = 0;
	private md5Cache = new Map<string, string>();
	private hashPathIndex = new Map<string, string>();
	private loading = false;
	private loadingVisible = false;
	private loadingTimeout: number | null = null;
	private isPreloading = false;

	constructor(options: ImageLoaderOptions) {
		this.options = options;
		
		// 初始化预加载worker
		this.preloadWorker = createPreloadWorker<PreloadWorkerResult>({
			concurrency: () => options.performanceMaxThreads,
			runTask: async (task: PreloadTask) => {
				// 调用已有的 triggerAutoUpscale 进行预超分
				return await triggerAutoUpscale(task, true);
			},
			onTaskSuccess: (task: PreloadTask, result: PreloadWorkerResult | undefined) => {
				if (result && result.upscaledImageBlob && result.upscaledImageData) {
					// 把返回的 data/blob 写入 preloadMemoryCache
					this.preloadMemoryCache.set(task.hash, { url: result.upscaledImageData, blob: result.upscaledImageBlob });
					
					// 标记预超分进度
					if (typeof task.pageIndex === 'number') {
						this.preUpscaledPages = new Set([...this.preUpscaledPages, task.pageIndex]);
						this.updatePreUpscaleProgress();
					}
					
					console.log('预加载任务成功，已写入缓存，hash:', task.hash);
				}
			},
			onTaskFailure: (task: PreloadTask, error: unknown) => {
				console.error('预加载任务失败，hash:', task.hash, error);
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
			// 更新 worker 的并发数 - 传入函数而不是值
			this.preloadWorker.updateConcurrency(() => config.maxThreads!);
		}
		if (config.viewMode !== undefined) {
			this.options.viewMode = config.viewMode;
		}
		
		console.log('ImageLoader 配置已更新:', {
			preloadPages: this.options.performancePreloadPages,
			maxThreads: this.options.performanceMaxThreads,
			viewMode: this.options.viewMode
		});
	}

	/**
	 * 初始化（用于重新加载 IndexedDB 缓存等）
	 */
	initialize(): void {
		// 这里可以添加从 IndexedDB 加载持久化缓存的逻辑
		console.log('ImageLoader 初始化');
	}

	/**
	 * 加载当前页面图片
	 */
	async loadCurrentImage(): Promise<void> {
		const currentPage = bookStore.currentPage;
		const currentBook = bookStore.currentBook;
		if (!currentPage || !currentBook) return;

		this.loading = true;
		this.loadingVisible = false;
		this.options.onError?.(null);

		// 设置1秒后显示loading动画
		this.loadingTimeout = setTimeout(() => {
			if (this.loading) {
				this.loadingVisible = true;
				this.options.onLoadingStateChange?.(this.loading, this.loadingVisible);
			}
		}, 1000);

		try {
			// 优先使用预加载解码的页面图片（若存在）以实现即时显示
			const currentIndex = bookStore.currentPageIndex;
			let data: string | null = null;
			let imageData2: string | null = null;

			if (this.preloadedPageImages.has(currentIndex)) {
				const cached = this.preloadedPageImages.get(currentIndex);
				if (cached && cached.data) {
					console.log('使用预加载缓存的当前页面图片，index:', currentIndex + 1);
					data = cached.data;
					// 标记为最近使用
					this.touchPreloadedPage(currentIndex);
				}
			} else {
				// 加载当前页（从磁盘/存档）
				if (currentBook.type === 'archive') {
					console.log('Loading image from archive:', currentPage.path);
					data = await loadImageFromArchive(currentBook.path, currentPage.path);
				} else {
					console.log('Loading image from file system:', currentPage.path);
					data = await loadImage(currentPage.path);
				}
			}

			// 双页模式：加载下一页
			if (this.options.viewMode === 'double' && bookStore.canNextPage) {
				const nextPage = bookStore.currentPageIndex + 1;
				const nextPageInfo = currentBook.pages[nextPage];
				
				if (nextPageInfo) {
					if (currentBook.type === 'archive') {
						imageData2 = await loadImageFromArchive(currentBook.path, nextPageInfo.path);
					} else {
						imageData2 = await loadImage(nextPageInfo.path);
					}
				}
			}

			// 获取带hash的图片数据：优先使用基于路径的稳定hash（archive::innerpath），回退到数据hash
			let imageDataWithHash = null;
			try {
				const pathKey = currentBook.type === 'archive' ? `${currentBook.path}::${currentPage.path}` : currentPage.path;
				try {
					const pathHash = await invoke<string>('calculate_path_hash', { path: pathKey });
					imageDataWithHash = { data, hash: pathHash };
				} catch (e) {
					console.warn('调用 calculate_path_hash 失败，回退到数据hash:', e);
				}
			} catch (e) {
				console.warn('生成路径hash异常，回退到数据hash:', e);
			}
			if (!imageDataWithHash) {
				imageDataWithHash = await getImageDataWithHash(data);
				if (!imageDataWithHash) {
					console.error('无法获取图片数据及hash');
					return;
				}
			}

			// 检查是否有对应的超分缓存（传入带hash的对象）
			const hasCache = await checkUpscaleCache(imageDataWithHash, true);

			// 如果没有缓存且全局超分开关开启，则自动开始超分
			if (!hasCache) {
				await triggerAutoUpscale(imageDataWithHash);
			}

			// 触发预加载后续页面
			setTimeout(() => {
				this.preloadNextPages();
			}, 1000);

			// 调用外部回调
			this.options.onImageLoaded?.(data, imageData2);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to load image';
			console.error('Failed to load image:', err);
			this.options.onError?.(errorMessage);
		} finally {
			this.loading = false;
			this.loadingVisible = false;
			this.options.onLoadingStateChange?.(this.loading, this.loadingVisible);
			
			// 清除延迟显示loading的定时器
			if (this.loadingTimeout) {
				clearTimeout(this.loadingTimeout);
				this.loadingTimeout = null;
			}
		}
	}

	/**
	 * 预加载后续页面的超分
	 */
	async preloadNextPages(): Promise<void> {
		try {
			// 使用性能配置中的预加载页数
			const preloadPages = this.options.performancePreloadPages;
			console.log('预加载设置:', { preloadPages, performanceMaxThreads: this.options.performanceMaxThreads });

			// 检查全局开关（如果关闭，仍执行普通的页面预加载/解码逻辑，但不触发预超分）
			const globalEnabled = await getGlobalUpscaleEnabled();
			if (!globalEnabled) {
				console.log('全局超分开关已关闭，预超分将被跳过，但会继续执行页面预加载解码');
			}

			if (preloadPages <= 0) {
				console.log('预加载页数为0，跳过预超分');
				return;
			}

			const currentBook = bookStore.currentBook;
			if (!currentBook) {
				console.log('没有当前书籍，跳过预超分');
				return;
			}

			const currentIndex = bookStore.currentPageIndex;
			const totalPages = bookStore.totalPages;

			// 初始化预超分进度
			this.totalPreUpscalePages = Math.min(preloadPages, totalPages - currentIndex - 1);
			this.preUpscaledPages = new Set();
			this.preUpscaleProgress = 0;

			if (this.totalPreUpscalePages <= 0) {
				console.log('没有需要预超分的页面');
				return;
			}

			console.log(`开始预超分，共 ${this.totalPreUpscalePages} 页，当前页: ${currentIndex + 1}/${totalPages}`);

			// 预加载后续页面
			for (let i = 1; i <= preloadPages; i++) {
				const targetIndex = currentIndex + i;
				if (targetIndex >= totalPages) break;

				const pageInfo = currentBook.pages[targetIndex];
				if (!pageInfo) continue;

				console.log(`预超分第 ${targetIndex + 1} 页...`);

				try {
					// 加载页面图片
					let pageImageData: string;
					if (currentBook.type === 'archive') {
						pageImageData = await loadImageFromArchive(currentBook.path, pageInfo.path);
					} else {
						pageImageData = await loadImage(pageInfo.path);
					}

					// 验证图片数据
					if (!pageImageData) {
						console.warn(`第 ${targetIndex + 1} 页图片数据为空，跳过`);
						continue;
					}

					// 获取带hash的图片数据：优先使用基于路径的稳定hash（archive::innerpath），回退到数据哈希
					let imageDataWithHash = null;
					try {
						const pathKey = currentBook.type === 'archive' ? `${currentBook.path}::${pageInfo.path}` : pageInfo.path;
						try {
							const pathHash = await invoke<string>('calculate_path_hash', { path: pathKey });
							imageDataWithHash = { data: pageImageData, hash: pathHash };
						} catch (e) {
							console.warn('为预加载页面获取路径hash失败，回退到数据hash:', e);
						}
					} catch (e) {
						console.warn('生成预加载页面路径hash异常，回退到数据hash:', e);
					}
					if (!imageDataWithHash) {
						const tmp = await getImageDataWithHash(pageImageData);
						if (!tmp) {
							console.warn(`第 ${targetIndex + 1} 页无法获取图片hash，跳过`);
							continue;
						}
						imageDataWithHash = tmp;
					}

					console.log(`第 ${targetIndex + 1} 页图片数据长度: ${imageDataWithHash.data.length}, hash: ${imageDataWithHash.hash}`);

					// 检查是否已有缓存（仅在开启全局超分或需要预览时进行）
					let hasCache = false;
					if (globalEnabled) {
						hasCache = await checkUpscaleCache(imageDataWithHash, false);
					} else {
						// 当全局关闭时，只做本地索引检查（不读取磁盘或替换显示）
						try {
							const idxPath = this.hashPathIndex.get(imageDataWithHash.hash);
							if (idxPath) {
								console.log('本地索引命中（全局超分关闭），hash:', imageDataWithHash.hash);
								hasCache = true;
							}
						} catch (e) {
							console.warn('本地索引检查失败:', e);
						}
					}
					if (hasCache) {
						console.log(`第 ${targetIndex + 1} 页已有超分缓存`);
						// 标记为已预超分
						this.preUpscaledPages = new Set([...this.preUpscaledPages, targetIndex]);
						this.updatePreUpscaleProgress();
						continue;
					}

					// 先把页面原图解码并缓存，保证翻页时可以直接显示（避免 DOM 再次解码延迟）
					try {
						const img = new Image();
						const decodePromise = new Promise<void>((resolve, reject) => {
							img.onload = () => resolve();
							img.onerror = () => reject(new Error('预加载图片解码失败'));
						});
						img.src = imageDataWithHash.data;
						await decodePromise;
						this.preloadedPageImages.set(targetIndex, { data: imageDataWithHash.data, decoded: true });
						
						// LRU 管理与持久化
						this.touchPreloadedPage(targetIndex);
						this.ensurePreloadedCacheLimit();
						
						console.log('预加载已解码页面图片，index:', targetIndex + 1);
					} catch (e) {
						console.warn('预加载页面解码失败，继续超分预处理:', e);
					}

					// 没有缓存：如果全局已开启，则使用新的preloadWorker API；
					// 如果全局已关闭，则跳过触发超分
					if (globalEnabled) {
						// 使用新的preloadWorker API
						const task = { data: imageDataWithHash.data, hash: imageDataWithHash.hash, pageIndex: targetIndex };
						this.preloadWorker.enqueue(task);
						console.log('已加入preloadWorker队列，hash:', imageDataWithHash.hash, 'pageIndex:', targetIndex);
					} else {
						console.log('全局超分关闭，跳过触发预超分（已完成预解码）');
					}
				} catch (error) {
					console.error(`预超分第 ${targetIndex + 1} 页失败:`, error);
				}
			}
		} catch (error) {
			console.error('预超分失败:', error);
		}
	}

	/**
	 * 更新预超分进度
	 */
	private updatePreUpscaleProgress(): void {
		if (this.totalPreUpscalePages > 0) {
			this.preUpscaleProgress = (this.preUpscaledPages.size / this.totalPreUpscalePages) * 100;
			this.options.onPreloadProgress?.(this.preUpscaleProgress, this.totalPreUpscalePages);
		}
	}

	/**
	 * 重置预超分进度（仅在书籍关闭时调用）
	 */
	resetPreUpscaleProgress(): void {
		this.preUpscaleProgress = 0;
		this.preUpscaledPages = new Set();
		this.totalPreUpscalePages = 0;
	}

	/**
	 * 清理预加载缓存（书籍切换时调用）
	 */
	cleanup(): void {
		this.md5Cache = new Map();
		this.isPreloading = false;
		this.preloadMemoryCache = new Map();
		this.preloadedPageImages = new Map();
		bookStore.setUpscaledImage(null);
		bookStore.setUpscaledImageBlob(null);
		this.preloadWorker.clear();
		this.resetPreUpscaleProgress();
	}

	/**
	 * 标记预加载页面为最近使用
	 */
	private touchPreloadedPage(index: number): void {
		if (this.preloadedPageImages.has(index)) {
			const data = this.preloadedPageImages.get(index);
			this.preloadedPageImages.delete(index);
			this.preloadedPageImages.set(index, data);
		}
	}

	/**
	 * 确保预加载缓存不超过限制
	 */
	private ensurePreloadedCacheLimit(): void {
		const PRELOADED_PAGES_CACHE_LIMIT = 10;
		while (this.preloadedPageImages.size > PRELOADED_PAGES_CACHE_LIMIT) {
			const firstKey = this.preloadedPageImages.keys().next().value;
			this.preloadedPageImages.delete(firstKey);
		}
	}

	/**
	 * 获取内存预加载缓存
	 */
	getPreloadMemoryCache(): Map<string, { url: string; blob: Blob }> {
		return this.preloadMemoryCache;
	}

	/**
	 * 获取当前加载状态
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
			pages: this.preUpscaledPages
		};
	}
}