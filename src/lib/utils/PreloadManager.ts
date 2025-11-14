/**
 * PreloadManager - 预加载管理器
 * 负责管理图片预加载和超分缓存，支持会话验证
 */

interface PreloadTask {
  page: any;
  sessionId: string;
  hash: string;
  priority: number;
}

interface UpscaleCacheEntry {
  url: string;
  blob: Blob;
  timestamp: number;
  sessionId: string;
}

class PreloadManager {
  private activeSession: string = '';
  private queue: PreloadTask[] = [];
  private processing: boolean = false;
  private memoryCache: Map<string, UpscaleCacheEntry> = new Map();
  private maxCacheSize: number = 100; // 最大缓存条目数
  private preloadPages: number = 3;
  private maxThreads: number = 2;

  constructor() {
    // 监听会话变更
    window.addEventListener('book-session-changed', (e: CustomEvent) => {
      console.log('[PreloadManager] 检测到会话变更:', e.detail);
      this.activeSession = e.detail.sessionId;
      // 清理旧会话的缓存
      this.cleanupSessionCache(e.detail.sessionId);
      // 取消所有旧任务
      this.cancelAll();
    });
  }

  /**
   * 更新配置
   */
  updateImageLoaderConfig(config: { preloadPages?: number; maxThreads?: number }) {
    if (config.preloadPages !== undefined) {
      this.preloadPages = config.preloadPages;
    }
    if (config.maxThreads !== undefined) {
      this.maxThreads = config.maxThreads;
    }
    console.log('[PreloadManager] 配置已更新:', { preloadPages: this.preloadPages, maxThreads: this.maxThreads });
  }

  /**
   * 获取内存缓存
   */
  getPreloadMemoryCache(): Map<string, UpscaleCacheEntry> {
    return this.memoryCache;
  }

  /**
   * 入队预加载任务
   */
  enqueue(page: any, sessionId: string) {
    if (sessionId !== this.activeSession) {
      console.warn('[PreloadManager] 会话不匹配，忽略任务', { taskSession: sessionId, activeSession: this.activeSession });
      return;
    }

    const hash = page.stableHash || page.hash;
    if (!hash) {
      console.warn('[PreloadManager] 页面缺少 hash，跳过预加载');
      return;
    }

    // 检查是否已在缓存中
    if (this.memoryCache.has(hash)) {
      const cached = this.memoryCache.get(hash)!;
      if (cached.sessionId === sessionId) {
        console.log('[PreloadManager] 页面已在缓存中:', hash);
        return;
      }
    }

    // 创建任务
    const task: PreloadTask = {
      page,
      sessionId,
      hash,
      priority: page.priority || 0
    };

    // 按优先级插入队列
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < task.priority) {
        insertIndex = i;
        break;
      }
    }
    this.queue.splice(insertIndex, 0, task);

    console.log('[PreloadManager] 任务已入队:', { hash, sessionId, queueLength: this.queue.length });

    // 启动处理
    this.schedule();
  }

  /**
   * 调度处理
   */
  private schedule() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.processNext();
  }

  /**
   * 处理下一个任务
   */
  private async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    const task = this.queue.shift()!;
    if (!task) {
      this.processing = false;
      return;
    }

    // 会话验证
    if (task.sessionId !== this.activeSession) {
      console.log('[PreloadManager] 会话已变更，跳过任务:', task.hash);
      this.processNext();
      return;
    }

    try {
      console.log('[PreloadManager] 处理预加载任务:', task.hash);
      
      // 模拟加载图片（实际应该调用图片加载器）
      const result = await this.loadPage(task.page);
      
      // 再次验证会话
      if (task.sessionId === this.activeSession) {
        // 存储到内存缓存
        this.memoryCache.set(task.hash, {
          url: result.url,
          blob: result.blob,
          timestamp: Date.now(),
          sessionId: task.sessionId
        });
        
        // 检查缓存大小限制
        this.enforceCacheLimit();
        
        console.log('[PreloadManager] 任务完成:', task.hash);
      } else {
        console.log('[PreloadManager] 会话已变更，丢弃结果:', task.hash);
      }
    } catch (error) {
      console.error('[PreloadManager] 任务失败:', task.hash, error);
    }

    // 处理下一个任务
    setTimeout(() => this.processNext(), 100);
  }

  /**
   * 加载页面（模拟实现）
   */
  private async loadPage(page: any): Promise<{ url: string; blob: Blob }> {
    // 这里应该实现实际的图片加载逻辑
    // 目前返回模拟数据
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockBlob = new Blob(['mock image data'], { type: 'image/webp' });
        const mockUrl = URL.createObjectURL(mockBlob);
        resolve({ url: mockUrl, blob: mockBlob });
      }, 100);
    });
  }

  /**
   * 强制执行缓存大小限制
   */
  private enforceCacheLimit() {
    if (this.memoryCache.size <= this.maxCacheSize) {
      return;
    }

    // 按时间戳排序，删除最旧的条目
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toDelete = entries.slice(0, entries.length - this.maxCacheSize);
    toDelete.forEach(([hash]) => {
      const entry = this.memoryCache.get(hash);
      if (entry) {
        URL.revokeObjectURL(entry.url);
        this.memoryCache.delete(hash);
      }
    });

    console.log('[PreloadManager] 清理了', toDelete.length, '个缓存条目');
  }

  /**
   * 清理指定会话的缓存
   */
  private cleanupSessionCache(newSessionId: string) {
    let cleaned = 0;
    for (const [hash, entry] of this.memoryCache.entries()) {
      if (entry.sessionId !== newSessionId) {
        URL.revokeObjectURL(entry.url);
        this.memoryCache.delete(hash);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log('[PreloadManager] 清理了', cleaned, '个旧会话的缓存条目');
    }
  }

  /**
   * 取消所有任务
   */
  cancelAll() {
    const count = this.queue.length;
    this.queue = [];
    console.log('[PreloadManager] 已取消', count, '个待处理任务');
  }

  /**
   * 清理所有缓存
   */
  clearCache() {
    for (const [hash, entry] of this.memoryCache.entries()) {
      URL.revokeObjectURL(entry.url);
    }
    this.memoryCache.clear();
    console.log('[PreloadManager] 已清理所有缓存');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      activeSession: this.activeSession,
      queueLength: this.queue.length,
      cacheSize: this.memoryCache.size,
      processing: this.processing,
      preloadPages: this.preloadPages,
      maxThreads: this.maxThreads
    };
  }
}

// 创建全局实例
const preloadManager = new PreloadManager();

// 将实例挂载到 window 对象
(window as any).preloadManager = preloadManager;

export default preloadManager;