/**
 * StackView 专用图片加载器
 * 共享 ImageLoaderCore 实例，复用主加载器的缓存
 */

import { getImageLoaderCore, type ImageLoaderCore } from '$lib/components/viewer/flow/imageLoaderCore';
import { getImageDimensions } from '$lib/components/viewer/flow/imageReader';
import { bookStore } from '$lib/stores/book.svelte';
import { computeAutoBackgroundColor } from '$lib/utils/autoBackground';

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
  private currentBookPath: string | null = null;
  // 尺寸缓存
  private dimensionsCache = new Map<number, { width: number; height: number }>();
  // 背景色缓存
  private backgroundColorCache = new Map<number, string>();
  // 超分图 URL 缓存：pageIndex -> upscaledUrl
  private upscaledUrlCache = new Map<number, string>();
  // 是否使用超分图
  private useUpscaledMap = new Map<number, boolean>();

  /**
   * 获取共享的 ImageLoaderCore 实例
   * 每次调用都获取当前活跃的实例，确保切书后使用正确的实例
   */
  private get core(): ImageLoaderCore {
    return getImageLoaderCore();
  }

  /**
   * 设置当前书本（切换时重置本地缓存）
   * 注意：ImageLoaderCore 的重置由主加载器管理，这里只清理本地缓存
   */
  setCurrentBook(bookPath: string): void {
    if (this.currentBookPath !== bookPath) {
      // 只清理本地缓存，共享的 core 由主加载器管理
      this.dimensionsCache.clear();
      this.backgroundColorCache.clear();
      this.upscaledUrlCache.clear();
      this.useUpscaledMap.clear();
      this.currentBookPath = bookPath;
    }
  }

  // ========================================================================
  // 超分图管理（复用原有图片系统）
  // ========================================================================

  /**
   * 设置超分图 URL
   * 超分完成后调用，将超分图 URL 存入缓存
   */
  setUpscaledUrl(pageIndex: number, url: string): void {
    this.upscaledUrlCache.set(pageIndex, url);
    this.useUpscaledMap.set(pageIndex, true);
  }

  /**
   * 获取显示 URL（优先返回超分图）
   */
  getDisplayUrl(pageIndex: number): string | undefined {
    if (this.useUpscaledMap.get(pageIndex) && this.upscaledUrlCache.has(pageIndex)) {
      return this.upscaledUrlCache.get(pageIndex);
    }
    return this.core.getCachedUrl(pageIndex);
  }

  /**
   * 检查是否有超分图
   */
  hasUpscaled(pageIndex: number): boolean {
    return this.upscaledUrlCache.has(pageIndex) && (this.useUpscaledMap.get(pageIndex) ?? false);
  }

  /**
   * 获取超分图 URL
   */
  getUpscaledUrl(pageIndex: number): string | undefined {
    return this.upscaledUrlCache.get(pageIndex);
  }

  /**
   * 清除指定页面的超分图
   */
  clearUpscaled(pageIndex: number): void {
    this.upscaledUrlCache.delete(pageIndex);
    this.useUpscaledMap.delete(pageIndex);
  }

  /**
   * 清除所有超分图
   */
  clearAllUpscaled(): void {
    this.upscaledUrlCache.clear();
    this.useUpscaledMap.clear();
  }

  /**
   * 设置是否使用超分图
   */
  setUseUpscaled(pageIndex: number, use: boolean): void {
    this.useUpscaledMap.set(pageIndex, use);
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
    
    // 后台计算背景色（不阻塞返回）
    if (result.url && !this.backgroundColorCache.has(pageIndex)) {
      void this.computeAndCacheBackgroundColor(pageIndex, result.url);
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

  /**
   * 获取缓存的背景色
   */
  getCachedBackgroundColor(pageIndex: number): string | undefined {
    return this.backgroundColorCache.get(pageIndex);
  }

  /**
   * 计算并缓存背景色
   */
  private async computeAndCacheBackgroundColor(pageIndex: number, url: string): Promise<void> {
    try {
      const color = await computeAutoBackgroundColor(url);
      if (color) {
        this.backgroundColorCache.set(pageIndex, color);
      }
    } catch (e) {
      console.warn('计算背景色失败:', pageIndex, e);
    }
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
    this.backgroundColorCache.clear();
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const stackImageLoader = new StackImageLoader();
