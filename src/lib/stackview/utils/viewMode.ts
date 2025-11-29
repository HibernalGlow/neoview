/**
 * 视图模式工具函数
 * 
 * 处理单页/双页/全景模式的逻辑
 * 严格参考 NeeView 的实现
 */

import type { FrameImage, FrameLayout } from '../types/frame';

/** 图片尺寸信息 */
export interface ImageSize {
  width: number;
  height: number;
}

/** 视图模式配置 */
export interface ViewModeConfig {
  /** 当前布局 */
  layout: FrameLayout;
  /** 阅读方向 */
  direction: 'ltr' | 'rtl';
  /** 是否启用横向分割 */
  divideLandscape: boolean;
  /** 是否将横向图视为双页 */
  treatHorizontalAsDoublePage: boolean;
  /** 是否启用自动旋转 */
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
