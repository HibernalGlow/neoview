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
	private preUpscaledPages = new Set<number>();
	private totalPreUpscalePages = 0;
	private preUpscaleProgress = 0;
	private md5Cache = new Map<string, string>();
	private hashPathIndex = new Map<string, string>();
	private preloadMemoryCache = new Map<string, { url: string; blob: Blob }>();
	
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
	 * 从 Blob 计算 MD5 哈希
	 */
	async calculateBlobHash(blob: Blob): Promise<string> {
		// 将 Blob 转换为 ArrayBuffer
		const arrayBuffer = await blob.arrayBuffer();
		
		// 使用 Web Crypto API 计算 MD5（如果可用）
		if (crypto.subtle) {
			try {
				// 注意：Web Crypto API 默认不支持 MD5，这里使用 SHA-256 作为替代
				// 在生产环境中，应该在后端计算 MD5
				const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
				const hashArray = Array.from(new Uint8Array(hashBuffer));
				const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
				return hashHex;
			} catch (e) {
				console.warn('Web Crypto API 计算哈希失败，回退到后端:', e);
			}
		}
		
		// 回退到后端计算
		// 将 ArrayBuffer 转换为 base64（仅用于哈希计算）
		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		const base64 = btoa(binary);
		
		return await invoke<string>('calculate_data_hash', { dataUrl: `data:image/png;base64,${base64}` });
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
			let imageDataWithHash = null;
			try {
				const pathKey = currentBook.type === 'archive' ? `${currentBook.path}::${pageInfo.path}` : pageInfo.path;
				try {
					const pathHash = await invoke<string>('calculate_path_hash', { path: pathKey });
					const { blob } = this.blobCache.get(currentPageIndex)!;
					imageDataWithHash = { blob, hash: pathHash };
				} catch (e) {
					console.warn('调用 calculate_path_hash 失败，回退到数据hash:', e);
				}
			} catch (e) {
				console.warn('生成路径hash异常，回退到数据hash:', e);
			}
			if (!imageDataWithHash) {
				const { blob } = this.blobCache.get(currentPageIndex)!;
				const data = await this.blobToDataURL(blob);
				imageDataWithHash = await getImageDataWithHash(data);
				if (!imageDataWithHash) {
					console.error('无法获取图片数据及hash');
					return;
				}
			}

			// 检查是否有对应的超分缓存
			const hasCache = await checkUpscaleCache(imageDataWithHash, true);

			// 如果没有缓存且全局超分开关开启，则自动开始超分
			if (!hasCache) {
				await triggerAutoUpscale(imageDataWithHash);
			}

			// 触发预加载后续页面
			setTimeout(() => {
				this.preloadNextPages();
			}, 1000);

			// 调用外部回调 - 传递新的数据格式
			this.options.onImageLoaded?.(objectUrl, objectUrl2);
			this.options.onImageBitmapReady?.(bitmap, bitmap2);
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
	 * 将 Blob 转换为 DataURL
	 */
	private async blobToDataURL(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	/**
	 * 预加载后续页面的超分
	 */
	async preloadNextPages(): Promise<void> {
		try {
			// 使用性能配置中的预加载页数
			const preloadPages = this.options.performancePreloadPages;
			console.log('预加载设置:', { preloadPages, performanceMaxThreads: this.options.performanceMaxThreads });

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

				console.log(`预加载第 ${targetIndex + 1} 页...`);

				try {
					// 获取路径哈希
					let hash: string;
					const pathKey = currentBook.type === 'archive' ? `${currentBook.path}::${pageInfo.path}` : pageInfo.path;
					try {
						hash = await invoke<string>('calculate_path_hash', { path: pathKey });
					} catch (e) {
						console.warn('获取路径hash失败，跳过页面:', e);
						continue;
					}

					// 检查是否已有缓存
					let hasCache = false;
					if (autoUpscaleEnabled) {
						// 使用 hash 检查缓存
						hasCache = await checkUpscaleCache({ hash }, false);
					}

					if (hasCache) {
						console.log(`第 ${targetIndex + 1} 页已有超分缓存`);
						// 标记为已预超分
						this.preUpscaledPages = new Set([...this.preUpscaledPages, targetIndex]);
						this.updatePreUpscaleProgress();
						continue;
					}

					// 确保核心缓存已准备（Blob + ImageBitmap），保证翻页时可以直接显示
					try {
						await this.ensureResources(targetIndex);
						console.log('预加载已写入核心缓存，index:', targetIndex + 1);
					} catch (e) {
						console.warn('预加载写入核心缓存失败:', e);
						continue;
					}

					// 没有缓存：如果自动超分已开启，则使用新的preloadWorker API
					if (autoUpscaleEnabled) {
						// 获取 Blob 用于超分
						const blob = await this.getBlob(targetIndex);
						// 使用新的preloadWorker API
						const task = { blob, hash, pageIndex: targetIndex };
						this.preloadWorker.enqueue(task);
						console.log('已加入preloadWorker队列，hash:', hash, 'pageIndex:', targetIndex);
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
		
		// 清理其他状态
		this.md5Cache = new Map();
		this.preloadMemoryCache.clear();
		this.isPreloading = false;
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
		return {
			progress: this.preUpscaleProgress,
			total: this.totalPreUpscalePages,
			pages: this.preUpscaledPages
		};
	}

	
}