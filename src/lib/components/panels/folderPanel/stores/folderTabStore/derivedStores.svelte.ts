/**
 * 派生 Stores 模块
 * 包含所有从主 Store 派生的响应式状态
 */

import { derived } from 'svelte/store';
import { SvelteSet } from 'svelte/reactivity';
import { store, recentlyClosedTabsStore } from './tabManagement.svelte';

// ============ 基础派生 Stores ============

/** 所有标签页 */
export const allTabs = derived(store, ($store) => $store.tabs);

/** 当前活动标签页 ID */
export const activeTabId = derived(store, ($store) => $store.activeTabId);

/** 当前活动标签页 */
export const activeTab = derived(store, ($store) => {
return $store.tabs.find((tab) => tab.id === $store.activeTabId) || $store.tabs[0];
});

// ============ 活动页签状态派生 Stores ============

export const tabCurrentPath = derived(activeTab, ($tab) => $tab?.currentPath || '');
export const tabItems = derived(activeTab, ($tab) => $tab?.items || []);
export const tabSelectedItems = derived(activeTab, ($tab) => $tab?.selectedItems || new SvelteSet());
export const tabLoading = derived(activeTab, ($tab) => $tab?.loading || false);
export const tabError = derived(activeTab, ($tab) => $tab?.error || null);
export const tabViewStyle = derived(activeTab, ($tab) => $tab?.viewStyle || 'list');

export const tabSortConfig = derived(activeTab, ($tab) => ({
field: $tab?.sortField || 'name',
order: $tab?.sortOrder || 'asc'
}));

export const tabMultiSelectMode = derived(activeTab, ($tab) => $tab?.multiSelectMode || false);
export const tabDeleteMode = derived(activeTab, ($tab) => $tab?.deleteMode || false);
export const tabSearchKeyword = derived(activeTab, ($tab) => $tab?.searchKeyword || '');
export const tabIsSearching = derived(activeTab, ($tab) => $tab?.isSearching || false);
export const tabShowSearchBar = derived(activeTab, ($tab) => $tab?.showSearchBar || false);
export const tabShowMigrationBar = derived(activeTab, ($tab) => $tab?.showMigrationBar || false);
export const tabShowPenetrateSettingsBar = derived(activeTab, ($tab) => $tab?.showPenetrateSettingsBar || false);
export const tabPenetrateMode = derived(activeTab, ($tab) => $tab?.penetrateMode || false);
export const tabOpenInNewTabMode = derived(activeTab, ($tab) => $tab?.openInNewTabMode || false);
export const tabDeleteStrategy = derived(activeTab, ($tab) => $tab?.deleteStrategy || 'trash');

export const tabSearchSettings = derived(activeTab, ($tab) => $tab?.searchSettings || {
includeSubfolders: true,
showHistoryOnFocus: true,
searchInPath: false
});

export const tabInlineTreeMode = derived(activeTab, ($tab) => $tab?.inlineTreeMode || false);
export const tabExpandedFolders = derived(activeTab, ($tab) => $tab?.expandedFolders || new SvelteSet());

export const tabFolderTreeConfig = derived(activeTab, ($tab) => ({
visible: $tab?.folderTreeVisible || false,
layout: $tab?.folderTreeLayout || 'left',
size: $tab?.folderTreeSize || 200
}));

// ============ 导航状态派生 Stores ============

export const tabCanGoBack = derived(activeTab, ($tab) => ($tab?.historyIndex || 0) > 0);

export const tabCanGoForward = derived(activeTab, ($tab) => {
const index = $tab?.historyIndex ?? -1;
const stackLength = $tab?.historyStack?.length ?? 0;
return index < stackLength - 1;
});

export const tabCanGoUp = derived(activeTab, ($tab) => {
if (!$tab?.currentPath) return false;
const normalized = $tab.currentPath.replace(/\\/g, '/');
return normalized.split('/').filter(Boolean).length > 1;
});

export const tabItemCount = derived(activeTab, ($tab) => $tab?.items?.length || 0);

// ============ 层叠栈状态派生 Stores ============

export const tabStackLayers = derived(activeTab, ($tab) => $tab?.stackLayers || []);
export const tabStackActiveIndex = derived(activeTab, ($tab) => $tab?.stackActiveIndex || 0);

// ============ 视图宽度派生 Stores ============

export const tabThumbnailWidthPercent = derived(activeTab, ($tab) => $tab?.thumbnailWidthPercent || 20);
export const tabBannerWidthPercent = derived(activeTab, ($tab) => $tab?.bannerWidthPercent || 50);

// ============ 待聚焦路径派生 Store ============

export const tabPendingFocusPath = derived(activeTab, ($tab) => $tab?.pendingFocusPath || null);

// ============ 标签页导航历史状态派生 Stores ============

export const tabCanGoBackTab = derived(store, ($store) => $store.tabNavHistoryIndex > 0);
export const tabCanGoForwardTab = derived(store, ($store) => $store.tabNavHistoryIndex < $store.tabNavHistory.length - 1);

// ============ 最近关闭标签页派生 Store ============

export const recentlyClosedTabs = derived(recentlyClosedTabsStore, ($tabs) => $tabs);
