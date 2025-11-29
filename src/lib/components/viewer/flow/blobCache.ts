/**
 * Blob 缓存管理模块
 * 负责图片 Blob 的缓存、访问时间追踪和 LRU 淘汰
 */

export interface BlobCacheItem {
	blob: Blob;
	url: string;
	lastAccessed: number;
	size: number;
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
	 */
	private enforceLimit(): void {
		if (this.currentSize <= this.config.maxSizeBytes) {
			return;
		}

		// 按访问时间排序（最旧的在前）
		const entries = Array.from(this.cache.entries())
			.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

		// 淘汰直到满足限制
		for (const [pageIndex] of entries) {
			if (this.currentSize <= this.config.maxSizeBytes) {
				break;
			}
			this.delete(pageIndex);
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
