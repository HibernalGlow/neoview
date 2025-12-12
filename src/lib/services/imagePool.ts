/**
 * ImagePool - 图像池
 * 
 * 管理图像的加载、缓存和生命周期
 * 支持 LRU 缓存、优先级预加载、内存压力处理
 * 
 * Requirements: 1.1, 1.3, 1.4, 8.4
 */

import { LRUCache } from '$lib/utils/lruCache';
import { perfMonitor } from '$lib/utils/perfMonitor';
import { getAdaptiveConfig, onMemoryPressure, getCurrentMemoryUsage } from '$lib/utils/systemCapabilities';

export interface ImageEntry {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  size: number;
  loadTime: number;
  lastAccess: number;
  priority: 'high' | 'normal' | 'low';
}

export interface ImagePoolConfig {
  maxMemoryMB: number;
  preloadAhead: number;
  preloadBehind: number;
  lowPriorityDelayMs: number;
  maxConcurrent: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
}

export type LoadImageFn = (key: string) => Promise<{ blob: Blob; width?: number; height?: number }>;

const DEFAULT_CONFIG: ImagePoolConfig = {
  maxMemoryMB: 512,
  preloadAhead: 3,
  preloadBehind: 1,
  lowPriorityDelayMs: 100,
  maxConcurrent: 3,
};

class ImagePoolImpl {
  private cache: LRUCache<string, ImageEntry>;
  private config: ImagePoolConfig;
  private totalSizeBytes: number = 0;
  private evictionCount: number = 0;
  private loadImageFn: LoadImageFn | null = null;

  // 预加载队列
  private preloadQueue: Map<string, { priority: 'high' | 'normal' | 'low'; abortController: AbortController }> = new Map();
  private activeLoads: Set<string> = new Set();

  // 内存压力监听器清理函数
  private memoryPressureCleanup: (() => void) | null = null;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.cache = new LRUCache<string, ImageEntry>(1000);
    this.setupMemoryPressureHandler();
  }

  /**
   * 初始化配置（异步，基于系统能力）
   */
  async init(): Promise<void> {
    const adaptiveConfig = await getAdaptiveConfig();
    this.config = {
      maxMemoryMB: adaptiveConfig.maxCacheSizeMB,
      preloadAhead: adaptiveConfig.preloadAhead,
      preloadBehind: adaptiveConfig.preloadBehind,
      lowPriorityDelayMs: adaptiveConfig.lowPriorityDelayMs,
      maxConcurrent: adaptiveConfig.maxConcurrentLoads,
    };
    console.log('🖼️ [ImagePool] Initialized with config:', this.config);
  }

  /**
   * 设置图像加载函数
   */
  setLoadImageFn(fn: LoadImageFn): void {
    this.loadImageFn = fn;
  }

  /**
   * 设置内存压力处理
   */
  private setupMemoryPressureHandler(): void {
    this.memoryPressureCleanup = onMemoryPressure(() => {
      this.handleMemoryPressure();
    });
  }

  /**
   * 处理内存压力
   */
  private handleMemoryPressure(): void {
    console.warn('⚠️ [ImagePool] Handling memory pressure');
    
    // 释放 50% 的缓存
    const targetSize = this.totalSizeBytes / 2;
    this.evictUntilSize(targetSize);

    // 取消低优先级预加载
    for (const [key, { priority, abortController }] of this.preloadQueue) {
      if (priority === 'low') {
        abortController.abort();
        this.preloadQueue.delete(key);
      }
    }

    // 减少预加载数量
    this.config.preloadAhead = Math.max(1, this.config.preloadAhead - 1);
    
    perfMonitor.record('memoryUsage', getCurrentMemoryUsage()?.usedMB || 0);
  }

  /**
   * 获取图像（优先从缓存）
   */
  async get(key: string): Promise<ImageEntry | null> {
    // 检查缓存
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached;
    }

    // 加载图像
    if (!this.loadImageFn) {
      console.warn('[ImagePool] No load function set');
      return null;
    }

    const startTime = performance.now();
    try {
      const { blob, width, height } = await this.loadImageFn(key);
      const loadTime = performance.now() - startTime;
      
      perfMonitor.record('imageLoadTime', loadTime);

      const entry: ImageEntry = {
        url: URL.createObjectURL(blob),
        blob,
        width: width || 0,
        height: height || 0,
        size: blob.size,
        loadTime,
        lastAccess: Date.now(),
        priority: 'high',
      };

      this.addToCache(key, entry);
      return entry;
    } catch (error) {
      console.error('[ImagePool] Failed to load image:', key, error);
      return null;
    }
  }

  /**
   * 预加载图像
   */
  preload(keys: string[], priority: 'high' | 'normal' | 'low' = 'normal'): void {
    for (const key of keys) {
      // 跳过已缓存的
      if (this.cache.has(key)) continue;
      
      // 跳过已在队列中的（除非新优先级更高）
      const existing = this.preloadQueue.get(key);
      if (existing) {
        if (this.comparePriority(priority, existing.priority) > 0) {
          existing.abortController.abort();
          this.preloadQueue.delete(key);
        } else {
          continue;
        }
      }

      const abortController = new AbortController();
      this.preloadQueue.set(key, { priority, abortController });

      // 根据优先级延迟启动
      const delay = priority === 'low' ? this.config.lowPriorityDelayMs : 0;
      setTimeout(() => {
        this.processPreloadQueue();
      }, delay);
    }
  }

  /**
   * 取消预加载
   */
  cancelPreload(keys: string[]): void {
    for (const key of keys) {
      const item = this.preloadQueue.get(key);
      if (item) {
        item.abortController.abort();
        this.preloadQueue.delete(key);
      }
    }
  }

  /**
   * 清理缓存
   */
  evict(keys?: string[]): void {
    if (keys) {
      for (const key of keys) {
        const entry = this.cache.get(key);
        if (entry) {
          URL.revokeObjectURL(entry.url);
          this.totalSizeBytes -= entry.size;
          this.cache.delete(key);
          this.evictionCount++;
        }
      }
    } else {
      // 清理所有
      for (const entry of this.cache.values()) {
        URL.revokeObjectURL(entry.url);
      }
      this.cache.clear();
      this.totalSizeBytes = 0;
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    const cacheStats = this.cache.getStats();
    return {
      totalEntries: cacheStats.size,
      totalSizeBytes: this.totalSizeBytes,
      hitCount: cacheStats.hits,
      missCount: cacheStats.misses,
      hitRate: cacheStats.hitRate,
      evictionCount: this.evictionCount,
    };
  }

  /**
   * 处理预加载队列
   */
  private async processPreloadQueue(): Promise<void> {
    if (this.activeLoads.size >= this.config.maxConcurrent) return;
    if (this.preloadQueue.size === 0) return;

    // 按优先级排序
    const sorted = Array.from(this.preloadQueue.entries())
      .sort((a, b) => this.comparePriority(b[1].priority, a[1].priority));

    for (const [key, { priority, abortController }] of sorted) {
      if (this.activeLoads.size >= this.config.maxConcurrent) break;
      if (abortController.signal.aborted) {
        this.preloadQueue.delete(key);
        continue;
      }

      this.activeLoads.add(key);
      this.preloadQueue.delete(key);

      this.loadWithAbort(key, priority, abortController.signal)
        .finally(() => {
          this.activeLoads.delete(key);
          this.processPreloadQueue();
        });
    }
  }

  /**
   * 带取消支持的加载
   */
  private async loadWithAbort(key: string, priority: 'high' | 'normal' | 'low', signal: AbortSignal): Promise<void> {
    if (signal.aborted || !this.loadImageFn) return;

    const startTime = performance.now();
    try {
      const { blob, width, height } = await this.loadImageFn(key);
      
      if (signal.aborted) {
        return;
      }

      const loadTime = performance.now() - startTime;
      perfMonitor.record('imageLoadTime', loadTime);

      const entry: ImageEntry = {
        url: URL.createObjectURL(blob),
        blob,
        width: width || 0,
        height: height || 0,
        size: blob.size,
        loadTime,
        lastAccess: Date.now(),
        priority,
      };

      this.addToCache(key, entry);
    } catch (error) {
      if (!signal.aborted) {
        console.debug('[ImagePool] Preload failed:', key, error);
      }
    }
  }

  /**
   * 添加到缓存
   */
  private addToCache(key: string, entry: ImageEntry): void {
    // 检查内存限制
    const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
    while (this.totalSizeBytes + entry.size > maxBytes && this.cache.size > 0) {
      this.evictOldest();
    }

    this.cache.set(key, entry);
    this.totalSizeBytes += entry.size;
  }

  /**
   * 驱逐最旧的条目
   */
  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey);
      if (entry) {
        URL.revokeObjectURL(entry.url);
        this.totalSizeBytes -= entry.size;
        this.cache.delete(firstKey);
        this.evictionCount++;
      }
    }
  }

  /**
   * 驱逐直到达到目标大小
   */
  private evictUntilSize(targetBytes: number): void {
    while (this.totalSizeBytes > targetBytes && this.cache.size > 0) {
      this.evictOldest();
    }
  }

  /**
   * 比较优先级
   */
  private comparePriority(a: 'high' | 'normal' | 'low', b: 'high' | 'normal' | 'low'): number {
    const order = { high: 3, normal: 2, low: 1 };
    return order[a] - order[b];
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.evict();
    this.preloadQueue.clear();
    this.activeLoads.clear();
    if (this.memoryPressureCleanup) {
      this.memoryPressureCleanup();
    }
  }
}

// 单例导出
export const imagePool = new ImagePoolImpl();
