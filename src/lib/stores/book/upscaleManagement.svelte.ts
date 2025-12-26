/**
 * Book Store - 超分状态管理模块
 * 负责超分状态跟踪和缓存管理
 */

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { UpscaleCacheEntry, UpscaleStatus } from './types';

/** 超分缓存查询参数 */
export interface UpscaleCacheQuery {
  hash: string;
  model: string;
  scale: number;
}

/** 超分缓存记录参数 */
export interface UpscaleCacheRecord {
  hash: string;
  model: string;
  scale: number;
  cachePath: string;
  originalPath: string;
  innerPath?: string;
}

/** 超分状态管理器 */
export class UpscaleStatusManager {
  // 每页超分状态映射: pageIndex -> status
  private statusByPage = $state<SvelteMap<number, UpscaleStatus>>(new SvelteMap());

  // 超分缓存映射: bookPath -> (hash -> cacheEntry)
  private cacheMapByBook = $state<SvelteMap<string, SvelteMap<string, UpscaleCacheEntry>>>(
    new SvelteMap()
  );

  // 当前书籍路径获取器
  private getCurrentBookPath: () => string | null;

  constructor(getCurrentBookPath: () => string | null) {
    this.getCurrentBookPath = getCurrentBookPath;
  }

  // ==================== 页面状态管理 ====================

  /** 获取指定页面的超分状态 */
  getPageStatus(pageIndex: number): UpscaleStatus {
    return this.statusByPage.get(pageIndex) ?? 'none';
  }

  /** 设置指定页面的超分状态 */
  setPageStatus(pageIndex: number, status: UpscaleStatus): void {
    const nextMap = new SvelteMap(this.statusByPage);
    nextMap.set(pageIndex, status);
    this.statusByPage = nextMap;
    console.log(`📄 页面 ${pageIndex + 1} 超分状态更新为:`, status);
  }

  /** 获取所有页面的超分状态 */
  getAllPageStatus(): Map<number, UpscaleStatus> {
    return new Map(this.statusByPage);
  }

  /** 重置所有页面的超分状态 */
  resetAllPageStatus(): void {
    this.statusByPage = new SvelteMap();
    console.log('🔄 已重置所有页面超分状态');
  }

  /** 获取预超分覆盖范围（最远已预超分的页面索引） */
  getFurthestPreUpscaledIndex(): number {
    let furthestIndex = -1;
    for (const [pageIndex, status] of this.statusByPage.entries()) {
      if (status === 'preupscaled' || status === 'done') {
        furthestIndex = Math.max(furthestIndex, pageIndex);
      }
    }
    return furthestIndex;
  }

  /** 获取已预超分的页面集合 */
  getPreUpscaledPages(): Set<number> {
    const pages = new SvelteSet<number>();
    for (const [pageIndex, status] of this.statusByPage.entries()) {
      if (status === 'preupscaled' || status === 'done') {
        pages.add(pageIndex);
      }
    }
    return pages;
  }

  // ==================== 缓存管理 ====================

  /** 获取当前书籍的缓存键 */
  private getCurrentBookCacheKey(): string {
    return this.getCurrentBookPath() ?? '__global__';
  }

  /** 获取或创建书籍缓存 */
  private getOrCreateBookCache(bookPath: string): SvelteMap<string, UpscaleCacheEntry> {
    if (!this.cacheMapByBook.has(bookPath)) {
      this.cacheMapByBook.set(bookPath, new SvelteMap());
    }
    return this.cacheMapByBook.get(bookPath)!;
  }


  /** 记录超分缓存关系 */
  recordCache(record: UpscaleCacheRecord): void {
    const bookPath = this.getCurrentBookPath() ?? record.originalPath ?? this.getCurrentBookCacheKey();
    const bookCache = this.getOrCreateBookCache(bookPath);
    bookCache.set(record.hash, {
      model: record.model,
      scale: record.scale,
      cachePath: record.cachePath,
      originalPath: record.originalPath,
      innerPath: record.innerPath,
      timestamp: Date.now()
    });
    console.log('💾 记录超分缓存:', record.hash, '->', record.cachePath, `(book: ${bookPath})`);
  }

  /** 检查是否有超分缓存 */
  getCache(query: UpscaleCacheQuery): UpscaleCacheEntry | null {
    const bookPath = this.getCurrentBookCacheKey();
    const bookCache = this.cacheMapByBook.get(bookPath);
    if (!bookCache) {
      return null;
    }
    const cache = bookCache.get(query.hash);
    if (cache && cache.model === query.model && cache.scale === query.scale) {
      return cache;
    }
    return null;
  }

  /** 获取所有超分缓存 */
  getAllCaches(): Array<[string, Map<string, UpscaleCacheEntry>]> {
    const allEntries: Array<[string, Map<string, UpscaleCacheEntry>]> = [];
    for (const [bookPath, cacheMap] of this.cacheMapByBook.entries()) {
      allEntries.push([bookPath, new Map(cacheMap)]);
    }
    return allEntries;
  }

  /** 清理过期缓存 */
  cleanupExpiredCaches(maxAge: number = 30 * 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [bookPath, cacheMap] of this.cacheMapByBook.entries()) {
      for (const [hash, cache] of cacheMap.entries()) {
        if (now - cache.timestamp > maxAge) {
          cacheMap.delete(hash);
          cleaned++;
        }
      }
      if (cacheMap.size === 0) {
        this.cacheMapByBook.delete(bookPath);
      }
    }

    console.log('🧹 清理过期缓存:', cleaned, '个');
    return cleaned;
  }

  /** 清除指定书籍的缓存 */
  clearBookCache(bookPath: string): void {
    this.cacheMapByBook.delete(bookPath);
  }

  /** 清除所有缓存 */
  clearAllCaches(): void {
    this.cacheMapByBook.clear();
  }

  /** 获取缓存统计 */
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

// ==================== 工具函数 ====================

/** 生成缓存键 */
export function generateCacheKey(hash: string, model: string, scale: number): string {
  return `${hash}_${model}_${scale}`;
}

/** 解析缓存键 */
export function parseCacheKey(key: string): { hash: string; model: string; scale: number } | null {
  const parts = key.split('_');
  if (parts.length < 3) return null;
  const scale = parseInt(parts[parts.length - 1], 10);
  const model = parts[parts.length - 2];
  const hash = parts.slice(0, -2).join('_');
  if (isNaN(scale)) return null;
  return { hash, model, scale };
}
