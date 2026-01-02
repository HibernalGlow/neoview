/**
 * StackView 层组件导出
 */

export { default as BackgroundLayer } from './BackgroundLayer.svelte';
export { default as PrevFrameLayer } from './PrevFrameLayer.svelte';
export { default as NextFrameLayer } from './NextFrameLayer.svelte';
export { default as CurrentFrameLayer } from './CurrentFrameLayer.svelte';
export { default as UpscaleLayer } from './UpscaleLayer.svelte';
export { default as InfoLayer } from './InfoLayer.svelte';
export { default as GestureLayer } from './GestureLayer.svelte';
export { default as HoverLayer } from './HoverLayer.svelte';
export { default as LayerTreeView } from './LayerTreeView.svelte';

// 新增：从 ImageViewer 解耦的浮窗层
export { default as ImageInfoLayer } from './ImageInfoLayer.svelte';
export { default as ProgressBarLayer } from './ProgressBarLayer.svelte';
export { default as SidebarControlLayer } from './SidebarControlLayer.svelte';

// 翻译叠加层
export { default as TranslationOverlay } from './TranslationOverlay.svelte';
