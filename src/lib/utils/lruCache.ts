/**
 * LRU Cache - 最近最少使用缓存
 * 用于 MetadataService 缓存文件元数据
 */

import { LRUCache as BaseLRUCache } from 'lru-cache';

export class LRUCache<K, V> {
  private cache: BaseLRUCache<K, V>;
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.cache = new BaseLRUCache<K, V>({
      max: maxSize,
    });
  }

  /**
   * 获取缓存值，如果存在则移到最后（最近使用）
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.hits++;
      return value;
    }
    this.misses++;
    return undefined;
  }

  /**
   * 设置缓存值，如果超过最大容量则驱逐最旧的条目
   */
  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  /**
   * 检查是否存在缓存
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 删除缓存条目
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * 获取所有键
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 获取所有值
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * 获取所有条目
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}
