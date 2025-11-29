/**
 * 手势相关类型定义
 */

/** 点 */
export interface Point {
  x: number;
  y: number;
}

/** 点击区域 */
export type TapZone = 'left' | 'center' | 'right';

/** 手势配置 */
export interface GestureConfig {
  /** 启用点击 */
  enableTap: boolean;
  /** 启用双击 */
  enableDoubleTap: boolean;
  /** 启用平移 */
  enablePan: boolean;
  /** 启用捏合缩放 */
  enablePinch: boolean;
  /** 启用滚轮 */
  enableWheel: boolean;
  /** 点击区域配置 */
  tapZones: {
    /** 左侧区域占比 (0-1) */
    left: number;
    /** 右侧区域占比 (0-1) */
    right: number;
  };
}

/** 手势事件 */
export interface GestureEvents {
  /** 点击 */
  onTap?: (zone: TapZone, point: Point) => void;
  /** 双击 */
  onDoubleTap?: (point: Point) => void;
  /** 平移 */
  onPan?: (delta: Point) => void;
  /** 平移开始 */
  onPanStart?: (point: Point) => void;
  /** 平移结束 */
  onPanEnd?: (point: Point) => void;
  /** 捏合缩放 */
  onPinch?: (scale: number, center: Point) => void;
  /** 滚轮 */
  onWheel?: (delta: number, point: Point) => void;
}

/** 默认手势配置 */
export const defaultGestureConfig: GestureConfig = {
  enableTap: true,
  enableDoubleTap: true,
  enablePan: true,
  enablePinch: true,
  enableWheel: true,
  tapZones: {
    left: 0.3,
    right: 0.7,
  },
};
