/**
 * 内存缓存管理器
 * 基于 LRU 策略的泛型内存缓存
 */

import { type CacheItem, type CacheStats, type CacheConfig } from '../types';

/** 缓存事件类型 */
export type CacheEventType = 'hit' | 'miss' | 'set' | 'evict' | 'expire' | 'clear';

/** 缓存事件 */
export interface CacheEvent<T> {
	type: CacheEventType;
	key: string;
	item?: CacheItem<T>;
}

/** 缓存事件监听器 */
export type CacheEventListener<T> = (event: CacheEvent<T>) => void;

/**
 * LRU 内存缓存
 * 支持大小限制、TTL、自动清理
 */
export class MemoryCache<T> {
	private cache = new Map<string, CacheItem<T>>();
	private config: CacheConfig;
	private stats: CacheStats;
	private cleanupTimer: ReturnType<typeof setInterval> | null = null;
	private sizeCalculator: (data: T) => number;
	private eventListeners: CacheEventListener<T>[] = [];

	constructor(
		config: Partial<CacheConfig>,
		sizeCalculator: (data: T) => number = () => 1
	) {
		this.config = {
			maxMemorySize: 512 * 1024 * 1024, // 512MB
			maxItems: 100,
			ttl: 5 * 60 * 1000, // 5分钟
			cleanupInterval: 60 * 1000, // 1分钟
			...config
		};
		
		this.stats = {
			count: 0,
			totalSize: 0,
			hitRate: 0,
			evictions: 0
		};
		
		this.sizeCalculator = sizeCalculator;
		
		// 启动定期清理
		if (this.config.cleanupInterval > 0) {
			this.startCleanupTimer();
		}
	}

	/** 获取缓存项 */
	get(key: string): T | null {
		const item = this.cache.get(key);
		
		if (!item) {
			this.emitEvent({ type: 'miss', key });
			return null;
		}
		
		// 检查是否过期
		if (item.expiresAt && Date.now() > item.expiresAt) {
			this.delete(key);
			this.emitEvent({ type: 'expire', key, item });
			return null;
		}
		
		// 更新访问时间（LRU）
		item.lastAccessed = Date.now();
		
		// 移到最后（Map保持插入顺序）
		this.cache.delete(key);
		this.cache.set(key, item);
		
		this.emitEvent({ type: 'hit', key, item });
		return item.data;
	}

	/** 设置缓存项 */
	set(key: string, data: T, ttl?: number): void {
		const size = this.sizeCalculator(data);
		const now = Date.now();
		
		// 如果已存在，先删除
		if (this.cache.has(key)) {
			this.delete(key);
		}
		
		// 检查是否需要腾出空间
		this.ensureCapacity(size);
		
		const item: CacheItem<T> = {
			key,
			data,
			size,
			lastAccessed: now,
			createdAt: now,
			expiresAt: ttl ? now + ttl : (this.config.ttl ? now + this.config.ttl : undefined)
		};
		
		this.cache.set(key, item);
		this.stats.count = this.cache.size;
		this.stats.totalSize += size;
		
		this.emitEvent({ type: 'set', key, item });
	}

	/** 检查是否存在 */
	has(key: string): boolean {
		const item = this.cache.get(key);
		if (!item) return false;
		
		// 检查是否过期
		if (item.expiresAt && Date.now() > item.expiresAt) {
			this.delete(key);
			return false;
		}
		
		return true;
	}

	/** 删除缓存项 */
	delete(key: string): boolean {
		const item = this.cache.get(key);
		if (!item) return false;
		
		this.cache.delete(key);
		this.stats.count = this.cache.size;
		this.stats.totalSize -= item.size;
		
		return true;
	}

	/** 清空缓存 */
	clear(): void {
		this.cache.clear();
		this.stats.count = 0;
		this.stats.totalSize = 0;
		this.emitEvent({ type: 'clear', key: '' });
	}

	/** 确保有足够容量 */
	private ensureCapacity(requiredSize: number): void {
		// 按数量限制淘汰
		while (this.cache.size >= this.config.maxItems) {
			this.evictOldest();
		}
		
		// 按大小限制淘汰
		while (this.stats.totalSize + requiredSize > this.config.maxMemorySize && this.cache.size > 0) {
			this.evictOldest();
		}
	}

	/** 淘汰最旧的项 */
	private evictOldest(): void {
		// Map迭代器返回的第一个是最早插入的
		const firstKey = this.cache.keys().next().value;
		if (firstKey !== undefined) {
			const item = this.cache.get(firstKey);
			this.delete(firstKey);
			this.stats.evictions++;
			this.emitEvent({ type: 'evict', key: firstKey, item });
		}
	}

	/** 清理过期项 */
	cleanup(): number {
		const now = Date.now();
		let cleaned = 0;
		
		for (const [key, item] of this.cache) {
			if (item.expiresAt && now > item.expiresAt) {
				this.delete(key);
				this.emitEvent({ type: 'expire', key, item });
				cleaned++;
			}
		}
		
		return cleaned;
	}

	/** 启动清理定时器 */
	private startCleanupTimer(): void {
		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, this.config.cleanupInterval);
	}

	/** 停止清理定时器 */
	private stopCleanupTimer(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	/** 获取统计信息 */
	getStats(): CacheStats {
		return { ...this.stats };
	}

	/** 获取所有键 */
	keys(): string[] {
		return Array.from(this.cache.keys());
	}

	/** 获取所有值 */
	values(): T[] {
		return Array.from(this.cache.values())
			.filter(item => !item.expiresAt || Date.now() <= item.expiresAt)
			.map(item => item.data);
	}

	/** 遍历缓存 */
	forEach(callback: (data: T, key: string) => void): void {
		const now = Date.now();
		for (const [key, item] of this.cache) {
			if (!item.expiresAt || now <= item.expiresAt) {
				callback(item.data, key);
			}
		}
	}

	/** 添加事件监听器 */
	addEventListener(listener: CacheEventListener<T>): () => void {
		this.eventListeners.push(listener);
		return () => {
			const index = this.eventListeners.indexOf(listener);
			if (index !== -1) {
				this.eventListeners.splice(index, 1);
			}
		};
	}

	/** 触发事件 */
	private emitEvent(event: CacheEvent<T>): void {
		for (const listener of this.eventListeners) {
			try {
				listener(event);
			} catch (error) {
				console.error('Cache event listener error:', error);
			}
		}
	}

	/** 更新配置 */
	updateConfig(config: Partial<CacheConfig>): void {
		const oldInterval = this.config.cleanupInterval;
		Object.assign(this.config, config);
		
		// 如果清理间隔改变，重启定时器
		if (config.cleanupInterval !== undefined && config.cleanupInterval !== oldInterval) {
			this.stopCleanupTimer();
			if (config.cleanupInterval > 0) {
				this.startCleanupTimer();
			}
		}
		
		// 如果容量减小，执行淘汰
		this.ensureCapacity(0);
	}

	/** 获取缓存大小 */
	get size(): number {
		return this.cache.size;
	}

	/** 获取总内存大小 */
	get totalSize(): number {
		return this.stats.totalSize;
	}

	/** 销毁缓存 */
	dispose(): void {
		this.stopCleanupTimer();
		this.clear();
		this.eventListeners = [];
	}
}

/** 创建内存缓存 */
export function createMemoryCache<T>(
	config?: Partial<CacheConfig>,
	sizeCalculator?: (data: T) => number
): MemoryCache<T> {
	return new MemoryCache(config ?? {}, sizeCalculator);
}
