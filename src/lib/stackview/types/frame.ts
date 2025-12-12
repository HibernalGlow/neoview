/**
 * 帧相关类型定义
 */

/**
 * 裁剪区域（归一化坐标 0-1）
 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 帧中的单张图片
 */
export interface FrameImage {
  /** 图片 URL */
  url: string;
  /** 物理页面索引 */
  physicalIndex: number;
  /** 虚拟页面索引 */
  virtualIndex: number;
  /** 分割半边（旧方式，兼容） */
  splitHalf?: 'left' | 'right' | null;
  /** 裁剪区域（新方式，优先于 splitHalf） */
  cropRect?: CropRect;
  /** 旋转角度 */
  rotation?: number;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
  /** 是否为视频 */
  isVideo?: boolean;
}

/**
 * 帧布局类型
 */
export type FrameLayout = 'single' | 'double' | 'panorama';

/**
 * 帧数据
 */
export interface Frame {
  /** 帧 ID */
  id: string;
  /** 帧中的图片列表 */
  images: FrameImage[];
  /** 布局类型 */
  layout: FrameLayout;
}

/**
 * 空帧常量
 */
export const emptyFrame: Frame = {
  id: '',
  images: [],
  layout: 'single',
};

/**
 * 帧提供者接口
 */
export interface FrameProvider {
  /** 获取当前帧 */
  getCurrentFrame(): Frame;
  /** 获取前一帧 */
  getPrevFrame(): Frame;
  /** 获取后一帧 */
  getNextFrame(): Frame;
  /** 获取超分帧 */
  getUpscaledFrame(): Frame | null;
}
