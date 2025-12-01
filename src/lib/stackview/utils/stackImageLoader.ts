/**
 * StackView 专用图片加载器
 * 使用 ImageLoaderCore 的独立实例，不干扰 ImageViewer
 */

import { ImageLoaderCore } from '$lib/components/viewer/flow/imageLoaderCore';
import { getImageDimensions } from '$lib/components/viewer/flow/imageReader';
import { bookStore } from '$lib/stores/book.svelte';

// ============================================================================
// 类型定义
// ============================================================================

export interface LoadResult {
  url: string;
  blob: Blob;
  dimensions: { width: number; height: number } | null;
  fromCache: boolean;
}

// ============================================================================
// StackImageLoader 类
// ============================================================================

export class StackImageLoader {
  private core: ImageLoaderCore;
  private currentBookPath: string | null = null;
  // 尺寸缓存
  private dimensionsCache = new Map<number, { width: number; height: number }>();

  constructor() {
    // 创建独立的 ImageLoaderCore 实例
    this.core = new ImageLoaderCore();
  }

  /**
   * 设置当前书本（切换时重置）
   */
  setCurrentBook(bookPath: string): void {
    if (this.currentBookPath !== bookPath) {
      this.core.reset();
      this.dimensionsCache.clear();
      this.currentBookPath = bookPath;
    }
  }

  /**
   * 加载页面
   */
  async loadPage(pageIndex: number, priority = 0): Promise<LoadResult> {
    const book = bookStore.currentBook;
    if (!book || pageIndex < 0 || pageIndex >= book.pages.length) {
      throw new Error(`Invalid page index: ${pageIndex}`);
    }

    const result = await this.core.loadPage(pageIndex, priority);
    
    // 优先使用缓存的尺寸
    let dimensions = this.dimensionsCache.get(pageIndex) ?? result.dimensions;
    
    // 如果没有尺寸，从 Blob 获取
    if (!dimensions && result.blob) {
      dimensions = await getImageDimensions(result.blob);
    }
    
    // 缓存尺寸
    if (dimensions) {
      this.dimensionsCache.set(pageIndex, dimensions);
    }
    
    return {
      url: result.url,
      blob: result.blob,
      dimensions,
      fromCache: result.fromCache,
    };
  }

  /**
   * 同步获取缓存
   */
  getCachedUrl(pageIndex: number): string | undefined {
    return this.core.getCachedUrl(pageIndex);
  }

  getCachedBlob(pageIndex: number): Blob | undefined {
    return this.core.getCachedBlob(pageIndex);
  }

  getCachedDimensions(pageIndex: number): { width: number; height: number } | undefined {
    return this.dimensionsCache.get(pageIndex);
  }

  hasCache(pageIndex: number): boolean {
    return this.core.hasCache(pageIndex);
  }

  /**
   * 预加载范围
   */
  async preloadRange(centerIndex: number, range: number): Promise<void> {
    await this.core.smartPreload({
      preloadSize: range,
      isDoublePage: false,
      forwardRatio: 0.7,
    });
  }

  /**
   * 清理
   */
  clear(): void {
    this.core.clearCache();
    this.dimensionsCache.clear();
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const stackImageLoader = new StackImageLoader();
