/**
 * Book Store - 超分缓存模块
 */

import { SvelteMap } from 'svelte/reactivity';
import type { UpscaleCacheEntry, UpscaleStatus } from './types';

/**
 * 超分状态管理器
 */
export class UpscaleManager {
  // 每页超分状态映射
  private statusByPage = $state<SvelteMap<number, UpscaleStatus>>(new SvelteMap());

  // 超分缓存映射: bookPath -> (hash -> cacheEntry)
  private cacheMapByBook = $state<SvelteMap<string, SvelteMap<string, UpscaleCacheEntry>>>(
    new SvelteMap()
  );

  /**
   * 获取页面超分状态
   */
  getStatus(pageIndex: number): UpscaleStatus {
    return this.statusByPage.get(pageIndex) ?? 'none';
  }

  /**
   * 设置页面超分状态
   */
  setStatus(pageIndex: number, status: UpscaleStatus): void {
    this.statusByPage.set(pageIndex, status);
  }

  /**
   * 清除所有状态
   */
  clearStatus(): void {
    this.statusByPage.clear();
  }

  /**
   * 获取或创建书籍缓存
   */
  getOrCreateBookCache(bookPath: string): SvelteMap<string, UpscaleCacheEntry> {
    let cache = this.cacheMapByBook.get(bookPath);
    if (!cache) {
      cache = new SvelteMap();
      this.cacheMapByBook.set(bookPath, cache);
    }
    return cache;
  }

  /**
   * 记录超分缓存
   */
  recordCache(
    bookPath: string,
    hash: string,
    entry: UpscaleCacheEntry
  ): void {
    const cache = this.getOrCreateBookCache(bookPath);
    cache.set(hash, entry);
  }

  /**
   * 获取超分缓存
   */
  getCache(bookPath: string, hash: string): UpscaleCacheEntry | undefined {
    return this.cacheMapByBook.get(bookPath)?.get(hash);
  }

  /**
   * 检查是否有缓存
   */
  hasCache(bookPath: string, hash: string): boolean {
    return this.cacheMapByBook.get(bookPath)?.has(hash) ?? false;
  }

  /**
   * 清除书籍缓存
   */
  clearBookCache(bookPath: string): void {
    this.cacheMapByBook.delete(bookPath);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.cacheMapByBook.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { books: number; totalEntries: number } {
    let totalEntries = 0;
    for (const cache of this.cacheMapByBook.values()) {
      totalEntries += cache.size;
    }
    return {
      books: this.cacheMapByBook.size,
      totalEntries,
    };
  }
}
