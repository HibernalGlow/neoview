/**
 * RenderQueue - 分层渲染队列（卡片预加载管理）
 * 
 * 管理图片加载和预解码的优先级，参考 OpenComic 的实现：
 * - 当前页立即加载（CRITICAL）
 * - 周围页延迟加载（HIGH/NORMAL/LOW）
 * - 快速翻页时取消过时任务
 * 
 * 【动态配置支持】
 * - 支持从设置中读取预加载数量
 * - 支持运行时动态调整预加载范围
 * - 支持基于系统能力的自适应配置
 */

import { bookStore } from '$lib/stores/book.svelte';
import { preDecodeCache } from './preDecodeCache.svelte';
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

/** 预加载配置 */
export interface PreloadConfig {
  /** 高优先级范围（±N 页） */
  highRange: number;
  /** 普通优先级范围（±N 页） */
  normalRange: number;
  /** 低优先级范围（±N 页） */
  lowRange: number;
  /** 高优先级延迟（ms） */
  highDelay: number;
  /** 普通优先级延迟（ms） */
  normalDelay: number;
  /** 低优先级延迟（ms） */
  lowDelay: number;
}

/** 递进加载配置 */
export interface ProgressiveLoadConfig {
  /** 是否启用递进加载 */
  enabled: boolean;
  /** 停留时间（秒） */
  dwellTime: number;
  /** 每次递进加载的页数 */
  batchSize: number;
  /** 最大递进页数（999 表示全部） */
  maxPages: number;
}

/** 递进加载状态 */
export interface ProgressiveLoadState {
  /** 是否正在运行 */
  isRunning: boolean;
  /** 倒计时秒数 */
  countdown: number;
  /** 计时器是否激活 */
  isTimerActive: boolean;
  /** 已递进加载的最远页码 */
  furthestLoadedIndex: number;
}

/** 默认预加载配置 */
const DEFAULT_PRELOAD_CONFIG: PreloadConfig = {
  highRange: 1,
  normalRange: 3,
  lowRange: 5,
  highDelay: 50,
  normalDelay: 150,
  lowDelay: 300,
};

/** 低端设备预加载配置 */
const LOW_END_PRELOAD_CONFIG: PreloadConfig = {
  highRange: 1,
  normalRange: 2,
  lowRange: 3,
  highDelay: 100,
  normalDelay: 250,
  lowDelay: 500,
};

/** 高端设备预加载配置 (如 i9 / 3090) */
const HIGH_END_PRELOAD_CONFIG: PreloadConfig = {
  highRange: 3,
  normalRange: 8,
  lowRange: 15,
  highDelay: 20,
  normalDelay: 60,
  lowDelay: 120,
};

/** 默认递进加载配置 */
const DEFAULT_PROGRESSIVE_CONFIG: ProgressiveLoadConfig = {
  enabled: true, // 默认开启，支持长时间停留后全量加载
  dwellTime: 4,  // 停留 4 秒后触发
  batchSize: 5,
  maxPages: 100,
};

// ============================================================================
// RenderQueue 类
// ============================================================================

export class RenderQueue {
  /** 当前任务令牌（用于取消过时任务） */
  private currentToken = 0;
  
  /** 当前页面索引 */
  private currentPageIndex = -1;
  
  /** View 通道任务（当前页 ±1，最高优先级，可抢占 Ahead） */
  private viewTasks: QueueTask[] = [];
  
  /** Ahead 通道任务（±2 以外的预加载，低优先级） */
  private aheadTasks: QueueTask[] = [];
  
  /** 旧的 tasks 引用（兼容 getStatus） */
  private get tasks(): QueueTask[] {
    return [...this.viewTasks, ...this.aheadTasks];
  }
  
  /** 是否正在处理 View 通道 */
  private processingView = false;
  
  /** 是否正在处理 Ahead 通道 */
  private processingAhead = false;
  
  /** 当前活跃的 AbortController（翻页时 abort 取消进行中的预加载） */
  private activeAbortController: AbortController | null = null;
  
  /** 并发解码窗口大小 */
  private readonly CONCURRENT_DECODE_LIMIT = Math.min(3, typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2);
  
  /** 延迟加载的定时器 */
  private delayTimers: ReturnType<typeof setTimeout>[] = [];
  
  /** 预加载范围配置 */
  private config: PreloadConfig = { ...DEFAULT_PRELOAD_CONFIG };
  
  /** 递进加载配置 */
  private progressiveConfig: ProgressiveLoadConfig = { ...DEFAULT_PROGRESSIVE_CONFIG };
  
  /** 递进加载状态 */
  private progressiveState: ProgressiveLoadState = {
    isRunning: false,
    countdown: 0,
    isTimerActive: false,
    furthestLoadedIndex: -1,
  };
  
  /** 递进加载定时器 */
  private progressiveDwellTimer: ReturnType<typeof setTimeout> | null = null;
  private progressiveCountdownTimer: ReturnType<typeof setInterval> | null = null;
  
  // ============================================================================
  // 快速翻页检测 (参考 NeeView 优化)
  // ============================================================================
  
  /** 上次翻页时间戳 */
  private lastPageTurnTime = 0;
  
  /** 连续快速翻页计数 */
  private rapidTurnCount = 0;
  
  /** 快速翻页阈值 (ms) - 降低从 200ms 到 120ms (更符合高性能设备节奏) */
  private readonly RAPID_TURN_THRESHOLD_MS = 120;
  
  /** 触发快速翻页模式所需的连续次数 - 增加到 4 次以减少模式抖动 */
  private readonly RAPID_TURN_TRIGGER_COUNT = 4;
  
  /** 是否处于快速翻页模式 */
  private isRapidTurnMode = false;
  
  /** 快速翻页恢复定时器 */
  private rapidTurnRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  
  /** 上一个页面索引（用于计算翻页方向） */
  private previousPageIndex = -1;
  
  /** 当前翻页方向 (1: 向后, -1: 向前) */
  private currentDirection: 1 | -1 = 1;
  
  /** 状态变更回调 */
  private onStateChange: (() => void) | null = null;
  
  /**
   * 从设置同步预加载配置
   */
  async syncFromSettings(): Promise<void> {
    try {
      const { settingsManager } = await import('$lib/settings/settingsManager');
      const settings = settingsManager.getSettings();
      const preLoadSize = settings.performance?.preLoadSize;
      
      if (preLoadSize !== undefined && preLoadSize > 0) {
        this.config.highRange = Math.max(1, Math.floor(preLoadSize * 0.2));
        this.config.normalRange = Math.max(2, Math.floor(preLoadSize * 0.5));
        this.config.lowRange = preLoadSize;
        console.log(`📋 [RenderQueue] 从设置同步预加载配置: preLoadSize=${preLoadSize}`, this.config);
      }
    } catch (error) {
      console.warn('⚠️ [RenderQueue] 同步设置失败，使用默认配置', error);
    }
  }
  
  /**
   * 应用系统能力自适应配置
   */
  async applyAdaptiveConfig(): Promise<void> {
    try {
      const { getAdaptiveConfig } = await import('$lib/utils/systemCapabilities');
      const adaptiveConfig = await getAdaptiveConfig();
      
      if (adaptiveConfig.preloadAhead <= 2) {
        this.config = { ...LOW_END_PRELOAD_CONFIG };
        console.log('📋 [RenderQueue] 应用低端设备配置');
      } else if (adaptiveConfig.preloadAhead >= 5) {
        this.config = { ...HIGH_END_PRELOAD_CONFIG };
        console.log('📋 [RenderQueue] 应用高端设备配置');
      } else {
        this.config = { ...DEFAULT_PRELOAD_CONFIG };
        console.log('📋 [RenderQueue] 应用默认配置');
      }
    } catch (error) {
      console.warn('⚠️ [RenderQueue] 获取系统能力失败，使用默认配置', error);
    }
  }
  
  /**
   * 设置当前页面，触发分层加载
   * 
   * 【优化 #2: 取消过时任务】翻页时立即 abort 所有进行中的预加载
   * 参考 NeeView: BookPageLoader._cancellationTokenSource.Cancel()
   */
  async setCurrentPage(pageIndex: number): Promise<void> {
    // 首次调用时同步配置
    if (this.currentPageIndex === -1) {
      await this.syncFromSettings();
    }
    
    // 检测快速翻页
    const now = Date.now();
    const timeSinceLastTurn = now - this.lastPageTurnTime;
    this.lastPageTurnTime = now;
    
    // 计算翻页方向
    if (this.previousPageIndex >= 0) {
      this.currentDirection = pageIndex > this.previousPageIndex ? 1 : -1;
    }
    this.previousPageIndex = pageIndex;
    
    // 快速翻页检测
    if (timeSinceLastTurn < this.RAPID_TURN_THRESHOLD_MS && timeSinceLastTurn > 0) {
      this.rapidTurnCount++;
      
      if (this.rapidTurnCount >= this.RAPID_TURN_TRIGGER_COUNT) {
        if (!this.isRapidTurnMode) {
          console.log(`⚡ [RenderQueue] 进入快速翻页模式 (连续 ${this.rapidTurnCount} 次快速翻页)`);
          this.isRapidTurnMode = true;
        }
      }
    } else {
      this.rapidTurnCount = 0;
    }
    
    // 【关键优化 #2】取消所有进行中的预加载 IO
    this.cancelAll();
    
    // 更新当前页面
    this.currentPageIndex = pageIndex;
    this.currentToken++;
    const token = this.currentToken;
    
    // 创建新的 AbortController
    this.activeAbortController = new AbortController();
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    const totalPages = book.pages.length;
    
    // 快速翻页模式
    if (this.isRapidTurnMode) {
      console.log(`⚡ [RenderQueue] 快速翻页模式: 加载页 ${pageIndex + 1} + 预测 ${this.currentDirection > 0 ? '→' : '←'}`);
      
      // View 通道：当前页
      if (!preDecodeCache.has(pageIndex)) {
        await this.loadAndPreDecode(pageIndex, token, this.activeAbortController.signal);
      }

      // View 通道：方向预测下一页
      const nextIdx = pageIndex + this.currentDirection;
      if (nextIdx >= 0 && nextIdx < totalPages && !preDecodeCache.has(nextIdx)) {
        this.addViewTask(nextIdx, RenderPriority.HIGH, token);
        this.processViewChannel();
      }
      
      // 恢复定时器
      this.clearRapidTurnRecoveryTimer();
      this.rapidTurnRecoveryTimer = setTimeout(() => {
        console.log(`✅ [RenderQueue] 退出快速翻页模式，恢复正常预加载`);
        this.isRapidTurnMode = false;
        this.rapidTurnCount = 0;
        this.scheduleNormalPreload(this.currentPageIndex, token, totalPages);
        this.resetProgressiveState();
      }, 500);
      
      return;
    }
    
    console.log(`📋 渲染队列: 设置当前页 ${pageIndex + 1}/${totalPages} (方向: ${this.currentDirection > 0 ? '→' : '←'}, 并发=${this.CONCURRENT_DECODE_LIMIT})`);
    
    // 正常模式：分层预加载
    await this.scheduleNormalPreload(pageIndex, token, totalPages);
    
    // 重置递进加载状态
    this.resetProgressiveState();
  }
  
  /**
   * 清除快速翻页恢复定时器
   */
  private clearRapidTurnRecoveryTimer(): void {
    if (this.rapidTurnRecoveryTimer) {
      clearTimeout(this.rapidTurnRecoveryTimer);
      this.rapidTurnRecoveryTimer = null;
    }
  }
  
  /**
   * 执行正常的分层预加载
   * 【优化 #1: 双通道】View ±1 → viewTasks; 其余 → aheadTasks
   */
  private async scheduleNormalPreload(
    pageIndex: number, 
    token: number, 
    totalPages: number
  ): Promise<void> {
    // View 通道：立即加载当前页
    if (!preDecodeCache.has(pageIndex)) {
      await this.loadAndPreDecode(pageIndex, token, this.activeAbortController?.signal);
    }
    
    // View 通道：延迟加载 ±1 页（HIGH 优先级）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleDirectionalView(pageIndex, 1, this.config.highRange, RenderPriority.HIGH, token, totalPages);
    }, this.config.highDelay));
    
    // Ahead 通道：延迟加载 ±2-N 页（NORMAL/LOW 优先级）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleDirectionalAhead(pageIndex, this.config.highRange + 1, this.config.normalRange, RenderPriority.NORMAL, token, totalPages);
    }, this.config.normalDelay));
    
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleDirectionalAhead(pageIndex, this.config.normalRange + 1, this.config.lowRange, RenderPriority.LOW, token, totalPages);
    }, this.config.lowDelay));

    // 【性能优化 #10】BACKGROUND 通道：IO 预加载 (±6-15 页，仅 IO 不解码)
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      // 这里的 15 是假设的背景加载范围，通常是 lowRange 的 2-3 倍
      const backgroundRange = Math.max(15, this.config.lowRange * 2);
      this.scheduleDirectionalAheadIO(pageIndex, this.config.lowRange + 1, backgroundRange, RenderPriority.BACKGROUND, token, totalPages);
    }, this.config.lowDelay + 200));
  }
  
  // ============================================================================
  // 双通道任务管理 (NeeView: View/Ahead JobClient 分离)
  // ============================================================================
  
  /** 添加 View 通道任务 */
  private addViewTask(pageIndex: number, priority: number, token: number): void {
    const existing = this.viewTasks.find(t => t.pageIndex === pageIndex && t.token === token);
    if (existing) {
      if (priority > existing.priority) existing.priority = priority;
      return;
    }
    this.viewTasks.push({ pageIndex, priority, token, status: 'pending' });
    this.viewTasks.sort((a, b) => b.priority - a.priority);
  }
  
  /** 添加 Ahead 通道任务 */
  private addAheadTask(pageIndex: number, priority: number, token: number, ioOnly = false): void {
    const existing = this.aheadTasks.find(t => t.pageIndex === pageIndex && t.token === token);
    if (existing) {
      if (priority > existing.priority) existing.priority = priority;
      return;
    }
    // 使用 QueueTask 扩展或元数据
    const task = { pageIndex, priority, token, status: 'pending' as const, ioOnly };
    this.aheadTasks.push(task as any);
    this.aheadTasks.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * View 通道方向调度
   */
  private scheduleDirectionalView(
    centerIndex: number, startOffset: number, endOffset: number,
    priority: number, token: number, totalPages: number
  ): void {
    const pages = this.collectDirectionalPages(centerIndex, startOffset, endOffset, totalPages);
    for (const idx of pages) this.addViewTask(idx, priority, token);
    if (pages.length > 0) {
      console.log(`🎯 [View] 方向预加载: [${pages.map(p => p + 1).join(', ')}]`);
      this.processViewChannel();
    }
  }
  
  /**
   * Ahead 通道方向调度
   */
  private scheduleDirectionalAhead(
    centerIndex: number, startOffset: number, endOffset: number,
    priority: number, token: number, totalPages: number
  ): void {
    const pages = this.collectDirectionalPages(centerIndex, startOffset, endOffset, totalPages);
    for (const idx of pages) this.addAheadTask(idx, priority, token);
    if (pages.length > 0) {
      console.log(`📦 [Ahead] 方向预加载: [${pages.map(p => p + 1).join(', ')}]`);
      this.processAheadChannel();
    }
  }

  /**
   * BACKGROUND 通道方向调度 (仅 IO)
   */
  private scheduleDirectionalAheadIO(
    centerIndex: number, startOffset: number, endOffset: number,
    priority: number, token: number, totalPages: number
  ): void {
    const pages = this.collectDirectionalPages(centerIndex, startOffset, endOffset, totalPages);
    for (const idx of pages) this.addAheadTask(idx, priority, token, true); // IO 标记
    if (pages.length > 0) {
      console.log(`🌐 [Background-IO] 方向预取: [${pages.map(p => p + 1).join(', ')}]`);
      this.processAheadChannel();
    }
  }
  
  /** 收集方向感知页面（公用逻辑） */
  private collectDirectionalPages(
    centerIndex: number, startOffset: number, endOffset: number, totalPages: number
  ): number[] {
    const pagesToLoad: number[] = [];
    const primaryDirection = this.currentDirection;
    const primaryCount = endOffset;
    const secondaryCount = Math.max(1, Math.floor(endOffset / 2));
    
    for (let i = startOffset; i <= primaryCount; i++) {
      const idx = centerIndex + (i * primaryDirection);
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) pagesToLoad.push(idx);
    }
    for (let i = startOffset; i <= secondaryCount; i++) {
      const idx = centerIndex - (i * primaryDirection);
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) pagesToLoad.push(idx);
    }
    return [...new Set(pagesToLoad)];
  }
  
  /**
   * 处理 View 通道（当前页 ±1，串行，最高优先级）
   * 【优化 #1】View 始终可抢占 Ahead
   */
  private async processViewChannel(): Promise<void> {
    if (this.processingView) return;
    this.processingView = true;
    
    try {
      while (this.viewTasks.length > 0) {
        const task = this.viewTasks[0];
        
        if (task.token !== this.currentToken) {
          task.status = 'cancelled';
          this.viewTasks.shift();
          continue;
        }
        if (preDecodeCache.has(task.pageIndex)) {
          task.status = 'done';
          this.viewTasks.shift();
          continue;
        }
        
        task.status = 'loading';
        await this.loadAndPreDecode(task.pageIndex, task.token, this.activeAbortController?.signal);
        task.status = 'done';
        this.viewTasks.shift();
      }
    } finally {
      this.processingView = false;
    }
  }
  
  /**
   * 处理 Ahead 通道（预加载，支持并发解码窗口）
   * 【优化 #1】View 有新任务时，Ahead 让步
   * 【优化 #3】使用 CONCURRENT_DECODE_LIMIT 路并行解码
   */
  private async processAheadChannel(): Promise<void> {
    if (this.processingAhead) return;
    this.processingAhead = true;
    
    try {
      const activeDecodes = new Set<Promise<void>>();
      
      while (this.aheadTasks.length > 0) {
        // 【抢占检查】如果 View 通道有新任务，让步等待
        if (this.viewTasks.length > 0) {
          // 等待 View 通道清空
          await new Promise(resolve => setTimeout(resolve, 10));
          continue;
        }
        
        const task = this.aheadTasks[0];
        
        if (task.token !== this.currentToken) {
          task.status = 'cancelled';
          this.aheadTasks.shift();
          continue;
        }
        if (preDecodeCache.has(task.pageIndex)) {
          task.status = 'done';
          this.aheadTasks.shift();
          continue;
        }
        
        // 【并发窗口控制】如果活跃解码数达上限，等待一个完成
        if (activeDecodes.size >= this.CONCURRENT_DECODE_LIMIT) {
          await Promise.race(activeDecodes);
        }
        
        // 再次检查（等待期间可能有新的翻页）
        if (task.token !== this.currentToken) {
          task.status = 'cancelled';
          this.aheadTasks.shift();
          continue;
        }
        
        task.status = 'loading';
        this.aheadTasks.shift();
        
        const signal = this.activeAbortController?.signal;
        const taskFn = (task as any).ioOnly ? this.loadOnly.bind(this) : this.loadAndPreDecode.bind(this);
        
        const decodePromise = taskFn(task.pageIndex, task.token, signal)
          .then(() => { task.status = 'done'; })
          .catch(() => { task.status = 'cancelled'; })
          .finally(() => { activeDecodes.delete(decodePromise); });
        
        activeDecodes.add(decodePromise);
      }
      
      // 等待所有活跃解码完成
      if (activeDecodes.size > 0) {
        await Promise.allSettled(activeDecodes);
      }
    } finally {
      this.processingAhead = false;
    }
  }
  
  /**
   * 兼容旧接口：调度一个方向范围的页面预加载
   */
  private scheduleDirectionalRange(
    centerIndex: number,
    startOffset: number,
    endOffset: number,
    priority: number,
    token: number,
    totalPages: number
  ): void {
    // 根据优先级分派到不同通道
    if (priority >= RenderPriority.HIGH) {
      this.scheduleDirectionalView(centerIndex, startOffset, endOffset, priority, token, totalPages);
    } else {
      this.scheduleDirectionalAhead(centerIndex, startOffset, endOffset, priority, token, totalPages);
    }
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
    
    for (let i = startOffset; i <= endOffset; i++) {
      const idx = centerIndex + i;
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) pagesToLoad.push(idx);
    }
    for (let i = startOffset; i <= endOffset; i++) {
      const idx = centerIndex - i;
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) pagesToLoad.push(idx);
    }
    
    const uniquePages = [...new Set(pagesToLoad)];
    
    if (uniquePages.length > 0) {
      console.log(`📋 调度预解码: 优先级=${priority}, 页面=[${uniquePages.map(p => p + 1).join(', ')}]`);
    }
    
    for (const pageIndex of uniquePages) {
      if (priority >= RenderPriority.HIGH) {
        this.addViewTask(pageIndex, priority, token);
      } else {
        this.addAheadTask(pageIndex, priority, token);
      }
    }
    
    if (priority >= RenderPriority.HIGH) {
      this.processViewChannel();
    } else {
      this.processAheadChannel();
    }
  }
  
  /**
   * 添加任务到队列（兼容旧接口，内部分派到双通道）
   */
  private addTask(pageIndex: number, priority: number, token: number): void {
    if (priority >= RenderPriority.HIGH) {
      this.addViewTask(pageIndex, priority, token);
    } else {
      this.addAheadTask(pageIndex, priority, token);
    }
  }
  
  /**
   * 处理队列（兼容旧接口，启动双通道处理）
   */
  private processQueue(): void {
    if (this.viewTasks.length > 0) this.processViewChannel();
    if (this.aheadTasks.length > 0) this.processAheadChannel();
  }
  
  /**
   * 仅加载页面数据（IO 预取）
   * 不执行预解码，节省内存但加速后续访问
   */
  private async loadOnly(pageIndex: number, token: number, signal?: AbortSignal): Promise<void> {
    try {
      if (token !== this.currentToken || signal?.aborted) return;
      if (imagePool.has(pageIndex)) return;

      // 仅触发加载
      await imagePool.get(pageIndex, signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.warn(`IO 预取失败: 页码 ${pageIndex + 1}`, error);
    }
  }

  /**
   * 加载并预解码页面
   * 【优化 #2】支持 AbortSignal 取消进行中的加载
   * 参考 NeeView: CancellationToken 贯穿整个加载管线
   */
  private async loadAndPreDecode(pageIndex: number, token: number, signal?: AbortSignal): Promise<void> {
    try {
      // 检查令牌 + 取消信号
      if (token !== this.currentToken || signal?.aborted) {
        return;
      }
      
      // 从 imagePool 获取 URL
      const cached = imagePool.getSync(pageIndex);
      let url: string;
      
      if (cached) {
        url = cached.url;
      } else {
        // 加载前再次检查取消
        if (signal?.aborted || token !== this.currentToken) return;
        
        const result = await imagePool.get(pageIndex);
        if (!result) return;
        url = result.url;
      }
      
      // 加载后检查取消（NeeView 模式：IO 完成后仍检查 token）
      if (token !== this.currentToken || signal?.aborted) {
        return;
      }
      
      // 预解码
      await preDecodeCache.preDecodeAndCache(pageIndex, url);
    } catch (error) {
      // AbortError 静默处理
      if (error instanceof DOMException && error.name === 'AbortError') return;
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
    
    // 清除快速翻页恢复定时器
    this.clearRapidTurnRecoveryTimer();
    
    // 标记所有任务为已取消
    for (const task of this.tasks) {
      if (task.status === 'pending') {
        task.status = 'cancelled';
      }
    }
    
    // 取消进行中的 IO
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    
    // 清空队列
    this.viewTasks = [];
    this.aheadTasks = [];
  }
  
  /**
   * 获取队列状态
   */
  getStatus(): QueueStatus {
    return {
      currentPage: this.currentPageIndex,
      pendingCount: this.tasks.filter(t => t.status === 'pending').length,
      preDecodedCount: preDecodeCache.getStats().count,
      currentToken: this.currentToken,
    };
  }
  
  /**
   * 获取当前预加载配置
   */
  getConfig(): PreloadConfig {
    return { ...this.config };
  }
  
  /**
   * 更新配置
   */
  setConfig(config: Partial<PreloadConfig>): void {
    Object.assign(this.config, config);
    console.log('📋 [RenderQueue] 配置已更新', this.config);
  }
  
  /**
   * 获取快速翻页状态
   */
  getRapidTurnStatus(): { isRapidMode: boolean; count: number; direction: 1 | -1 } {
    return {
      isRapidMode: this.isRapidTurnMode,
      count: this.rapidTurnCount,
      direction: this.currentDirection,
    };
  }
  
  /**
   * 获取当前翻页方向
   * @returns 1: 向后, -1: 向前
   */
  getDirection(): 1 | -1 {
    return this.currentDirection;
  }
  
  /**
   * 获取预加载窗口范围
   * 返回当前配置下的预加载索引范围
   */
  getPreloadWindow(): { forward: number[]; backward: number[]; all: number[] } {
    const book = bookStore.currentBook;
    if (!book) return { forward: [], backward: [], all: [] };
    
    const totalPages = book.pages.length;
    const center = this.currentPageIndex;
    const forward: number[] = [];
    const backward: number[] = [];
    
    // 向前预加载
    for (let i = 1; i <= this.config.lowRange; i++) {
      const idx = center + i;
      if (idx < totalPages) forward.push(idx);
    }
    
    // 向后预加载
    for (let i = 1; i <= this.config.lowRange; i++) {
      const idx = center - i;
      if (idx >= 0) backward.push(idx);
    }
    
    return { forward, backward, all: [...backward.reverse(), ...forward] };
  }
  
  /**
   * 检查索引是否在预加载窗口内
   */
  isInPreloadWindow(pageIndex: number): boolean {
    const center = this.currentPageIndex;
    const distance = Math.abs(pageIndex - center);
    return distance <= this.config.lowRange;
  }
  
  /**
   * 获取索引的预加载优先级
   */
  getPreloadPriority(pageIndex: number): number {
    const center = this.currentPageIndex;
    const distance = Math.abs(pageIndex - center);
    
    if (distance === 0) return RenderPriority.CRITICAL;
    if (distance <= this.config.highRange) return RenderPriority.HIGH;
    if (distance <= this.config.normalRange) return RenderPriority.NORMAL;
    if (distance <= this.config.lowRange) return RenderPriority.LOW;
    return RenderPriority.BACKGROUND;
  }
  
  // ============================================================================
  // 递进加载功能
  // ============================================================================
  
  /**
   * 设置状态变更回调
   */
  setOnStateChange(callback: (() => void) | null): void {
    this.onStateChange = callback;
  }
  
  /**
   * 通知状态变更
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange();
    }
  }
  
  /**
   * 获取递进加载配置
   */
  getProgressiveConfig(): ProgressiveLoadConfig {
    return { ...this.progressiveConfig };
  }
  
  /**
   * 获取递进加载状态
   */
  getProgressiveState(): ProgressiveLoadState {
    return { ...this.progressiveState };
  }
  
  /**
   * 更新递进加载配置
   */
  setProgressiveConfig(config: Partial<ProgressiveLoadConfig>): void {
    const wasEnabled = this.progressiveConfig.enabled;
    Object.assign(this.progressiveConfig, config);
    console.log('📋 [RenderQueue] 递进加载配置已更新', this.progressiveConfig);
    
    // 如果启用状态变化，处理定时器
    if (config.enabled !== undefined) {
      if (config.enabled && !wasEnabled) {
        this.startProgressiveDwellTimer();
      } else if (!config.enabled && wasEnabled) {
        this.stopProgressiveDwellTimer();
      }
    }
    
    // 如果停留时间变化且已启用，重启定时器
    if (config.dwellTime !== undefined && this.progressiveConfig.enabled) {
      this.startProgressiveDwellTimer();
    }
    
    this.notifyStateChange();
  }
  
  /**
   * 启动递进加载停留计时器
   */
  startProgressiveDwellTimer(): void {
    this.stopProgressiveDwellTimer();
    if (!this.progressiveConfig.enabled) return;
    
    // 设置倒计时
    this.progressiveState.countdown = this.progressiveConfig.dwellTime;
    this.progressiveState.isTimerActive = true;
    this.notifyStateChange();
    
    // 每秒更新倒计时
    this.progressiveCountdownTimer = setInterval(() => {
      this.progressiveState.countdown = Math.max(0, this.progressiveState.countdown - 1);
      this.notifyStateChange();
    }, 1000);
    
    // 停留时间到后触发递进加载
    this.progressiveDwellTimer = setTimeout(() => {
      this.triggerProgressiveLoad();
    }, this.progressiveConfig.dwellTime * 1000);
  }
  
  /**
   * 停止递进加载停留计时器
   */
  stopProgressiveDwellTimer(): void {
    if (this.progressiveDwellTimer) {
      clearTimeout(this.progressiveDwellTimer);
      this.progressiveDwellTimer = null;
    }
    if (this.progressiveCountdownTimer) {
      clearInterval(this.progressiveCountdownTimer);
      this.progressiveCountdownTimer = null;
    }
    this.progressiveState.isTimerActive = false;
    this.progressiveState.countdown = 0;
    this.notifyStateChange();
  }
  
  /**
   * 触发递进加载
   */
  async triggerProgressiveLoad(): Promise<void> {
    if (!this.progressiveConfig.enabled) return;
    
    // 停止倒计时
    if (this.progressiveCountdownTimer) {
      clearInterval(this.progressiveCountdownTimer);
      this.progressiveCountdownTimer = null;
    }
    
    this.progressiveState.isRunning = true;
    this.progressiveState.countdown = 0;
    this.notifyStateChange();
    
    const book = bookStore.currentBook;
    if (!book) {
      this.progressiveState.isRunning = false;
      this.progressiveState.isTimerActive = false;
      this.notifyStateChange();
      return;
    }
    
    const totalPages = book.pages.length;
    const maxPages = this.progressiveConfig.maxPages === 999 ? totalPages : this.progressiveConfig.maxPages;
    const batchSize = this.progressiveConfig.batchSize;
    
    // 计算起始位置：从当前预加载窗口之后开始
    const startIndex = this.currentPageIndex + this.config.lowRange + 1;
    const endIndex = Math.min(startIndex + batchSize, this.currentPageIndex + maxPages, totalPages);
    
    console.log(`📈 [RenderQueue] 递进加载触发: 当前页 ${this.currentPageIndex + 1}, 范围 ${startIndex + 1}-${endIndex}`);
    
    // 递进加载
    for (let i = startIndex; i < endIndex; i++) {
      if (!preDecodeCache.has(i)) {
        await this.loadAndPreDecode(i, this.currentToken);
        this.progressiveState.furthestLoadedIndex = Math.max(this.progressiveState.furthestLoadedIndex, i);
        this.notifyStateChange();
      }
    }
    
    this.progressiveState.isRunning = false;
    this.progressiveState.isTimerActive = false;
    this.notifyStateChange();
    
    console.log(`✅ [RenderQueue] 递进加载完成: 最远页 ${this.progressiveState.furthestLoadedIndex + 1}`);
  }
  
  /**
   * 重置递进加载状态（切换页面时调用）
   */
  resetProgressiveState(): void {
    this.progressiveState.furthestLoadedIndex = -1;
    if (this.progressiveConfig.enabled) {
      this.startProgressiveDwellTimer();
    }
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const renderQueue = new RenderQueue();

// 导出配置预设
export { DEFAULT_PRELOAD_CONFIG, LOW_END_PRELOAD_CONFIG, HIGH_END_PRELOAD_CONFIG, DEFAULT_PROGRESSIVE_CONFIG };
