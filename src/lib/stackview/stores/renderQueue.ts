/**
 * RenderQueue - 分层渲染队列
 * 
 * 管理图片加载和预解码的优先级，参考 OpenComic 的实现：
 * - 当前页立即加载（CRITICAL）
 * - 周围页延迟加载（HIGH/NORMAL/LOW）
 * - 快速翻页时取消过时任务
 * 
 * OpenComic 的关键代码：
 * ```javascript
 * setRenderQueue(visbleImages.prev, visbleImages.next);  // 立即
 * setTimeout(() => setRenderQueue(maxPrev, maxNext), 400);  // 延迟
 * if (queueIndex !== queue.index('readingRender')) return;  // 取消检查
 * ```
 */

import { bookStore } from '$lib/stores/book.svelte';
import { preDecodeCache } from './preDecodeCache';
import { imagePool } from './imagePool.svelte';

// ============================================================================
// 优先级常量
// ============================================================================

export const RenderPriority = {
  /** 当前页 - 最高优先级 */
  CRITICAL: 100,
  /** ±1 页 - 高优先级 */
  HIGH: 80,
  /** ±2-3 页 - 普通优先级 */
  NORMAL: 50,
  /** ±4-5 页 - 低优先级 */
  LOW: 20,
  /** 更远的页 - 后台优先级 */
  BACKGROUND: 10,
} as const;

// ============================================================================
// 类型定义
// ============================================================================

export interface QueueTask {
  /** 页面索引 */
  pageIndex: number;
  /** 优先级 */
  priority: number;
  /** 任务令牌（用于取消） */
  token: number;
  /** 任务状态 */
  status: 'pending' | 'loading' | 'done' | 'cancelled';
}

export interface QueueStatus {
  /** 当前页面 */
  currentPage: number;
  /** 待处理任务数 */
  pendingCount: number;
  /** 已预解码数 */
  preDecodedCount: number;
  /** 当前令牌 */
  currentToken: number;
}

// ============================================================================
// RenderQueue 类
// ============================================================================

export class RenderQueue {
  /** 当前任务令牌（用于取消过时任务） */
  private currentToken = 0;
  
  /** 当前页面索引 */
  private currentPageIndex = -1;
  
  /** 任务队列 */
  private tasks: QueueTask[] = [];
  
  /** 是否正在处理队列 */
  private processing = false;
  
  /** 延迟加载的定时器 */
  private delayTimers: ReturnType<typeof setTimeout>[] = [];
  
  /** 预加载范围配置 */
  private config = {
    /** 高优先级范围（±1 页） */
    highRange: 1,
    /** 普通优先级范围（±2-3 页） */
    normalRange: 3,
    /** 低优先级范围（±4-5 页） */
    lowRange: 5,
    /** 高优先级延迟（ms） */
    highDelay: 50,
    /** 普通优先级延迟（ms） */
    normalDelay: 150,
    /** 低优先级延迟（ms） */
    lowDelay: 300,
  };
  
  /**
   * 设置当前页面，触发分层加载
   * 
   * @param pageIndex 当前页面索引
   */
  async setCurrentPage(pageIndex: number): Promise<void> {
    // 取消之前的任务
    this.cancelAll();
    
    // 更新当前页面
    this.currentPageIndex = pageIndex;
    this.currentToken++;
    const token = this.currentToken;
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    const totalPages = book.pages.length;
    
    console.log(`📋 渲染队列: 设置当前页 ${pageIndex + 1}/${totalPages}`);
    
    // 1. 立即加载当前页（如果未预解码）
    if (!preDecodeCache.has(pageIndex)) {
      await this.loadAndPreDecode(pageIndex, token);
    }
    
    // 2. 延迟加载高优先级页面（±1 页）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleRange(pageIndex, 1, this.config.highRange, RenderPriority.HIGH, token, totalPages);
    }, this.config.highDelay));
    
    // 3. 延迟加载普通优先级页面（±2-3 页）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleRange(pageIndex, this.config.highRange + 1, this.config.normalRange, RenderPriority.NORMAL, token, totalPages);
    }, this.config.normalDelay));
    
    // 4. 延迟加载低优先级页面（±4-5 页）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleRange(pageIndex, this.config.normalRange + 1, this.config.lowRange, RenderPriority.LOW, token, totalPages);
    }, this.config.lowDelay));
  }
  
  /**
   * 调度一个范围内的页面加载
   */
  private scheduleRange(
    centerIndex: number,
    startOffset: number,
    endOffset: number,
    priority: number,
    token: number,
    totalPages: number
  ): void {
    const pagesToLoad: number[] = [];
    
    // 前向页面
    for (let i = startOffset; i <= endOffset; i++) {
      const idx = centerIndex + i;
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) {
        pagesToLoad.push(idx);
      }
    }
    
    // 后向页面
    for (let i = startOffset; i <= endOffset; i++) {
      const idx = centerIndex - i;
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) {
        pagesToLoad.push(idx);
      }
    }
    
    // 去重
    const uniquePages = [...new Set(pagesToLoad)];
    
    if (uniquePages.length > 0) {
      console.log(`📋 调度预解码: 优先级=${priority}, 页面=[${uniquePages.map(p => p + 1).join(', ')}]`);
    }
    
    // 添加到队列
    for (const pageIndex of uniquePages) {
      this.addTask(pageIndex, priority, token);
    }
    
    // 处理队列
    this.processQueue();
  }
  
  /**
   * 添加任务到队列
   */
  private addTask(pageIndex: number, priority: number, token: number): void {
    // 检查是否已在队列中
    const existing = this.tasks.find(t => t.pageIndex === pageIndex && t.token === token);
    if (existing) {
      // 提升优先级
      if (priority > existing.priority) {
        existing.priority = priority;
      }
      return;
    }
    
    this.tasks.push({
      pageIndex,
      priority,
      token,
      status: 'pending',
    });
    
    // 按优先级排序（高优先级在前）
    this.tasks.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    
    try {
      while (this.tasks.length > 0) {
        const task = this.tasks[0];
        
        // 检查任务是否已过时
        if (task.token !== this.currentToken) {
          task.status = 'cancelled';
          this.tasks.shift();
          continue;
        }
        
        // 检查是否已预解码
        if (preDecodeCache.has(task.pageIndex)) {
          task.status = 'done';
          this.tasks.shift();
          continue;
        }
        
        // 执行加载
        task.status = 'loading';
        await this.loadAndPreDecode(task.pageIndex, task.token);
        task.status = 'done';
        this.tasks.shift();
      }
    } finally {
      this.processing = false;
    }
  }
  
  /**
   * 加载并预解码页面
   */
  private async loadAndPreDecode(pageIndex: number, token: number): Promise<void> {
    try {
      // 检查令牌是否仍然有效
      if (token !== this.currentToken) {
        return;
      }
      
      // 从 imagePool 获取 URL
      const cached = imagePool.getSync(pageIndex);
      let url: string;
      
      if (cached) {
        url = cached.url;
      } else {
        // 需要先加载
        const result = await imagePool.get(pageIndex);
        if (!result) return;
        url = result.url;
      }
      
      // 再次检查令牌
      if (token !== this.currentToken) {
        return;
      }
      
      // 预解码
      await preDecodeCache.preDecodeAndCache(pageIndex, url);
    } catch (error) {
      console.warn(`预解码失败: 页码 ${pageIndex + 1}`, error);
    }
  }
  
  /**
   * 取消所有待处理任务
   */
  cancelAll(): void {
    // 清除延迟定时器
    for (const timer of this.delayTimers) {
      clearTimeout(timer);
    }
    this.delayTimers = [];
    
    // 标记所有任务为已取消
    for (const task of this.tasks) {
      if (task.status === 'pending') {
        task.status = 'cancelled';
      }
    }
    
    // 清空队列
    this.tasks = [];
  }
  
  /**
   * 获取队列状态
   */
  getStatus(): QueueStatus {
    return {
      currentPage: this.currentPageIndex,
      pendingCount: this.tasks.filter(t => t.status === 'pending').length,
      preDecodedCount: preDecodeCache.getStats().size,
      currentToken: this.currentToken,
    };
  }
  
  /**
   * 更新配置
   */
  setConfig(config: Partial<typeof this.config>): void {
    Object.assign(this.config, config);
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const renderQueue = new RenderQueue();
