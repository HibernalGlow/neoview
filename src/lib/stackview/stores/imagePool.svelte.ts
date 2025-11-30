/**
 * ImagePool - 统一图片缓存池
 * 
 * 所有模式（单页、双页、全景）共享同一个图片池
 * 避免模式切换时重复加载
 */

import { SvelteMap } from 'svelte/reactivity';
import { bookStore } from '$lib/stores/book.svelte';
import { readPageBlob } from '../utils/imageReader';

// ============================================================================
// 类型定义
// ============================================================================

export interface PooledImage {
  url: string;
  blob: Blob;
  pageIndex: number;
  width?: number;
  height?: number;
  loadedAt: number;
}

// ============================================================================
// ImagePool 类
// ============================================================================

class ImagePool {
  /** 图片缓存 */
  private cache = new SvelteMap<string, PooledImage>();
  
  /** 当前书本路径 */
  private currentBookPath: string | null = null;
  
  /** 最大缓存数量 */
  private maxSize = 20;
  
  /** 正在加载的页面 */
  private loadingPages = new Set<string>();
  
  // ============================================================================
  // 缓存键生成
  // ============================================================================
  
  private getKey(bookPath: string, pageIndex: number): string {
    return `${bookPath}:${pageIndex}`;
  }
  
  // ============================================================================
  // 书本管理
  // ============================================================================
  
  /**
   * 设置当前书本（切换书本时调用）
   */
  setCurrentBook(bookPath: string) {
    if (this.currentBookPath !== bookPath) {
      // 书本切换，清除旧缓存
      this.clear();
      this.currentBookPath = bookPath;
    }
  }
  
  // ============================================================================
  // 图片获取
  // ============================================================================
  
  /**
   * 获取图片（从缓存或加载）
   */
  async get(pageIndex: number): Promise<PooledImage | null> {
    const book = bookStore.currentBook;
    if (!book) return null;
    
    const key = this.getKey(book.path, pageIndex);
    
    // 检查缓存
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    
    // 避免重复加载
    if (this.loadingPages.has(key)) {
      // 等待加载完成
      return this.waitForLoad(key);
    }
    
    // 加载新图片
    return this.load(pageIndex);
  }
  
  /**
   * 同步获取（仅从缓存，不触发加载）
   */
  getSync(pageIndex: number): PooledImage | null {
    const book = bookStore.currentBook;
    if (!book) return null;
    
    const key = this.getKey(book.path, pageIndex);
    return this.cache.get(key) ?? null;
  }
  
  /**
   * 检查是否已缓存
   */
  has(pageIndex: number): boolean {
    const book = bookStore.currentBook;
    if (!book) return false;
    
    const key = this.getKey(book.path, pageIndex);
    return this.cache.has(key);
  }
  
  // ============================================================================
  // 图片加载
  // ============================================================================
  
  /**
   * 加载单张图片
   */
  async load(pageIndex: number): Promise<PooledImage | null> {
    const book = bookStore.currentBook;
    if (!book) return null;
    
    const key = this.getKey(book.path, pageIndex);
    
    // 标记为正在加载
    this.loadingPages.add(key);
    
    try {
      const { blob } = await readPageBlob(pageIndex);
      const url = URL.createObjectURL(blob);
      
      // 获取图片尺寸
      const dimensions = await this.getImageDimensions(url);
      
      const image: PooledImage = {
        url,
        blob,
        pageIndex,
        width: dimensions?.width,
        height: dimensions?.height,
        loadedAt: Date.now(),
      };
      
      // 存入缓存
      this.cache.set(key, image);
      this.trimCache();
      
      return image;
    } catch {
      return null;
    } finally {
      this.loadingPages.delete(key);
    }
  }
  
  /**
   * 获取图片尺寸
   */
  private getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
  
  /**
   * 预加载多张图片
   */
  async preload(pageIndices: number[]): Promise<void> {
    const promises = pageIndices
      .filter(idx => !this.has(idx))
      .map(idx => this.load(idx));
    
    await Promise.all(promises);
  }
  
  /**
   * 预加载范围
   */
  async preloadRange(centerIndex: number, range: number = 2): Promise<void> {
    const book = bookStore.currentBook;
    if (!book) return;
    
    const totalPages = book.pages.length;
    const indices: number[] = [];
    
    // 中心页
    indices.push(centerIndex);
    
    // 前后页
    for (let i = 1; i <= range; i++) {
      if (centerIndex - i >= 0) indices.push(centerIndex - i);
      if (centerIndex + i < totalPages) indices.push(centerIndex + i);
    }
    
    await this.preload(indices);
  }
  
  // ============================================================================
  // 等待加载
  // ============================================================================
  
  private async waitForLoad(key: string, timeout: number = 5000): Promise<PooledImage | null> {
    const startTime = Date.now();
    
    while (this.loadingPages.has(key)) {
      if (Date.now() - startTime > timeout) {
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return this.cache.get(key) ?? null;
  }
  
  // ============================================================================
  // 缓存管理
  // ============================================================================
  
  /**
   * 修剪缓存（LRU）
   */
  private trimCache() {
    if (this.cache.size <= this.maxSize) return;
    
    // 按加载时间排序，删除最旧的
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].loadedAt - b[1].loadedAt);
    
    const toRemove = entries.slice(0, this.cache.size - this.maxSize);
    
    for (const [key, image] of toRemove) {
      URL.revokeObjectURL(image.url);
      this.cache.delete(key);
    }
  }
  
  /**
   * 清除所有缓存
   */
  clear() {
    for (const image of this.cache.values()) {
      URL.revokeObjectURL(image.url);
    }
    this.cache.clear();
    this.loadingPages.clear();
  }
  
  /**
   * 获取缓存状态
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      loading: this.loadingPages.size,
    };
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const imagePool = new ImagePool();
