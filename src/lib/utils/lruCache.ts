/**
 * LRU Cache Implementation
 * 基于 LRU 算法的智能缓存淘汰系统
 */

export interface LRUCacheEntry<T> {
  key: string;
  value: T;
  size: number; // 字节大小
  lastAccess: number; // 最后访问时间戳
  accessCount: number; // 访问次数
}

export interface LRUCacheOptions {
  maxSize: number; // 最大缓存大小（字节）
  maxItems?: number; // 最大缓存项数
  ttl?: number; // 缓存过期时间（毫秒），可选
}

/**
 * LRU 缓存实现
 * 支持基于大小和访问时间的智能淘汰
 */
export class LRUCache<T> {
  private cache = new Map<string, LRUCacheEntry<T>>();
  private maxSize: number;
  private maxItems: number;
  private ttl?: number;
  private currentSize = 0;

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.maxItems = options.maxItems ?? Infinity;
    this.ttl = options.ttl;
  }

  /**
   * 获取缓存项
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (this.ttl && Date.now() - entry.lastAccess > this.ttl) {
      this.delete(key);
      return null;
    }

    // 更新访问信息
    entry.lastAccess = Date.now();
    entry.accessCount++;
    
    // 移动到末尾（LRU 策略）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 设置缓存项
   */
  set(key: string, value: T, size: number = 0): void {
    // 如果已存在，先删除旧项
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // 检查是否需要清理空间
    while (
      (this.currentSize + size > this.maxSize || this.cache.size >= this.maxItems) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    // 添加新项
    const entry: LRUCacheEntry<T> = {
      key,
      value,
      size,
      lastAccess: Date.now(),
      accessCount: 1,
    };

    this.cache.set(key, entry);
    this.currentSize += size;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentSize -= entry.size;
    return true;
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    count: number;
    maxSize: number;
    maxItems: number;
    usage: number; // 使用率 0-1
  } {
    return {
      size: this.currentSize,
      count: this.cache.size,
      maxSize: this.maxSize,
      maxItems: this.maxItems,
      usage: this.maxSize > 0 ? this.currentSize / this.maxSize : 0,
    };
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * 淘汰最少使用的项（LRU）
   */
  private evictLRU(): void {
    if (this.cache.size === 0) {
      return;
    }

    // 找到最久未访问的项（Map 的第一个元素）
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.delete(firstKey);
    }
  }

  /**
   * 批量删除
   */
  deleteBatch(keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * 清理过期项
   */
  cleanupExpired(): number {
    if (!this.ttl) {
      return 0;
    }

    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastAccess > this.ttl) {
        expired.push(key);
      }
    }

    return this.deleteBatch(expired);
  }

  /**
   * 更新最大大小
   */
  updateMaxSize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    
    // 如果当前大小超过新限制，清理缓存
    while (this.currentSize > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }
  }
}

