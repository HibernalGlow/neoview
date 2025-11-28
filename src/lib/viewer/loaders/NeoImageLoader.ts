/**
 * NeoImageLoader - 新一代图片加载器
 * 
 * 基于 bookStore2 虚拟页面系统的图片加载器
 * 
 * 职责：
 * - 加载当前虚拟页面的图片
 * - 预加载后续页面
 * - 管理 Blob 缓存
 * - 与 bookStore2 同步尺寸信息
 * 
 * 与旧 ImageLoader 的区别：
 * - 使用虚拟页面索引而非物理页面索引
 * - 自动处理分割页面的裁剪
 * - 与 bookStore2 深度集成
 */

import { bookStore2 } from '$lib/stores/bookStore2';
import { get } from 'svelte/store';
import type { VirtualPage } from '$lib/core/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface BlobCacheEntry {
  blob: Blob;
  url: string;
  lastAccessed: number;
}

export interface ImageLoadResult {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  virtualPage: VirtualPage;
}

export interface NeoImageLoaderOptions {
  /** 缓存大小限制 (MB) */
  cacheSizeLimit?: number;
  /** 预加载页数 */
  preloadCount?: number;
  /** 图片加载回调 */
  onImageLoaded?: (result: ImageLoadResult) => void;
  /** 加载状态变化回调 */
  onLoadingStateChange?: (loading: boolean) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
}

// ============================================================================
// NeoImageLoader 类
// ============================================================================

export class NeoImageLoader {
  private options: Required<NeoImageLoaderOptions>;
  private blobCache = new Map<number, BlobCacheEntry>(); // 物理页面索引 -> Blob
  private pendingLoads = new Map<number, Promise<BlobCacheEntry>>();
  private loading = false;
  
  constructor(options: NeoImageLoaderOptions = {}) {
    this.options = {
      cacheSizeLimit: options.cacheSizeLimit ?? 500, // 500MB
      preloadCount: options.preloadCount ?? 3,
      onImageLoaded: options.onImageLoaded ?? (() => {}),
      onLoadingStateChange: options.onLoadingStateChange ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
  }
  
  // ============================================================================
  // 公共方法
  // ============================================================================
  
  /**
   * 加载当前帧的图片
   */
  async loadCurrentFrame(): Promise<ImageLoadResult | null> {
    const state = get(bookStore2);
    if (!state.isOpen || !state.currentFrame) {
      return null;
    }
    
    this.setLoading(true);
    
    try {
      const frame = state.currentFrame;
      const element = frame.elements[0];
      if (!element) {
        return null;
      }
      
      const virtualPage = element.virtualPage;
      const physicalIndex = virtualPage.physicalPage.index;
      
      // 获取或加载 Blob
      const entry = await this.ensureBlob(physicalIndex);
      
      // 获取图片尺寸
      const dimensions = await this.getImageDimensions(entry.blob);
      
      // 更新物理页面尺寸到 bookStore2
      bookStore2.updatePhysicalPageSize(physicalIndex, dimensions.width, dimensions.height);
      
      const result: ImageLoadResult = {
        url: entry.url,
        blob: entry.blob,
        width: dimensions.width,
        height: dimensions.height,
        virtualPage,
      };
      
      this.options.onImageLoaded(result);
      
      // 触发预加载
      this.preloadNextPages();
      
      return result;
    } catch (error) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      this.setLoading(false);
    }
  }
  
  /**
   * 获取虚拟页面的 Object URL
   */
  async getVirtualPageUrl(virtualIndex: number): Promise<string | null> {
    const virtualPage = bookStore2.getVirtualPage(virtualIndex);
    if (!virtualPage) {
      return null;
    }
    
    const entry = await this.ensureBlob(virtualPage.physicalPage.index);
    return entry.url;
  }
  
  /**
   * 获取物理页面的 Object URL
   */
  async getPhysicalPageUrl(physicalIndex: number): Promise<string | null> {
    const entry = await this.ensureBlob(physicalIndex);
    return entry.url;
  }
  
  /**
   * 清空缓存
   */
  clearCache(): void {
    for (const entry of this.blobCache.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.blobCache.clear();
    this.pendingLoads.clear();
  }
  
  /**
   * 销毁
   */
  destroy(): void {
    this.clearCache();
  }
  
  // ============================================================================
  // 私有方法
  // ============================================================================
  
  private async ensureBlob(physicalIndex: number): Promise<BlobCacheEntry> {
    // 检查缓存
    const cached = this.blobCache.get(physicalIndex);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached;
    }
    
    // 检查是否正在加载
    const pending = this.pendingLoads.get(physicalIndex);
    if (pending) {
      return pending;
    }
    
    // 创建加载任务
    const loadPromise = this.loadBlob(physicalIndex);
    this.pendingLoads.set(physicalIndex, loadPromise);
    
    try {
      const entry = await loadPromise;
      this.blobCache.set(physicalIndex, entry);
      return entry;
    } finally {
      this.pendingLoads.delete(physicalIndex);
    }
  }
  
  private async loadBlob(physicalIndex: number): Promise<BlobCacheEntry> {
    const physicalPage = bookStore2.getPhysicalPage(physicalIndex);
    if (!physicalPage) {
      throw new Error(`Physical page ${physicalIndex} not found`);
    }
    
    // 使用 bookStore2 的 requestImage 方法
    const blob = await bookStore2.requestImage(physicalIndex);
    if (!blob) {
      throw new Error(`Failed to load image for page ${physicalIndex}`);
    }
    
    const url = URL.createObjectURL(blob);
    
    return {
      blob,
      url,
      lastAccessed: Date.now(),
    };
  }
  
  private async getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for dimensions'));
      };
      
      img.src = url;
    });
  }
  
  private preloadNextPages(): void {
    const state = get(bookStore2);
    if (!state.isOpen) return;
    
    const currentIndex = state.currentIndex;
    const totalPages = state.virtualPageCount;
    const preloadCount = this.options.preloadCount;
    
    // 预加载后续页面
    for (let i = 1; i <= preloadCount; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex >= totalPages) break;
      
      const virtualPage = bookStore2.getVirtualPage(nextIndex);
      if (virtualPage && !this.blobCache.has(virtualPage.physicalPage.index)) {
        const physicalIndex = virtualPage.physicalPage.index;
        // 异步预加载并获取尺寸
        this.preloadWithSize(physicalIndex).catch(() => {
          // 预加载失败不报错
        });
      }
    }
    
    // 清理过期缓存
    this.enforceCacheLimit();
  }
  
  /**
   * 预加载图片并获取尺寸，更新到 bookStore2
   * 这样翻页前就知道是否需要分割
   */
  private async preloadWithSize(physicalIndex: number): Promise<void> {
    const entry = await this.ensureBlob(physicalIndex);
    
    // 获取尺寸并更新
    const dimensions = await this.getImageDimensions(entry.blob);
    bookStore2.updatePhysicalPageSize(physicalIndex, dimensions.width, dimensions.height);
  }
  
  private enforceCacheLimit(): void {
    const limitBytes = this.options.cacheSizeLimit * 1024 * 1024;
    let totalSize = 0;
    
    const entries = Array.from(this.blobCache.entries());
    for (const [, entry] of entries) {
      totalSize += entry.blob.size;
    }
    
    if (totalSize <= limitBytes) return;
    
    // 按访问时间排序，移除最旧的
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    for (const [index, entry] of entries) {
      if (totalSize <= limitBytes) break;
      
      URL.revokeObjectURL(entry.url);
      this.blobCache.delete(index);
      totalSize -= entry.blob.size;
    }
  }
  
  private setLoading(loading: boolean): void {
    if (this.loading !== loading) {
      this.loading = loading;
      this.options.onLoadingStateChange(loading);
    }
  }
}

// ============================================================================
// 单例导出
// ============================================================================

let instance: NeoImageLoader | null = null;

export function getNeoImageLoader(options?: NeoImageLoaderOptions): NeoImageLoader {
  if (!instance) {
    instance = new NeoImageLoader(options);
  }
  return instance;
}

export function resetNeoImageLoader(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
