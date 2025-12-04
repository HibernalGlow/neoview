/**
 * ViewerJS 配置类型定义
 */

/** ViewerJS 选项 */
export interface ViewerJSOptions {
  /** 是否启用滚轮缩放 */
  zoomOnWheel: boolean;
  /** 是否启用触摸缩放 */
  zoomOnTouch: boolean;
  /** 是否可移动 */
  movable: boolean;
  /** 是否可旋转 */
  rotatable: boolean;
  /** 是否启用键盘 */
  keyboard: boolean;
  /** 是否显示工具栏 */
  toolbar: boolean;
  /** 是否显示导航栏 */
  navbar: boolean;
  /** 是否显示标题 */
  title: boolean;
  /** 是否内联模式 */
  inline: boolean;
  /** 是否启用过渡动画 */
  transition: boolean;
  /** 最小缩放比例 */
  minZoomRatio: number;
  /** 最大缩放比例 */
  maxZoomRatio: number;
  /** 初始覆盖率 (0-1) */
  initialCoverage: number;
}

/** 默认 ViewerJS 选项 */
export const defaultViewerJSOptions: ViewerJSOptions = {
  zoomOnWheel: true,
  zoomOnTouch: true,
  movable: true,
  rotatable: false,
  keyboard: false,
  toolbar: false,
  navbar: false,
  title: false,
  inline: true,
  transition: true,
  minZoomRatio: 0.1,
  maxZoomRatio: 10,
  initialCoverage: 0.95,
};

/** 为阅读优化的选项 - 禁用滚轮缩放（用于翻页） */
export const readerViewerJSOptions: ViewerJSOptions = {
  ...defaultViewerJSOptions,
  zoomOnWheel: false, // 滚轮用于翻页
  zoomOnTouch: true,  // 触摸缩放保留
  movable: true,
  rotatable: false,
  transition: false,  // 更快响应
};

/** ViewerJS 缩放事件 */
export interface ViewerZoomEvent {
  ratio: number;
  oldRatio: number;
}

/** ViewerJS 移动事件 */
export interface ViewerMoveEvent {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

/** ViewerJS 旋转事件 */
export interface ViewerRotateEvent {
  degree: number;
  oldDegree: number;
}
