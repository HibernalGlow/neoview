/**
 * ThumbnailManager - 缩略图管理器
 * 
 * 管理缩略图的批量加载、优先级和可见性取消
 * 
 * Requirements: 3.1, 3.2, 3.4, 3.5
 */

import { LRUCache } from '$lib/utils/lruCache';
import { perfMonitor } from '$lib/utils/perfMonitor';
import { getAdaptiveConfig } from '$lib/utils/systemCapabilities';

export interface ThumbnailRequest {
  path: string;
  priority: number;
  visible: boolean;
  callback: (url: string | null) => void;
  abortController: AbortController;
}

export interface ThumbnailManagerConfig {
  batchSize: number;
  maxConcurrent: number;
  cacheSize: number;
  debounceMs: number;
}

export type LoadThumbnailFn = (path: string, signal: AbortSignal) => Promise<string>;

const DEFAULT_CONFIG: ThumbnailManagerConfig = {
  batchSize: 10,
  maxConcurrent: 4,
  cacheSize: 500,
  debounceMs: 50,
};

class ThumbnailManagerImpl {
  private config: ThumbnailManagerConfig = { ...DEFAULT_CONFIG };
  private cache: LRUCache<string, string>;
  private pendingRequests: Map<string, ThumbnailRequest> = new Map();
  private activeLoads: Set<string> = new Set();
  private visiblePaths: Set<string> = new Set();
  private loadThumbnailFn: LoadThumbnailFn | null = null;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.cache = new LRUCache<string, string>(DEFAULT_CONFIG.cacheSize);
  }

  /**
   * 初始化配置
   */
  async init(): Promise<void> {
    const adaptiveConfig = await getAdaptiveConfig();
    this.config = {
      batchSize: adaptiveConfig.thumbnailBatchSize,
      maxConcurrent: adaptiveConfig.maxConcurrentThumbnails,
      cacheSize: 500,
      debounceMs: 50,
    };
    this.cache = new LRUCache<string, string>(this.config.cacheSize);
    console.log('🖼️ [ThumbnailManager] Initialized with config:', this.config);
  }

  /**
   * 设置缩略图加载函数
   */
  setLoadThumbnailFn(fn: LoadThumbnailFn): void {
    this.loadThumbnailFn = fn;
  }

  /**
   * 请求缩略图
   */
  async request(path: string, priority: number = 0): Promise<string | null> {
    // 检查缓存
    const cached = this.cache.get(path);
    if (cached) {
      return cached;
    }

    return new Promise((resolve) => {
      const abortController = new AbortController();
      const request: ThumbnailRequest = {
        path,
        priority,
        visible: this.visiblePaths.has(path),
        callback: resolve,
        abortController,
      };

      // 如果已有请求，更新优先级
      const existing = this.pendingRequests.get(path);
      if (existing) {
        if (priority > existing.priority) {
          existing.priority = priority;
          existing.visible = request.visible;
        }
        // 添加回调
        const originalCallback = existing.callback;
        existing.callback = (url) => {
          originalCallback(url);
          resolve(url);
        };
        return;
      }

      this.pendingRequests.set(path, request);
      this.scheduleProcessing();
    });
  }

  /**
   * 批量请求
   */
  async requestBatch(paths: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    const promises: Promise<void>[] = [];

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      // 可见项优先级更高
      const priority = this.visiblePaths.has(path) ? 100 - i : 50 - i;
      
      promises.push(
        this.request(path, priority).then((url) => {
          results.set(path, url);
        })
      );
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * 更新可见性
   */
  updateVisibility(visiblePaths: Set<string>): void {
    this.visiblePaths = visiblePaths;

    // 更新待处理请求的优先级
    for (const [path, request] of this.pendingRequests) {
      const wasVisible = request.visible;
      const isVisible = visiblePaths.has(path);
      
      if (isVisible && !wasVisible) {
        request.visible = true;
        request.priority += 50; // 提升优先级
      } else if (!isVisible && wasVisible) {
        request.visible = false;
        request.priority -= 50; // 降低优先级
      }
    }

    // 取消不可见且低优先级的请求
    this.cancelInvisible();
  }

  /**
   * 取消请求
   */
  cancel(paths: string[]): void {
    for (const path of paths) {
      const request = this.pendingRequests.get(path);
      if (request) {
        request.abortController.abort();
        request.callback(null);
        this.pendingRequests.delete(path);
      }
    }
  }

  /**
   * 取消不可见的请求
   */
  private cancelInvisible(): void {
    const toCancel: string[] = [];
    
    for (const [path, request] of this.pendingRequests) {
      if (!request.visible && !this.activeLoads.has(path)) {
        toCancel.push(path);
      }
    }

    if (toCancel.length > 0) {
      this.cancel(toCancel);
      console.log(`🖼️ [ThumbnailManager] Cancelled ${toCancel.length} invisible requests`);
    }
  }

  /**
   * 调度处理
   */
  private scheduleProcessing(): void {
    if (this.processingTimer) return;

    this.processingTimer = setTimeout(() => {
      this.processingTimer = null;
      this.processQueue();
    }, this.config.debounceMs);
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.activeLoads.size >= this.config.maxConcurrent) return;
    if (this.pendingRequests.size === 0) return;

    // 按优先级排序，可见项优先
    const sorted = Array.from(this.pendingRequests.entries())
      .sort((a, b) => {
        // 可见项优先
        if (a[1].visible !== b[1].visible) {
          return a[1].visible ? -1 : 1;
        }
        // 然后按优先级
        return b[1].priority - a[1].priority;
      });

    // 取一批处理
    const batch = sorted.slice(0, Math.min(
      this.config.batchSize,
      this.config.maxConcurrent - this.activeLoads.size
    ));

    for (const [path, request] of batch) {
      if (request.abortController.signal.aborted) {
        this.pendingRequests.delete(path);
        continue;
      }

      this.activeLoads.add(path);
      this.pendingRequests.delete(path);

      this.loadThumbnail(path, request)
        .finally(() => {
          this.activeLoads.delete(path);
          this.processQueue();
        });
    }
  }

  /**
   * 加载单个缩略图
   */
  private async loadThumbnail(path: string, request: ThumbnailRequest): Promise<void> {
    if (!this.loadThumbnailFn) {
      request.callback(null);
      return;
    }

    const startTime = performance.now();
    try {
      const url = await this.loadThumbnailFn(path, request.abortController.signal);
      
      if (request.abortController.signal.aborted) {
        return;
      }

      const loadTime = performance.now() - startTime;
      perfMonitor.record('thumbnailLoadTime', loadTime);

      // 缓存结果
      this.cache.set(path, url);
      request.callback(url);
    } catch (error) {
      if (!request.abortController.signal.aborted) {
        console.debug('[ThumbnailManager] Failed to load:', path, error);
        request.callback(null);
      }
    }
  }

  /**
   * 获取缓存的缩略图
   */
  getCached(path: string): string | null {
    return this.cache.get(path) || null;
  }

  /**
   * 检查是否有缓存
   */
  hasCached(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取统计
   */
  getStats(): {
    cacheSize: number;
    pendingCount: number;
    activeCount: number;
    hitRate: number;
  } {
    const cacheStats = this.cache.getStats();
    return {
      cacheSize: cacheStats.size,
      pendingCount: this.pendingRequests.size,
      activeCount: this.activeLoads.size,
      hitRate: cacheStats.hitRate,
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }
    this.cancel(Array.from(this.pendingRequests.keys()));
    this.cache.clear();
  }
}

// 单例导出
export const thumbnailManager = new ThumbnailManagerImpl();
