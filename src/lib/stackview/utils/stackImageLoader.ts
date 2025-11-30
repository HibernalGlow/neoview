/**
 * StackView 专用图片加载器
 * 使用 ImageLoaderCore 的独立实例，不干扰 ImageViewer
 */

import { ImageLoaderCore } from '$lib/components/viewer/flow/imageLoaderCore';
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
    return {
      url: result.url,
      blob: result.blob,
      dimensions: result.dimensions,
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
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const stackImageLoader = new StackImageLoader();
