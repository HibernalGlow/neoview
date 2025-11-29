/**
 * Blob 缓存管理器
 * 专门用于管理图片 Blob 数据和 Object URL
 */

import { MemoryCache } from './MemoryCache';
import { type BlobCacheItem, type CacheConfig } from '../types';

/** Blob 缓存配置 */
export interface BlobCacheConfig extends CacheConfig {
	revokeOnEvict: boolean;  // 淘汰时是否释放 Object URL
}

/** Blob 缓存条目 */
interface BlobEntry {
	blob: Blob;
	objectUrl: string;
	pageIndex: number;
	hash?: string;
}

/**
 * Blob 缓存管理器
 * 管理图片 Blob 和对应的 Object URL
 */
export class BlobCache {
	private cache: MemoryCache<BlobEntry>;
	private urlToKey = new Map<string, string>();
	private pageIndexToKey = new Map<number, string>();
	private config: BlobCacheConfig;

	constructor(config?: Partial<BlobCacheConfig>) {
		this.config = {
			maxMemorySize: 512 * 1024 * 1024, // 512MB
			maxItems: 50,
			ttl: 5 * 60 * 1000, // 5分钟
			cleanupInterval: 60 * 1000,
			revokeOnEvict: true,
			...config
		};
		
		this.cache = new MemoryCache<BlobEntry>(
			this.config,
			(entry) => entry.blob.size
		);
		
		// 监听淘汰事件，释放 Object URL
		this.cache.addEventListener((event) => {
			if ((event.type === 'evict' || event.type === 'expire') && event.item) {
				this.handleEviction(event.key, event.item.data);
			}
		});
	}

	/** 处理缓存淘汰 */
	private handleEviction(key: string, entry: BlobEntry): void {
		// 清理索引
		this.urlToKey.delete(entry.objectUrl);
		this.pageIndexToKey.delete(entry.pageIndex);
		
		// 释放 Object URL
		if (this.config.revokeOnEvict) {
			URL.revokeObjectURL(entry.objectUrl);
		}
	}

	/** 生成缓存键 */
	private generateKey(pageIndex: number, bookPath?: string): string {
		return bookPath ? `${bookPath}:${pageIndex}` : `page:${pageIndex}`;
	}

	/** 设置 Blob 缓存 */
	set(pageIndex: number, blob: Blob, bookPath?: string, hash?: string): string {
		const key = this.generateKey(pageIndex, bookPath);
		
		// 如果已存在，先删除旧的
		if (this.cache.has(key)) {
			this.delete(pageIndex, bookPath);
		}
		
		// 创建 Object URL
		const objectUrl = URL.createObjectURL(blob);
		
		const entry: BlobEntry = {
			blob,
			objectUrl,
			pageIndex,
			hash
		};
		
		this.cache.set(key, entry);
		this.urlToKey.set(objectUrl, key);
		this.pageIndexToKey.set(pageIndex, key);
		
		return objectUrl;
	}

	/** 获取 Blob */
	get(pageIndex: number, bookPath?: string): BlobEntry | null {
		const key = this.generateKey(pageIndex, bookPath);
		return this.cache.get(key);
	}

	/** 获取 Object URL */
	getUrl(pageIndex: number, bookPath?: string): string | null {
		const entry = this.get(pageIndex, bookPath);
		return entry?.objectUrl ?? null;
	}

	/** 获取 Blob 数据 */
	getBlob(pageIndex: number, bookPath?: string): Blob | null {
		const entry = this.get(pageIndex, bookPath);
		return entry?.blob ?? null;
	}

	/** 检查是否存在 */
	has(pageIndex: number, bookPath?: string): boolean {
		const key = this.generateKey(pageIndex, bookPath);
		return this.cache.has(key);
	}

	/** 通过 Object URL 获取页面索引 */
	getPageIndexByUrl(url: string): number | null {
		const key = this.urlToKey.get(url);
		if (!key) return null;
		
		const entry = this.cache.get(key);
		return entry?.pageIndex ?? null;
	}

	/** 删除缓存 */
	delete(pageIndex: number, bookPath?: string): boolean {
		const key = this.generateKey(pageIndex, bookPath);
		const entry = this.cache.get(key);
		
		if (!entry) return false;
		
		// 清理索引
		this.urlToKey.delete(entry.objectUrl);
		this.pageIndexToKey.delete(pageIndex);
		
		// 释放 Object URL
		if (this.config.revokeOnEvict) {
			URL.revokeObjectURL(entry.objectUrl);
		}
		
		return this.cache.delete(key);
	}

	/** 清空缓存 */
	clear(): void {
		// 释放所有 Object URL
		if (this.config.revokeOnEvict) {
			this.cache.forEach((entry) => {
				URL.revokeObjectURL(entry.objectUrl);
			});
		}
		
		this.cache.clear();
		this.urlToKey.clear();
		this.pageIndexToKey.clear();
	}

	/** 更新访问时间 */
	touch(pageIndex: number, bookPath?: string): void {
		const key = this.generateKey(pageIndex, bookPath);
		// 通过 get 更新访问时间
		this.cache.get(key);
	}

	/** 获取统计信息 */
	getStats(): {
		count: number;
		totalSize: number;
		evictions: number;
	} {
		const stats = this.cache.getStats();
		return {
			count: stats.count,
			totalSize: stats.totalSize,
			evictions: stats.evictions
		};
	}

	/** 获取所有缓存的页面索引 */
	getCachedPageIndices(): number[] {
		return Array.from(this.pageIndexToKey.keys());
	}

	/** 预热缓存（批量添加） */
	async warmup(entries: Array<{
		pageIndex: number;
		blob: Blob;
		bookPath?: string;
		hash?: string;
	}>): Promise<void> {
		for (const entry of entries) {
			this.set(entry.pageIndex, entry.blob, entry.bookPath, entry.hash);
		}
	}

	/** 收缩缓存到指定大小 */
	shrinkTo(maxSize: number): number {
		const currentSize = this.cache.totalSize;
		if (currentSize <= maxSize) return 0;
		
		let shrunk = 0;
		const entries = this.cache.keys();
		
		for (const key of entries) {
			if (this.cache.totalSize <= maxSize) break;
			
			const entry = this.cache.get(key);
			if (entry) {
				const size = entry.blob.size;
				this.cache.delete(key);
				shrunk += size;
			}
		}
		
		return shrunk;
	}

	/** 获取缓存大小 */
	get size(): number {
		return this.cache.size;
	}

	/** 获取总内存大小 */
	get totalSize(): number {
		return this.cache.totalSize;
	}

	/** 更新配置 */
	updateConfig(config: Partial<BlobCacheConfig>): void {
		Object.assign(this.config, config);
		this.cache.updateConfig(config);
	}

	/** 销毁缓存 */
	dispose(): void {
		this.clear();
		this.cache.dispose();
	}
}

/** 创建 Blob 缓存 */
export function createBlobCache(config?: Partial<BlobCacheConfig>): BlobCache {
	return new BlobCache(config);
}
