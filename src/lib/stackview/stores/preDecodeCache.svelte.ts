/**
 * PreDecodeCache - 预解码缓存（Svelte 5 响应式）
 * 
 * 存储已解码的 HTMLImageElement，避免翻页时重复解码
 * 使用 $state version 触发响应式更新
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
// PreDecodeCacheStore 类（响应式）
// ============================================================================

class PreDecodeCacheStore {
  /** 响应式版本号，用于触发 UI 更新 */
  version = $state(0);
  
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
  
  /** 递增版本号，触发响应式更新 */
  private bumpVersion(): void {
    this.version++;
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
   */
  get(pageIndex: number): PreDecodedEntry | null {
    const entry = this.cache.get(pageIndex);
    if (entry) {
      entry.timestamp = Date.now();
      this.hits++;
      return entry;
    }
    this.misses++;
    return null;
  }
  
  /**
   * 获取预解码的 URL
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
   */
  async preDecodeAndCache(
    pageIndex: number, 
    url: string,
    skipAnimated = true
  ): Promise<PreDecodedEntry | null> {
    if (this.cache.has(pageIndex)) {
      return this.cache.get(pageIndex)!;
    }
    
    if (this.pending.has(pageIndex)) {
      await new Promise(resolve => setTimeout(resolve, 50));
      return this.cache.get(pageIndex) ?? null;
    }
    
    this.pending.add(pageIndex);
    
    try {
      if (skipAnimated) {
        const isAnimated = await isAnimatedImage(url);
        if (isAnimated) {
          console.log(`⏭️ 跳过动图预解码: 页码 ${pageIndex + 1}`);
          return null;
        }
      }
      
      const img = new Image();
      img.src = url;
      
      const startTime = performance.now();
      await img.decode();
      const decodeTime = performance.now() - startTime;
      
      const entry: PreDecodedEntry = {
        img,
        url,
        timestamp: Date.now(),
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      
      if (this.cache.size >= this.maxSize) {
        this.evictLRU();
      }
      
      this.cache.set(pageIndex, entry);
      
      // 触发响应式更新
      this.bumpVersion();
      
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
   * 用超分图替换预解码缓存（超分完成后调用）
   * 强制替换已有的原图缓存，确保翻页时使用超分图的预解码结果
   * 
   * @param pageIndex 页面索引
   * @param upscaledUrl 超分图 URL
   * @returns Promise<PreDecodedEntry | null>
   */
  async replaceWithUpscaled(
    pageIndex: number,
    upscaledUrl: string
  ): Promise<PreDecodedEntry | null> {
    // 避免重复预解码
    if (this.pending.has(pageIndex)) {
      await new Promise(resolve => setTimeout(resolve, 50));
      // 如果已经是同一个 URL，直接返回
      const existing = this.cache.get(pageIndex);
      if (existing?.url === upscaledUrl) {
        return existing;
      }
    }
    
    this.pending.add(pageIndex);
    
    try {
      const img = new Image();
      img.src = upscaledUrl;
      
      const startTime = performance.now();
      await img.decode();
      const decodeTime = performance.now() - startTime;
      
      // 清理旧的缓存条目
      const oldEntry = this.cache.get(pageIndex);
      if (oldEntry) {
        oldEntry.img.src = '';
      }
      
      const entry: PreDecodedEntry = {
        img,
        url: upscaledUrl,
        timestamp: Date.now(),
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      
      // 直接替换，不检查 maxSize（超分图优先级更高）
      this.cache.set(pageIndex, entry);
      
      // 触发响应式更新
      this.bumpVersion();
      
      console.log(`✨ 超分图预解码完成: 页码 ${pageIndex + 1}, 耗时 ${decodeTime.toFixed(1)}ms, 尺寸 ${entry.width}x${entry.height}`);
      
      return entry;
    } catch (error) {
      console.warn(`⚠️ 超分图预解码失败: 页码 ${pageIndex + 1}`, error);
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
        entry.img.src = '';
      }
      this.cache.delete(oldestKey);
      this.bumpVersion();
      console.log(`🗑️ 淘汰预解码缓存: 页码 ${oldestKey + 1}`);
    }
  }
  
  /**
   * 清除所有缓存
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      entry.img.src = '';
    }
    this.cache.clear();
    this.pending.clear();
    this.hits = 0;
    this.misses = 0;
    this.bumpVersion();
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
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const preDecodeCache = new PreDecodeCacheStore();
