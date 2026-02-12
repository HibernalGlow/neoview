/**
 * 视图模式工具函数
 * 
 * 处理单页/双页/全景模式的逻辑
 * 严格参考 NeeView 的实现
 * 
 * 三个独立维度：
 * 1. PageMode: single / double / panorama - 显示几页
 * 2. Orientation: horizontal / vertical - 多页如何排列
 * 3. Direction: ltr / rtl - 阅读方向
 * 
 * 有效组合（非冲突）：
 * - single: 不受 orientation 影响（单页无排列）
 * - double + horizontal: 左右排列
 * - double + vertical: 上下排列
 * - panorama + horizontal: 水平滚动
 * - panorama + vertical: 垂直滚动
 */

import type { FrameImage, FrameLayout } from '../types/frame';
import type { AutoRotateMode } from '$lib/settings/settingsManager';
import { computeAutoRotateAngle } from '$lib/utils/pageLayout';

/** 页面模式 */
export type PageMode = 'single' | 'double' | 'panorama';

/** 排列方向 */
export type Orientation = 'horizontal' | 'vertical';

/** 阅读方向 */
export type Direction = 'ltr' | 'rtl';

/** 图片尺寸信息 */
export interface ImageSize {
  width: number;
  height: number;
}

/** 视图模式配置 */
export interface ViewModeConfig {
  /** 页面模式 */
  layout: FrameLayout;
  /** 排列方向（仅 double/panorama 有效） */
  orientation: Orientation;
  /** 阅读方向 */
  direction: Direction;
  /** 是否启用横向分割（仅 single 模式） */
  divideLandscape: boolean;
  /** 是否将横向图视为双页（仅 double 模式） */
  treatHorizontalAsDoublePage: boolean;
  /** 自动旋转模式 */
  autoRotate: AutoRotateMode;
}

/** 分割状态 */
export interface SplitState {
  /** 当前页索引 */
  pageIndex: number;
  /** 当前显示的半边 */
  half: 'left' | 'right';
}

/** 分割页面导航结果 */
export interface SplitNavigationResult {
  /** 新的页面索引 */
  pageIndex: number;
  /** 新的分割半边（null 表示不分割） */
  splitHalf: 'left' | 'right' | null;
  /** 步长（0.5 表示半页，1 表示整页） */
  step: number;
}

/**
 * 判断图片是否为横向
 * 【优化】使用宽高比判断，与 OpenComic 保持一致
 */
export function isLandscape(size: ImageSize): boolean {
  if (size.width <= 0 || size.height <= 0) return false;
  return size.width > size.height;
}

/**
 * 判断图片是否为纵向
 */
export function isPortrait(size: ImageSize): boolean {
  if (size.width <= 0 || size.height <= 0) return true; // 无尺寸时默认纵向
  return size.height >= size.width;
}

/**
 * 获取图片宽高比
 * 【优化】缓存计算结果，避免重复计算
 */
export function getAspectRatio(size: ImageSize): number {
  if (size.height <= 0) return 1;
  return size.width / size.height;
}

/**
 * 根据阅读方向获取分割半边的显示顺序
 * LTR: 先左后右
 * RTL: 先右后左
 */
export function getInitialSplitHalf(direction: 'ltr' | 'rtl'): 'left' | 'right' {
  return direction === 'ltr' ? 'left' : 'right';
}

/**
 * 获取下一个分割半边
 */
export function getNextSplitHalf(
  current: 'left' | 'right',
  direction: 'ltr' | 'rtl'
): 'left' | 'right' | 'next' {
  if (direction === 'ltr') {
    return current === 'left' ? 'right' : 'next';
  } else {
    return current === 'right' ? 'left' : 'next';
  }
}

/**
 * 获取上一个分割半边
 */
export function getPrevSplitHalf(
  current: 'left' | 'right',
  direction: 'ltr' | 'rtl'
): 'left' | 'right' | 'prev' {
  if (direction === 'ltr') {
    return current === 'right' ? 'left' : 'prev';
  } else {
    return current === 'left' ? 'right' : 'prev';
  }
}

/**
 * 计算双页模式下的图片组合
 * 
 * 规则：
 * 1. 如果当前图是横向且 treatHorizontalAsDoublePage=true，则独占双页
 * 2. 否则，当前图 + 下一图 组成双页
 * 3. RTL 模式下，顺序相反
 */
export function computeDoublePageImages(
  currentImage: FrameImage,
  nextImage: FrameImage | null,
  config: ViewModeConfig
): FrameImage[] {
  const currentSize: ImageSize = {
    width: currentImage.width || 0,
    height: currentImage.height || 0,
  };

  // 横向图独占双页
  if (config.treatHorizontalAsDoublePage && isLandscape(currentSize)) {
    return [currentImage];
  }

  // 没有下一页
  if (!nextImage) {
    return [currentImage];
  }

  const nextSize: ImageSize = {
    width: nextImage.width || 0,
    height: nextImage.height || 0,
  };

  // 下一张是横向图，当前页单独显示
  if (config.treatHorizontalAsDoublePage && isLandscape(nextSize)) {
    return [currentImage];
  }

  // 两张图组成双页
  // 注意：我们始终按逻辑顺序返回 [Current, Next]。
  // RTL 模式下的视觉反转由 CSS (.frame-rtl -> flex-direction: row-reverse) 处理。
  return [currentImage, nextImage];
}

/**
 * 计算双页模式下的翻页步进
 */
export function computeDoublePageStep(
  currentImage: FrameImage,
  nextImage: FrameImage | null,
  config: ViewModeConfig
): number {
  const currentSize: ImageSize = {
    width: currentImage.width || 0,
    height: currentImage.height || 0,
  };

  // 横向图独占，只进1页
  if (config.treatHorizontalAsDoublePage && isLandscape(currentSize)) {
    return 1;
  }

  // 没有下一页，只进1页
  if (!nextImage) {
    return 1;
  }

  const nextSize: ImageSize = {
    width: nextImage.width || 0,
    height: nextImage.height || 0,
  };

  // 下一张是横向图，只进1页
  if (config.treatHorizontalAsDoublePage && isLandscape(nextSize)) {
    return 1;
  }

  // 正常双页，进2页
  return 2;
}

/**
 * 处理横向分割的图片
 * 
 * 将一张横向图分成两个虚拟页
 */
export function applySplitToImage(
  image: FrameImage,
  splitHalf: 'left' | 'right'
): FrameImage {
  return {
    ...image,
    splitHalf,
    // 虚拟页索引需要调整
    virtualIndex: splitHalf === 'left'
      ? image.physicalIndex * 2
      : image.physicalIndex * 2 + 1,
  };
}

/**
 * 处理自动旋转的图片
 * 
 * 横向图旋转90度
 */
export function applyAutoRotate(
  image: FrameImage,
  size: ImageSize
): FrameImage {
  if (isLandscape(size)) {
    return {
      ...image,
      rotation: 90,
    };
  }
  return image;
}

/**
 * 根据配置处理单张图片
 * 
 * 优先级：
 * 1. 横向分割 > 自动旋转（分割开启时不旋转）
 * 2. 自动旋转只在单页模式下生效
 */
export function processImageForDisplay(
  image: FrameImage,
  size: ImageSize,
  config: ViewModeConfig,
  splitState: SplitState | null
): FrameImage {
  // 如果开启横向分割且当前图是横向
  if (config.divideLandscape && isLandscape(size) && config.layout === 'single') {
    if (splitState) {
      return applySplitToImage(image, splitState.half);
    }
    // 默认显示第一半
    return applySplitToImage(image, getInitialSplitHalf(config.direction));
  }

  // 如果开启自动旋转（仅单页模式）
  if (config.autoRotate !== 'none' && config.layout === 'single') {
    const rotationAngle = computeAutoRotateAngle(config.autoRotate, size);
    if (rotationAngle !== null) {
      return { ...image, rotation: rotationAngle };
    }
  }

  return image;
}

/**
 * 计算全景模式下需要显示的页面范围
 */
export function computePanoramaRange(
  currentIndex: number,
  totalPages: number,
  visibleCount: number = 5
): { start: number; end: number } {
  const half = Math.floor(visibleCount / 2);
  let start = Math.max(0, currentIndex - half);
  let end = Math.min(totalPages - 1, currentIndex + half);

  // 调整确保显示 visibleCount 张（如果有的话）
  if (end - start + 1 < visibleCount) {
    if (start === 0) {
      end = Math.min(totalPages - 1, start + visibleCount - 1);
    } else {
      start = Math.max(0, end - visibleCount + 1);
    }
  }

  return { start, end };
}

// ============================================================================
// 帧构建辅助
// ============================================================================

/** 宽页拉伸模式 */
export type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

export interface FrameBuildConfig {
  layout: PageMode;
  orientation: Orientation;
  direction: Direction;
  divideLandscape: boolean;
  treatHorizontalAsDoublePage: boolean;
  autoRotate: AutoRotateMode;
  // 首页/尾页单独显示（参考 NeeView 的 IsSupportedSingleFirstPage/IsSupportedSingleLastPage）
  singleFirstPage: boolean;
  singleLastPage: boolean;
  totalPages: number;
  /** 宽页拉伸模式（双页模式下的对齐方式） */
  widePageStretch?: WidePageStretch;
}

export interface PageData {
  url: string;
  pageIndex: number;
  width?: number;
  height?: number;
}

/**
 * 计算双页模式下的内容缩放比例
 * 【优化】单次遍历计算最大/平均值，避免多次遍历
 * 
 * @param sizes 各元素的原始尺寸
 * @param stretchMode 拉伸模式
 * @returns 每个元素对应的缩放比例
 */
function calculateContentScales(
  sizes: ImageSize[],
  stretchMode: WidePageStretch
): number[] {
  if (sizes.length === 0) return [];
  if (sizes.length === 1) return [1.0];
  
  switch (stretchMode) {
    case 'none':
      return sizes.map(() => 1.0);
    
    case 'uniformHeight': {
      // 【优化】单次遍历找最大高度
      let maxHeight = 0;
      for (const s of sizes) {
        if (s.height > maxHeight) maxHeight = s.height;
      }
      if (maxHeight <= 0) return sizes.map(() => 1.0);
      return sizes.map(s => s.height > 0 ? maxHeight / s.height : 1.0);
    }
    
    case 'uniformWidth': {
      // 【优化】单次遍历计算总宽度
      let totalWidth = 0;
      for (const s of sizes) {
        totalWidth += s.width;
      }
      const avgWidth = totalWidth / sizes.length;
      if (avgWidth <= 0) return sizes.map(() => 1.0);
      return sizes.map(s => s.width > 0 ? avgWidth / s.width : 1.0);
    }
    
    default:
      return sizes.map(() => 1.0);
  }
}

/**
 * 根据配置构建显示图片列表
 * 【优化】减少重复的尺寸检查，提前计算 aspectRatio
 * 
 * @param currentPage 当前页数据
 * @param nextPage 下一页数据（双页模式需要）
 * @param config 配置
 * @param splitState 分割状态（单页分割模式）
 */
export function buildFrameImages(
  currentPage: PageData,
  nextPage: PageData | null,
  config: FrameBuildConfig,
  splitState: SplitState | null = null
): FrameImage[] {
  const currentSize: ImageSize = {
    width: currentPage.width || 0,
    height: currentPage.height || 0,
  };
  // 【优化】提前计算横向判断，避免重复计算
  const isCurrentLandscape = isLandscape(currentSize);

  // 构建主图
  const mainImage: FrameImage = {
    url: currentPage.url,
    physicalIndex: currentPage.pageIndex,
    virtualIndex: currentPage.pageIndex,
    width: currentPage.width,
    height: currentPage.height,
  };

  // 单页模式
  if (config.layout === 'single') {
    // 处理分割
    if (config.divideLandscape && isCurrentLandscape) {
      if (splitState) {
        mainImage.splitHalf = splitState.half;
      } else {
        mainImage.splitHalf = getInitialSplitHalf(config.direction);
      }
      // 【关键】逻辑尺寸减半，确保后续缩放计算正确
      if (mainImage.width) mainImage.width /= 2;
      return [mainImage];
    }

    // 处理自动旋转
    if (config.autoRotate !== 'none') {
      const rotationAngle = computeAutoRotateAngle(config.autoRotate, currentSize);
      if (rotationAngle !== null) {
        mainImage.rotation = rotationAngle;
      }
    }

    return [mainImage];
  }

  // 双页模式
  // 按照 NeeView 的 CreatePageFrame 逻辑：
  // 1. 当前页横向 → 独占
  // 2. 下一页横向 → 当前页独占
  // 3. 首页/尾页检查（检查当前页或下一页）
  // 4. 正常双页
  if (config.layout === 'double') {
    // 1. 当前页横向 → 独占显示
    if (config.treatHorizontalAsDoublePage && isCurrentLandscape) {
      return [mainImage];
    }

    // 2. 没有下一页 → 单页显示
    if (!nextPage) {
      return [mainImage];
    }

    const nextSize: ImageSize = {
      width: nextPage.width || 0,
      height: nextPage.height || 0,
    };
    // 【优化】提前计算横向判断
    const isNextLandscape = isLandscape(nextSize);

    // 3. 下一页横向 → 当前页独占（关键修复点！）
    if (config.treatHorizontalAsDoublePage && isNextLandscape) {
      return [mainImage];
    }

    // 4. 首页/尾页单独显示（检查当前页或下一页是否为首页/尾页）
    const currentIndex = currentPage.pageIndex;
    const nextIndex = nextPage.pageIndex;
    const isFirst = currentIndex === 0 || nextIndex === 0;
    const isLast = config.totalPages > 0 && 
      (currentIndex === config.totalPages - 1 || nextIndex === config.totalPages - 1);
    
    if ((config.singleFirstPage && isFirst) || (config.singleLastPage && isLast)) {
      return [mainImage];
    }

    // 5. 正常双页
    const secondImage: FrameImage = {
      url: nextPage.url,
      physicalIndex: nextPage.pageIndex,
      virtualIndex: nextPage.pageIndex,
      width: nextPage.width,
      height: nextPage.height,
    };

    // 计算双页对齐的 scale
    const stretchMode = config.widePageStretch ?? 'uniformHeight';
    if (stretchMode !== 'none') {
      const sizes: ImageSize[] = [currentSize, nextSize];
      const scales = calculateContentScales(sizes, stretchMode);
      mainImage.scale = scales[0];
      secondImage.scale = scales[1];
    }

    // 根据方向排列
    // 注意：我们始终按逻辑顺序返回 [Current, Next]。
    // RTL 模式下的视觉反转由 CSS (.frame-rtl -> flex-direction: row-reverse) 处理。
    return [mainImage, secondImage];
  }

  // 全景模式：只返回当前图，全景的多图加载由调用方处理
  return [mainImage];
}

/**
 * 计算双页模式的翻页步进
 */
/**
 * 判断页面是否应该被分割（单页模式下的横向图）
 */
export function shouldSplitPage(
  page: PageData,
  divideLandscape: boolean
): boolean {
  if (!divideLandscape) return false;
  const size: ImageSize = {
    width: page.width || 0,
    height: page.height || 0,
  };
  // 需要有有效尺寸且为横向
  return size.width > 0 && size.height > 0 && isLandscape(size);
}

/**
 * 计算单页模式下的下一步导航（支持分割横向页）
 * 
 * @param currentIndex 当前页面索引
 * @param currentSplitHalf 当前分割半边（null 表示非分割状态）
 * @param totalPages 总页数
 * @param direction 阅读方向
 * @param getPageData 获取页面数据的函数
 * @param divideLandscape 是否启用分割横向页
 */
export function getNextSplitNavigation(
  currentIndex: number,
  currentSplitHalf: 'left' | 'right' | null,
  totalPages: number,
  direction: Direction,
  getPageData: (index: number) => PageData | null,
  divideLandscape: boolean
): SplitNavigationResult {
  const currentPage = getPageData(currentIndex);
  if (!currentPage) {
    return { pageIndex: currentIndex, splitHalf: null, step: 0 };
  }

  const isCurrentSplit = shouldSplitPage(currentPage, divideLandscape);

  // 当前页是分割页
  if (isCurrentSplit) {
    // 根据阅读方向决定分割顺序
    // LTR: left -> right -> next page
    // RTL: right -> left -> next page
    const firstHalf: 'left' | 'right' = direction === 'ltr' ? 'left' : 'right';
    const secondHalf: 'left' | 'right' = direction === 'ltr' ? 'right' : 'left';

    if (currentSplitHalf === null || currentSplitHalf === firstHalf) {
      // 当前显示第一半，下一步显示第二半
      return { pageIndex: currentIndex, splitHalf: secondHalf, step: 0.5 };
    } else {
      // 当前显示第二半，跳到下一页
      const nextIndex = currentIndex + 1;
      if (nextIndex >= totalPages) {
        // 已经是最后一页
        return { pageIndex: currentIndex, splitHalf: secondHalf, step: 0 };
      }
      const nextPage = getPageData(nextIndex);
      if (nextPage && shouldSplitPage(nextPage, divideLandscape)) {
        // 下一页也是分割页，从第一半开始
        return { pageIndex: nextIndex, splitHalf: firstHalf, step: 0.5 };
      } else {
        // 下一页不是分割页
        return { pageIndex: nextIndex, splitHalf: null, step: 1 };
      }
    }
  }

  // 当前页不是分割页，正常跳到下一页
  const nextIndex = currentIndex + 1;
  if (nextIndex >= totalPages) {
    return { pageIndex: currentIndex, splitHalf: null, step: 0 };
  }
  const nextPage = getPageData(nextIndex);
  const firstHalf: 'left' | 'right' = direction === 'ltr' ? 'left' : 'right';
  if (nextPage && shouldSplitPage(nextPage, divideLandscape)) {
    // 下一页是分割页，从第一半开始
    return { pageIndex: nextIndex, splitHalf: firstHalf, step: 0.5 };
  } else {
    return { pageIndex: nextIndex, splitHalf: null, step: 1 };
  }
}

/**
 * 计算单页模式下的上一步导航（支持分割横向页）
 */
export function getPrevSplitNavigation(
  currentIndex: number,
  currentSplitHalf: 'left' | 'right' | null,
  totalPages: number,
  direction: Direction,
  getPageData: (index: number) => PageData | null,
  divideLandscape: boolean
): SplitNavigationResult {
  const currentPage = getPageData(currentIndex);
  if (!currentPage) {
    return { pageIndex: currentIndex, splitHalf: null, step: 0 };
  }

  const isCurrentSplit = shouldSplitPage(currentPage, divideLandscape);

  // 根据阅读方向决定分割顺序
  const firstHalf: 'left' | 'right' = direction === 'ltr' ? 'left' : 'right';
  const secondHalf: 'left' | 'right' = direction === 'ltr' ? 'right' : 'left';

  // 当前页是分割页
  if (isCurrentSplit) {
    if (currentSplitHalf === secondHalf) {
      // 当前显示第二半，上一步显示第一半
      return { pageIndex: currentIndex, splitHalf: firstHalf, step: 0.5 };
    } else {
      // 当前显示第一半或null，跳到上一页
      const prevIndex = currentIndex - 1;
      if (prevIndex < 0) {
        // 已经是第一页
        return { pageIndex: currentIndex, splitHalf: firstHalf, step: 0 };
      }
      const prevPage = getPageData(prevIndex);
      if (prevPage && shouldSplitPage(prevPage, divideLandscape)) {
        // 上一页也是分割页，从第二半开始（反向）
        return { pageIndex: prevIndex, splitHalf: secondHalf, step: 0.5 };
      } else {
        // 上一页不是分割页
        return { pageIndex: prevIndex, splitHalf: null, step: 1 };
      }
    }
  }

  // 当前页不是分割页，正常跳到上一页
  const prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    return { pageIndex: currentIndex, splitHalf: null, step: 0 };
  }
  const prevPage = getPageData(prevIndex);
  if (prevPage && shouldSplitPage(prevPage, divideLandscape)) {
    // 上一页是分割页，从第二半开始（反向）
    return { pageIndex: prevIndex, splitHalf: secondHalf, step: 0.5 };
  } else {
    return { pageIndex: prevIndex, splitHalf: null, step: 1 };
  }
}

/**
 * 计算双页模式的翻页步进
 * 【优化】减少重复的尺寸检查，与 buildFrameImages 保持一致
 * 
 * 按照 NeeView 的逻辑：
 * 1. 当前页横向 → 步进 1
 * 2. 下一页横向 → 步进 1
 * 3. 首页/尾页检查 → 步进 1
 * 4. 正常双页 → 步进 2
 */
export function getPageStep(
  currentPage: PageData,
  nextPage: PageData | null,
  config: FrameBuildConfig
): number {
  if (config.layout !== 'double') {
    return 1;
  }

  const currentSize: ImageSize = {
    width: currentPage.width || 0,
    height: currentPage.height || 0,
  };
  // 【优化】使用统一的 isLandscape 函数，内部已处理无效尺寸
  const isCurrentLandscape = isLandscape(currentSize);

  // 1. 当前页横向 → 步进 1
  if (config.treatHorizontalAsDoublePage && isCurrentLandscape) {
    return 1;
  }

  // 2. 没有下一页 → 步进 1
  if (!nextPage) {
    return 1;
  }

  const nextSize: ImageSize = {
    width: nextPage.width || 0,
    height: nextPage.height || 0,
  };
  // 【优化】使用统一的 isLandscape 函数
  const isNextLandscape = isLandscape(nextSize);

  // 3. 下一页横向 → 步进 1
  if (config.treatHorizontalAsDoublePage && isNextLandscape) {
    return 1;
  }

  // 4. 首页/尾页单独显示
  const currentIndex = currentPage.pageIndex;
  const nextIndex = nextPage.pageIndex;
  const isFirst = currentIndex === 0 || nextIndex === 0;
  const isLast = config.totalPages > 0 && 
    (currentIndex === config.totalPages - 1 || nextIndex === config.totalPages - 1);
  
  if ((config.singleFirstPage && isFirst) || (config.singleLastPage && isLast)) {
    return 1;
  }

  // 5. 正常双页 → 步进 2
  return 2;
}
