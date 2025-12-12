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
  // 【性能优化】预计算的缩放比例缓存：(pageIndex, viewportKey) -> scale
  // viewportKey 格式：`${width}x${height}x${zoomMode}`
  private precomputedScaleCache = new Map<string, number>();
  // 当前视口尺寸（用于预计算）
  private lastViewportSize: { width: number; height: number } | null = null;

  // 是否已注册尺寸回调
  private dimensionsCallbackRegistered = false;

  /**
   * 获取共享的 ImageLoaderCore 实例
   * 每次调用都获取当前活跃的实例，确保切书后使用正确的实例
   * 【性能优化】注册尺寸回调，确保预加载时尺寸被缓存
   */
  private get core(): ImageLoaderCore {
    const core = getImageLoaderCore();
    
    // 注册尺寸回调（只注册一次）
    if (!this.dimensionsCallbackRegistered) {
      core.setOnDimensionsReady((pageIndex, dimensions) => {
        if (dimensions) {
          this.dimensionsCache.set(pageIndex, dimensions);
        }
      });
      this.dimensionsCallbackRegistered = true;
    }
    
    return core;
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
      this.precomputedScaleCache.clear();
      this.currentBookPath = bookPath;
      // 切书后需要重新注册回调（因为 core 实例可能已切换）
      this.dimensionsCallbackRegistered = false;
    }
  }

  /**
   * 【性能优化】设置当前视口尺寸（用于预计算缩放）
   */
  setViewportSize(width: number, height: number): void {
    if (this.lastViewportSize?.width !== width || this.lastViewportSize?.height !== height) {
      this.lastViewportSize = { width, height };
      // 视口变化时清空缩放缓存（需要重新计算）
      this.precomputedScaleCache.clear();
    }
  }

  /**
   * 【性能优化】预计算并缓存缩放比例
   * @param pageIndex 页面索引
   * @param zoomMode 缩放模式
   * @returns 缩放比例，如果无法计算返回 null
   */
  precomputeScale(pageIndex: number, zoomMode: string): number | null {
    const dims = this.dimensionsCache.get(pageIndex);
    const vp = this.lastViewportSize;
    if (!dims || !vp || !vp.width || !vp.height) return null;

    const cacheKey = `${pageIndex}:${vp.width}x${vp.height}:${zoomMode}`;
    
    // 已缓存则直接返回
    if (this.precomputedScaleCache.has(cacheKey)) {
      return this.precomputedScaleCache.get(cacheKey)!;
    }

    // 计算缩放比例
    const iw = dims.width;
    const ih = dims.height;
    const vw = vp.width;
    const vh = vp.height;
    const ratioW = vw / iw;
    const ratioH = vh / ih;

    let scale: number;
    switch (zoomMode) {
      case 'original':
        scale = 1;
        break;
      case 'fit':
      case 'fitLeftAlign':
      case 'fitRightAlign':
        scale = Math.min(ratioW, ratioH);
        break;
      case 'fill':
        scale = Math.max(ratioW, ratioH);
        break;
      case 'fitWidth':
        scale = ratioW;
        break;
      case 'fitHeight':
        scale = ratioH;
        break;
      default:
        scale = Math.min(ratioW, ratioH);
    }

    // 缓存
    this.precomputedScaleCache.set(cacheKey, scale);
    return scale;
  }

  /**
   * 【性能优化】获取缓存的缩放比例
   */
  getCachedScale(pageIndex: number, zoomMode: string): number | null {
    const vp = this.lastViewportSize;
    if (!vp) return null;
    const cacheKey = `${pageIndex}:${vp.width}x${vp.height}:${zoomMode}`;
    return this.precomputedScaleCache.get(cacheKey) ?? null;
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
      // 【关键修复】同步尺寸到 bookStore.pages
      // 这样 getPageStep 可以正确判断页面是否为横向
      bookStore.updatePageDimensions(pageIndex, dimensions);
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
   * 【性能优化】使用 loadPage 预加载，确保尺寸被缓存
   */
  async preloadRange(centerIndex: number, range: number): Promise<void> {
    const book = bookStore.currentBook;
    if (!book) return;

    const totalPages = book.pages.length;
    const forwardCount = Math.ceil(range * 0.7);
    const backwardCount = range - forwardCount;

    // 计算需要预加载的页面索引
    const pagesToPreload: number[] = [];
    
    // 前向预加载
    for (let i = 1; i <= forwardCount; i++) {
      const idx = centerIndex + i;
      if (idx < totalPages && !this.hasCache(idx)) {
        pagesToPreload.push(idx);
      }
    }
    
    // 后向预加载
    for (let i = 1; i <= backwardCount; i++) {
      const idx = centerIndex - i;
      if (idx >= 0 && !this.hasCache(idx)) {
        pagesToPreload.push(idx);
      }
    }

    // 并行预加载（使用 loadPage 确保尺寸被缓存）
    const loadPromises = pagesToPreload.map(idx => 
      this.loadPage(idx, 5).catch(() => null)
    );
    
    // 不阻塞，后台完成
    Promise.allSettled(loadPromises).then(() => {
      console.log(`✅ 预加载完成: ${pagesToPreload.length} 页（含尺寸缓存）`);
    });
  }

  /**
   * 清理
   */
  clear(): void {
    this.core.clearCache();
    this.dimensionsCache.clear();
    this.backgroundColorCache.clear();
    this.precomputedScaleCache.clear();
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const stackImageLoader = new StackImageLoader();
