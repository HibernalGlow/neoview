/**
 * NeoView 核心类型定义
 * 参考 NeeView 架构设计
 */

// ============================================================================
// 基础几何类型
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// 页面位置类型
// ============================================================================

/**
 * 页面位置
 * - index: 页面索引 (0-based)
 * - part: 页面部分 (0=左半/前半, 1=右半/后半)
 */
export interface PagePosition {
  index: number;
  part: 0 | 1;
}

export const PagePositionEmpty: PagePosition = { index: -1, part: 0 };
export const PagePositionZero: PagePosition = { index: 0, part: 0 };

export function isPagePositionEmpty(pos: PagePosition): boolean {
  return pos.index < 0;
}

export function isPagePositionEqual(a: PagePosition, b: PagePosition): boolean {
  return a.index === b.index && a.part === b.part;
}

export function comparePagePosition(a: PagePosition, b: PagePosition): number {
  if (a.index !== b.index) return a.index - b.index;
  return a.part - b.part;
}

export function pagePositionToValue(pos: PagePosition): number {
  return pos.index * 2 + pos.part;
}

export function valueToPagePosition(value: number): PagePosition {
  return {
    index: Math.floor(value / 2),
    part: (value % 2) as 0 | 1,
  };
}

export function addPagePosition(pos: PagePosition, delta: number): PagePosition {
  return valueToPagePosition(pagePositionToValue(pos) + delta);
}

// ============================================================================
// 页面范围类型
// ============================================================================

/**
 * 页面范围 (不可变)
 * - min: 范围起始位置
 * - max: 范围结束位置
 */
export interface PageRange {
  min: PagePosition;
  max: PagePosition;
}

export const PageRangeEmpty: PageRange = {
  min: PagePositionEmpty,
  max: PagePositionEmpty,
};

export function isPageRangeEmpty(range: PageRange): boolean {
  return isPagePositionEmpty(range.min) || isPagePositionEmpty(range.max);
}

export function createPageRange(position: PagePosition, partSize: number): PageRange {
  if (isPagePositionEmpty(position) || partSize === 0) {
    return PageRangeEmpty;
  }

  if (partSize > 0) {
    return {
      min: position,
      max: addPagePosition(position, partSize - 1),
    };
  } else {
    return {
      min: addPagePosition(position, partSize + 1),
      max: position,
    };
  }
}

export function createPageRangeForOnePage(position: PagePosition, direction: 1 | -1): PageRange {
  const last: PagePosition = {
    index: position.index,
    part: direction > 0 ? 1 : 0,
  };
  return {
    min: comparePagePosition(position, last) < 0 ? position : last,
    max: comparePagePosition(position, last) < 0 ? last : position,
  };
}

export function getPageRangePartSize(range: PageRange): number {
  if (isPageRangeEmpty(range)) return 0;
  return Math.abs(pagePositionToValue(range.max) - pagePositionToValue(range.min)) + 1;
}

export function getPageRangePageSize(range: PageRange): number {
  if (isPageRangeEmpty(range)) return 0;
  return Math.abs(range.max.index - range.min.index) + 1;
}

export function pageRangeContains(range: PageRange, position: PagePosition): boolean {
  if (isPagePositionEmpty(position) || isPageRangeEmpty(range)) return false;
  return comparePagePosition(range.min, position) <= 0 && comparePagePosition(position, range.max) <= 0;
}

export function pageRangeConflict(a: PageRange, b: PageRange): boolean {
  if (isPageRangeEmpty(a) || isPageRangeEmpty(b)) return false;
  return comparePagePosition(a.min, b.max) <= 0 && comparePagePosition(b.min, a.max) <= 0;
}

export function getPageRangeNext(range: PageRange, direction: 1 | -1): PagePosition {
  if (isPageRangeEmpty(range)) return PagePositionEmpty;
  return direction < 0 ? addPagePosition(range.min, -1) : addPagePosition(range.max, 1);
}

export function getPageRangeTop(range: PageRange, direction: 1 | -1): PagePosition {
  if (isPageRangeEmpty(range)) return PagePositionEmpty;
  return direction < 0 ? range.max : range.min;
}

// ============================================================================
// 页面终端标记
// ============================================================================

export enum PageTerminal {
  None = 0,
  First = 1,
  Last = 2,
  Both = 3,
}

// ============================================================================
// 页面模式
// ============================================================================

export type PageMode = 'single' | 'wide';
export type ReadOrder = 'ltr' | 'rtl';
export type FitMode = 'contain' | 'cover' | 'width' | 'height' | 'none';
export type ViewMode = 'normal' | 'panorama' | 'loupe';

// ============================================================================
// 物理页面
// ============================================================================

/**
 * 物理页面 - 对应一个实际的图像文件
 */
export interface PhysicalPage {
  /** 物理索引 */
  index: number;
  /** 文件路径 (压缩包内路径或文件系统路径) */
  path: string;
  /** 入口名称 (用于显示) */
  entryName: string;
  /** 原始尺寸 */
  size: Size;
  /** 宽高比 */
  aspectRatio: number;
  /** 是否横向 */
  isLandscape: boolean;
  /** 最后修改时间 */
  lastModified: number;
  /** 文件大小 (字节) */
  fileSize: number;
  /** 页面类型 */
  pageType: 'image' | 'video' | 'folder' | 'archive';
  /** 是否已删除 */
  isDeleted: boolean;
}

// ============================================================================
// 虚拟页面
// ============================================================================

/**
 * 虚拟页面 - 可能是物理页面的一部分
 */
export interface VirtualPage {
  /** 虚拟索引 */
  virtualIndex: number;
  /** 对应的物理页面 */
  physicalPage: PhysicalPage;
  /** 页面部分 (0=完整/左半, 1=右半) */
  part: 0 | 1;
  /** 裁剪区域 (分割时使用) */
  cropRect?: Rect;
  /** 是否为分割页面 */
  isDivided: boolean;
}

// ============================================================================
// 页面帧元素
// ============================================================================

/**
 * 页面帧元素 - PageFrame 的组成部分
 */
export interface PageFrameElement {
  /** 虚拟页面 */
  virtualPage: VirtualPage;
  /** 元素缩放 */
  scale: number;
  /** 元素偏移 */
  offset: Point;
  /** 是否为空白页 */
  isDummy: boolean;
  /** 原始尺寸 */
  rawSize: Size;
  /** 页面范围 */
  pageRange: PageRange;
}

// ============================================================================
// 页面帧
// ============================================================================

/**
 * 页面帧 - 显示的基本单位，包含 1-2 个元素
 */
export interface PageFrame {
  /** 唯一标识 */
  id: string;
  /** 元素列表 (1-2 个) */
  elements: PageFrameElement[];
  /** 覆盖的虚拟页面范围 */
  frameRange: PageRange;
  /** 创建方向 */
  direction: 1 | -1;
  /** 帧尺寸 */
  size: Size;
  /** 拉伸后尺寸 */
  stretchedSize: Size;
  /** 终端标记 */
  terminal: PageTerminal;
}

// ============================================================================
// 加载状态
// ============================================================================

export type PageContentState = 'none' | 'view' | 'ahead';
export type LoadStatus = 'idle' | 'pending' | 'loading' | 'done' | 'error';

// ============================================================================
// 预加载任务
// ============================================================================

export interface PreloadTask {
  /** 任务 ID */
  id: string;
  /** 任务类型 */
  type: 'image' | 'thumbnail' | 'upscale';
  /** 虚拟页面索引 */
  virtualIndex: number;
  /** 优先级 (越小越高) */
  priority: number;
  /** 状态 */
  status: LoadStatus;
  /** 取消控制器 */
  abortController?: AbortController;
  /** 创建时间 */
  createdAt: number;
}

// ============================================================================
// 视图状态
// ============================================================================

export interface ViewState {
  /** 视图模式 */
  mode: ViewMode;
  /** 缩放比例 */
  scale: number;
  /** 旋转角度 */
  rotation: number;
  /** 偏移量 */
  offset: Point;
  /** 全景模式偏移 */
  panoramaOffset: number;
  /** 放大镜中心 */
  loupeCenter: Point;
  /** 放大镜缩放 */
  loupeScale: number;
}

// ============================================================================
// 配置类型
// ============================================================================

export interface VirtualPageListConfig {
  /** 是否分割横向页面 */
  divideLandscape: boolean;
  /** 分割阈值 (宽高比 > 此值才分割) */
  divideThreshold: number;
  /** 页面模式 */
  pageMode: PageMode;
  /** 阅读方向 */
  readOrder: ReadOrder;
  /** 首页单独显示 */
  singleFirstPage: boolean;
  /** 尾页单独显示 */
  singleLastPage: boolean;
  /** 横向页面视为双页 */
  supportWidePage: boolean;
}

export interface PageFrameConfig {
  /** 帧内页面数 */
  framePageSize: 1 | 2;
  /** 横向页面视为双页 */
  supportWidePage: boolean;
  /** 首页单独显示 */
  singleFirstPage: boolean;
  /** 尾页单独显示 */
  singleLastPage: boolean;
  /** 插入空白页 */
  insertDummyPage: boolean;
  /** 阅读方向 */
  readOrder: ReadOrder;
  /** 是否循环 */
  isLoop: boolean;
}

export interface PreloadConfig {
  /** 向前预加载页数 */
  preloadAhead: number;
  /** 向后预加载页数 */
  preloadBehind: number;
  /** 最大图像并发 */
  maxConcurrentImages: number;
  /** 最大缩略图并发 */
  maxConcurrentThumbnails: number;
  /** 最大超分并发 */
  maxConcurrentUpscale: number;
  /** 自动超分 */
  autoUpscale: boolean;
  /** 超分模型 */
  upscaleModel: string;
}

export interface ViewerConfig {
  /** 最小缩放 */
  minScale: number;
  /** 最大缩放 */
  maxScale: number;
  /** 缩放步进 */
  scaleStep: number;
  /** 适应模式 */
  fitMode: FitMode;
  /** 动画时长 (ms) */
  animationDuration: number;
  /** 缓动函数 */
  animationEasing: string;
}

// ============================================================================
// 默认配置
// ============================================================================

export const defaultVirtualPageListConfig: VirtualPageListConfig = {
  divideLandscape: false,
  divideThreshold: 1.0,
  pageMode: 'single',
  readOrder: 'rtl',
  singleFirstPage: true,
  singleLastPage: true,
  supportWidePage: true,
};

export const defaultPageFrameConfig: PageFrameConfig = {
  framePageSize: 1,
  supportWidePage: true,
  singleFirstPage: true,
  singleLastPage: true,
  insertDummyPage: false,
  readOrder: 'rtl',
  isLoop: false,
};

export const defaultPreloadConfig: PreloadConfig = {
  preloadAhead: 3,
  preloadBehind: 1,
  maxConcurrentImages: 4,
  maxConcurrentThumbnails: 8,
  maxConcurrentUpscale: 1,
  autoUpscale: false,
  upscaleModel: 'realesrgan-x4plus-anime',
};

export const defaultViewerConfig: ViewerConfig = {
  minScale: 0.1,
  maxScale: 10,
  scaleStep: 0.1,
  fitMode: 'contain',
  animationDuration: 200,
  animationEasing: 'ease-out',
};
