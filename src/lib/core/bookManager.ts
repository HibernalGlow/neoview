/**
 * BookManager - 书籍管理器
 * 
 * 整合 VirtualPageList, PageFrameManager, PreloadPipeline 的高层接口
 * 提供统一的书籍操作 API
 * 
 * 参考 NeeView 的 Book 和 BookContext
 */

import { VirtualPageList, createPhysicalPagesFromFiles } from './virtualPageList';
import type { SortMode } from './virtualPageList';
import { PageFrameManager } from './pageFrameManager';
import { PreloadPipeline } from './preloadPipeline';
import type { ImageLoadFunction, ThumbnailLoadFunction, UpscaleFunction } from './preloadPipeline';
import type {
  PhysicalPage,
  VirtualPage,
  PageFrame,
  VirtualPageListConfig,
  PageFrameConfig,
  PreloadConfig,
  PagePosition,
} from './types';
import {
  defaultVirtualPageListConfig,
  defaultPageFrameConfig,
  defaultPreloadConfig,
  getPageRangeNext,
} from './types';

// ============================================================================
// 类型定义
// ============================================================================

export interface BookInfo {
  /** 书籍路径 */
  path: string;
  /** 书籍名称 */
  name: string;
  /** 是否为压缩包 */
  isArchive: boolean;
  /** 物理页面数 */
  physicalPageCount: number;
  /** 虚拟页面数 */
  virtualPageCount: number;
  /** 当前虚拟页面索引 */
  currentIndex: number;
  /** 当前帧 */
  currentFrame: PageFrame | null;
}

export interface BookManagerConfig {
  virtualPageList: Partial<VirtualPageListConfig>;
  pageFrame: Partial<PageFrameConfig>;
  preload: Partial<PreloadConfig>;
}

export interface BookManagerEvents {
  onBookOpen?: (info: BookInfo) => void;
  onBookClose?: () => void;
  onPageChange?: (index: number, frame: PageFrame | null) => void;
  onPagesRebuilt?: () => void;
  onLoadProgress?: (loaded: number, total: number) => void;
}

// ============================================================================
// BookManager
// ============================================================================

export class BookManager {
  // 核心组件
  private _virtualPageList: VirtualPageList;
  private _pageFrameManager: PageFrameManager;
  private _preloadPipeline: PreloadPipeline;

  // 状态
  private _bookPath: string = '';
  private _bookName: string = '';
  private _isArchive: boolean = false;
  private _currentIndex: number = 0;
  private _currentFrame: PageFrame | null = null;
  private _direction: 1 | -1 = 1;

  // 事件
  private _events: BookManagerEvents = {};

  // 配置
  private _config: BookManagerConfig;

  constructor(config: Partial<BookManagerConfig> = {}) {
    this._config = {
      virtualPageList: { ...defaultVirtualPageListConfig, ...config.virtualPageList },
      pageFrame: { ...defaultPageFrameConfig, ...config.pageFrame },
      preload: { ...defaultPreloadConfig, ...config.preload },
    };

    // 初始化组件
    this._virtualPageList = new VirtualPageList(this._config.virtualPageList);
    this._pageFrameManager = new PageFrameManager(this._virtualPageList, this._config.pageFrame);
    this._preloadPipeline = new PreloadPipeline(this._config.preload);

    // 设置事件
    this._virtualPageList.setEvents({
      onRebuild: () => this.onPagesRebuilt(),
    });

    this._preloadPipeline.setVirtualPageList(this._virtualPageList);
  }

  // ============================================================================
  // 配置
  // ============================================================================

  setEvents(events: BookManagerEvents): void {
    this._events = events;
  }

  setLoadFunctions(
    loadImage: ImageLoadFunction,
    loadThumbnail: ThumbnailLoadFunction,
    upscaleImage?: UpscaleFunction
  ): void {
    this._preloadPipeline.setLoadFunctions(loadImage, loadThumbnail, upscaleImage);
  }

  // ============================================================================
  // 书籍操作
  // ============================================================================

  /**
   * 打开书籍
   */
  async openBook(
    path: string,
    files: Array<{
      path: string;
      name: string;
      size: number;
      lastModified: number;
      width?: number;
      height?: number;
    }>,
    options: {
      isArchive?: boolean;
      startIndex?: number;
    } = {}
  ): Promise<void> {
    // 关闭当前书籍
    this.closeBook();

    // 设置书籍信息
    this._bookPath = path;
    this._bookName = this.extractBookName(path);
    this._isArchive = options.isArchive ?? path.match(/\.(zip|rar|7z|cbz|cbr)$/i) !== null;

    // 创建物理页面
    const physicalPages = createPhysicalPagesFromFiles(files);
    this._virtualPageList.setPhysicalPages(physicalPages);

    // 设置起始位置
    const startIndex = options.startIndex ?? 0;
    this._currentIndex = this._virtualPageList.clampIndex(startIndex);
    this._direction = 1;

    // 创建当前帧
    this.updateCurrentFrame();

    // 启动预加载
    this._preloadPipeline.setFocus(this._currentIndex);

    // 触发事件
    this._events.onBookOpen?.(this.getBookInfo());
  }

  /**
   * 关闭书籍
   */
  closeBook(): void {
    if (!this._bookPath) return;

    // 停止预加载
    this._preloadPipeline.cancelAll();
    this._preloadPipeline.clearCache();

    // 清空页面
    this._virtualPageList.clear();
    this._pageFrameManager.clearCache();

    // 重置状态
    this._bookPath = '';
    this._bookName = '';
    this._isArchive = false;
    this._currentIndex = 0;
    this._currentFrame = null;

    // 触发事件
    this._events.onBookClose?.();
  }

  /**
   * 获取书籍信息
   */
  getBookInfo(): BookInfo {
    return {
      path: this._bookPath,
      name: this._bookName,
      isArchive: this._isArchive,
      physicalPageCount: this._virtualPageList.physicalLength,
      virtualPageCount: this._virtualPageList.length,
      currentIndex: this._currentIndex,
      currentFrame: this._currentFrame,
    };
  }

  /**
   * 是否有打开的书籍
   */
  get isOpen(): boolean {
    return this._bookPath !== '';
  }

  // ============================================================================
  // 页面导航
  // ============================================================================

  /**
   * 跳转到指定虚拟页面
   */
  goToPage(virtualIndex: number): void {
    if (!this.isOpen) return;

    const clampedIndex = this._virtualPageList.clampIndex(virtualIndex);
    if (clampedIndex === this._currentIndex) return;

    this._direction = clampedIndex > this._currentIndex ? 1 : -1;
    this._currentIndex = clampedIndex;

    this.updateCurrentFrame();
    this._preloadPipeline.setFocus(this._currentIndex);

    this._events.onPageChange?.(this._currentIndex, this._currentFrame);
  }

  /**
   * 下一页
   */
  nextPage(): boolean {
    if (!this.isOpen || !this._currentFrame) return false;

    const nextPos = getPageRangeNext(this._currentFrame.frameRange, 1);
    if (!this._virtualPageList.isValidVirtualIndex(nextPos.index)) {
      // 已到末尾
      return false;
    }

    this._direction = 1;
    this._currentIndex = nextPos.index;

    this.updateCurrentFrame();
    this._preloadPipeline.setFocus(this._currentIndex);

    this._events.onPageChange?.(this._currentIndex, this._currentFrame);
    return true;
  }

  /**
   * 上一页
   */
  prevPage(): boolean {
    if (!this.isOpen || !this._currentFrame) return false;

    const prevPos = getPageRangeNext(this._currentFrame.frameRange, -1);
    if (!this._virtualPageList.isValidVirtualIndex(prevPos.index)) {
      // 已到开头
      return false;
    }

    this._direction = -1;
    this._currentIndex = prevPos.index;

    this.updateCurrentFrame();
    this._preloadPipeline.setFocus(this._currentIndex);

    this._events.onPageChange?.(this._currentIndex, this._currentFrame);
    return true;
  }

  /**
   * 跳转到首页
   */
  goToFirst(): void {
    this.goToPage(0);
  }

  /**
   * 跳转到末页
   */
  goToLast(): void {
    this.goToPage(this._virtualPageList.length - 1);
  }

  /**
   * 跳转到下一个文件夹
   */
  nextFolder(): boolean {
    if (!this.isOpen) return false;

    const nextIndex = this._virtualPageList.getNextFolderIndex(this._currentIndex);
    if (nextIndex < 0) return false;

    this.goToPage(nextIndex);
    return true;
  }

  /**
   * 跳转到上一个文件夹
   */
  prevFolder(): boolean {
    if (!this.isOpen) return false;

    const prevIndex = this._virtualPageList.getPrevFolderIndex(this._currentIndex);
    if (prevIndex < 0) return false;

    this.goToPage(prevIndex);
    return true;
  }

  // ============================================================================
  // 页面设置
  // ============================================================================

  /**
   * 设置排序模式
   */
  setSortMode(mode: SortMode): void {
    this._virtualPageList.setSortMode(mode);
  }

  /**
   * 设置搜索关键词
   */
  setSearchKeyword(keyword: string): void {
    this._virtualPageList.setSearchKeyword(keyword);
  }

  /**
   * 设置是否分割横向页面
   */
  setDivideLandscape(enabled: boolean): void {
    this._virtualPageList.setConfig({ divideLandscape: enabled });
  }

  /**
   * 设置页面模式
   */
  setPageMode(mode: 'single' | 'wide'): void {
    this._virtualPageList.setConfig({ pageMode: mode });
    this._pageFrameManager.setConfig({ framePageSize: mode === 'single' ? 1 : 2 });
  }

  /**
   * 设置阅读方向
   */
  setReadOrder(order: 'ltr' | 'rtl'): void {
    this._virtualPageList.setConfig({ readOrder: order });
    this._pageFrameManager.setConfig({ readOrder: order });
  }

  /**
   * 更新物理页面尺寸
   * 当异步加载图片后获取到真实尺寸时调用
   */
  updatePageSize(physicalIndex: number, width: number, height: number): void {
    this._virtualPageList.updatePhysicalPageSize(physicalIndex, width, height);
  }

  /**
   * 批量更新物理页面尺寸
   */
  updatePageSizes(updates: Array<{ index: number; width: number; height: number }>): void {
    this._virtualPageList.updatePhysicalPageSizes(updates);
  }

  // ============================================================================
  // 数据访问
  // ============================================================================

  /**
   * 获取当前虚拟页面索引
   */
  get currentIndex(): number {
    return this._currentIndex;
  }

  /**
   * 获取当前帧
   */
  get currentFrame(): PageFrame | null {
    return this._currentFrame;
  }

  /**
   * 获取虚拟页面总数
   */
  get pageCount(): number {
    return this._virtualPageList.length;
  }

  /**
   * 获取物理页面总数
   */
  get physicalPageCount(): number {
    return this._virtualPageList.physicalLength;
  }

  /**
   * 获取虚拟页面
   */
  getVirtualPage(index: number): VirtualPage | null {
    return this._virtualPageList.getVirtualPage(index);
  }

  /**
   * 获取物理页面
   */
  getPhysicalPage(index: number): PhysicalPage | null {
    return this._virtualPageList.getPhysicalPage(index);
  }

  /**
   * 获取所有虚拟页面
   */
  getAllVirtualPages(): VirtualPage[] {
    return this._virtualPageList.getAllVirtualPages();
  }

  /**
   * 获取范围内的虚拟页面
   */
  getVirtualPagesInRange(start: number, end: number): VirtualPage[] {
    return this._virtualPageList.getVirtualPagesInRange(start, end);
  }

  /**
   * 获取帧序列
   */
  getFrameSequence(startIndex: number, count: number, direction: 1 | -1 = 1): PageFrame[] {
    return this._pageFrameManager.getFrameSequence(startIndex, count, direction);
  }

  // ============================================================================
  // 缓存访问
  // ============================================================================

  /**
   * 获取图像缓存
   */
  getImageCache(virtualIndex: number): Blob | null {
    return this._preloadPipeline.getCache(virtualIndex, 'image');
  }

  /**
   * 获取缩略图缓存
   */
  getThumbnailCache(virtualIndex: number): Blob | null {
    return this._preloadPipeline.getCache(virtualIndex, 'thumbnail');
  }

  /**
   * 获取超分缓存
   */
  getUpscaleCache(virtualIndex: number): Blob | null {
    return this._preloadPipeline.getCache(virtualIndex, 'upscale');
  }

  /**
   * 请求加载图像
   */
  async requestImage(virtualIndex: number): Promise<Blob | null> {
    return this._preloadPipeline.requestImage(virtualIndex);
  }

  /**
   * 请求加载缩略图
   */
  async requestThumbnail(virtualIndex: number): Promise<Blob | null> {
    return this._preloadPipeline.requestThumbnail(virtualIndex);
  }

  /**
   * 请求超分
   */
  async requestUpscale(virtualIndex: number): Promise<Blob | null> {
    return this._preloadPipeline.requestUpscale(virtualIndex);
  }

  // ============================================================================
  // 预加载控制
  // ============================================================================

  /**
   * 暂停预加载
   */
  pausePreload(): void {
    this._preloadPipeline.pause();
  }

  /**
   * 恢复预加载
   */
  resumePreload(): void {
    this._preloadPipeline.resume();
  }

  /**
   * 清空预加载缓存
   */
  clearPreloadCache(): void {
    this._preloadPipeline.clearCache();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private extractBookName(path: string): string {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  }

  private updateCurrentFrame(): void {
    const position: PagePosition = { index: this._currentIndex, part: 0 };
    this._currentFrame = this._pageFrameManager.createFrame(position, this._direction);
  }

  private onPagesRebuilt(): void {
    // 重建帧缓存
    this._pageFrameManager.clearCache();

    // 确保当前索引有效
    this._currentIndex = this._virtualPageList.clampIndex(this._currentIndex);

    // 更新当前帧
    this.updateCurrentFrame();

    // 更新预加载
    this._preloadPipeline.setFocus(this._currentIndex);

    // 触发事件
    this._events.onPagesRebuilt?.();
    this._events.onPageChange?.(this._currentIndex, this._currentFrame);
  }

  // ============================================================================
  // 销毁
  // ============================================================================

  destroy(): void {
    this.closeBook();
  }
}
