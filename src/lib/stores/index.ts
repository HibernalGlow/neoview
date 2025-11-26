/**
 * NeoView - Store Exports
 * 统一导出所有 Store
 */

export * from './book.svelte';
export * from './bookmark.svelte';
export * from './ui.svelte';
export * from './keyboard.svelte';
export * from './fileBrowser.svelte';
export * from './infoPanel.svelte';
export * from './insightsPanel.svelte';
// panels.svelte 导出的 PanelType 与 ui.svelte 冲突，需要单独导入
export {
	panels,
	sidebars,
	activePanel,
	draggingPanel,
	panelsByLocation,
	leftPanels,
	rightPanels,
	bottomPanels,
	togglePanelSidebar,
	setPanelSidebarSize,
	togglePanelVisibility,
	movePanelToLocation,
	reorderPanels,
	setActivePanelTab,
	startDraggingPanel,
	stopDraggingPanel,
	resetPanelLayout
} from './panels.svelte';
export type { PanelConfig, SidebarConfig, PanelLocation } from './panels.svelte';
// 重命名 panels.svelte 的 PanelType 避免冲突
export type { PanelType as PanelTabType } from './panels.svelte';
