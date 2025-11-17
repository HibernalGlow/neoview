/**
 * Image Loader
 * 页面加载和预加载逻辑模块 - 三层缓存架构
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
	getAutoUpscaleEnabled,
	type ImageDataWithHash 
} from './preloadRuntime';
import { createPreloadWorker, type PreloadTask, type PreloadTaskResult } from './preloadWorker';
import type { PreloadTaskWithCondition } from './preloadManager';
import { upscaleState, startUpscale, updateUpscaleProgress, completeUpscale, setUpscaleError } from '$lib/stores/upscale/upscaleState.svelte';
import { showSuccessToast } from '$lib/utils/toast';
import { collectPageMetadata, evaluateConditions } from '$lib/utils/upscale/conditions';
import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
function getPanelModelSettings() {
	const settings = loadUpscalePanelSettings();
	return {
		modelName: settings.selectedModel,
		scale: settings.scale,
		tileSize: settings.tileSize,
		noiseLevel: settings.noiseLevel
	};
}

// 缩略图高度配置
const THUMB_HEIGHT = 120;

// 缓存项接口
interface BlobCacheItem {
	blob: Blob;
	url: string;
	lastAccessed: number;
}

interface BitmapCacheItem {
	bitmap: ImageBitmap;
	lastAccessed: number;
}

interface ThumbnailCacheItem {
	dataURL: string;
	lastAccessed: number;
}

export interface ImageLoaderOptions {
	performancePreloadPages: number;
	performanceMaxThreads: number;
	viewMode?: 'single' | 'double' | 'panorama';
	onImageLoaded?: (objectUrl: string, objectUrl2?: string) => void;
	onImageBitmapReady?: (bitmap: ImageBitmap, bitmap2?: ImageBitmap) => void;
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
	
	// 三层缓存架构
	private blobCache = new Map<number, BlobCacheItem>();
	private bitmapCache = new Map<number, BitmapCacheItem>();
	private thumbnailCache = new Map<number, ThumbnailCacheItem>();
	
	// 预超分相关
	private totalPreUpscalePages = 0;
	private preUpscaleProgress = 0;
	private md5Cache = new Map<string, string>();
	private hashPathIndex = new Map<string, string>();
	private preloadMemoryCache = new Map<string, { url: string; blob: Blob }>();
	private pendingPreloadTasks = new Set<string>(); // 用于去重的待处理任务集合
	private lastAutoUpscalePageIndex: number | null = null;
	
	// 加载状态
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
					this.enforcePreloadMemoryLimit();
					
					// 标记预超分进度
					if (typeof task.pageIndex === 'number') {
						bookStore.setPageUpscaleStatus(task.pageIndex, 'preupscaled');
						this.updatePreUpscaleProgress();
					}
					
					// 从待处理集合中移除
					this.pendingPreloadTasks.delete(task.hash);
					
					console.log('预加载任务成功，已写入缓存，hash:', task.hash);
				}
			},
			onTaskFailure: (task: PreloadTask, error: unknown) => {
				console.error('预加载任务失败，hash:', task.hash, error);
				// 从待处理集合中移除
				this.pendingPreloadTasks.delete(task.hash);
			}
		});
	}

	/**
	 * 从 Blob 计算 MD5 哈希
	 */
	async calculateBlobHash(blob: Blob): Promise<string> {
		// 直接使用后端计算 MD5，确保与缓存系统一致
		const arrayBuffer = await blob.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		
		try {
			// 调用后端命令计算 MD5
			return await invoke<string>('calculate_blob_md5', { 
				bytes: Array.from(bytes) 
			});
		} catch (error) {
			console.warn('后端 calculate_blob_md5 命令不可用，使用前端计算（SHA-256）:', error);
			// 临时回退到前端计算 SHA-256（虽然与缓存系统不匹配，但至少不会崩溃）
			const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		}
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
	 * 确保页面资源已加载
	 */
	private async ensureResources(pageIndex: number): Promise<void> {
		// 1. 确保 Blob 缓存
		if (!this.blobCache.has(pageIndex)) {
			const blob = await this.readPageBlob(pageIndex);
			const url = URL.createObjectURL(blob);
			this.blobCache.set(pageIndex, {
				blob,
				url,
				lastAccessed: Date.now()
			});
		}
		
		// 2. 确保 ImageBitmap 缓存
		if (!this.bitmapCache.has(pageIndex)) {
			const { blob } = this.blobCache.get(pageIndex)!;
			const bitmap = await createImageBitmap(blob);
			this.bitmapCache.set(pageIndex, {
				bitmap,
				lastAccessed: Date.now()
			});
		}
		
		// 更新访问时间
		this.updateAccessTime(pageIndex);
	}
	
	/**
	 * 读取页面 Blob
	 */
	async readPageBlob(pageIndex: number): Promise<Blob> {
		// 首先检查缓存
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			item.lastAccessed = Date.now();
			return item.blob;
		}
		
		const pageInfo = bookStore.currentBook?.pages[pageIndex];
		if (!pageInfo) {
			throw new Error(`页面 ${pageIndex} 不存在`);
		}
		
		let base64Data: string;
		if (bookStore.currentBook?.type === 'archive') {
			base64Data = await loadImageFromArchive(bookStore.currentBook.path, pageInfo.path);
		} else {
			base64Data = await loadImage(pageInfo.path);
		}
		
		// 将 base64 转换为 Blob
		const response = await fetch(base64Data);
		const blob = await response.blob();
		
		// 缓存 Blob
		const url = URL.createObjectURL(blob);
		this.blobCache.set(pageIndex, {
			blob,
			url,
			lastAccessed: Date.now()
		});
		
		return blob;
	}
	
	/**
	 * 更新缓存访问时间
	 */
	private updateAccessTime(pageIndex: number): void {
		const now = Date.now();
		if (this.blobCache.has(pageIndex)) {
			const item = this.blobCache.get(pageIndex)!;
			item.lastAccessed = now;
		}
		if (this.bitmapCache.has(pageIndex)) {
			const item = this.bitmapCache.get(pageIndex)!;
			item.lastAccessed = now;
		}
		if (this.thumbnailCache.has(pageIndex)) {
			const item = this.thumbnailCache.get(pageIndex)!;
			item.lastAccessed = now;
		}
	}
	
	/**
	 * 获取 ImageBitmap
	 */
	async getBitmap(pageIndex: number): Promise<ImageBitmap> {
		await this.ensureResources(pageIndex);
		return this.bitmapCache.get(pageIndex)!.bitmap;
	}
	
	/**
	 * 获取缩略图 DataURL
	 */
	async getThumbnail(pageIndex: number): Promise<string> {
		await this.ensureResources(pageIndex);
		
		if (!this.thumbnailCache.has(pageIndex)) {
			const { bitmap } = this.bitmapCache.get(pageIndex)!;
			const dataURL = await this.drawBitmapToDataURL(bitmap, THUMB_HEIGHT);
			this.thumbnailCache.set(pageIndex, {
				dataURL,
				lastAccessed: Date.now()
			});
		}
		
		return this.thumbnailCache.get(pageIndex)!.dataURL;
	}
	
	/**
	 * 获取 Blob
	 */
	async getBlob(pageIndex: number): Promise<Blob> {
		await this.ensureResources(pageIndex);
		return this.blobCache.get(pageIndex)!.blob;
	}
	
	/**
	 * 获取 Object URL
	 */
	async getObjectUrl(pageIndex: number): Promise<string> {
		await this.ensureResources(pageIndex);
		return this.blobCache.get(pageIndex)!.url;
	}
	
	/**
	 * 将 ImageBitmap 绘制为 DataURL 缩略图
	 */
	private async drawBitmapToDataURL(bitmap: ImageBitmap, height: number): Promise<string> {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d')!;
		
		// 计算缩放比例
		const scale = height / bitmap.height;
		canvas.width = bitmap.width * scale;
		canvas.height = height;
		
		// 绘制缩略图
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		
		return canvas.toDataURL('image/jpeg', 0.85);
	}

	/**
	 * 预加载指定范围
	 */
	async preloadRange(centerIndex: number, radius: number): Promise<void> {
		const targets = this.computeRange(centerIndex, radius);
		const promises = targets.map(index => this.ensureResources(index));
		await Promise.all(promises);
		this.enforceCacheLimits();
	}
	
	/**
	 * 计算预加载范围
	 */
	private computeRange(centerIndex: number, radius: number): number[] {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return [];
		
		const totalPages = currentBook.pages.length;
		const start = Math.max(0, centerIndex - radius);
		const end = Math.min(totalPages - 1, centerIndex + radius);
		
		const indices: number[] = [];
		for (let i = start; i <= end; i++) {
			if (i !== centerIndex) { // 跳过当前页
				indices.push(i);
			}
		}
		
		return indices;
	}
	
	/**
	 * 执行缓存限制
	 */
	private enforceCacheLimits(): void {
		this.enforceBlobCacheLimit();
		this.enforceBitmapCacheLimit();
		this.enforceThumbnailCacheLimit();
	}
	
	/**
	 * 限制 Blob 缓存
	 */
	private enforceBlobCacheLimit(): void {
		const limit = performanceSettings.cache_memory_size * 1024 * 1024; // MB to bytes
		let totalSize = 0;
		const entries = Array.from(this.blobCache.entries());
		
		// 计算总大小
		for (const [, item] of entries) {
			totalSize += item.blob.size;
		}
		
		// 按访问时间排序
		entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
		
		// 移除最旧的项直到满足限制
		for (const [index, item] of entries) {
			if (totalSize <= limit) break;
			
			// 检查是否有其他缓存依赖
			if (this.bitmapCache.has(index) || this.thumbnailCache.has(index)) {
				continue; // 跳过仍在使用的项
			}
			
			URL.revokeObjectURL(item.url);
			this.blobCache.delete(index);
			totalSize -= item.blob.size;
		}
	}
	
	/**
	 * 限制 ImageBitmap 缓存
	 */
	private enforceBitmapCacheLimit(): void {
		const limit = 20; // 最多缓存 20 个 ImageBitmap
		const entries = Array.from(this.bitmapCache.entries());
		
		if (entries.length <= limit) return;
		
		// 按访问时间排序
		entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
		
		// 移除最旧的项
		const toRemove = entries.length - limit;
		for (let i = 0; i < toRemove; i++) {
			const [index, item] = entries[i];
			
			// 检查是否有缩略图依赖
			if (this.thumbnailCache.has(index)) {
				continue; // 跳过仍在使用的项
			}
			
			item.bitmap.close();
			this.bitmapCache.delete(index);
		}
	}
	
	/**
	 * 限制缩略图缓存
	 */
	private enforceThumbnailCacheLimit(): void {
		const limit = 50; // 最多缓存 50 个缩略图
		const entries = Array.from(this.thumbnailCache.entries());
		
		if (entries.length <= limit) return;
		
		// 按访问时间排序
		entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
		
		// 移除最旧的项
		const toRemove = entries.length - limit;
		for (let i = 0; i < toRemove; i++) {
			const [index] = entries[i];
			this.thumbnailCache.delete(index);
		}
	}
	
	/**
	 * 限制预超分内存缓存（preloadMemoryCache）总大小
	 * 使用简单的近似 LRU：按照 Map 插入顺序移除最早写入的条目
	 */
	private enforcePreloadMemoryLimit(): void {
		// 默认 1000 MB 上限，仅作用于超分内存缓存
		const limitBytes = 1000 * 1024 * 1024;
		let totalSize = 0;
		const entries = Array.from(this.preloadMemoryCache.entries());
		
		for (const [, item] of entries) {
			// Blob.size 为字节数
			totalSize += item.blob.size;
		}
		
		if (totalSize <= limitBytes) return;
		
		// 按插入顺序移除最旧的项（Map 迭代顺序即插入顺序）
		for (const [hash, item] of this.preloadMemoryCache) {
			if (totalSize <= limitBytes) break;
			URL.revokeObjectURL(item.url);
			this.preloadMemoryCache.delete(hash);
			totalSize -= item.blob.size;
		}
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
		const currentPageIndex = bookStore.currentPageIndex;
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		if (
			this.lastAutoUpscalePageIndex !== null &&
			this.lastAutoUpscalePageIndex !== currentPageIndex
		) {
			try {
				await invoke('cancel_upscale_jobs_for_page', {
					bookPath: currentBook.path ?? null,
					pageIndex: this.lastAutoUpscalePageIndex
				});
				console.log(
					'已请求取消上一页的超分任务:',
					this.lastAutoUpscalePageIndex + 1
				);
			} catch (error) {
				console.warn('取消上一页超分任务失败:', error);
			} finally {
				this.lastAutoUpscalePageIndex = null;
			}
		}

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
			// 确保当前页资源已加载
			await this.ensureResources(currentPageIndex);
			
			// 获取 ImageBitmap 和 Object URL
			const bitmap = await this.getBitmap(currentPageIndex);
			const objectUrl = await this.getObjectUrl(currentPageIndex);
			
			// 双页模式：加载下一页
			let bitmap2: ImageBitmap | null = null;
			let objectUrl2: string | null = null;
			
			if (this.options.viewMode === 'double' && bookStore.canNextPage) {
				const nextPageIndex = currentPageIndex + 1;
				if (nextPageIndex < currentBook.pages.length) {
					await this.ensureResources(nextPageIndex);
					bitmap2 = await this.getBitmap(nextPageIndex);
					objectUrl2 = await this.getObjectUrl(nextPageIndex);
				}
			}

			// 获取带hash的图片数据：用于超分缓存检查
			const pageInfo = currentBook.pages[currentPageIndex];
			let imageDataWithHash: ImageDataWithHash | null = null;
			
			// 使用 bookStore 的统一 hash API
			const imageHash = bookStore.getPageHash(currentPageIndex);
			if (imageHash) {
				const { blob } = this.blobCache.get(currentPageIndex)!;
				imageDataWithHash = { blob, hash: imageHash, pageIndex: currentPageIndex };
				console.log(`使用稳定哈希，页码: ${currentPageIndex + 1}/${bookStore.totalPages}, hash: ${imageHash}`);
			} else {
				console.warn('当前页没有 stableHash，跳过自动超分');
			}

			// ---- 缓存优先逻辑 ----
			let usedCache = false;
			// imageHash 已经在上面声明过了
			
			if (imageHash) {
				// 1. 先检查内存缓存
				const memCache = this.preloadMemoryCache.get(imageHash);
				if (memCache) {
					// 🔥 关键修复：验证缓存的 hash 是否真的匹配当前页
					const currentPageHash = bookStore.getPageHash(currentPageIndex);
					if (currentPageHash && currentPageHash !== imageHash) {
						console.warn(`⚠️ 内存缓存 hash 不匹配！当前页 ${currentPageIndex + 1} 的 hash: ${currentPageHash}, 缓存的 hash: ${imageHash}，清除此缓存`);
						this.preloadMemoryCache.delete(imageHash);
					} else {
						usedCache = true;
						console.log('✅ 使用内存超分缓存，页码:', currentPageIndex + 1, 'hash:', imageHash);
						// 直接使用内存中的超分结果
						bookStore.setUpscaledImage(memCache.url);
						bookStore.setUpscaledImageBlob(memCache.blob);
						bookStore.setPageUpscaleStatus(currentPageIndex, 'done');
						// 触发事件通知 Viewer 替换显示
						window.dispatchEvent(new CustomEvent('upscale-complete', {
							detail: {
								imageData: memCache.url,
								imageBlob: memCache.blob,
								originalImageHash: imageHash,
								background: false,
								pageIndex: currentPageIndex
							}
						}));
					}
				}

				// 2. 内存没有，尝试从磁盘加载到内存
				if (!usedCache) {
					const diskLoaded = await this.loadDiskUpscaleToMemory(imageHash);
					if (diskLoaded) {
						const diskCache = this.preloadMemoryCache.get(imageHash);
						if (diskCache) {
							// 🔥 关键修复：验证从磁盘加载的 hash 是否真的匹配当前页
							const currentPageHash = bookStore.getPageHash(currentPageIndex);
							if (currentPageHash && currentPageHash !== imageHash) {
								console.warn(`⚠️ 磁盘缓存 hash 不匹配！当前页 ${currentPageIndex + 1} 的 hash: ${currentPageHash}, 缓存的 hash: ${imageHash}，清除此缓存`);
								this.preloadMemoryCache.delete(imageHash);
							} else {
								usedCache = true;
								console.log('✅ 从磁盘加载超分结果到内存，页码:', currentPageIndex + 1, 'hash:', imageHash);
								bookStore.setUpscaledImage(diskCache.url);
								bookStore.setUpscaledImageBlob(diskCache.blob);
								bookStore.setPageUpscaleStatus(currentPageIndex, 'done');
								// 触发事件通知 Viewer 替换显示
								window.dispatchEvent(new CustomEvent('upscale-complete', {
									detail: {
										imageData: diskCache.url,
										imageBlob: diskCache.blob,
										originalImageHash: imageHash,
										background: false,
										pageIndex: currentPageIndex
									}
								}));
							}
						}
					}
				}

				// 3. 现场超分（仅在没有任何缓存时）
				if (!usedCache && imageDataWithHash) {
					const autoUpscaleEnabled = await getAutoUpscaleEnabled();
					if (autoUpscaleEnabled) {
						console.log('内存和磁盘都没有缓存，开始现场超分，页码:', currentPageIndex + 1);
							await triggerAutoUpscale(imageDataWithHash);
							this.lastAutoUpscalePageIndex = currentPageIndex;
					} else {
						console.log('自动超分开关已关闭，不进行现场超分');
					}
				}
			}

			// 调用外部回调 - 传递新的数据格式
			this.options.onImageLoaded?.(objectUrl, objectUrl2);
			this.options.onImageBitmapReady?.(bitmap, bitmap2);

			// ---- 无论是否 usedCache，都进行预超分队列调度 ----
			setTimeout(() => {
				this.preloadNextPages();   // 利用 pendingPreloadTasks + preloadWorker 队列管理预超分
			}, 1000);
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
			// 使用自身配置中的预加载页数
			const preloadPages = this.options.performancePreloadPages;
			console.log('预加载设置:', { 
				preloadPages, 
				performanceMaxThreads: this.options.performanceMaxThreads 
			});

			// 检查自动超分开关（如果关闭，仍执行普通的页面预加载/解码逻辑，但不触发预超分）
			const autoUpscaleEnabled = await getAutoUpscaleEnabled();
			if (!autoUpscaleEnabled) {
				console.log('自动超分开关已关闭，预超分将被跳过，但会继续执行页面预加载解码');
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

				console.log(`预加载第 ${targetIndex + 1} 页...`);

				// 使用 bookStore 的统一 hash API
				const hash = bookStore.getPageHash(targetIndex);
				if (!hash) {
					console.warn(`第 ${targetIndex + 1} 页没有 stableHash，跳过预超分`);
					continue;
				}
				console.log(`预加载使用稳定哈希，页码: ${targetIndex + 1}/${totalPages}, hash: ${hash}`);

				// 检查是否已有缓存
				let hasCache = false;
				if (autoUpscaleEnabled) {
					// 使用 hash 检查缓存（需要传入一个空的 blob，因为缓存检查只需要 hash）
					const emptyBlob = new Blob();
					hasCache = await checkUpscaleCache({ blob: emptyBlob, hash }, false);
				}

				if (hasCache) {
					console.log(`第 ${targetIndex + 1} 页已有超分缓存`);
					// 标记为已预超分
					bookStore.setPageUpscaleStatus(targetIndex, 'preupscaled');
					this.updatePreUpscaleProgress();
					continue;
				}

				// 确保核心缓存已准备（Blob + ImageBitmap），保证翻页时可以直接显示
				// 没有缓存：如果自动超分已开启，则使用新的preloadWorker API
				try {
					await this.ensureResources(targetIndex);
					console.log('预加载已写入核心缓存，index:', targetIndex + 1);
					
					if (autoUpscaleEnabled) {
						// 评估条件并检查是否应该排除预超分
						const currentBook = bookStore.currentBook;
						if (currentBook) {
							const pageMetadata = collectPageMetadata(pageInfo, currentBook.path);
							const panelSettings = loadUpscalePanelSettings();
							const conditionResult = evaluateConditions(pageMetadata, panelSettings.conditionsList);
							
							if (conditionResult.excludeFromPreload) {
								console.log(`第 ${targetIndex + 1} 页被条件排除，跳过预超分。条件ID: ${conditionResult.conditionId}`);
								continue;
							}
							
							// 检查是否已经在处理中（去重）
							if (this.pendingPreloadTasks.has(hash)) {
								console.log(`第 ${targetIndex + 1} 页已在预加载队列中，跳过重复任务`);
								continue;
							}
							
							// 标记为待处理
							this.pendingPreloadTasks.add(hash);
							
							// 获取 Blob 用于超分
							const blob = await this.getBlob(targetIndex);
							// 使用新的preloadWorker API，携带条件ID
							const task: PreloadTaskWithCondition = { 
								blob, 
								hash, 
								pageIndex: targetIndex,
								conditionId: conditionResult.conditionId || undefined
							};
							this.preloadWorker.enqueue(task);
							console.log('已加入preloadWorker队列，hash:', hash, 'pageIndex:', targetIndex, 'conditionId:', conditionResult.conditionId);
						}
					} else {
						console.log('自动超分关闭，跳过触发预超分（已完成预加载）');
					}
				} catch (error) {
					console.error(`预加载第 ${targetIndex + 1} 页失败:`, error);
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
			const preUpscaledPages = bookStore.getPreUpscaledPages();
			this.preUpscaleProgress = (preUpscaledPages.size / this.totalPreUpscalePages) * 100;
			this.options.onPreloadProgress?.(this.preUpscaleProgress, this.totalPreUpscalePages);
		}
	}

	/**
	 * 重置预超分进度（仅在书籍关闭时调用）
	 */
	resetPreUpscaleProgress(): void {
		this.preUpscaleProgress = 0;
		this.totalPreUpscalePages = 0;
		this.pendingPreloadTasks.clear();
	}

	/**
	 * 清理预加载缓存（书籍切换时调用）
	 */
	cleanup(): void {
		// 清理所有缓存
		for (const [, item] of this.blobCache) {
			URL.revokeObjectURL(item.url);
		}
		this.blobCache.clear();
		
		for (const [, item] of this.bitmapCache) {
			item.bitmap.close();
		}
		this.bitmapCache.clear();
		
		this.thumbnailCache.clear();
		
		// 清理超分内存缓存（重要：防止旧书的超分结果匹配到新书）
		this.preloadMemoryCache.clear();
		
		// 清理其他状态
		this.md5Cache = new Map();
		this.isPreloading = false;
		this.lastAutoUpscalePageIndex = null;
		bookStore.setUpscaledImage(null);
		bookStore.setUpscaledImageBlob(null);
		this.preloadWorker.clear();
		this.resetPreUpscaleProgress();
	}

	/**
	 * 获取内存预加载缓存（兼容旧接口）
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
		const preUpscaledPages = bookStore.getPreUpscaledPages();
		return {
			progress: this.preUpscaleProgress,
			total: this.totalPreUpscalePages,
			pages: preUpscaledPages
		};
	}

	/**
	 * 从磁盘加载超分结果到内存缓存
	 */
	async loadDiskUpscaleToMemory(imageHash: string): Promise<boolean> {
		try {
			// 通过 PyO3 命令检查当前模型下是否有该 hash 的缓存
			const model = getPanelModelSettings();

			const cachePath = await invoke<string | null>('check_pyo3_upscale_cache', {
				imageHash,
				modelName: model.modelName,
				scale: model.scale,
				tileSize: model.tileSize,
				noiseLevel: model.noiseLevel
			});

			if (!cachePath) {
				console.log('PyO3 磁盘缓存未命中，hash:', imageHash);
				return false;
			}

			// 读磁盘文件 → Blob
			const bytes = await invoke<number[]>('read_binary_file', { filePath: cachePath });
			const arr = new Uint8Array(bytes);
			const blob = new Blob([arr], { type: 'image/webp' });
			const url = URL.createObjectURL(blob);

			// 写入内存缓存
			this.preloadMemoryCache.set(imageHash, { url, blob });
			this.enforcePreloadMemoryLimit();
			console.log('从 PyO3 磁盘缓存加载超分结果到内存:', imageHash, 'path:', cachePath);

			return true;
		} catch (error) {
			console.warn('从 PyO3 磁盘缓存加载超分结果失败:', error);
			return false;
		}
	}

	
}