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

// 新版侧边栏配置 - sidebarConfig.svelte.ts (完全替代旧的 panels.svelte)
export {
	sidebarConfigStore,
	sidebarLeftPanels,
	sidebarRightPanels,
	sidebarAllPanels,
	sidebarHiddenPanels,
	activePanel,
	setActivePanelTab,
	type PanelId,
	type PanelPosition,
	type PanelConfig,
	type SidebarConfigState
} from './sidebarConfig.svelte';

// 兼容性别名
export { sidebarLeftPanels as leftPanels } from './sidebarConfig.svelte';
export { sidebarRightPanels as rightPanels } from './sidebarConfig.svelte';
export type { PanelId as PanelTabType } from './sidebarConfig.svelte';
