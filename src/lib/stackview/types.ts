/**
 * StackViewer 类型定义
 */

/** 旋转角度 */
export type Rotation = 0 | 90 | 180 | 270;

/** 分割半边 */
export type SplitHalf = 'left' | 'right' | null;

/** 布局模式 */
export type LayoutMode = 'single' | 'double' | 'panorama';

/** 阅读方向 */
export type ReadingDirection = 'ltr' | 'rtl';

/** 点 */
export interface Point {
  x: number;
  y: number;
}

/** 变换状态 */
export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: Rotation;
}

/** 帧图像 */
export interface FrameImage {
  url: string;
  physicalIndex: number;
  splitHalf: SplitHalf;
  rotation: Rotation;
  width?: number;
  height?: number;
  loaded?: boolean;
}

/** 帧数据 */
export interface Frame {
  id: string;
  images: FrameImage[];
  layout: LayoutMode;
  direction: ReadingDirection;
}

/** 空帧 */
export const emptyFrame: Frame = {
  id: '',
  images: [],
  layout: 'single',
  direction: 'ltr',
};

/** 默认变换 */
export const defaultTransform: Transform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

/** 计算变换 CSS */
export function computeTransformCSS(t: Transform): string {
  const parts: string[] = [];
  if (t.offsetX !== 0 || t.offsetY !== 0) {
    parts.push(`translate(${t.offsetX}px, ${t.offsetY}px)`);
  }
  if (t.scale !== 1) {
    parts.push(`scale(${t.scale})`);
  }
  if (t.rotation !== 0) {
    parts.push(`rotate(${t.rotation}deg)`);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}
