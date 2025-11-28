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
export { default as NeoViewer2 } from './NeoViewer2.svelte';
// 注意：StackViewer 已迁移到 $lib/stackview

// 工具类
export { GestureHandler } from './GestureHandler';
export type { GestureEvents, GestureConfig } from './GestureHandler';

// Composables (后续完善)
// export * from './composables';

// Utils
export * from './utils';

// Loaders
export * from './loaders';
