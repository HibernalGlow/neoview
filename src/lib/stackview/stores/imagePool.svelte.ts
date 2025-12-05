/**
 * ImagePool - StackView 专用图片缓存池
 * 
 * 使用独立的 StackImageLoader，不依赖 ImageViewer
 */

import { stackImageLoader } from '../utils/stackImageLoader';

// 响应式版本号，用于触发超分图更新后的重新渲染
let upscaleVersion = $state(0);

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

// ============================================================================
// ImagePool 类
// ============================================================================

class ImagePool {
  /**
   * 设置当前书本
   */
  setCurrentBook(bookPath: string) {
    stackImageLoader.setCurrentBook(bookPath);
  }
  
  /**
   * 异步获取图片
   */
  async get(pageIndex: number): Promise<PooledImage | null> {
    try {
      const result = await stackImageLoader.loadPage(pageIndex, 10);
      return {
        url: result.url,
        blob: result.blob,
        pageIndex,
        width: result.dimensions?.width,
        height: result.dimensions?.height,
      };
    } catch {
      return null;
    }
  }
  
  /**
   * 同步获取（从缓存）
   */
  getSync(pageIndex: number): PooledImage | null {
    const url = stackImageLoader.getCachedUrl(pageIndex);
    const blob = stackImageLoader.getCachedBlob(pageIndex);
    const dimensions = stackImageLoader.getCachedDimensions(pageIndex);
    if (url) {
      return { 
        url, 
        blob, 
        pageIndex,
        width: dimensions?.width,
        height: dimensions?.height,
      };
    }
    return null;
  }
  
  /**
   * 检查是否已缓存
   */
  has(pageIndex: number): boolean {
    return stackImageLoader.hasCache(pageIndex);
  }
  
  /**
   * 获取缓存的背景色
   */
  getBackgroundColor(pageIndex: number): string | undefined {
    return stackImageLoader.getCachedBackgroundColor(pageIndex);
  }
  
  /**
   * 预加载
   */
  async preload(pageIndices: number[]): Promise<void> {
    const toLoad = pageIndices.filter(idx => !this.has(idx));
    await Promise.all(toLoad.slice(0, 4).map(idx => 
      stackImageLoader.loadPage(idx, 5).catch(() => null)
    ));
  }
  
  /**
   * 预加载范围
   */
  preloadRange(centerIndex: number, range = 5): void {
    stackImageLoader.preloadRange(centerIndex, range);
  }
  
  /**
   * 清除
   */
  clear() {
    stackImageLoader.clear();
  }

  // ========================================================================
  // 超分图管理（复用原有图片系统）
  // ========================================================================

  /**
   * 设置超分图 URL（超分完成后调用）
   */
  setUpscaled(pageIndex: number, url: string): void {
    stackImageLoader.setUpscaledUrl(pageIndex, url);
    // 增加版本号触发重新渲染
    upscaleVersion++;
  }
  
  /**
   * 获取超分版本号（用于响应式依赖）
   */
  get version(): number {
    return upscaleVersion;
  }

  /**
   * 获取显示 URL（优先返回超分图）
   */
  getDisplayUrl(pageIndex: number): string | null {
    return stackImageLoader.getDisplayUrl(pageIndex) ?? null;
  }

  /**
   * 检查是否有超分图
   */
  hasUpscaled(pageIndex: number): boolean {
    return stackImageLoader.hasUpscaled(pageIndex);
  }

  /**
   * 获取超分图 URL
   */
  getUpscaledUrl(pageIndex: number): string | null {
    return stackImageLoader.getUpscaledUrl(pageIndex) ?? null;
  }

  /**
   * 清除指定页面的超分图
   */
  clearUpscaled(pageIndex: number): void {
    stackImageLoader.clearUpscaled(pageIndex);
  }

  /**
   * 清除所有超分图
   */
  clearAllUpscaled(): void {
    stackImageLoader.clearAllUpscaled();
  }

  /**
   * 设置是否使用超分图
   */
  setUseUpscaled(pageIndex: number, use: boolean): void {
    stackImageLoader.setUseUpscaled(pageIndex, use);
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const imagePool = new ImagePool();
