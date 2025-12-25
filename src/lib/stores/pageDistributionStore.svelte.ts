/**
 * PageDistributionStore - 页面分布状态管理
 * 
 * 使用预计算的页面分布，提供 O(1) 翻页查询
 * 参考 OpenComic 的 imagesDistribution 实现
 * 
 * 核心优势：
 * 1. 翻页时直接查表，无需重新计算
 * 2. 支持双页模式下的横向图独占
 * 3. 支持首页/尾页单独显示
 * 4. 支持空白页对齐
 */

import {
  PageDistributionManager,
  type DistributionConfig,
  type FrameDistribution,
  type PhysicalPage,
  type Size,
  defaultDistributionConfig,
} from '$lib/core/pageDistribution';
import { bookStore } from './book.svelte';
import { settingsManager } from '$lib/settings/settingsManager';

// ============================================================================
// 类型定义
// ============================================================================

export interface PageDistributionState {
  /** 是否已初始化 */
  initialized: boolean;
  /** 帧总数 */
  frameCount: number;
  /** 当前帧索引 */
  currentFrameIndex: number;
  /** 当前帧数据 */
  currentFrame: FrameDistribution | null;
  /** 配置 */
  config: DistributionConfig;
}

// ============================================================================
// Store 实现
// ============================================================================

class PageDistributionStore {
  private _manager: PageDistributionManager;
  private _state = $state<PageDistributionState>({
    initialized: false,
    frameCount: 0,
    currentFrameIndex: 0,
    currentFrame: null,
    config: defaultDistributionConfig,
  });

  constructor() {
    this._manager = new PageDistributionManager();
  }

  // ============================================================================
  // 公共属性
  // ============================================================================

  get state(): PageDistributionState {
    return this._state;
  }

  get frameCount(): number {
    return this._manager.frameCount;
  }

  get currentFrameIndex(): number {
    return this._state.currentFrameIndex;
  }

  get currentFrame(): FrameDistribution | null {
    return this._state.currentFrame;
  }

  get distribution(): FrameDistribution[] {
    return this._manager.distribution;
  }

  // ============================================================================
  // 初始化
  // ============================================================================

  /**
   * 从 bookStore 初始化页面分布
   */
  initialize(): void {
    const book = bookStore.currentBook;
    if (!book || !book.pages || book.pages.length === 0) {
      this.reset();
      return;
    }

    // 从 bookStore.pages 构建 PhysicalPage 列表
    const physicalPages: PhysicalPage[] = book.pages.map((page, index) => ({
      index,
      path: page.path,
      entryName: page.name || page.innerPath || '',
      size: {
        width: page.width ?? 0,
        height: page.height ?? 0,
      },
      aspectRatio: (page.height ?? 0) > 0 
        ? (page.width ?? 0) / (page.height ?? 1) 
        : 1,
      isLandscape: (page.width ?? 0) > (page.height ?? 0),
      lastModified: 0,
      fileSize: 0,
      pageType: 'image' as const,
      isDeleted: false,
    }));

    // 从设置获取配置
    const settings = settingsManager.getSettings();
    const config = this.buildConfigFromSettings(settings);

    // 设置页面和配置
    this._manager.setConfig(config);
    this._manager.setPages(physicalPages);

    // 更新状态
    this._state.initialized = true;
    this._state.frameCount = this._manager.frameCount;
    this._state.config = this._manager.config;

    // 设置当前帧
    this.goToPage(bookStore.currentPageIndex);
  }

  /**
   * 从设置构建配置
   */
  private buildConfigFromSettings(settings: ReturnType<typeof settingsManager.getSettings>): Partial<DistributionConfig> {
    const pageLayout = settings.view.pageLayout;
    const readingDirection = settings.book.readingDirection;

    return {
      doublePage: false, // 由外部控制
      doNotApplyToHorizontals: pageLayout?.treatHorizontalAsDoublePage ?? true,
      alignWithNextHorizontal: false, // 暂不支持
      blankFirstPage: false, // 暂不支持
      singleFirstPage: pageLayout?.singleFirstPageMode === 'default',
      singleLastPage: pageLayout?.singleLastPageMode === 'continue',
      readOrder: readingDirection === 'right-to-left' ? 'rtl' : 'ltr',
      landscapeThreshold: 1.0,
    };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this._manager = new PageDistributionManager();
    this._state = {
      initialized: false,
      frameCount: 0,
      currentFrameIndex: 0,
      currentFrame: null,
      config: defaultDistributionConfig,
    };
  }

  // ============================================================================
  // 配置更新
  // ============================================================================

  /**
   * 设置双页模式
   */
  setDoublePage(enabled: boolean): void {
    this._manager.setConfig({ doublePage: enabled });
    this._state.frameCount = this._manager.frameCount;
    this._state.config = this._manager.config;
    
    // 重新定位当前帧
    this.goToPage(bookStore.currentPageIndex);
  }

  /**
   * 设置阅读方向
   */
  setReadOrder(order: 'ltr' | 'rtl'): void {
    this._manager.setConfig({ readOrder: order });
    this._state.config = this._manager.config;
  }

  /**
   * 设置横向图独占
   */
  setDoNotApplyToHorizontals(enabled: boolean): void {
    this._manager.setConfig({ doNotApplyToHorizontals: enabled });
    this._state.frameCount = this._manager.frameCount;
    this._state.config = this._manager.config;
    
    // 重新定位当前帧
    this.goToPage(bookStore.currentPageIndex);
  }

  /**
   * 更新页面尺寸
   * 当异步加载图片后获取到真实尺寸时调用
   */
  updatePageSize(pageIndex: number, size: Size): void {
    const needsRebuild = this._manager.updatePageSize(pageIndex, size);
    if (needsRebuild) {
      this._state.frameCount = this._manager.frameCount;
      // 重新定位当前帧
      this.goToPage(bookStore.currentPageIndex);
    }
  }

  // ============================================================================
  // 导航
  // ============================================================================

  /**
   * 根据物理页面索引跳转到对应帧
   * O(1) 查表
   */
  goToPage(pageIndex: number): void {
    const frameIndex = this._manager.getFrameIndexByPage(pageIndex);
    if (frameIndex >= 0) {
      this._state.currentFrameIndex = frameIndex;
      this._state.currentFrame = this._manager.getFrame(frameIndex);
    }
  }

  /**
   * 跳转到指定帧
   */
  goToFrame(frameIndex: number): void {
    const frame = this._manager.getFrame(frameIndex);
    if (frame) {
      this._state.currentFrameIndex = frameIndex;
      this._state.currentFrame = frame;
    }
  }

  /**
   * 下一帧
   * @returns 是否成功翻页
   */
  nextFrame(): boolean {
    const nextIndex = this._manager.getNextFrameIndex(this._state.currentFrameIndex);
    if (nextIndex >= 0) {
      this._state.currentFrameIndex = nextIndex;
      this._state.currentFrame = this._manager.getFrame(nextIndex);
      return true;
    }
    return false;
  }

  /**
   * 上一帧
   * @returns 是否成功翻页
   */
  prevFrame(): boolean {
    const prevIndex = this._manager.getPrevFrameIndex(this._state.currentFrameIndex);
    if (prevIndex >= 0) {
      this._state.currentFrameIndex = prevIndex;
      this._state.currentFrame = this._manager.getFrame(prevIndex);
      return true;
    }
    return false;
  }

  /**
   * 跳转到首帧
   */
  goToFirst(): void {
    this.goToFrame(0);
  }

  /**
   * 跳转到尾帧
   */
  goToLast(): void {
    this.goToFrame(this._manager.frameCount - 1);
  }

  // ============================================================================
  // 查询
  // ============================================================================

  /**
   * 根据物理页面索引获取帧索引
   * O(1) 查表
   */
  getFrameIndexByPage(pageIndex: number): number {
    return this._manager.getFrameIndexByPage(pageIndex);
  }

  /**
   * 根据帧索引获取物理页面索引列表
   * O(1) 查表
   */
  getPageIndicesByFrame(frameIndex: number): number[] {
    return this._manager.getPageIndicesByFrame(frameIndex);
  }

  /**
   * 获取帧数据
   * O(1) 查表
   */
  getFrame(frameIndex: number): FrameDistribution | null {
    return this._manager.getFrame(frameIndex);
  }

  /**
   * 获取当前帧的翻页步进（跳过的物理页数）
   */
  getCurrentFrameStep(): number {
    return this._manager.getFrameStep(this._state.currentFrameIndex);
  }

  /**
   * 获取当前帧包含的物理页面索引
   */
  getCurrentPageIndices(): number[] {
    return this._manager.getPageIndicesByFrame(this._state.currentFrameIndex);
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const pageDistributionStore = new PageDistributionStore();
