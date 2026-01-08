/**
 * Blob 缓存管理模块
 * 负责图片 Blob 的缓存、访问时间追踪和 LRU 淘汰
 */

export interface BlobCacheItem {
	blob: Blob;
	url: string;
	lastAccessed: number;
	size: number;
	/** 【性能优化】缓存图片尺寸，避免重复解码 */
	dimensions?: { width: number; height: number } | null;
	/** 【性能优化】预解码的 ImageBitmap，避免渲染时解码 */
	bitmap?: ImageBitmap;
}

export interface BlobCacheConfig {
	maxSizeBytes: number; // 最大缓存大小（字节）
}

const DEFAULT_CONFIG: BlobCacheConfig = {
	maxSizeBytes: 500 * 1024 * 1024 // 500MB
};

export class BlobCache {
	private cache = new Map<number, BlobCacheItem>();
	private config: BlobCacheConfig;
	private currentSize = 0;

	constructor(config: Partial<BlobCacheConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * 检查是否有缓存
	 */
	has(pageIndex: number): boolean {
		return this.cache.has(pageIndex);
	}

	/**
	 * 获取缓存项（同时更新访问时间）
	 */
	get(pageIndex: number): BlobCacheItem | undefined {
		const item = this.cache.get(pageIndex);
		if (item) {
			item.lastAccessed = Date.now();
		}
		return item;
	}

	/**
	 * 获取 URL（快速访问）
	 */
	getUrl(pageIndex: number): string | undefined {
		return this.get(pageIndex)?.url;
	}

	/**
	 * 获取 Blob（快速访问）
	 */
	getBlob(pageIndex: number): Blob | undefined {
		return this.get(pageIndex)?.blob;
	}

	/**
	 * 【性能优化】获取已缓存的尺寸
	 */
	getDimensions(pageIndex: number): { width: number; height: number } | null | undefined {
		return this.cache.get(pageIndex)?.dimensions;
	}

	/**
	 * 【性能优化】设置图片尺寸（加载后缓存）
	 */
	setDimensions(pageIndex: number, dimensions: { width: number; height: number } | null): void {
		const item = this.cache.get(pageIndex);
		if (item) {
			item.dimensions = dimensions;
		}
	}

	/**
	 * 【性能优化】获取预解码的 ImageBitmap
	 */
	getBitmap(pageIndex: number): ImageBitmap | undefined {
		return this.cache.get(pageIndex)?.bitmap;
	}

	/**
	 * 【性能优化】设置预解码的 ImageBitmap
	 */
	setBitmap(pageIndex: number, bitmap: ImageBitmap): void {
		const item = this.cache.get(pageIndex);
		if (item) {
			// 关闭旧的 bitmap
			if (item.bitmap) {
				item.bitmap.close();
			}
			item.bitmap = bitmap;
			// 同时更新尺寸
			if (!item.dimensions) {
				item.dimensions = { width: bitmap.width, height: bitmap.height };
			}
		}
	}

	/**
	 * 设置缓存
	 */
	set(pageIndex: number, blob: Blob): string {
		// 如果已存在，先删除旧的
		if (this.cache.has(pageIndex)) {
			this.delete(pageIndex);
		}

		const url = URL.createObjectURL(blob);

		const item: BlobCacheItem = {
			blob,
			url,
			lastAccessed: Date.now(),
			size: blob.size
		};

		this.cache.set(pageIndex, item);
		this.currentSize += blob.size;

		// 检查是否需要淘汰
		this.enforceLimit();

		return url;
	}

	/**
	 * 删除缓存
	 */
	delete(pageIndex: number): boolean {
		const item = this.cache.get(pageIndex);
		if (item) {
			URL.revokeObjectURL(item.url);
			// 【重要】释放 ImageBitmap 防止内存泄漏
			if (item.bitmap) {
				item.bitmap.close();
			}
			this.currentSize -= item.size;
			return this.cache.delete(pageIndex);
		}
		return false;
	}

	/**
	 * 清空所有缓存
	 */
	clear(): void {
		for (const [, item] of this.cache) {
			URL.revokeObjectURL(item.url);
			// 【重要】释放所有 ImageBitmap
			if (item.bitmap) {
				item.bitmap.close();
			}
		}
		this.cache.clear();
		this.currentSize = 0;
	}

	/**
	 * 更新访问时间
	 */
	touch(pageIndex: number): void {
		const item = this.cache.get(pageIndex);
		if (item) {
			item.lastAccessed = Date.now();
		}
	}

	/**
	 * 获取缓存统计
	 */
	getStats(): { count: number; sizeBytes: number; sizeMB: number } {
		return {
			count: this.cache.size,
			sizeBytes: this.currentSize,
			sizeMB: Math.round(this.currentSize / 1024 / 1024 * 100) / 100
		};
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<BlobCacheConfig>): void {
		this.config = { ...this.config, ...config };
		this.enforceLimit();
	}

	/**
	 * 执行 LRU 淘汰
	 * 【优化】使用部分排序，只找到需要淘汰的最旧条目
	 */
	private enforceLimit(): void {
		if (this.currentSize <= this.config.maxSizeBytes) {
			return;
		}

		// 计算需要释放的空间
		const targetSize = Math.floor(this.config.maxSizeBytes * 0.8); // 释放到80%，避免频繁触发
		
		// 收集所有条目
		const entries = Array.from(this.cache.entries());
		
		// 如果条目很少，直接排序
		if (entries.length <= 20) {
			entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
			for (const [pageIndex] of entries) {
				if (this.currentSize <= targetSize) break;
				this.delete(pageIndex);
			}
			return;
		}

		// 【优化】使用选择淘汰：找到访问时间最早的条目批量删除
		// 而不是排序整个数组
		while (this.currentSize > targetSize && this.cache.size > 0) {
			let oldestKey: number | null = null;
			let oldestTime = Infinity;
			
			for (const [key, item] of this.cache) {
				if (item.lastAccessed < oldestTime) {
					oldestTime = item.lastAccessed;
					oldestKey = key;
				}
			}
			
			if (oldestKey !== null) {
				this.delete(oldestKey);
			} else {
				break;
			}
		}
	}

	/**
	 * 预热：批量检查哪些页面需要加载
	 */
	getMissingPages(pageIndices: number[]): number[] {
		return pageIndices.filter(index => !this.cache.has(index));
	}
}

// 单例实例
let instance: BlobCache | null = null;

export function getBlobCache(config?: Partial<BlobCacheConfig>): BlobCache {
	if (!instance) {
		instance = new BlobCache(config);
	}
	return instance;
}

export function resetBlobCache(): void {
	if (instance) {
		instance.clear();
		instance = null;
	}
}
