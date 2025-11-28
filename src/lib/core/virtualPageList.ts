/**
 * VirtualPageList - 虚拟页面列表
 * 
 * 核心功能：
 * 1. 管理物理页面到虚拟页面的映射
 * 2. 支持智能分割横向页面
 * 3. 支持排序和过滤
 * 
 * 参考 NeeView 的 BookPageCollection
 */

import type {
  PhysicalPage,
  VirtualPage,
  VirtualPageListConfig,
  Rect,
  PagePosition,
} from './types';
import { defaultVirtualPageListConfig } from './types';

export type SortMode = 
  | 'entry'           // 原始顺序
  | 'entryDesc'       // 原始顺序倒序
  | 'fileName'        // 文件名
  | 'fileNameDesc'    // 文件名倒序
  | 'timestamp'       // 时间戳
  | 'timestampDesc'   // 时间戳倒序
  | 'size'            // 文件大小
  | 'sizeDesc'        // 文件大小倒序
  | 'random';         // 随机

export interface VirtualPageListEvents {
  onRebuild?: () => void;
  onConfigChange?: (config: VirtualPageListConfig) => void;
}

export class VirtualPageList {
  private _physicalPages: PhysicalPage[] = [];
  private _virtualPages: VirtualPage[] = [];
  private _config: VirtualPageListConfig;
  private _sortMode: SortMode = 'entry';
  private _sortSeed: number = 0;
  private _searchKeyword: string = '';
  private _events: VirtualPageListEvents = {};

  // 索引映射缓存
  private _physicalToVirtualMap: Map<number, number[]> = new Map();
  private _virtualToPhysicalMap: Map<number, number> = new Map();

  constructor(config: Partial<VirtualPageListConfig> = {}) {
    this._config = { ...defaultVirtualPageListConfig, ...config };
  }

  // ============================================================================
  // 公共属性
  // ============================================================================

  get length(): number {
    return this._virtualPages.length;
  }

  get physicalLength(): number {
    return this._physicalPages.length;
  }

  get config(): VirtualPageListConfig {
    return { ...this._config };
  }

  get sortMode(): SortMode {
    return this._sortMode;
  }

  get searchKeyword(): string {
    return this._searchKeyword;
  }

  // ============================================================================
  // 事件
  // ============================================================================

  setEvents(events: VirtualPageListEvents): void {
    this._events = events;
  }

  // ============================================================================
  // 配置
  // ============================================================================

  setConfig(config: Partial<VirtualPageListConfig>): void {
    const oldConfig = this._config;
    this._config = { ...this._config, ...config };

    // 检查是否需要重建
    const needRebuild = 
      oldConfig.divideLandscape !== this._config.divideLandscape ||
      oldConfig.divideThreshold !== this._config.divideThreshold ||
      oldConfig.pageMode !== this._config.pageMode ||
      oldConfig.readOrder !== this._config.readOrder;

    if (needRebuild) {
      this.rebuild();
    }

    this._events.onConfigChange?.(this._config);
  }

  // ============================================================================
  // 数据管理
  // ============================================================================

  /**
   * 设置物理页面列表
   */
  setPhysicalPages(pages: PhysicalPage[]): void {
    this._physicalPages = [...pages];
    this.rebuild();
  }

  /**
   * 添加物理页面
   */
  addPhysicalPage(page: PhysicalPage): void {
    this._physicalPages.push(page);
    this.rebuild();
  }

  /**
   * 移除物理页面
   */
  removePhysicalPage(index: number): void {
    if (index >= 0 && index < this._physicalPages.length) {
      this._physicalPages.splice(index, 1);
      // 更新后续页面的索引
      for (let i = index; i < this._physicalPages.length; i++) {
        this._physicalPages[i].index = i;
      }
      this.rebuild();
    }
  }

  /**
   * 清空所有页面
   */
  clear(): void {
    this._physicalPages = [];
    this._virtualPages = [];
    this._physicalToVirtualMap.clear();
    this._virtualToPhysicalMap.clear();
  }

  /**
   * 更新物理页面的尺寸信息
   * 当异步加载图片后获取到真实尺寸时调用
   */
  updatePhysicalPageSize(physicalIndex: number, width: number, height: number): boolean {
    const page = this._physicalPages[physicalIndex];
    if (!page) return false;

    // 检查是否有变化
    if (page.size.width === width && page.size.height === height) {
      return false;
    }

    // 更新尺寸
    page.size = { width, height };
    page.aspectRatio = height > 0 ? width / height : 1;
    page.isLandscape = page.aspectRatio > 1;

    // 检查是否需要重建（如果分割设置开启且页面变成横向）
    if (this._config.divideLandscape && page.isLandscape && page.aspectRatio > this._config.divideThreshold) {
      this.rebuild();
      return true;
    }

    return false;
  }

  /**
   * 批量更新物理页面尺寸
   */
  updatePhysicalPageSizes(updates: Array<{ index: number; width: number; height: number }>): void {
    let needRebuild = false;

    for (const { index, width, height } of updates) {
      const page = this._physicalPages[index];
      if (!page) continue;

      if (page.size.width !== width || page.size.height !== height) {
        page.size = { width, height };
        page.aspectRatio = height > 0 ? width / height : 1;
        page.isLandscape = page.aspectRatio > 1;

        // 检查是否需要重建
        if (this._config.divideLandscape && page.isLandscape && page.aspectRatio > this._config.divideThreshold) {
          needRebuild = true;
        }
      }
    }

    if (needRebuild) {
      this.rebuild();
    }
  }

  // ============================================================================
  // 排序和过滤
  // ============================================================================

  /**
   * 设置排序模式
   */
  setSortMode(mode: SortMode, seed?: number): void {
    this._sortMode = mode;
    if (mode === 'random') {
      this._sortSeed = seed ?? Math.floor(Math.random() * 1000000);
    }
    this.rebuild();
  }

  /**
   * 设置搜索关键词
   */
  setSearchKeyword(keyword: string): void {
    this._searchKeyword = keyword;
    this.rebuild();
  }

  // ============================================================================
  // 核心重建逻辑
  // ============================================================================

  /**
   * 重建虚拟页面列表
   */
  rebuild(): void {
    // 1. 过滤
    let pages = this.filterPages(this._physicalPages);

    // 2. 排序
    pages = this.sortPages(pages);

    // 3. 构建虚拟页面
    this._virtualPages = [];
    this._physicalToVirtualMap.clear();
    this._virtualToPhysicalMap.clear();

    let virtualIndex = 0;

    for (const physical of pages) {
      const virtualIndices: number[] = [];

      if (this.shouldDivide(physical)) {
        // 分割横向页面
        const [leftCrop, rightCrop] = this.calculateCropRects(physical);

        // 根据阅读方向决定顺序
        const parts = this._config.readOrder === 'rtl'
          ? [{ part: 1 as const, crop: rightCrop }, { part: 0 as const, crop: leftCrop }]
          : [{ part: 0 as const, crop: leftCrop }, { part: 1 as const, crop: rightCrop }];

        for (const { part, crop } of parts) {
          const vp: VirtualPage = {
            virtualIndex,
            physicalPage: physical,
            part,
            cropRect: crop,
            isDivided: true,
          };
          this._virtualPages.push(vp);
          this._virtualToPhysicalMap.set(virtualIndex, physical.index);
          virtualIndices.push(virtualIndex);
          virtualIndex++;
        }
      } else {
        // 不分割
        const vp: VirtualPage = {
          virtualIndex,
          physicalPage: physical,
          part: 0,
          isDivided: false,
        };
        this._virtualPages.push(vp);
        this._virtualToPhysicalMap.set(virtualIndex, physical.index);
        virtualIndices.push(virtualIndex);
        virtualIndex++;
      }

      this._physicalToVirtualMap.set(physical.index, virtualIndices);
    }

    this._events.onRebuild?.();
  }

  /**
   * 判断是否应该分割页面
   */
  private shouldDivide(page: PhysicalPage): boolean {
    // 只在单页模式下分割
    if (this._config.pageMode !== 'single') return false;
    // 检查是否启用分割
    if (!this._config.divideLandscape) return false;
    // 检查宽高比
    return page.aspectRatio > this._config.divideThreshold;
  }

  /**
   * 计算裁剪区域
   */
  private calculateCropRects(page: PhysicalPage): [Rect, Rect] {
    const halfWidth = page.size.width / 2;
    return [
      { x: 0, y: 0, width: halfWidth, height: page.size.height },
      { x: halfWidth, y: 0, width: halfWidth, height: page.size.height },
    ];
  }

  /**
   * 过滤页面
   */
  private filterPages(pages: PhysicalPage[]): PhysicalPage[] {
    if (!this._searchKeyword) return pages;

    const keyword = this._searchKeyword.toLowerCase();
    return pages.filter(page => {
      return page.entryName.toLowerCase().includes(keyword) ||
             page.path.toLowerCase().includes(keyword);
    });
  }

  /**
   * 排序页面
   */
  private sortPages(pages: PhysicalPage[]): PhysicalPage[] {
    const sorted = [...pages];

    switch (this._sortMode) {
      case 'entry':
        sorted.sort((a, b) => a.index - b.index);
        break;
      case 'entryDesc':
        sorted.sort((a, b) => b.index - a.index);
        break;
      case 'fileName':
        sorted.sort((a, b) => this.naturalCompare(a.entryName, b.entryName));
        break;
      case 'fileNameDesc':
        sorted.sort((a, b) => this.naturalCompare(b.entryName, a.entryName));
        break;
      case 'timestamp':
        sorted.sort((a, b) => a.lastModified - b.lastModified);
        break;
      case 'timestampDesc':
        sorted.sort((a, b) => b.lastModified - a.lastModified);
        break;
      case 'size':
        sorted.sort((a, b) => a.fileSize - b.fileSize);
        break;
      case 'sizeDesc':
        sorted.sort((a, b) => b.fileSize - a.fileSize);
        break;
      case 'random':
        this.shuffleWithSeed(sorted, this._sortSeed);
        break;
    }

    return sorted;
  }

  /**
   * 自然排序比较
   */
  private naturalCompare(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  /**
   * 使用种子的随机打乱
   */
  private shuffleWithSeed(array: PhysicalPage[], seed: number): void {
    let m = array.length;
    let t: PhysicalPage;
    let i: number;

    // 简单的伪随机数生成器
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    while (m) {
      i = Math.floor(random() * m--);
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }
  }

  // ============================================================================
  // 查询方法
  // ============================================================================

  /**
   * 根据虚拟索引获取虚拟页面
   */
  getVirtualPage(virtualIndex: number): VirtualPage | null {
    if (virtualIndex < 0 || virtualIndex >= this._virtualPages.length) {
      return null;
    }
    return this._virtualPages[virtualIndex];
  }

  /**
   * 根据物理索引获取所有对应的虚拟页面
   */
  getVirtualPagesForPhysical(physicalIndex: number): VirtualPage[] {
    const indices = this._physicalToVirtualMap.get(physicalIndex);
    if (!indices) return [];
    return indices.map(i => this._virtualPages[i]).filter(Boolean);
  }

  /**
   * 虚拟索引转物理索引
   */
  toPhysicalIndex(virtualIndex: number): number {
    return this._virtualToPhysicalMap.get(virtualIndex) ?? -1;
  }

  /**
   * 物理索引转虚拟索引 (返回第一个)
   */
  toVirtualIndex(physicalIndex: number): number {
    const indices = this._physicalToVirtualMap.get(physicalIndex);
    return indices?.[0] ?? -1;
  }

  /**
   * 获取物理页面
   */
  getPhysicalPage(physicalIndex: number): PhysicalPage | null {
    return this._physicalPages[physicalIndex] ?? null;
  }

  /**
   * 获取所有虚拟页面
   */
  getAllVirtualPages(): VirtualPage[] {
    return [...this._virtualPages];
  }

  /**
   * 获取所有物理页面
   */
  getAllPhysicalPages(): PhysicalPage[] {
    return [...this._physicalPages];
  }

  /**
   * 获取范围内的虚拟页面
   */
  getVirtualPagesInRange(start: number, end: number): VirtualPage[] {
    const actualStart = Math.max(0, start);
    const actualEnd = Math.min(this._virtualPages.length - 1, end);
    return this._virtualPages.slice(actualStart, actualEnd + 1);
  }

  /**
   * 检查虚拟索引是否有效
   */
  isValidVirtualIndex(index: number): boolean {
    return index >= 0 && index < this._virtualPages.length;
  }

  /**
   * 获取第一个位置
   */
  firstPosition(): PagePosition {
    return { index: 0, part: 0 };
  }

  /**
   * 获取最后一个位置
   */
  lastPosition(): PagePosition {
    if (this._virtualPages.length === 0) {
      return this.firstPosition();
    }
    return { index: this._virtualPages.length - 1, part: 1 };
  }

  /**
   * 限制索引在有效范围内
   */
  clampIndex(index: number): number {
    if (this._virtualPages.length === 0) return 0;
    return Math.max(0, Math.min(this._virtualPages.length - 1, index));
  }

  // ============================================================================
  // 导航方法
  // ============================================================================

  /**
   * 获取下一个文件夹的起始索引
   */
  getNextFolderIndex(currentIndex: number): number {
    if (this._virtualPages.length === 0 || currentIndex < 0) {
      return -1;
    }

    const currentPage = this._virtualPages[currentIndex];
    if (!currentPage) return -1;

    const currentFolder = this.getDirectoryName(currentPage.physicalPage.entryName);

    for (let i = currentIndex + 1; i < this._virtualPages.length; i++) {
      const page = this._virtualPages[i];
      const folder = this.getDirectoryName(page.physicalPage.entryName);
      if (folder !== currentFolder) {
        return i;
      }
    }

    return -1;
  }

  /**
   * 获取上一个文件夹的起始索引
   */
  getPrevFolderIndex(currentIndex: number): number {
    if (this._virtualPages.length === 0 || currentIndex <= 0) {
      return -1;
    }

    const prevPage = this._virtualPages[currentIndex - 1];
    if (!prevPage) return -1;

    const currentFolder = this.getDirectoryName(prevPage.physicalPage.entryName);

    for (let i = currentIndex - 1; i > 0; i--) {
      const page = this._virtualPages[i - 1];
      const folder = this.getDirectoryName(page.physicalPage.entryName);
      if (folder !== currentFolder) {
        return i;
      }
    }

    return 0;
  }

  /**
   * 获取目录名
   */
  private getDirectoryName(path: string): string {
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
  }

  // ============================================================================
  // 序列化
  // ============================================================================

  /**
   * 导出状态
   */
  exportState(): {
    physicalPages: PhysicalPage[];
    config: VirtualPageListConfig;
    sortMode: SortMode;
    sortSeed: number;
    searchKeyword: string;
  } {
    return {
      physicalPages: [...this._physicalPages],
      config: { ...this._config },
      sortMode: this._sortMode,
      sortSeed: this._sortSeed,
      searchKeyword: this._searchKeyword,
    };
  }

  /**
   * 导入状态
   */
  importState(state: ReturnType<VirtualPageList['exportState']>): void {
    this._physicalPages = [...state.physicalPages];
    this._config = { ...state.config };
    this._sortMode = state.sortMode;
    this._sortSeed = state.sortSeed;
    this._searchKeyword = state.searchKeyword;
    this.rebuild();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 从文件列表创建物理页面
 */
export function createPhysicalPagesFromFiles(
  files: Array<{
    path: string;
    name: string;
    size: number;
    lastModified: number;
    width?: number;
    height?: number;
  }>
): PhysicalPage[] {
  return files.map((file, index) => {
    const width = file.width ?? 0;
    const height = file.height ?? 0;
    const aspectRatio = height > 0 ? width / height : 1;

    return {
      index,
      path: file.path,
      entryName: file.name,
      size: { width, height },
      aspectRatio,
      isLandscape: aspectRatio > 1,
      lastModified: file.lastModified,
      fileSize: file.size,
      pageType: 'image' as const,
      isDeleted: false,
    };
  });
}
