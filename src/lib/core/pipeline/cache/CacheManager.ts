/**
 * 统一缓存管理器
 * 整合 Blob缓存、缩略图缓存、超分缓存
 * 参考 NeeView BookMemoryService 设计
 */

import { BlobCache, type BlobCacheConfig } from './BlobCache';
import { MemoryCache } from './MemoryCache';
import { type CacheConfig, type UpscaleCacheItem } from '../types';

/** 缓存管理器配置 */
export interface CacheManagerConfig {
	blob: Partial<BlobCacheConfig>;
	thumbnail: Partial<CacheConfig>;
	upscale: Partial<CacheConfig>;
	memoryLimit: number;           // 总内存限制 (bytes)
	enableAutoCleanup: boolean;    // 自动清理
	cleanupThreshold: number;      // 触发清理的阈值百分比
}

/** 缩略图条目 */
interface ThumbnailEntry {
	dataUrl: string;
	width: number;
	height: number;
	pageIndex: number;
}

/** 超分条目 */
interface UpscaleEntry {
	blob: Blob;
	objectUrl: string;
	originalHash: string;
	modelName: string;
	scaleFactor: number;
	pageIndex?: number;
}

/** 缓存统计 */
export interface CacheManagerStats {
	blob: { count: number; size: number };
	thumbnail: { count: number; size: number };
	upscale: { count: number; size: number };
	totalSize: number;
	memoryLimit: number;
	usagePercent: number;
}

/**
 * 统一缓存管理器
 * 协调多种缓存，实现内存优化
 */
export class CacheManager {
	private static instance: CacheManager | null = null;
	
	private blobCache: BlobCache;
	private thumbnailCache: MemoryCache<ThumbnailEntry>;
	private upscaleCache: MemoryCache<UpscaleEntry>;
	private config: CacheManagerConfig;
	private disposed = false;

	// 超分 URL 到 hash 的映射
	private upscaleUrlToHash = new Map<string, string>();

	private constructor(config?: Partial<CacheManagerConfig>) {
		this.config = {
			blob: {
				maxMemorySize: 256 * 1024 * 1024, // 256MB
				maxItems: 30,
				ttl: 5 * 60 * 1000,
				revokeOnEvict: true
			},
			thumbnail: {
				maxMemorySize: 50 * 1024 * 1024, // 50MB
				maxItems: 100,
				ttl: 30 * 60 * 1000 // 30分钟
			},
			upscale: {
				maxMemorySize: 500 * 1024 * 1024, // 500MB
				maxItems: 20,
				ttl: 10 * 60 * 1000 // 10分钟
			},
			memoryLimit: 800 * 1024 * 1024, // 800MB
			enableAutoCleanup: true,
			cleanupThreshold: 0.9, // 90%
			...config
		};

		// 初始化各缓存
		this.blobCache = new BlobCache(this.config.blob);
		
		this.thumbnailCache = new MemoryCache<ThumbnailEntry>(
			this.config.thumbnail,
			(entry) => entry.dataUrl.length * 2 // 估算字符串占用
		);
		
		this.upscaleCache = new MemoryCache<UpscaleEntry>(
			this.config.upscale,
			(entry) => entry.blob.size
		);

		// 监听超分缓存淘汰，释放 Object URL
		this.upscaleCache.addEventListener((event) => {
			if ((event.type === 'evict' || event.type === 'expire') && event.item) {
				const entry = event.item.data;
				URL.revokeObjectURL(entry.objectUrl);
				this.upscaleUrlToHash.delete(entry.objectUrl);
			}
		});
	}

	/** 获取单例 */
	static getInstance(config?: Partial<CacheManagerConfig>): CacheManager {
		if (!CacheManager.instance) {
			CacheManager.instance = new CacheManager(config);
		}
		return CacheManager.instance;
	}

	/** 重置单例 */
	static resetInstance(): void {
		if (CacheManager.instance) {
			CacheManager.instance.dispose();
			CacheManager.instance = null;
		}
	}

	// ==================== Blob 缓存操作 ====================

	/** 设置 Blob 缓存 */
	setBlob(pageIndex: number, blob: Blob, bookPath?: string, hash?: string): string {
		this.checkMemoryAndCleanup();
		return this.blobCache.set(pageIndex, blob, bookPath, hash);
	}

	/** 获取 Blob */
	getBlob(pageIndex: number, bookPath?: string): Blob | null {
		return this.blobCache.getBlob(pageIndex, bookPath);
	}

	/** 获取 Blob URL */
	getBlobUrl(pageIndex: number, bookPath?: string): string | null {
		return this.blobCache.getUrl(pageIndex, bookPath);
	}

	/** 检查 Blob 是否存在 */
	hasBlob(pageIndex: number, bookPath?: string): boolean {
		return this.blobCache.has(pageIndex, bookPath);
	}

	/** 更新 Blob 访问时间 */
	touchBlob(pageIndex: number, bookPath?: string): void {
		this.blobCache.touch(pageIndex, bookPath);
	}

	// ==================== 缩略图缓存操作 ====================

	/** 设置缩略图 */
	setThumbnail(pageIndex: number, dataUrl: string, width: number, height: number, bookPath?: string): void {
		this.checkMemoryAndCleanup();
		const key = this.getThumbnailKey(pageIndex, bookPath);
		this.thumbnailCache.set(key, { dataUrl, width, height, pageIndex });
	}

	/** 获取缩略图 */
	getThumbnail(pageIndex: number, bookPath?: string): string | null {
		const key = this.getThumbnailKey(pageIndex, bookPath);
		const entry = this.thumbnailCache.get(key);
		return entry?.dataUrl ?? null;
	}

	/** 检查缩略图是否存在 */
	hasThumbnail(pageIndex: number, bookPath?: string): boolean {
		const key = this.getThumbnailKey(pageIndex, bookPath);
		return this.thumbnailCache.has(key);
	}

	private getThumbnailKey(pageIndex: number, bookPath?: string): string {
		return bookPath ? `thumb:${bookPath}:${pageIndex}` : `thumb:${pageIndex}`;
	}

	// ==================== 超分缓存操作 ====================

	/** 设置超分结果 */
	setUpscale(
		originalHash: string,
		blob: Blob,
		modelName: string,
		scaleFactor: number,
		pageIndex?: number
	): string {
		this.checkMemoryAndCleanup();
		
		// 如果已存在，先清理
		if (this.upscaleCache.has(originalHash)) {
			this.deleteUpscale(originalHash);
		}
		
		const objectUrl = URL.createObjectURL(blob);
		const entry: UpscaleEntry = {
			blob,
			objectUrl,
			originalHash,
			modelName,
			scaleFactor,
			pageIndex
		};
		
		this.upscaleCache.set(originalHash, entry);
		this.upscaleUrlToHash.set(objectUrl, originalHash);
		
		return objectUrl;
	}

	/** 获取超分结果 */
	getUpscale(originalHash: string): UpscaleEntry | null {
		return this.upscaleCache.get(originalHash);
	}

	/** 获取超分 URL */
	getUpscaleUrl(originalHash: string): string | null {
		const entry = this.upscaleCache.get(originalHash);
		return entry?.objectUrl ?? null;
	}

	/** 获取超分 Blob */
	getUpscaleBlob(originalHash: string): Blob | null {
		const entry = this.upscaleCache.get(originalHash);
		return entry?.blob ?? null;
	}

	/** 检查超分是否存在 */
	hasUpscale(originalHash: string): boolean {
		return this.upscaleCache.has(originalHash);
	}

	/** 删除超分缓存 */
	deleteUpscale(originalHash: string): boolean {
		const entry = this.upscaleCache.get(originalHash);
		if (entry) {
			URL.revokeObjectURL(entry.objectUrl);
			this.upscaleUrlToHash.delete(entry.objectUrl);
		}
		return this.upscaleCache.delete(originalHash);
	}

	/** 通过 URL 获取超分 hash */
	getUpscaleHashByUrl(url: string): string | null {
		return this.upscaleUrlToHash.get(url) ?? null;
	}

	// ==================== 内存管理 ====================

	/** 检查内存并触发清理 */
	private checkMemoryAndCleanup(): void {
		if (!this.config.enableAutoCleanup) return;
		
		const stats = this.getStats();
		if (stats.usagePercent >= this.config.cleanupThreshold) {
			this.performCleanup();
		}
	}

	/** 执行清理 */
	performCleanup(): void {
		// 按优先级清理：超分 > 缩略图 > Blob
		const targetSize = this.config.memoryLimit * 0.7; // 清理到70%
		let currentSize = this.getTotalSize();
		
		// 1. 清理过期项
		this.thumbnailCache.cleanup();
		this.upscaleCache.cleanup();
		currentSize = this.getTotalSize();
		
		// 2. 如果还超限，收缩超分缓存
		if (currentSize > targetSize) {
			const upscaleTarget = Math.max(
				this.config.upscale.maxMemorySize! * 0.5,
				targetSize - this.blobCache.totalSize - this.thumbnailCache.totalSize
			);
			this.shrinkUpscaleCache(upscaleTarget);
			currentSize = this.getTotalSize();
		}
		
		// 3. 如果还超限，收缩缩略图缓存
		if (currentSize > targetSize) {
			const thumbTarget = Math.max(
				this.config.thumbnail.maxMemorySize! * 0.5,
				targetSize - this.blobCache.totalSize - this.upscaleCache.totalSize
			);
			this.shrinkThumbnailCache(thumbTarget);
			currentSize = this.getTotalSize();
		}
		
		// 4. 最后收缩 Blob 缓存
		if (currentSize > targetSize) {
			const blobTarget = targetSize - this.thumbnailCache.totalSize - this.upscaleCache.totalSize;
			this.blobCache.shrinkTo(Math.max(0, blobTarget));
		}
	}

	/** 收缩超分缓存 */
	private shrinkUpscaleCache(targetSize: number): void {
		if (this.upscaleCache.totalSize <= targetSize) return;
		
		const keys = this.upscaleCache.keys();
		for (const key of keys) {
			if (this.upscaleCache.totalSize <= targetSize) break;
			this.deleteUpscale(key);
		}
	}

	/** 收缩缩略图缓存 */
	private shrinkThumbnailCache(targetSize: number): void {
		if (this.thumbnailCache.totalSize <= targetSize) return;
		
		const keys = this.thumbnailCache.keys();
		for (const key of keys) {
			if (this.thumbnailCache.totalSize <= targetSize) break;
			this.thumbnailCache.delete(key);
		}
	}

	/** 获取总大小 */
	private getTotalSize(): number {
		return this.blobCache.totalSize + 
			this.thumbnailCache.totalSize + 
			this.upscaleCache.totalSize;
	}

	/** 获取统计信息 */
	getStats(): CacheManagerStats {
		const blobStats = this.blobCache.getStats();
		const thumbStats = this.thumbnailCache.getStats();
		const upscaleStats = this.upscaleCache.getStats();
		
		const totalSize = blobStats.totalSize + thumbStats.totalSize + upscaleStats.totalSize;
		
		return {
			blob: { count: blobStats.count, size: blobStats.totalSize },
			thumbnail: { count: thumbStats.count, size: thumbStats.totalSize },
			upscale: { count: upscaleStats.count, size: upscaleStats.totalSize },
			totalSize,
			memoryLimit: this.config.memoryLimit,
			usagePercent: totalSize / this.config.memoryLimit
		};
	}

	/** 清空所有缓存 */
	clearAll(): void {
		this.blobCache.clear();
		this.thumbnailCache.clear();
		
		// 清理超分缓存的 URL
		this.upscaleCache.forEach((entry) => {
			URL.revokeObjectURL(entry.objectUrl);
		});
		this.upscaleCache.clear();
		this.upscaleUrlToHash.clear();
	}

	/** 清空指定书籍的缓存 */
	clearBook(bookPath: string): void {
		// Blob 缓存需要遍历清理
		const blobIndices = this.blobCache.getCachedPageIndices();
		for (const index of blobIndices) {
			this.blobCache.delete(index, bookPath);
		}
		
		// 缩略图缓存需要遍历清理
		const thumbKeys = this.thumbnailCache.keys().filter(k => k.includes(bookPath));
		for (const key of thumbKeys) {
			this.thumbnailCache.delete(key);
		}
	}

	/** 更新配置 */
	updateConfig(config: Partial<CacheManagerConfig>): void {
		Object.assign(this.config, config);
		
		if (config.blob) {
			this.blobCache.updateConfig(config.blob);
		}
		if (config.thumbnail) {
			this.thumbnailCache.updateConfig(config.thumbnail);
		}
		if (config.upscale) {
			this.upscaleCache.updateConfig(config.upscale);
		}
	}

	/** 销毁 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		
		this.clearAll();
		this.blobCache.dispose();
		this.thumbnailCache.dispose();
		this.upscaleCache.dispose();
	}
}

/** 获取缓存管理器实例 */
export function getCacheManager(config?: Partial<CacheManagerConfig>): CacheManager {
	return CacheManager.getInstance(config);
}
