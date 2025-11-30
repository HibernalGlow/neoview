/**
 * BookContext - 书本上下文状态管理
 * 
 * 复刻 NeeView 的 BookContext/PageFrameContext 架构
 * 提供书本级别的状态管理，支持：
 * - 每本书独立的视图状态
 * - 书本级别的记忆（页码、缩放等）
 * - 统一的状态访问接口
 */

import { SvelteMap } from 'svelte/reactivity';

// ============================================================================
// 类型定义
// ============================================================================

/** 页面模式 */
export type PageMode = 'single' | 'double';

/** 布局方向 */
export type Orientation = 'horizontal' | 'vertical';

/** 阅读方向 */
export type Direction = 'ltr' | 'rtl';

/** 书本视图状态 */
export interface BookViewState {
  /** 当前页码 */
  currentPage: number;
  /** 页面模式 */
  pageMode: PageMode;
  /** 全景模式 */
  panoramaEnabled: boolean;
  /** 布局方向 */
  orientation: Orientation;
  /** 缩放级别 */
  zoomLevel: number;
  /** 旋转角度 */
  rotation: number;
}

/** 书本记忆数据（用于持久化） */
export interface BookMemory {
  /** 最后阅读页码 */
  lastPage: number;
  /** 最后使用的视图设置 */
  viewState?: Partial<BookViewState>;
  /** 最后阅读时间 */
  lastReadTime: number;
}

// ============================================================================
// 默认值
// ============================================================================

const DEFAULT_VIEW_STATE: BookViewState = {
  currentPage: 0,
  pageMode: 'single',
  panoramaEnabled: false,
  orientation: 'horizontal',
  zoomLevel: 1,
  rotation: 0,
};

// ============================================================================
// BookContext 类
// ============================================================================

export class BookContext {
  /** 书本路径（唯一标识） */
  readonly path: string;
  
  /** 书本总页数 */
  totalPages: number = 0;
  
  /** 视图状态 */
  private _viewState = $state<BookViewState>({ ...DEFAULT_VIEW_STATE });
  
  /** 是否已加载记忆 */
  private _memoryLoaded = false;
  
  constructor(path: string, totalPages: number = 0) {
    this.path = path;
    this.totalPages = totalPages;
  }
  
  // ============================================================================
  // Getters
  // ============================================================================
  
  get viewState(): BookViewState {
    return this._viewState;
  }
  
  get currentPage(): number {
    return this._viewState.currentPage;
  }
  
  get pageMode(): PageMode {
    return this._viewState.pageMode;
  }
  
  get panoramaEnabled(): boolean {
    return this._viewState.panoramaEnabled;
  }
  
  get orientation(): Orientation {
    return this._viewState.orientation;
  }
  
  get zoomLevel(): number {
    return this._viewState.zoomLevel;
  }
  
  get rotation(): number {
    return this._viewState.rotation;
  }
  
  /** 翻页步进 */
  get pageStep(): number {
    return this._viewState.pageMode === 'double' ? 2 : 1;
  }
  
  // ============================================================================
  // Setters
  // ============================================================================
  
  setCurrentPage(page: number) {
    this._viewState.currentPage = Math.max(0, Math.min(page, this.totalPages - 1));
  }
  
  setPageMode(mode: PageMode) {
    this._viewState.pageMode = mode;
  }
  
  setPanoramaEnabled(enabled: boolean) {
    this._viewState.panoramaEnabled = enabled;
  }
  
  setOrientation(orientation: Orientation) {
    this._viewState.orientation = orientation;
  }
  
  setZoomLevel(level: number) {
    this._viewState.zoomLevel = level;
  }
  
  setRotation(rotation: number) {
    this._viewState.rotation = rotation;
  }
  
  // ============================================================================
  // Toggle 方法
  // ============================================================================
  
  togglePageMode() {
    this._viewState.pageMode = this._viewState.pageMode === 'single' ? 'double' : 'single';
  }
  
  togglePanorama() {
    this._viewState.panoramaEnabled = !this._viewState.panoramaEnabled;
  }
  
  toggleOrientation() {
    this._viewState.orientation = this._viewState.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  }
  
  // ============================================================================
  // 导航方法
  // ============================================================================
  
  nextPage(): boolean {
    const step = this.pageStep;
    const newPage = this._viewState.currentPage + step;
    if (newPage < this.totalPages) {
      this._viewState.currentPage = newPage;
      return true;
    }
    return false;
  }
  
  prevPage(): boolean {
    const step = this.pageStep;
    const newPage = this._viewState.currentPage - step;
    if (newPage >= 0) {
      this._viewState.currentPage = newPage;
      return true;
    }
    return false;
  }
  
  goToPage(page: number): boolean {
    if (page >= 0 && page < this.totalPages) {
      this._viewState.currentPage = page;
      return true;
    }
    return false;
  }
  
  // ============================================================================
  // 记忆接口（为持久化预留）
  // ============================================================================
  
  /** 获取记忆数据 */
  getMemory(): BookMemory {
    return {
      lastPage: this._viewState.currentPage,
      viewState: {
        pageMode: this._viewState.pageMode,
        panoramaEnabled: this._viewState.panoramaEnabled,
        orientation: this._viewState.orientation,
        zoomLevel: this._viewState.zoomLevel,
        rotation: this._viewState.rotation,
      },
      lastReadTime: Date.now(),
    };
  }
  
  /** 恢复记忆数据 */
  restoreMemory(memory: BookMemory) {
    this._viewState.currentPage = memory.lastPage;
    if (memory.viewState) {
      if (memory.viewState.pageMode) this._viewState.pageMode = memory.viewState.pageMode;
      if (memory.viewState.panoramaEnabled !== undefined) this._viewState.panoramaEnabled = memory.viewState.panoramaEnabled;
      if (memory.viewState.orientation) this._viewState.orientation = memory.viewState.orientation;
      if (memory.viewState.zoomLevel !== undefined) this._viewState.zoomLevel = memory.viewState.zoomLevel;
      if (memory.viewState.rotation !== undefined) this._viewState.rotation = memory.viewState.rotation;
    }
    this._memoryLoaded = true;
  }
  
  /** 重置为默认状态 */
  reset() {
    this._viewState = { ...DEFAULT_VIEW_STATE };
    this._memoryLoaded = false;
  }
}

// ============================================================================
// BookContextManager - 管理多本书的上下文
// ============================================================================

class BookContextManager {
  /** 书本上下文缓存 */
  private contexts = new SvelteMap<string, BookContext>();
  
  /** 当前活动的书本路径 */
  private _currentPath = $state<string | null>(null);
  
  /** 最大缓存数量 */
  private maxCacheSize = 10;
  
  // ============================================================================
  // 当前上下文
  // ============================================================================
  
  get currentPath(): string | null {
    return this._currentPath;
  }
  
  get current(): BookContext | null {
    if (!this._currentPath) return null;
    return this.contexts.get(this._currentPath) ?? null;
  }
  
  // ============================================================================
  // 上下文管理
  // ============================================================================
  
  /**
   * 获取或创建书本上下文
   */
  getOrCreate(path: string, totalPages: number = 0): BookContext {
    let context = this.contexts.get(path);
    if (!context) {
      context = new BookContext(path, totalPages);
      this.contexts.set(path, context);
      this.trimCache();
    } else if (totalPages > 0 && context.totalPages !== totalPages) {
      context.totalPages = totalPages;
    }
    return context;
  }
  
  /**
   * 设置当前活动书本
   */
  setCurrent(path: string, totalPages: number = 0): BookContext {
    const context = this.getOrCreate(path, totalPages);
    this._currentPath = path;
    return context;
  }
  
  /**
   * 清除当前书本
   */
  clearCurrent() {
    this._currentPath = null;
  }
  
  /**
   * 获取书本上下文（不创建）
   */
  get(path: string): BookContext | undefined {
    return this.contexts.get(path);
  }
  
  /**
   * 检查是否有缓存
   */
  has(path: string): boolean {
    return this.contexts.has(path);
  }
  
  /**
   * 移除书本上下文
   */
  remove(path: string) {
    this.contexts.delete(path);
    if (this._currentPath === path) {
      this._currentPath = null;
    }
  }
  
  /**
   * 清除所有缓存
   */
  clear() {
    this.contexts.clear();
    this._currentPath = null;
  }
  
  /**
   * 限制缓存大小
   */
  private trimCache() {
    if (this.contexts.size <= this.maxCacheSize) return;
    
    // 移除最早的（除了当前的）
    const keys = Array.from(this.contexts.keys());
    for (const key of keys) {
      if (key !== this._currentPath && this.contexts.size > this.maxCacheSize) {
        this.contexts.delete(key);
      }
    }
  }
  
  // ============================================================================
  // 记忆接口（为持久化预留）
  // ============================================================================
  
  /** 导出所有记忆 */
  exportMemories(): Record<string, BookMemory> {
    const memories: Record<string, BookMemory> = {};
    for (const [path, context] of this.contexts) {
      memories[path] = context.getMemory();
    }
    return memories;
  }
  
  /** 导入记忆 */
  importMemory(path: string, memory: BookMemory) {
    const context = this.getOrCreate(path);
    context.restoreMemory(memory);
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const bookContextManager = new BookContextManager();

// 便捷访问当前上下文
export function getCurrentBookContext(): BookContext | null {
  return bookContextManager.current;
}
