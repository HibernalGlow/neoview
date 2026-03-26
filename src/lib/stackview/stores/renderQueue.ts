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
  enabled: false,
  dwellTime: 3,
  batchSize: 5,
  maxPages: 50,
};

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
        // 根据用户设置的预加载大小调整范围
        // preLoadSize 表示总预加载数，按比例分配到各优先级
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
      
      // 根据系统能力选择预设配置
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
   * @param pageIndex 当前页面索引
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
      // 翻页速度减慢，重置计数
      this.rapidTurnCount = 0;
    }
    
    // 取消之前的任务
    this.cancelAll();
    
    // 更新当前页面
    this.currentPageIndex = pageIndex;
    this.currentToken++;
    const token = this.currentToken;
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    const totalPages = book.pages.length;
    
    // 快速翻页模式：不仅加载当前页，预加载方向上的 1 页以防止白屏
    if (this.isRapidTurnMode) {
      console.log(`⚡ [RenderQueue] 快速翻页模式: 加载页 ${pageIndex + 1} + 预测预加载方向 ${this.currentDirection > 0 ? '→' : '←'}`);
      
      // 1. 加载当前页
      if (!preDecodeCache.has(pageIndex)) {
        await this.loadAndPreDecode(pageIndex, token);
      }

      // 2. 加载方向预测的下一页 (1页)
      const nextIdx = pageIndex + this.currentDirection;
      if (nextIdx >= 0 && nextIdx < totalPages && !preDecodeCache.has(nextIdx)) {
        this.addTask(nextIdx, RenderPriority.HIGH, token);
        this.processQueue();
      }
      
      // 设置恢复定时器：停止翻页后 500ms 恢复正常预加载
      this.clearRapidTurnRecoveryTimer();
      this.rapidTurnRecoveryTimer = setTimeout(() => {
        console.log(`✅ [RenderQueue] 退出快速翻页模式，恢复正常预加载`);
        this.isRapidTurnMode = false;
        this.rapidTurnCount = 0;
        // 恢复正常预加载
        this.scheduleNormalPreload(this.currentPageIndex, token, totalPages);
        // 重置递进加载状态
        this.resetProgressiveState();
      }, 500);
      
      return;
    }
    
    console.log(`📋 渲染队列: 设置当前页 ${pageIndex + 1}/${totalPages} (方向: ${this.currentDirection > 0 ? '→' : '←'})`);
    
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
   */
  private async scheduleNormalPreload(
    pageIndex: number, 
    token: number, 
    totalPages: number
  ): Promise<void> {
    // 1. 立即加载当前页（如果未预解码）
    if (!preDecodeCache.has(pageIndex)) {
      await this.loadAndPreDecode(pageIndex, token);
    }
    
    // 3. 延迟加载高优先级页面（主方向 ±1 页）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleDirectionalRange(pageIndex, 1, this.config.highRange, RenderPriority.HIGH, token, totalPages);
    }, this.config.highDelay));
    
    // 4. 延迟加载普通优先级页面（±2-3 页）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleDirectionalRange(pageIndex, this.config.highRange + 1, this.config.normalRange, RenderPriority.NORMAL, token, totalPages);
    }, this.config.normalDelay));
    
    // 5. 延迟加载低优先级页面（±4-5 页）
    this.delayTimers.push(setTimeout(() => {
      if (token !== this.currentToken) return;
      this.scheduleDirectionalRange(pageIndex, this.config.normalRange + 1, this.config.lowRange, RenderPriority.LOW, token, totalPages);
    }, this.config.lowDelay));
  }
  
  /**
   * 基于翻页方向的智能预加载调度
   * 主方向（currentDirection）加载更多页面，反方向加载较少
   */
  private scheduleDirectionalRange(
    centerIndex: number,
    startOffset: number,
    endOffset: number,
    priority: number,
    token: number,
    totalPages: number
  ): void {
    const pagesToLoad: number[] = [];
    
    // 主方向（翻页方向）加载更多
    const primaryDirection = this.currentDirection;
    const primaryCount = endOffset; // 主方向加载完整范围
    const secondaryCount = Math.max(1, Math.floor(endOffset / 2)); // 反方向加载一半
    
    // 主方向页面
    for (let i = startOffset; i <= primaryCount; i++) {
      const idx = centerIndex + (i * primaryDirection);
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) {
        pagesToLoad.push(idx);
      }
    }
    
    // 反方向页面（数量减半）
    for (let i = startOffset; i <= secondaryCount; i++) {
      const idx = centerIndex - (i * primaryDirection);
      if (idx >= 0 && idx < totalPages && !preDecodeCache.has(idx)) {
        pagesToLoad.push(idx);
      }
    }
    
    // 去重
    const uniquePages = [...new Set(pagesToLoad)];
    
    if (uniquePages.length > 0) {
      console.log(`📋 方向感知预加载: 优先级=${priority}, 方向=${primaryDirection > 0 ? '→' : '←'}, 页面=[${uniquePages.map(p => p + 1).join(', ')}]`);
    }
    
    // 添加到队列
    for (const idx of uniquePages) {
      this.addTask(idx, priority, token);
    }
    
    // 处理队列
    this.processQueue();
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
    
    // 清除快速翻页恢复定时器
    this.clearRapidTurnRecoveryTimer();
    
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
