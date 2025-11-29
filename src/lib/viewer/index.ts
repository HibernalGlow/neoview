/**
 * NeoViewer 模块导出
 * 
 * 模块化架构：
 * - core/: 核心类型定义
 * - composables/: 可组合函数
 * - components/: UI 组件
 * 
 * 主要组件：
 * - NeoViewer: 主组件，兼容 ImageViewerDisplay 接口
 * - ImageRenderer: 图片渲染组件
 * - GestureHandler: 手势处理器
 */

// 组件
export { default as NeoViewer } from './NeoViewer.svelte';
export { default as NeoViewer2 } from './NeoViewer2.svelte';
export { default as StackViewer } from './StackViewer.svelte';

// 层组件
export * from './layers';

// 帧组件
export * from './frames';

// Stores
export * from './stores';

// StackViewer 类型 (新系统)
export type {
  Frame,
  FrameImage,
  LayoutMode,
  ReadingDirection as StackReadingDirection,
  Rotation as StackRotation,
  SplitHalf,
} from './types/frame';
export type { Transform } from './types/transform';
export type { Point as StackPoint, TapZone, GestureConfig as StackGestureConfig } from './types/gesture';
export type { LayerId, LayerConfig, LayerState } from './types/layer';
export { emptyFrame, createFrame, createFrameImage } from './types/frame';
export { defaultTransform, resetTransform, computeTransformCSS, computeClipPath, computeSplitTranslate } from './types/transform';
export { defaultGestureConfig } from './types/gesture';
export { DEFAULT_LAYER_Z_INDEX } from './types/layer';

// 旧核心类型 (保持兼容)
export * from './core';

// 工具类
export { GestureHandler } from './GestureHandler';
export type { GestureEvents, GestureConfig } from './GestureHandler';

// Composables (后续完善)
// export * from './composables';

// Utils
export * from './utils';

// Loaders
export * from './loaders';
