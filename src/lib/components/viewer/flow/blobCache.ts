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
		console.log(`✅ BlobCache.set: page=${pageIndex} size=${blob.size} type=${blob.type} url=${url.substring(0, 50)}...`);
		
		// 【调试】验证 Blob 内容的前几个字节（检查图片魔数）
		blob.slice(0, 12).arrayBuffer().then(buf => {
			const header = new Uint8Array(buf);
			const hex = Array.from(header.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
			console.log(`🔍 BlobCache[${pageIndex}] header: ${hex}`);
		});
		
		// 【调试】测试 Blob URL 是否可用
		const testImg = new Image();
		testImg.onload = () => console.log(`✅ BlobCache[${pageIndex}] testImg onload 成功! ${testImg.naturalWidth}x${testImg.naturalHeight}`);
		testImg.onerror = () => console.error(`❌ BlobCache[${pageIndex}] testImg onerror! Blob URL 无法加载`);
		testImg.src = url;

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
		// 【调试】暂时禁用 LRU 淘汰
		console.log(`⚠️ BlobCache: LRU 已禁用，当前缓存: ${this.cache.size} 项, ${Math.round(this.currentSize / 1024 / 1024)}MB`);
		return;
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
