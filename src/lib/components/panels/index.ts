/**
 * NeoView - Panel Components Index
 * 面板组件统一导出 - 供两个边栏共用
 */

// 左侧默认面板
export { default as FolderPanel } from './folderPanel/FolderPanel.svelte';
export { default as HistoryPanel } from './HistoryPanel.svelte';
export { default as BookmarkPanel } from './BookmarkPanel.svelte';
export { default as BookPageListPanel } from './BookPageListPanel.svelte';

// 右侧默认面板
export { default as InfoPanel } from './InfoPanel.svelte';
export { default as ImagePropertiesPanel } from './ImagePropertiesPanel.svelte';
export { default as UpscalePanel } from './UpscalePanel.svelte';
export { default as DataInsightsPanel } from './DataInsightsPanel.svelte';

// 其他面板
export { default as SidebarManagementPanel } from './SidebarManagementPanel.svelte';

// 面板组件映射 - 使用 any 类型避免复杂的类型问题
import FolderPanel from './folderPanel/FolderPanel.svelte';
import HistoryPanel from './HistoryPanel.svelte';
import BookmarkPanel from './BookmarkPanel.svelte';
import BookPageListPanel from './BookPageListPanel.svelte';
import InfoPanel from './InfoPanel.svelte';
import ImagePropertiesPanel from './ImagePropertiesPanel.svelte';
import UpscalePanel from './UpscalePanel.svelte';
import DataInsightsPanel from './DataInsightsPanel.svelte';

import type { PanelId } from '$lib/stores/sidebarConfig.svelte';

/**
 * 面板组件注册表
 * 所有面板组件的统一映射，供两个边栏共用
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_COMPONENTS: Record<PanelId, any> = {
	// 左侧默认面板
	folder: FolderPanel,
	history: HistoryPanel,
	bookmark: BookmarkPanel,
	thumbnail: BookPageListPanel,
	playlist: FolderPanel, // 占位，后续实现
	// 右侧默认面板
	info: InfoPanel,
	properties: ImagePropertiesPanel,
	upscale: UpscalePanel,
	insights: DataInsightsPanel,
	// 其他
	settings: FolderPanel // 占位，后续实现
};

/**
 * 获取面板组件
 */
export function getPanelComponent(panelId: PanelId): typeof FolderPanel | undefined {
	return PANEL_COMPONENTS[panelId];
}
