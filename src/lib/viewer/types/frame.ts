/**
 * 帧相关类型定义
 */

/** 旋转角度 */
export type Rotation = 0 | 90 | 180 | 270;

/** 分割半边 */
export type SplitHalf = 'left' | 'right' | null;

/** 布局模式 */
export type LayoutMode = 'single' | 'double' | 'panorama';

/** 阅读方向 */
export type ReadingDirection = 'ltr' | 'rtl';

/** 帧图像 */
export interface FrameImage {
  /** 图像 URL */
  url: string;
  /** 物理页索引 */
  physicalIndex: number;
  /** 虚拟页索引 */
  virtualIndex: number;
  /** 分割半边 */
  splitHalf: SplitHalf;
  /** 旋转角度 */
  rotation: Rotation;
  /** 原始宽度 */
  width?: number;
  /** 原始高度 */
  height?: number;
  /** 是否为横向图片 */
  isLandscape?: boolean;
  /** 是否已加载 */
  loaded?: boolean;
  /** 加载错误 */
  error?: string | null;
}

/** 帧数据 */
export interface Frame {
  /** 帧唯一 ID */
  id: string;
  /** 帧中的图像列表 */
  images: FrameImage[];
  /** 布局模式 */
  layout: LayoutMode;
  /** 阅读方向 */
  direction: ReadingDirection;
}

/** 空帧 */
export const emptyFrame: Frame = {
  id: '',
  images: [],
  layout: 'single',
  direction: 'ltr',
};

/** 创建帧图像 */
export function createFrameImage(
  url: string,
  physicalIndex: number,
  virtualIndex: number,
  options: Partial<Omit<FrameImage, 'url' | 'physicalIndex' | 'virtualIndex'>> = {}
): FrameImage {
  return {
    url,
    physicalIndex,
    virtualIndex,
    splitHalf: options.splitHalf ?? null,
    rotation: options.rotation ?? 0,
    width: options.width,
    height: options.height,
    isLandscape: options.isLandscape,
    loaded: options.loaded ?? false,
    error: options.error ?? null,
  };
}

/** 创建帧 */
export function createFrame(
  id: string,
  images: FrameImage[],
  layout: LayoutMode = 'single',
  direction: ReadingDirection = 'ltr'
): Frame {
  return { id, images, layout, direction };
}
