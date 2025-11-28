/**
 * LRUCache - 最近最少使用缓存
 * 
 * 用于管理图像和缩略图的内存缓存
 * 当缓存满时自动移除最久未使用的项
 */

export interface LRUCacheOptions<V> {
  /** 最大缓存数量 */
  max: number;
  /** 项被移除时的回调 */
  dispose?: (value: V, key: string) => void;
  /** 获取项大小的函数 (用于基于大小的限制) */
  sizeOf?: (value: V, key: string) => number;
  /** 最大总大小 (字节) */
  maxSize?: number;
}

interface CacheEntry<V> {
  key: string;
  value: V;
  size: number;
  prev: CacheEntry<V> | null;
  next: CacheEntry<V> | null;
}

export class LRUCache<V> {
  private _options: LRUCacheOptions<V>;
  private _map: Map<string, CacheEntry<V>> = new Map();
  private _head: CacheEntry<V> | null = null;
  private _tail: CacheEntry<V> | null = null;
  private _size: number = 0;
  private _totalSize: number = 0;

  constructor(options: LRUCacheOptions<V>) {
    this._options = options;
  }

  // ============================================================================
  // 公共属性
  // ============================================================================

  get size(): number {
    return this._size;
  }

  get totalSize(): number {
    return this._totalSize;
  }

  get max(): number {
    return this._options.max;
  }

  get maxSize(): number | undefined {
    return this._options.maxSize;
  }

  // ============================================================================
  // 公共方法
  // ============================================================================

  /**
   * 获取缓存项
   */
  get(key: string): V | undefined {
    const entry = this._map.get(key);
    if (!entry) return undefined;

    // 移动到头部 (最近使用)
    this.moveToHead(entry);
    return entry.value;
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    return this._map.has(key);
  }

  /**
   * 设置缓存项
   */
  set(key: string, value: V): this {
    const existingEntry = this._map.get(key);

    if (existingEntry) {
      // 更新现有项
      const oldSize = existingEntry.size;
      const newSize = this._options.sizeOf?.(value, key) ?? 1;

      existingEntry.value = value;
      existingEntry.size = newSize;
      this._totalSize += newSize - oldSize;

      this.moveToHead(existingEntry);
    } else {
      // 创建新项
      const size = this._options.sizeOf?.(value, key) ?? 1;
      const entry: CacheEntry<V> = {
        key,
        value,
        size,
        prev: null,
        next: null,
      };

      this._map.set(key, entry);
      this.addToHead(entry);
      this._size++;
      this._totalSize += size;
    }

    // 清理超出限制的项
    this.trim();

    return this;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const entry = this._map.get(key);
    if (!entry) return false;

    this.removeEntry(entry);
    this._map.delete(key);
    this._size--;
    this._totalSize -= entry.size;

    this._options.dispose?.(entry.value, key);
    return true;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    if (this._options.dispose) {
      for (const [key, entry] of this._map) {
        this._options.dispose(entry.value, key);
      }
    }

    this._map.clear();
    this._head = null;
    this._tail = null;
    this._size = 0;
    this._totalSize = 0;
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this._map.keys());
  }

  /**
   * 获取所有值
   */
  values(): V[] {
    return Array.from(this._map.values()).map(e => e.value);
  }

  /**
   * 遍历
   */
  forEach(callback: (value: V, key: string) => void): void {
    for (const [key, entry] of this._map) {
      callback(entry.value, key);
    }
  }

  /**
   * 查看最近使用的项 (不更新访问顺序)
   */
  peek(key: string): V | undefined {
    return this._map.get(key)?.value;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private addToHead(entry: CacheEntry<V>): void {
    entry.prev = null;
    entry.next = this._head;

    if (this._head) {
      this._head.prev = entry;
    }
    this._head = entry;

    if (!this._tail) {
      this._tail = entry;
    }
  }

  private removeEntry(entry: CacheEntry<V>): void {
    if (entry.prev) {
      entry.prev.next = entry.next;
    } else {
      this._head = entry.next;
    }

    if (entry.next) {
      entry.next.prev = entry.prev;
    } else {
      this._tail = entry.prev;
    }
  }

  private moveToHead(entry: CacheEntry<V>): void {
    if (entry === this._head) return;

    this.removeEntry(entry);
    this.addToHead(entry);
  }

  private trim(): void {
    // 按数量限制
    while (this._size > this._options.max && this._tail) {
      this.evictTail();
    }

    // 按大小限制
    if (this._options.maxSize) {
      while (this._totalSize > this._options.maxSize && this._tail) {
        this.evictTail();
      }
    }
  }

  private evictTail(): void {
    if (!this._tail) return;

    const entry = this._tail;
    this.removeEntry(entry);
    this._map.delete(entry.key);
    this._size--;
    this._totalSize -= entry.size;

    this._options.dispose?.(entry.value, entry.key);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 Blob 缓存
 */
export function createBlobCache(maxItems: number = 50): LRUCache<Blob> {
  return new LRUCache<Blob>({
    max: maxItems,
    // Blob 本身不需要特殊清理，但如果有关联的 URL，需要在外部处理
    sizeOf: (blob) => blob.size,
    maxSize: 500 * 1024 * 1024, // 500MB
  });
}

/**
 * 创建 URL 缓存 (自动 revoke)
 */
export function createURLCache(maxItems: number = 100): LRUCache<string> {
  return new LRUCache<string>({
    max: maxItems,
    dispose: (url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    },
  });
}
