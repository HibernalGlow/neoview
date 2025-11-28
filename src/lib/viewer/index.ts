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

// 核心类型
export * from './core';

// 组件
export { default as NeoViewer } from './NeoViewer.svelte';
export { default as ImageRenderer } from './ImageRenderer.svelte';
export { default as NewViewer } from './NewViewer.svelte';

// 工具类
export { GestureHandler } from './GestureHandler';
export type { GestureEvents, GestureConfig } from './GestureHandler';

// Composables (后续完善)
// export * from './composables';

// Utils
export * from './utils';

// Loaders
export * from './loaders';
