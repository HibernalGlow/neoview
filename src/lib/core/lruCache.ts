/**
 * LRUCache - 最近最少使用缓存
 *
 * 用于管理图像和缩略图的内存缓存
 * 当缓存满时自动移除最久未使用的项
 */

import { LRUCache as BaseLRUCache } from 'lru-cache';

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

export class LRUCache<V> {
  private _options: LRUCacheOptions<V>;
  private _cache: BaseLRUCache<string, V & {}>;

  constructor(options: LRUCacheOptions<V>) {
    this._options = options;
    this._cache = new BaseLRUCache<string, V & {}>({
      max: options.max,
      maxSize: options.maxSize,
      sizeCalculation: (value, key) => options.sizeOf?.(value, key) ?? 1,
      dispose: (value, key) => {
        options.dispose?.(value, key);
      },
    });
  }

  // ============================================================================
  // 公共属性
  // ============================================================================

  get size(): number {
    return this._cache.size;
  }

  get totalSize(): number {
    return this._cache.calculatedSize;
  }

  get max(): number {
    return this._cache.max;
  }

  get maxSize(): number | undefined {
    return this._cache.maxSize || undefined;
  }

  // ============================================================================
  // 公共方法
  // ============================================================================

  /**
   * 获取缓存项
   */
  get(key: string): V | undefined {
    return this._cache.get(key) as V | undefined;
  }

  /**
   * 检查是否存在
   */
  has(key: string): boolean {
    return this._cache.has(key);
  }

  /**
   * 设置缓存项
   */
  set(key: string, value: V): this {
    this._cache.set(key, value as V & {});
    return this;
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    return this._cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this._cache.clear();
  }

  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this._cache.keys());
  }

  /**
   * 获取所有值
   */
  values(): V[] {
    return Array.from(this._cache.values()) as V[];
  }

  /**
   * 遍历
   */
  forEach(callback: (value: V, key: string) => void): void {
    this._cache.forEach((value, key) => callback(value as V, key));
  }

  /**
   * 查看最近使用的项 (不更新访问顺序)
   */
  peek(key: string): V | undefined {
    return this._cache.peek(key) as V | undefined;
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
    sizeOf: (blob) => blob.size,
    maxSize: 500 * 1024 * 1024,
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
