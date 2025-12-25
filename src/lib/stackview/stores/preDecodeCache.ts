/**
 * PreDecodeCache - 预解码缓存
 * 
 * 存储已解码的 HTMLImageElement，避免翻页时重复解码
 * 
 * 核心原理：
 * - 浏览器对同一个 URL 的图片有解码缓存
 * - 调用 img.decode() 后，浏览器会在后台完成解码
 * - 再次使用相同 URL 时，浏览器直接使用已解码的数据
 * 
 * 参考 OpenComic 的实现：
 * - rendered[index] = scale; // 标记已渲染
 * - await img.decode(); // 确保解码完成
 */

import { isAnimatedImage } from '$lib/utils/imageUtils';

// ============================================================================
// 类型定义
// ============================================================================

export interface PreDecodedEntry {
  /** 已解码的图片元素 */
  img: HTMLImageElement;
  /** Blob URL */
  url: string;
  /** 缓存时间戳（用于 LRU 淘汰） */
  timestamp: number;
  /** 图片尺寸 */
  width: number;
  height: number;
}

export interface PreDecodeCacheStats {
  /** 缓存大小 */
  size: number;
  /** 最大缓存数 */
  maxSize: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
}

// ============================================================================
// PreDecodeCache 类
// ============================================================================

export class PreDecodeCache {
  /** 缓存: pageIndex -> PreDecodedEntry */
  private cache = new Map<number, PreDecodedEntry>();
  
  /** 最大缓存数量 */
  private maxSize: number;
  
  /** 统计：命中次数 */
  private hits = 0;
  
  /** 统计：未命中次数 */
  private misses = 0;
  
  /** 当前书籍路径（切书时清空缓存） */
  private currentBookPath: string | null = null;
  
  /** 正在预解码的页面（避免重复预解码） */
  private pending = new Set<number>();
  
  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }
  
  /**
   * 设置当前书籍（切书时清空缓存）
   */
  setCurrentBook(bookPath: string): void {
    if (this.currentBookPath !== bookPath) {
      this.clear();
      this.currentBookPath = bookPath;
    }
  }
  
  /**
   * 获取预解码的图片
   * @param pageIndex 页面索引
   * @returns 已解码的图片元素，如果未缓存返回 null
   */
  get(pageIndex: number): PreDecodedEntry | null {
    const entry = this.cache.get(pageIndex);
    if (entry) {
      // 更新时间戳（LRU）
      entry.timestamp = Date.now();
      this.hits++;
      return entry;
    }
    this.misses++;
    return null;
  }
  
  /**
   * 获取预解码的 URL
   * @param pageIndex 页面索引
   * @returns Blob URL，如果未缓存返回 undefined
   */
  getUrl(pageIndex: number): string | undefined {
    const entry = this.cache.get(pageIndex);
    if (entry) {
      entry.timestamp = Date.now();
      this.hits++;
      return entry.url;
    }
    this.misses++;
    return undefined;
  }
  
  /**
   * 检查是否已预解码
   */
  has(pageIndex: number): boolean {
    return this.cache.has(pageIndex);
  }
  
  /**
   * 检查是否正在预解码
   */
  isPending(pageIndex: number): boolean {
    return this.pending.has(pageIndex);
  }
  
  /**
   * 预解码并缓存
   * 
   * @param pageIndex 页面索引
   * @param url Blob URL
   * @param skipAnimated 是否跳过动图（默认 true）
   * @returns Promise<PreDecodedEntry | null>
   */
  async preDecodeAndCache(
    pageIndex: number, 
    url: string,
    skipAnimated = true
  ): Promise<PreDecodedEntry | null> {
    // 已缓存，直接返回
    if (this.cache.has(pageIndex)) {
      return this.cache.get(pageIndex)!;
    }
    
    // 正在预解码，等待完成
    if (this.pending.has(pageIndex)) {
      // 等待一小段时间后重试
      await new Promise(resolve => setTimeout(resolve, 50));
      return this.cache.get(pageIndex) ?? null;
    }
    
    // 标记为正在预解码
    this.pending.add(pageIndex);
    
    try {
      // 检查是否为动图（动图不预解码，保持动画）
      if (skipAnimated) {
        const isAnimated = await isAnimatedImage(url);
        if (isAnimated) {
          console.log(`⏭️ 跳过动图预解码: 页码 ${pageIndex + 1}`);
          return null;
        }
      }
      
      // 创建图片元素
      const img = new Image();
      img.src = url;
      
      // 等待解码完成
      const startTime = performance.now();
      await img.decode();
      const decodeTime = performance.now() - startTime;
      
      // 创建缓存条目
      const entry: PreDecodedEntry = {
        img,
        url,
        timestamp: Date.now(),
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      
      // 检查缓存是否已满，需要淘汰
      if (this.cache.size >= this.maxSize) {
        this.evictLRU();
      }
      
      // 存入缓存
      this.cache.set(pageIndex, entry);
      
      console.log(`✅ 预解码完成: 页码 ${pageIndex + 1}, 耗时 ${decodeTime.toFixed(1)}ms, 尺寸 ${entry.width}x${entry.height}`);
      
      return entry;
    } catch (error) {
      console.warn(`⚠️ 预解码失败: 页码 ${pageIndex + 1}`, error);
      return null;
    } finally {
      this.pending.delete(pageIndex);
    }
  }
  
  /**
   * 淘汰最久未使用的条目（LRU）
   */
  private evictLRU(): void {
    let oldestKey: number | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey !== null) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        // 释放图片引用
        entry.img.src = '';
      }
      this.cache.delete(oldestKey);
      console.log(`🗑️ 淘汰预解码缓存: 页码 ${oldestKey + 1}`);
    }
  }
  
  /**
   * 清除所有缓存
   */
  clear(): void {
    // 释放所有图片引用
    for (const entry of this.cache.values()) {
      entry.img.src = '';
    }
    this.cache.clear();
    this.pending.clear();
    this.hits = 0;
    this.misses = 0;
    console.log('🧹 预解码缓存已清空');
  }
  
  /**
   * 获取缓存统计
   */
  getStats(): PreDecodeCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
  
  /**
   * 设置最大缓存数量
   */
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    // 如果当前缓存超出新限制，淘汰多余的
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const preDecodeCache = new PreDecodeCache();
