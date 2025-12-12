/**
 * Preloader - 智能预加载器
 * 
 * 基于用户行为预测，提前加载即将显示的内容
 * 支持方向检测、快速翻页取消、优先级管理
 * 
 * Requirements: 1.1, 1.2, 1.5
 */

import { imagePool } from './imagePool';
import { getAdaptiveConfig } from '$lib/utils/systemCapabilities';

export interface PreloaderConfig {
  preloadAhead: number;
  preloadBehind: number;
  maxConcurrent: number;
}

export type NavigationDirection = 'forward' | 'backward' | 'unknown';

const DEFAULT_CONFIG: PreloaderConfig = {
  preloadAhead: 3,
  preloadBehind: 1,
  maxConcurrent: 2,
};

class PreloaderImpl {
  private config: PreloaderConfig = { ...DEFAULT_CONFIG };
  private currentPage: number = 0;
  private totalPages: number = 0;
  private direction: NavigationDirection = 'unknown';
  private lastNavigationTime: number = 0;
  private pendingPages: Set<number> = new Set();
  private getPageKey: ((pageIndex: number) => string) | null = null;

  /**
   * 初始化配置
   */
  async init(): Promise<void> {
    const adaptiveConfig = await getAdaptiveConfig();
    this.config = {
      preloadAhead: adaptiveConfig.preloadAhead,
      preloadBehind: adaptiveConfig.preloadBehind,
      maxConcurrent: adaptiveConfig.maxConcurrentLoads,
    };
    console.log('⚡ [Preloader] Initialized with config:', this.config);
  }

  /**
   * 设置页面键生成函数
   */
  setPageKeyFn(fn: (pageIndex: number) => string): void {
    this.getPageKey = fn;
  }

  /**
   * 设置总页数
   */
  setTotalPages(total: number): void {
    this.totalPages = total;
    this.pendingPages.clear();
  }

  /**
   * 计算需要预加载的页面
   */
  calculatePreloadPages(
    currentPage: number,
    totalPages: number,
    direction: NavigationDirection
  ): number[] {
    const pages: number[] = [];

    // 根据方向调整预加载范围
    let ahead = this.config.preloadAhead;
    let behind = this.config.preloadBehind;

    if (direction === 'forward') {
      ahead = this.config.preloadAhead + 1;
      behind = Math.max(0, this.config.preloadBehind - 1);
    } else if (direction === 'backward') {
      ahead = Math.max(0, this.config.preloadAhead - 1);
      behind = this.config.preloadBehind + 1;
    }

    // 添加前方页面（优先级更高）
    for (let i = 1; i <= ahead; i++) {
      const page = currentPage + i;
      if (page < totalPages) {
        pages.push(page);
      }
    }

    // 添加后方页面
    for (let i = 1; i <= behind; i++) {
      const page = currentPage - i;
      if (page >= 0) {
        pages.push(page);
      }
    }

    return pages;
  }

  /**
   * 更新预加载队列
   */
  updateQueue(currentPage: number): void {
    if (!this.getPageKey) {
      console.warn('[Preloader] No page key function set');
      return;
    }

    // 检测方向
    const now = Date.now();
    if (now - this.lastNavigationTime < 500) {
      // 快速翻页，更新方向
      if (currentPage > this.currentPage) {
        this.direction = 'forward';
      } else if (currentPage < this.currentPage) {
        this.direction = 'backward';
      }
    } else {
      this.direction = 'unknown';
    }
    this.lastNavigationTime = now;

    // 计算需要预加载的页面
    const pagesToPreload = this.calculatePreloadPages(
      currentPage,
      this.totalPages,
      this.direction
    );

    // 取消不再需要的预加载
    const pagesToCancel: string[] = [];
    for (const page of this.pendingPages) {
      if (!pagesToPreload.includes(page) && page !== currentPage) {
        pagesToCancel.push(this.getPageKey(page));
        this.pendingPages.delete(page);
      }
    }
    if (pagesToCancel.length > 0) {
      imagePool.cancelPreload(pagesToCancel);
    }

    // 添加新的预加载
    const keysToPreload: string[] = [];
    for (const page of pagesToPreload) {
      if (!this.pendingPages.has(page)) {
        keysToPreload.push(this.getPageKey(page));
        this.pendingPages.add(page);
      }
    }

    if (keysToPreload.length > 0) {
      // 前方页面用 normal 优先级，后方用 low
      const forwardKeys = keysToPreload.slice(0, this.config.preloadAhead);
      const backwardKeys = keysToPreload.slice(this.config.preloadAhead);

      if (forwardKeys.length > 0) {
        imagePool.preload(forwardKeys, 'normal');
      }
      if (backwardKeys.length > 0) {
        imagePool.preload(backwardKeys, 'low');
      }
    }

    this.currentPage = currentPage;
  }

  /**
   * 取消跳过的页面预加载
   */
  cancelSkipped(fromPage: number, toPage: number): void {
    if (!this.getPageKey) return;

    const keysToCancel: string[] = [];
    const min = Math.min(fromPage, toPage);
    const max = Math.max(fromPage, toPage);

    for (let page = min + 1; page < max; page++) {
      if (this.pendingPages.has(page)) {
        keysToCancel.push(this.getPageKey(page));
        this.pendingPages.delete(page);
      }
    }

    if (keysToCancel.length > 0) {
      imagePool.cancelPreload(keysToCancel);
      console.log(`⚡ [Preloader] Cancelled ${keysToCancel.length} skipped pages`);
    }
  }

  /**
   * 处理快速翻页
   */
  handleRapidNavigation(fromPage: number, toPage: number): void {
    // 如果跳过了多个页面，取消中间页面的预加载
    const skipped = Math.abs(toPage - fromPage);
    if (skipped > 1) {
      this.cancelSkipped(fromPage, toPage);
    }

    // 更新队列
    this.updateQueue(toPage);
  }

  /**
   * 清除所有预加载
   */
  clear(): void {
    if (this.getPageKey) {
      const keysToCancel = Array.from(this.pendingPages).map(p => this.getPageKey!(p));
      imagePool.cancelPreload(keysToCancel);
    }
    this.pendingPages.clear();
    this.direction = 'unknown';
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    currentPage: number;
    totalPages: number;
    direction: NavigationDirection;
    pendingCount: number;
  } {
    return {
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      direction: this.direction,
      pendingCount: this.pendingPages.size,
    };
  }
}

// 单例导出
export const preloader = new PreloaderImpl();
