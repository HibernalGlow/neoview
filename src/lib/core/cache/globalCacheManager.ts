/**
 * 全局缓存管理器
 * 
 * 提供统一的缓存管理，支持：
 * - TTL（时间过期）
 * - LRU（最近最少使用淘汰）
 * - IndexedDB 持久化（可选）
 * - 自动清理
 * - 统计监控
 */

import { PersistentCache, createPersistentCache } from './persistentCache';

// ============================================================================
// 类型定义
// ============================================================================

export interface CacheEntryMeta {
	key: string;
	size: number;
	createdAt: number;
	lastAccessed: number;
	accessCount: number;
	expiresAt?: number;
}

export interface CacheNamespaceConfig {
	/** 命名空间名称 */
	name: string;
	/** 最大缓存大小（字节），默认 50MB */
	maxSize?: number;
	/** 最大缓存项数，默认 1000 */
	maxItems?: number;
	/** TTL（毫秒），默认不过期 */
	ttl?: number;
	/** 是否启用持久化，默认 false */
	persistent?: boolean;
	/** 持久化存储名称 */
	storeName?: string;
}

export interface GlobalCacheStats {
	namespaces: Map<string, NamespaceStats>;
	totalSize: number;
	totalItems: number;
	persistentNamespaces: number;
}

export interface NamespaceStats {
	name: string;
	size: number;
	items: number;
	maxSize: number;
	maxItems: number;
	ttl?: number;
	hitRate: number;
	persistent: boolean;
}

// ============================================================================
// 缓存命名空间
// ============================================================================

class CacheNamespace<T> {
	private memoryCache = new Map<string, { value: T; meta: CacheEntryMeta }>();
	private persistentCache: PersistentCache<T> | null = null;
	private config: Required<Omit<CacheNamespaceConfig, 'storeName'>> & { storeName?: string };
	private currentSize = 0;
	private hits = 0;
	private misses = 0;
	private initPromise: Promise<void> | null = null;

	constructor(config: CacheNamespaceConfig) {
		this.config = {
			name: config.name,
			maxSize: config.maxSize ?? 50 * 1024 * 1024,
			maxItems: config.maxItems ?? 1000,
			ttl: config.ttl ?? 0,
			persistent: config.persistent ?? false,
			storeName: config.storeName,
		};

		if (this.config.persistent) {
			this.initPromise = this.initPersistence();
		}
	}

	private async initPersistence(): Promise<void> {
		try {
			this.persistentCache = createPersistentCache<T>({
				dbName: 'neoview-cache',
				storeName: this.config.storeName || this.config.name,
				maxAge: this.config.ttl || undefined,
			});
			await this.persistentCache.init();
		} catch (e) {
			console.warn(`[CacheNamespace:${this.config.name}] 持久化初始化失败:`, e);
			this.persistentCache = null;
		}
	}

	async get(key: string): Promise<T | undefined> {
		// 先检查内存缓存
		const memEntry = this.memoryCache.get(key);
		if (memEntry) {
			// 检查是否过期
			if (this.isExpired(memEntry.meta)) {
				this.delete(key);
				this.misses++;
				return undefined;
			}
			memEntry.meta.lastAccessed = Date.now();
			memEntry.meta.accessCount++;
			this.hits++;
			return memEntry.value;
		}

		// 检查持久化缓存
		if (this.persistentCache) {
			await this.initPromise;
			try {
				const persisted = await this.persistentCache.get(key);
				if (persisted !== undefined) {
					// 恢复到内存缓存
					const size = this.estimateSize(persisted);
					this.setMemory(key, persisted, size);
					this.hits++;
					return persisted;
				}
			} catch (e) {
				console.debug(`[CacheNamespace:${this.config.name}] 持久化读取失败:`, e);
			}
		}

		this.misses++;
		return undefined;
	}

	getSync(key: string): T | undefined {
		const memEntry = this.memoryCache.get(key);
		if (!memEntry) {
			this.misses++;
			return undefined;
		}
		if (this.isExpired(memEntry.meta)) {
			this.delete(key);
			this.misses++;
			return undefined;
		}
		memEntry.meta.lastAccessed = Date.now();
		memEntry.meta.accessCount++;
		this.hits++;
		return memEntry.value;
	}

	async set(key: string, value: T, size?: number): Promise<void> {
		const actualSize = size ?? this.estimateSize(value);
		
		// 设置内存缓存
		this.setMemory(key, value, actualSize);

		// 持久化
		if (this.persistentCache) {
			await this.initPromise;
			try {
				await this.persistentCache.set(key, value);
			} catch (e) {
				console.debug(`[CacheNamespace:${this.config.name}] 持久化写入失败:`, e);
			}
		}
	}

	private setMemory(key: string, value: T, size: number): void {
		// 删除旧项（如果存在）
		if (this.memoryCache.has(key)) {
			this.deleteMemory(key);
		}

		// 淘汰以腾出空间
		this.evictIfNeeded(size);

		const meta: CacheEntryMeta = {
			key,
			size,
			createdAt: Date.now(),
			lastAccessed: Date.now(),
			accessCount: 1,
			expiresAt: this.config.ttl > 0 ? Date.now() + this.config.ttl : undefined,
		};

		this.memoryCache.set(key, { value, meta });
		this.currentSize += size;
	}

	delete(key: string): boolean {
		const deleted = this.deleteMemory(key);
		
		// 也从持久化存储删除
		if (this.persistentCache) {
			this.persistentCache.delete(key).catch(() => {});
		}

		return deleted;
	}

	private deleteMemory(key: string): boolean {
		const entry = this.memoryCache.get(key);
		if (!entry) return false;
		this.currentSize -= entry.meta.size;
		return this.memoryCache.delete(key);
	}

	has(key: string): boolean {
		const entry = this.memoryCache.get(key);
		if (!entry) return false;
		if (this.isExpired(entry.meta)) {
			this.delete(key);
			return false;
		}
		return true;
	}

	clear(): void {
		this.memoryCache.clear();
		this.currentSize = 0;
		this.hits = 0;
		this.misses = 0;

		if (this.persistentCache) {
			this.persistentCache.clear().catch(() => {});
		}
	}

	/** 清理过期项 */
	cleanupExpired(): number {
		if (this.config.ttl <= 0) return 0;

		const now = Date.now();
		const expired: string[] = [];

		for (const [key, entry] of this.memoryCache) {
			if (this.isExpired(entry.meta, now)) {
				expired.push(key);
			}
		}

		for (const key of expired) {
			this.delete(key);
		}

		return expired.length;
	}

	getStats(): NamespaceStats {
		const totalRequests = this.hits + this.misses;
		return {
			name: this.config.name,
			size: this.currentSize,
			items: this.memoryCache.size,
			maxSize: this.config.maxSize,
			maxItems: this.config.maxItems,
			ttl: this.config.ttl || undefined,
			hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
			persistent: this.config.persistent,
		};
	}

	keys(): string[] {
		return Array.from(this.memoryCache.keys());
	}

	/** 从持久化存储预热内存缓存 */
	async warmup(keys?: string[]): Promise<number> {
		if (!this.persistentCache) return 0;

		await this.initPromise;
		let loaded = 0;

		try {
			const allKeys = keys || await this.persistentCache.keys();
			for (const key of allKeys) {
				if (this.memoryCache.has(key)) continue;
				const value = await this.persistentCache.get(key);
				if (value !== undefined) {
					const size = this.estimateSize(value);
					this.setMemory(key, value, size);
					loaded++;
				}
			}
		} catch (e) {
			console.debug(`[CacheNamespace:${this.config.name}] 预热失败:`, e);
		}

		return loaded;
	}

	private isExpired(meta: CacheEntryMeta, now = Date.now()): boolean {
		return meta.expiresAt !== undefined && now > meta.expiresAt;
	}

	private evictIfNeeded(neededSize: number): void {
		// 按数量淘汰
		while (this.memoryCache.size >= this.config.maxItems) {
			this.evictLRU();
		}

		// 按大小淘汰
		while (this.currentSize + neededSize > this.config.maxSize && this.memoryCache.size > 0) {
			this.evictLRU();
		}
	}

	private evictLRU(): void {
		let oldest: { key: string; time: number } | null = null;

		for (const [key, entry] of this.memoryCache) {
			if (!oldest || entry.meta.lastAccessed < oldest.time) {
				oldest = { key, time: entry.meta.lastAccessed };
			}
		}

		if (oldest) {
			this.deleteMemory(oldest.key);
			// 注意：LRU淘汰不删除持久化存储，下次可以恢复
		}
	}

	private estimateSize(value: T): number {
		if (value instanceof Blob) return value.size;
		if (value instanceof ArrayBuffer) return value.byteLength;
		if (typeof value === 'string') return value.length * 2;
		if (typeof value === 'number') return 8;
		if (typeof value === 'boolean') return 4;
		// 对象估算
		try {
			return JSON.stringify(value).length * 2;
		} catch {
			return 1024; // 默认 1KB
		}
	}
}

// ============================================================================
// 全局缓存管理器
// ============================================================================

class GlobalCacheManager {
	private namespaces = new Map<string, CacheNamespace<unknown>>();
	private cleanupIntervalId: number | null = null;
	private cleanupIntervalMs = 60 * 1000; // 默认1分钟清理一次

	constructor() {
		this.startAutoCleanup();
	}

	/**
	 * 获取或创建命名空间
	 */
	getNamespace<T>(config: CacheNamespaceConfig): CacheNamespace<T> {
		let ns = this.namespaces.get(config.name);
		if (!ns) {
			ns = new CacheNamespace<T>(config);
			this.namespaces.set(config.name, ns as CacheNamespace<unknown>);
		}
		return ns as CacheNamespace<T>;
	}

	/**
	 * 检查命名空间是否存在
	 */
	hasNamespace(name: string): boolean {
		return this.namespaces.has(name);
	}

	/**
	 * 删除命名空间
	 */
	deleteNamespace(name: string): boolean {
		const ns = this.namespaces.get(name);
		if (ns) {
			ns.clear();
			return this.namespaces.delete(name);
		}
		return false;
	}

	/**
	 * 清理所有命名空间的过期项
	 */
	cleanupAllExpired(): number {
		let total = 0;
		for (const ns of this.namespaces.values()) {
			total += ns.cleanupExpired();
		}
		if (total > 0) {
			console.debug(`[GlobalCacheManager] 清理过期项: ${total}`);
		}
		return total;
	}

	/**
	 * 清空所有缓存
	 */
	clearAll(): void {
		for (const ns of this.namespaces.values()) {
			ns.clear();
		}
	}

	/**
	 * 获取全局统计
	 */
	getStats(): GlobalCacheStats {
		const stats: GlobalCacheStats = {
			namespaces: new Map(),
			totalSize: 0,
			totalItems: 0,
			persistentNamespaces: 0,
		};

		for (const [name, ns] of this.namespaces) {
			const nsStats = ns.getStats();
			stats.namespaces.set(name, nsStats);
			stats.totalSize += nsStats.size;
			stats.totalItems += nsStats.items;
			if (nsStats.persistent) {
				stats.persistentNamespaces++;
			}
		}

		return stats;
	}

	/**
	 * 设置自动清理间隔
	 */
	setCleanupInterval(ms: number): void {
		this.cleanupIntervalMs = ms;
		this.stopAutoCleanup();
		this.startAutoCleanup();
	}

	/**
	 * 启动自动清理
	 */
	startAutoCleanup(): void {
		if (this.cleanupIntervalId !== null) return;
		this.cleanupIntervalId = window.setInterval(() => {
			this.cleanupAllExpired();
		}, this.cleanupIntervalMs);
	}

	/**
	 * 停止自动清理
	 */
	stopAutoCleanup(): void {
		if (this.cleanupIntervalId !== null) {
			clearInterval(this.cleanupIntervalId);
			this.cleanupIntervalId = null;
		}
	}

	/**
	 * 预热所有持久化命名空间
	 */
	async warmupAll(): Promise<Map<string, number>> {
		const results = new Map<string, number>();
		for (const [name, ns] of this.namespaces) {
			const loaded = await ns.warmup();
			if (loaded > 0) {
				results.set(name, loaded);
			}
		}
		return results;
	}

	/**
	 * 应用关闭时的清理
	 */
	dispose(): void {
		this.stopAutoCleanup();
		// 持久化缓存会自动保存，这里只清理内存
	}
}

// ============================================================================
// 单例导出
// ============================================================================

export const globalCacheManager = new GlobalCacheManager();

// ============================================================================
// 便捷工厂函数
// ============================================================================

/** 创建内存缓存（不持久化） */
export function createMemoryCache<T>(name: string, options?: Partial<CacheNamespaceConfig>) {
	return globalCacheManager.getNamespace<T>({
		name,
		persistent: false,
		...options,
	});
}

/** 创建持久化缓存 */
export function createPersistentNamespace<T>(name: string, options?: Partial<CacheNamespaceConfig>) {
	return globalCacheManager.getNamespace<T>({
		name,
		persistent: true,
		...options,
	});
}

/** 创建带TTL的缓存 */
export function createTTLCache<T>(name: string, ttlMs: number, options?: Partial<CacheNamespaceConfig>) {
	return globalCacheManager.getNamespace<T>({
		name,
		ttl: ttlMs,
		...options,
	});
}

// ============================================================================
// 预定义缓存命名空间
// ============================================================================

/** 缩略图缓存 - 持久化，TTL 24小时 */
export const thumbnailCache = globalCacheManager.getNamespace<string>({
	name: 'thumbnails',
	maxSize: 100 * 1024 * 1024, // 100MB
	maxItems: 2000,
	ttl: 24 * 60 * 60 * 1000, // 24小时
	persistent: true,
});

/** 文件夹元数据缓存 - 持久化，TTL 1小时 */
export const folderMetaCache = globalCacheManager.getNamespace<unknown>({
	name: 'folder-meta',
	maxSize: 10 * 1024 * 1024, // 10MB
	maxItems: 1000,
	ttl: 60 * 60 * 1000, // 1小时
	persistent: true,
});

/** 评分缓存 - 持久化，TTL 5分钟 */
export const ratingCacheNs = globalCacheManager.getNamespace<unknown>({
	name: 'ratings',
	maxSize: 5 * 1024 * 1024, // 5MB
	maxItems: 5000,
	ttl: 5 * 60 * 1000, // 5分钟
	persistent: true,
});

/** 图片Blob缓存 - 仅内存，500MB */
export const imageBlobCache = globalCacheManager.getNamespace<Blob>({
	name: 'image-blobs',
	maxSize: 500 * 1024 * 1024, // 500MB
	maxItems: 200,
	persistent: false, // Blob不持久化
});

/** 目录树缓存 - 持久化，TTL 30分钟 */
export const directoryTreeCacheNs = globalCacheManager.getNamespace<unknown>({
	name: 'directory-tree',
	maxSize: 20 * 1024 * 1024, // 20MB
	maxItems: 500,
	ttl: 30 * 60 * 1000, // 30分钟
	persistent: true,
});
