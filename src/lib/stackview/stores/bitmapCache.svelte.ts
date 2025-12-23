/**
 * BitmapCache - ImageBitmap 预解码缓存
 * 
 * 在 Worker 中预解码图片为 ImageBitmap，翻页时直接渲染，无需重复解码。
 * 
 * 【性能优势】
 * - ImageBitmap 是已解码的像素数据，可直接绘制到 Canvas
 * - 解码在 Worker 中进行，不阻塞主线程
 * - 缓存已解码的 bitmap，翻页时零延迟
 * 
 * 【内存管理】
 * - LRU 淘汰策略
 * - 自动释放 ImageBitmap（调用 .close()）
 * - 可配置最大缓存数量
 */

import { decodeImageInWorker, type DecodeResult } from '$lib/workers/imageDecoderManager';

// 缓存项
interface CacheItem {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  lastAccess: number;
}

// 默认最大缓存数量（ImageBitmap 占用显存，不宜过多）
const DEFAULT_MAX_SIZE = 10;

class BitmapCache {
  private cache = new Map<number, CacheItem>();
  private maxSize: number;
  private pendingDecodes = new Map<number, Promise<DecodeResult>>();
  
  constructor(maxSize = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }
  
  /**
   * 获取已缓存的 ImageBitmap
   */
  get(pageIndex: number): CacheItem | null {
    const item = this.cache.get(pageIndex);
    if (item) {
      // 更新访问时间（LRU）
      item.lastAccess = Date.now();
      return item;
    }
    return null;
  }
  
  /**
   * 检查是否已缓存
   */
  has(pageIndex: number): boolean {
    return this.cache.has(pageIndex);
  }
  
  /**
   * 预解码并缓存
   * @param pageIndex 页面索引
   * @param blob 图片 Blob
   * @returns 解码结果
   */
  async decode(pageIndex: number, blob: Blob): Promise<CacheItem> {
    // 已缓存，直接返回
    const cached = this.get(pageIndex);
    if (cached) {
      return cached;
    }
    
    // 正在解码，等待完成
    if (this.pendingDecodes.has(pageIndex)) {
      const result = await this.pendingDecodes.get(pageIndex)!;
      // 解码完成后可能已被缓存
      const item = this.get(pageIndex);
      if (item) return item;
      // 否则创建缓存项
      return this.addToCache(pageIndex, result);
    }
    
    // 开始解码
    const decodePromise = decodeImageInWorker(blob);
    this.pendingDecodes.set(pageIndex, decodePromise);
    
    try {
      const result = await decodePromise;
      return this.addToCache(pageIndex, result);
    } finally {
      this.pendingDecodes.delete(pageIndex);
    }
  }
  
  /**
   * 添加到缓存
   */
  private addToCache(pageIndex: number, result: DecodeResult): CacheItem {
    // 淘汰旧项
    this.evictIfNeeded();
    
    const item: CacheItem = {
      bitmap: result.bitmap,
      width: result.width,
      height: result.height,
      lastAccess: Date.now(),
    };
    
    this.cache.set(pageIndex, item);
    return item;
  }
  
  /**
   * LRU 淘汰
   */
  private evictIfNeeded(): void {
    if (this.cache.size < this.maxSize) return;
    
    // 找到最久未访问的项
    let oldestKey: number | null = null;
    let oldestTime = Infinity;
    
    for (const [key, item] of this.cache) {
      if (item.lastAccess < oldestTime) {
        oldestTime = item.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey !== null) {
      const item = this.cache.get(oldestKey);
      if (item) {
        // 释放 ImageBitmap
        item.bitmap.close();
      }
      this.cache.delete(oldestKey);
    }
  }
  
  /**
   * 预解码多个页面（不阻塞）
   */
  async preload(pages: Array<{ pageIndex: number; blob: Blob }>): Promise<void> {
    const promises = pages
      .filter(p => !this.has(p.pageIndex))
      .map(p => this.decode(p.pageIndex, p.blob).catch(() => null));
    
    await Promise.allSettled(promises);
  }
  
  /**
   * 清除指定页面的缓存
   */
  remove(pageIndex: number): void {
    const item = this.cache.get(pageIndex);
    if (item) {
      item.bitmap.close();
      this.cache.delete(pageIndex);
    }
  }
  
  /**
   * 清除所有缓存
   */
  clear(): void {
    for (const item of this.cache.values()) {
      item.bitmap.close();
    }
    this.cache.clear();
    this.pendingDecodes.clear();
  }
  
  /**
   * 获取缓存状态
   */
  getStats(): { size: number; maxSize: number; pages: number[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      pages: Array.from(this.cache.keys()),
    };
  }
}

// 单例导出
export const bitmapCache = new BitmapCache();
