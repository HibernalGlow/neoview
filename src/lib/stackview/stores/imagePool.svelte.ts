/**
 * ImagePool - StackView 专用图片缓存池
 * 
 * 使用独立的 StackImageLoader，不依赖 ImageViewer
 */

import { stackImageLoader } from '../utils/stackImageLoader';

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
    if (url) {
      return { url, blob, pageIndex };
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
}

// ============================================================================
// 单例导出
// ============================================================================

export const imagePool = new ImagePool();
