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
  /** 是否启用自动旋转（仅 single 模式） */
  autoRotate: boolean;
}

/** 分割状态 */
export interface SplitState {
  /** 当前页索引 */
  pageIndex: number;
  /** 当前显示的半边 */
  half: 'left' | 'right';
}

/**
 * 判断图片是否为横向
 */
export function isLandscape(size: ImageSize): boolean {
  return size.width > size.height;
}

/**
 * 判断图片是否为纵向
 */
export function isPortrait(size: ImageSize): boolean {
  return size.height >= size.width;
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
  if (config.direction === 'rtl') {
    return [nextImage, currentImage]; // RTL: 下一张在左，当前在右
  }
  return [currentImage, nextImage]; // LTR: 当前在左，下一张在右
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

  // 如果开启自动旋转且当前图是横向（仅单页模式）
  if (config.autoRotate && isLandscape(size) && config.layout === 'single') {
    return applyAutoRotate(image, size);
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

export interface FrameBuildConfig {
  layout: PageMode;
  orientation: Orientation;
  direction: Direction;
  divideLandscape: boolean;
  treatHorizontalAsDoublePage: boolean;
  autoRotate: boolean;
}

export interface PageData {
  url: string;
  pageIndex: number;
  width?: number;
  height?: number;
}

/**
 * 根据配置构建显示图片列表
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
    if (config.divideLandscape && isLandscape(currentSize)) {
      if (splitState) {
        mainImage.splitHalf = splitState.half;
      } else {
        mainImage.splitHalf = getInitialSplitHalf(config.direction);
      }
      return [mainImage];
    }
    
    // 处理自动旋转
    if (config.autoRotate && isLandscape(currentSize)) {
      mainImage.rotation = 90;
    }
    
    return [mainImage];
  }
  
  // 双页模式
  if (config.layout === 'double') {
    // 横向图独占
    if (config.treatHorizontalAsDoublePage && isLandscape(currentSize)) {
      return [mainImage];
    }
    
    // 没有下一页
    if (!nextPage) {
      return [mainImage];
    }
    
    const nextSize: ImageSize = {
      width: nextPage.width || 0,
      height: nextPage.height || 0,
    };
    
    // 下一张是横向图，当前页单独显示
    if (config.treatHorizontalAsDoublePage && isLandscape(nextSize)) {
      return [mainImage];
    }
    
    // 构建第二张图
    const secondImage: FrameImage = {
      url: nextPage.url,
      physicalIndex: nextPage.pageIndex,
      virtualIndex: nextPage.pageIndex,
      width: nextPage.width,
      height: nextPage.height,
    };
    
    // 根据方向排列
    if (config.direction === 'rtl') {
      return [secondImage, mainImage]; // RTL: 下一张在前
    }
    return [mainImage, secondImage]; // LTR: 当前在前
  }
  
  // 全景模式：只返回当前图，全景的多图加载由调用方处理
  return [mainImage];
}

/**
 * 计算双页模式的翻页步进
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
  
  // 横向图独占
  if (config.treatHorizontalAsDoublePage && isLandscape(currentSize)) {
    return 1;
  }
  
  if (!nextPage) {
    return 1;
  }
  
  const nextSize: ImageSize = {
    width: nextPage.width || 0,
    height: nextPage.height || 0,
  };
  
  // 下一张是横向图
  if (config.treatHorizontalAsDoublePage && isLandscape(nextSize)) {
    return 1;
  }
  
  return 2;
}
