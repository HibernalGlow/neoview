/**
 * PageDistribution - 预计算页面分布
 * 
 * 参考 OpenComic 的 calculateImagesDistribution 实现
 * 预先计算所有页面的组合方式，翻页时直接查表
 * 
 * 核心优势：
 * 1. 翻页时 O(1) 查表，无需重新计算
 * 2. 支持空白页对齐
 * 3. 支持横向图独占双页
 * 4. 支持首页/尾页单独显示
 */

// 内联类型定义，避免循环依赖
export interface Size {
  width: number;
  height: number;
}

export interface PhysicalPage {
  index: number;
  path: string;
  entryName: string;
  size: Size;
  aspectRatio: number;
  isLandscape: boolean;
  lastModified: number;
  fileSize: number;
  pageType: 'image' | 'folder';
  isDeleted: boolean;
}

/** 页面分布项 */
export interface DistributionItem {
  /** 物理页面索引（-1 表示空白页） */
  pageIndex: number;
  /** 是否为空白页 */
  isBlank: boolean;
  /** 是否为文件夹 */
  isFolder: boolean;
  /** 宽度权重（1=单页，2=双页中的一页） */
  width: 1 | 2;
}

/** 页面帧分布（一帧可能包含1-2个页面） */
export interface FrameDistribution {
  /** 帧索引 */
  frameIndex: number;
  /** 帧内的页面项 */
  items: DistributionItem[];
  /** 是否为双页帧 */
  isDoublePage: boolean;
}

/** 页面分布配置 */
export interface DistributionConfig {
  /** 是否启用双页模式 */
  doublePage: boolean;
  /** 横向图不应用双页（独占显示） */
  doNotApplyToHorizontals: boolean;
  /** 与下一横向图对齐（插入空白页） */
  alignWithNextHorizontal: boolean;
  /** 首页前插入空白页 */
  blankFirstPage: boolean;
  /** 首页单独显示 */
  singleFirstPage: boolean;
  /** 尾页单独显示 */
  singleLastPage: boolean;
  /** 阅读方向 */
  readOrder: 'ltr' | 'rtl';
  /** 横向判断阈值（宽高比） */
  landscapeThreshold: number;
}

/** 默认配置 */
export const defaultDistributionConfig: DistributionConfig = {
  doublePage: false,
  doNotApplyToHorizontals: true,
  alignWithNextHorizontal: false,
  blankFirstPage: false,
  singleFirstPage: false,
  singleLastPage: false,
  readOrder: 'ltr',
  landscapeThreshold: 1.0,
};

/**
 * 判断页面是否为横向
 */
function isLandscape(page: PhysicalPage, threshold: number): boolean {
  if (page.size.width <= 0 || page.size.height <= 0) return false;
  return page.aspectRatio > threshold;
}

/**
 * 计算是否需要在当前位置插入空白页以对齐下一个横向图
 * 参考 OpenComic 的 blankPage() 函数
 */
function shouldInsertBlankForAlignment(
  pages: PhysicalPage[],
  currentIndex: number,
  config: DistributionConfig
): boolean {
  if (!config.alignWithNextHorizontal) return false;
  if (!config.doublePage) return false;
  if (!config.doNotApplyToHorizontals) return false;

  let key = 0;
  for (let i = currentIndex; i < pages.length; i++) {
    const page = pages[i];
    if (isLandscape(page, config.landscapeThreshold)) {
      // 找到横向图，检查是否需要空白页对齐
      return key % 2 === 1;
    }
    key++;
  }
  return false;
}

/**
 * 预计算页面分布
 * 
 * @param pages 物理页面列表
 * @param config 配置
 * @returns 帧分布列表
 */
export function calculatePageDistribution(
  pages: PhysicalPage[],
  config: DistributionConfig
): FrameDistribution[] {
  const distribution: FrameDistribution[] = [];
  
  if (pages.length === 0) return distribution;

  // 单页模式：每页一帧
  if (!config.doublePage) {
    for (let i = 0; i < pages.length; i++) {
      distribution.push({
        frameIndex: i,
        items: [{
          pageIndex: i,
          isBlank: false,
          isFolder: false,
          width: 1,
        }],
        isDoublePage: false,
      });
    }
    return distribution;
  }

  // 双页模式
  let frameIndex = 0;
  let pendingItems: DistributionItem[] = [];

  // 首页前插入空白页
  if (config.blankFirstPage) {
    const firstPage = pages[0];
    // 只有当首页不是横向图时才插入空白页
    if (!config.doNotApplyToHorizontals || !isLandscape(firstPage, config.landscapeThreshold)) {
      pendingItems.push({
        pageIndex: -1,
        isBlank: true,
        isFolder: false,
        width: 2,
      });
    }
  }

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const isPageLandscape = isLandscape(page, config.landscapeThreshold);
    const isFirst = i === 0;
    const isLast = i === pages.length - 1;

    // 横向图独占处理
    if (config.doNotApplyToHorizontals && isPageLandscape) {
      // 先提交之前累积的页面
      if (pendingItems.length > 0) {
        // 补充空白页使其成为双页
        pendingItems.push({
          pageIndex: -1,
          isBlank: true,
          isFolder: false,
          width: 2,
        });
        distribution.push({
          frameIndex: frameIndex++,
          items: pendingItems,
          isDoublePage: true,
        });
        pendingItems = [];
      }

      // 横向图独占一帧
      distribution.push({
        frameIndex: frameIndex++,
        items: [{
          pageIndex: i,
          isBlank: false,
          isFolder: false,
          width: 1,
        }],
        isDoublePage: false,
      });
      continue;
    }

    // 首页单独显示
    if (config.singleFirstPage && isFirst) {
      distribution.push({
        frameIndex: frameIndex++,
        items: [{
          pageIndex: i,
          isBlank: false,
          isFolder: false,
          width: 1,
        }],
        isDoublePage: false,
      });
      continue;
    }

    // 尾页单独显示
    if (config.singleLastPage && isLast) {
      // 先提交之前累积的页面
      if (pendingItems.length > 0) {
        pendingItems.push({
          pageIndex: -1,
          isBlank: true,
          isFolder: false,
          width: 2,
        });
        distribution.push({
          frameIndex: frameIndex++,
          items: pendingItems,
          isDoublePage: true,
        });
        pendingItems = [];
      }

      distribution.push({
        frameIndex: frameIndex++,
        items: [{
          pageIndex: i,
          isBlank: false,
          isFolder: false,
          width: 1,
        }],
        isDoublePage: false,
      });
      continue;
    }

    // 检查是否需要插入空白页对齐
    if (config.alignWithNextHorizontal && pendingItems.length === 0) {
      if (shouldInsertBlankForAlignment(pages, i, config)) {
        pendingItems.push({
          pageIndex: -1,
          isBlank: true,
          isFolder: false,
          width: 2,
        });
      }
    }

    // 添加当前页面
    pendingItems.push({
      pageIndex: i,
      isBlank: false,
      isFolder: false,
      width: 2,
    });

    // 累积两页后提交
    if (pendingItems.length >= 2) {
      distribution.push({
        frameIndex: frameIndex++,
        items: pendingItems,
        isDoublePage: true,
      });
      pendingItems = [];
    }
  }

  // 处理剩余的单页
  if (pendingItems.length > 0) {
    if (pendingItems.length === 1 && pendingItems[0].width === 2) {
      // 单页补充空白页
      pendingItems.push({
        pageIndex: -1,
        isBlank: true,
        isFolder: false,
        width: 2,
      });
      distribution.push({
        frameIndex: frameIndex++,
        items: pendingItems,
        isDoublePage: true,
      });
    } else {
      distribution.push({
        frameIndex: frameIndex++,
        items: pendingItems,
        isDoublePage: pendingItems.length > 1,
      });
    }
  }

  return distribution;
}

/**
 * 页面分布管理器
 * 提供快速查询接口
 */
export class PageDistributionManager {
  private _pages: PhysicalPage[] = [];
  private _config: DistributionConfig;
  private _distribution: FrameDistribution[] = [];
  
  // 索引映射缓存
  private _pageToFrameMap: Map<number, number> = new Map();
  private _frameToPageMap: Map<number, number[]> = new Map();

  constructor(config: Partial<DistributionConfig> = {}) {
    this._config = { ...defaultDistributionConfig, ...config };
  }

  /** 获取帧总数 */
  get frameCount(): number {
    return this._distribution.length;
  }

  /** 获取页面总数 */
  get pageCount(): number {
    return this._pages.length;
  }

  /** 获取配置 */
  get config(): DistributionConfig {
    return { ...this._config };
  }

  /** 获取分布数据 */
  get distribution(): FrameDistribution[] {
    return this._distribution;
  }

  /**
   * 设置页面列表并重建分布
   */
  setPages(pages: PhysicalPage[]): void {
    this._pages = pages;
    this.rebuild();
  }

  /**
   * 更新配置并重建分布
   */
  setConfig(config: Partial<DistributionConfig>): void {
    this._config = { ...this._config, ...config };
    this.rebuild();
  }

  /**
   * 重建分布
   */
  rebuild(): void {
    this._distribution = calculatePageDistribution(this._pages, this._config);
    this.buildIndexMaps();
  }

  /**
   * 构建索引映射
   */
  private buildIndexMaps(): void {
    this._pageToFrameMap.clear();
    this._frameToPageMap.clear();

    for (const frame of this._distribution) {
      const pageIndices: number[] = [];
      
      for (const item of frame.items) {
        if (!item.isBlank && item.pageIndex >= 0) {
          this._pageToFrameMap.set(item.pageIndex, frame.frameIndex);
          pageIndices.push(item.pageIndex);
        }
      }
      
      this._frameToPageMap.set(frame.frameIndex, pageIndices);
    }
  }

  /**
   * 根据页面索引获取帧索引
   * O(1) 查询
   */
  getFrameIndexByPage(pageIndex: number): number {
    return this._pageToFrameMap.get(pageIndex) ?? -1;
  }

  /**
   * 根据帧索引获取页面索引列表
   * O(1) 查询
   */
  getPageIndicesByFrame(frameIndex: number): number[] {
    return this._frameToPageMap.get(frameIndex) ?? [];
  }

  /**
   * 获取帧分布
   * O(1) 查询
   */
  getFrame(frameIndex: number): FrameDistribution | null {
    if (frameIndex < 0 || frameIndex >= this._distribution.length) {
      return null;
    }
    return this._distribution[frameIndex];
  }

  /**
   * 获取下一帧索引
   */
  getNextFrameIndex(currentFrameIndex: number): number {
    const next = currentFrameIndex + 1;
    return next < this._distribution.length ? next : -1;
  }

  /**
   * 获取上一帧索引
   */
  getPrevFrameIndex(currentFrameIndex: number): number {
    const prev = currentFrameIndex - 1;
    return prev >= 0 ? prev : -1;
  }

  /**
   * 获取帧的翻页步进（跳过的物理页数）
   */
  getFrameStep(frameIndex: number): number {
    const frame = this.getFrame(frameIndex);
    if (!frame) return 1;
    
    // 计算非空白页数量
    return frame.items.filter(item => !item.isBlank).length;
  }

  /**
   * 更新单个页面的尺寸
   * 如果影响横向判断，会触发重建
   */
  updatePageSize(pageIndex: number, size: Size): boolean {
    const page = this._pages[pageIndex];
    if (!page) return false;

    const oldIsLandscape = isLandscape(page, this._config.landscapeThreshold);
    
    page.size = size;
    page.aspectRatio = size.height > 0 ? size.width / size.height : 1;
    page.isLandscape = page.aspectRatio > 1;

    const newIsLandscape = isLandscape(page, this._config.landscapeThreshold);

    // 如果横向状态改变且启用了相关功能，需要重建
    if (oldIsLandscape !== newIsLandscape && 
        (this._config.doNotApplyToHorizontals || this._config.alignWithNextHorizontal)) {
      this.rebuild();
      return true;
    }

    return false;
  }
}
