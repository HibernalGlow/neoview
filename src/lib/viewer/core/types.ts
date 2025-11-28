/**
 * NeoViewer 核心类型定义
 */

// 基础类型
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

// 旋转角度
export type Rotation = 0 | 90 | 180 | 270;

// 视图模式
export type ViewMode = 'single' | 'double' | 'panorama';

// 适应模式
export type FitMode = 'contain' | 'cover' | 'none' | 'width' | 'height';

// 分割半边
export type SplitHalf = 'left' | 'right' | null;

// 阅读方向
export type ReadingDirection = 'left-to-right' | 'right-to-left';

// 页面信息
export interface PageInfo {
  index: number;
  src: string | null;
  rotation: Rotation;
  splitHalf: SplitHalf;
  isDivided: boolean;
}

// 视图状态
export interface ViewState {
  scale: number;
  offset: Point;
  rotation: Rotation;
}

// 手势事件
export interface GestureCallbacks {
  onPan?: (delta: Point) => void;
  onZoom?: (scale: number, center: Point) => void;
  onTap?: (point: Point) => void;
  onDoubleTap?: (point: Point) => void;
}

// 页面导航回调
export interface NavigationCallbacks {
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onGoToPage?: (index: number) => void;
}
