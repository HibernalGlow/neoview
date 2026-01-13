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

// Store 工具函数
export {
	createPersistedState,
	createState,
	createAsyncStore,
	type PersistedStateOptions,
	type PersistedState,
	type AsyncStoreOptions,
	type AsyncStore,
	type AsyncState
} from './utils';

// 新版侧边栏配置 - sidebarConfig.svelte.ts (完全替代旧的 panels.svelte)
export {
	sidebarConfigStore,
	sidebarLeftPanels,
	sidebarRightPanels,
	sidebarAllPanels,
	sidebarHiddenPanels,
	activePanel,
	setActivePanelTab,
	// 高度配置
	leftSidebarHeight,
	leftSidebarCustomHeight,
	leftSidebarVerticalAlign,
	rightSidebarHeight,
	rightSidebarCustomHeight,
	rightSidebarVerticalAlign,
	SIDEBAR_HEIGHT_PRESETS,
	getSidebarHeightPercent,
	getVerticalAlignStyle,
	type PanelId,
	type PanelPosition,
	type PanelConfig,
	type SidebarConfigState,
	type SidebarHeightPreset,
	type SidebarVerticalAlign
} from './sidebarConfig.svelte';

// 兼容性别名
export { sidebarLeftPanels as leftPanels } from './sidebarConfig.svelte';
export { sidebarRightPanels as rightPanels } from './sidebarConfig.svelte';
export type { PanelId as PanelTabType } from './sidebarConfig.svelte';

// NeoView 新架构 - 后端主导加载系统
export { pageStore, type PageState } from './pageStore.svelte';

// 加载模式
export { loadModeStore, type LoadModeConfig, type DataSource, type RenderMode } from './loadModeStore.svelte';

// 颜色滤镜
export { filterStore, type FilterSettings, type ColorPoint, colorPresets, defaultFilterSettings } from './filterStore.svelte';
