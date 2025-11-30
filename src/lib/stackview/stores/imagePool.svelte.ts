/**
 * ImagePool - 直接使用 PreloadManager 的 ImageLoader
 * 
 * 简化版：完全依赖 ImageLoader，不维护独立缓存
 */

import { bookStore } from '$lib/stores/book.svelte';
import { subscribeSharedPreloadManager } from '$lib/components/viewer/flow/sharedPreloadManager';
import type { PreloadManager } from '$lib/components/viewer/flow/preloadManager.svelte';

// ============================================================================
// 类型定义
// ============================================================================

export interface PooledImage {
  url: string;
  blob?: Blob;
  pageIndex: number;
  width?: number;
  height?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// ImagePool 类
// ============================================================================

class ImagePool {
  private preloadManager: PreloadManager | null = null;
  private currentBookPath: string | null = null;
  
  constructor() {
    subscribeSharedPreloadManager((manager) => {
      this.preloadManager = manager;
    });
  }
  
  /**
   * 设置当前书本
   */
  setCurrentBook(bookPath: string) {
    this.currentBookPath = bookPath;
  }
  
  /**
   * 获取 ImageLoader 的 core（验证有效性）
   */
  private getCore() {
    if (!this.preloadManager) return null;
    const imageLoader = (this.preloadManager as any).imageLoader;
    const core = imageLoader?.core;
    // 检查 core 是否有效（未被 invalidate）
    if (core && typeof core.isValid === 'function' && !core.isValid()) {
      console.log('[ImagePool] Core is invalidated, returning null');
      return null;
    }
    return core ?? null;
  }
  
  /**
   * 异步获取图片
   */
  async get(pageIndex: number): Promise<PooledImage | null> {
    const book = bookStore.currentBook;
    if (!book || pageIndex < 0 || pageIndex >= book.pages.length) {
      return null;
    }
    
    // 尝试获取 core，如果不可用则等待
    let core = this.getCore();
    if (!core) {
      // 等待 core 可用（最多 2 秒）
      for (let i = 0; i < 20 && !core; i++) {
        await new Promise(r => setTimeout(r, 100));
        core = this.getCore();
      }
      if (!core) {
        console.warn('[ImagePool] Core not available after waiting');
        return null;
      }
    }
    
    try {
      const result = await core.loadPage(pageIndex);
      if (result?.url) {
        return {
          url: result.url,
          blob: result.blob,
          pageIndex,
          width: result.dimensions?.width,
          height: result.dimensions?.height,
        };
      }
    } catch {
      // 忽略错误
    }
    
    return null;
  }
  
  /**
   * 同步获取（从缓存）
   * 注意：不使用缓存，因为可能是旧书本的数据
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSync(pageIndex: number): PooledImage | null {
    // 暂时禁用缓存获取，强制从 loader 加载
    // 避免显示旧书本的图片
    return null;
  }
  
  /**
   * 检查是否已缓存
   */
  has(pageIndex: number): boolean {
    const core = this.getCore();
    return !!core?.getCachedUrl?.(pageIndex);
  }
  
  /**
   * 预加载（委托给 core）
   */
  async preload(pageIndices: number[]): Promise<void> {
    const core = this.getCore();
    if (!core) return;
    
    const toLoad = pageIndices.filter(idx => !this.has(idx));
    await Promise.all(toLoad.slice(0, 4).map(idx => core.loadPage(idx).catch(() => null)));
  }
  
  /**
   * 预加载范围
   */
  preloadRange(centerIndex: number, range = 5): void {
    const book = bookStore.currentBook;
    if (!book) return;
    
    const total = book.pages.length;
    const indices: number[] = [];
    
    for (let i = 0; i <= range; i++) {
      if (centerIndex + i < total) indices.push(centerIndex + i);
      if (i > 0 && centerIndex - i >= 0) indices.push(centerIndex - i);
    }
    
    this.preload(indices);
  }
  
  /**
   * 清除（无操作，缓存由 core 管理）
   */
  clear() {
    // ImageLoaderCore 管理自己的缓存
  }
  
  /**
   * 获取状态
   */
  getStats() {
    const core = this.getCore();
    return core?.getCacheStats?.() ?? { size: 0 };
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const imagePool = new ImagePool();
