/**
 * FolderTabStore 模块入口
 * 统一导出所有子模块的功能，保持原有 API 兼容性
 */

// ============ 类型导出 ============

export type {
FolderHistoryEntry,
FolderStackLayer,
RecentlyClosedTab,
TabBarLayout,
BreadcrumbPosition,
ToolbarPosition,
PanelMode,
PanelLayoutSettings,
PerPanelLayoutSettings,
SortInheritStrategy,
SharedSortSettings,
SharedFolderTreeSettings,
FolderTabState,
FolderTabsState,
VirtualPathType,
FsItem,
FolderViewStyle,
FolderSortField,
FolderSortOrder,
DeleteStrategy
} from './types';

export { VIRTUAL_PATHS, MAX_RECENTLY_CLOSED, STORAGE_KEYS, DEFAULT_PANEL_LAYOUT_SETTINGS } from './types';

// ============ 工具函数导出 ============

export {
isVirtualPath,
getVirtualPathType,
getVirtualDisplayName,
getDisplayName,
generateTabId,
normalizePath
} from './utils.svelte';

// ============ 派生 Stores 导出 ============

export {
allTabs,
activeTabId,
activeTab,
tabCurrentPath,
tabItems,
tabSelectedItems,
tabLoading,
tabError,
tabViewStyle,
tabSortConfig,
tabMultiSelectMode,
tabDeleteMode,
tabSearchKeyword,
tabIsSearching,
tabShowSearchBar,
tabShowMigrationBar,
tabShowPenetrateSettingsBar,
tabPenetrateMode,
tabOpenInNewTabMode,
tabDeleteStrategy,
tabSearchSettings,
tabInlineTreeMode,
tabExpandedFolders,
tabFolderTreeConfig,
tabCanGoBack,
tabCanGoForward,
tabCanGoUp,
tabItemCount,
tabStackLayers,
tabStackActiveIndex,
tabThumbnailWidthPercent,
tabBannerWidthPercent,
tabPendingFocusPath,
tabCanGoBackTab,
tabCanGoForwardTab,
recentlyClosedTabs
} from './derivedStores.svelte';

// ============ 全局搜索结果 Store 导出 ============

export { globalSearchResults, globalSearchResults as tabSearchResults } from './sortingFiltering.svelte';

// ============ 布局设置 Stores 导出 ============

export {
folderTabBarLayout,
folderTabBarWidth,
folderBreadcrumbPosition,
folderToolbarPosition,
bookmarkTabBarLayout,
bookmarkTabBarWidth,
bookmarkBreadcrumbPosition,
bookmarkToolbarPosition,
historyTabBarLayout,
historyTabBarWidth,
historyBreadcrumbPosition,
historyToolbarPosition,
tabBarLayout,
tabBarWidth,
breadcrumbPosition,
toolbarPosition,
getPanelLayoutStores
} from './layoutSettings.svelte';

// ============ Store 订阅导出 ============

import { store } from './tabManagement.svelte';
export const folderTabsStore = {
subscribe: store.subscribe
};

// ============ Actions 对象导出（保持原有 API 兼容） ============

import {
createTab,
closeTab,
closeOthers,
closeLeft,
closeRight,
togglePinned,
setPinned,
reopenClosedTab,
getRecentlyClosedTabs,
switchTab,
duplicateTab,
getActiveTab,
getAllTabs
} from './tabManagement.svelte';

import {
setPath,
peekBack,
findPathInHistory,
goToHistoryIndex,
goBack,
goForward,
canGoBackTab,
canGoForwardTab,
goBackTab,
goForwardTab,
goHome,
setHomePath,
updateScrollPosition,
clearHistory,
getHistory
} from './navigationHistory.svelte';

import {
setViewStyle,
setSort,
getSortSettings,
resolveSortForTab,
toggleSortLock,
setSortLocked,
setSortStrategy,
setDefaultSortScope,
setCurrentSortAsDefault,
clearFolderSortMemory,
getFolderSortMemoryEntries,
setCachedSortedItems,
getCachedSortedItems,
getCachedSortedMeta,
toggleMultiSelectMode,
toggleDeleteMode,
toggleRecursiveMode,
togglePenetrateMode,
toggleOpenInNewTabMode,
setDeleteStrategy,
toggleDeleteStrategy,
setSearchKeyword,
setSearchResults,
setIsSearching,
clearSearch,
setSearchSettings,
toggleShowSearchBar,
toggleShowMigrationBar,
toggleShowPenetrateSettingsBar,
setItems,
removeItem,
setLoading,
setError
} from './sortingFiltering.svelte';

import {
selectItem,
selectRange,
getLastSelectedIndex,
setLastSelectedIndex,
selectAll,
deselectAll,
setSelectedItems,
invertSelection,
setFocusedItem,
focusOnPath,
clearPendingFocusPath,
toggleFolderTree,
setFolderTreeLayout,
setFolderTreeSize,
toggleInlineTreeMode,
expandFolder,
collapseFolder,
toggleFolderExpand,
setStackLayers,
getStackLayers,
setStackActiveIndex,
setThumbnailWidthPercent,
setBannerWidthPercent
} from './selectionFolderTree.svelte';

import {
setTabBarLayout,
getTabBarLayout,
setTabBarWidth,
getTabBarWidth,
setBreadcrumbPosition,
getBreadcrumbPosition,
setToolbarPosition,
getToolbarPosition
} from './layoutSettings.svelte';

/** 统一的 Actions 对象，保持原有 API 兼容性 */
export const folderTabActions = {
// 标签页管理
createTab,
closeTab,
closeOthers,
closeLeft,
closeRight,
togglePinned,
setPinned,
reopenClosedTab,
getRecentlyClosedTabs,
switchTab,
duplicateTab,
getActiveTab,
getAllTabs,

// 导航历史
setPath,
peekBack,
findPathInHistory,
goToHistoryIndex,
goBack,
goForward,
canGoBackTab,
canGoForwardTab,
goBackTab,
goForwardTab,
goHome,
setHomePath,
updateScrollPosition,
clearHistory,
getHistory,

// 视图和排序
setViewStyle,
setSort,
getSortSettings,
resolveSortForTab,
toggleSortLock,
setCachedSortedItems,
getCachedSortedItems,
getCachedSortedMeta,
setSortLocked,
setSortStrategy,
setDefaultSortScope,
setCurrentSortAsDefault,
clearFolderSortMemory,
getFolderSortMemoryEntries,

// 模式切换
toggleMultiSelectMode,
toggleDeleteMode,
toggleRecursiveMode,
togglePenetrateMode,
toggleOpenInNewTabMode,
setDeleteStrategy,
toggleDeleteStrategy,

// 搜索
setSearchKeyword,
setSearchResults,
setIsSearching,
clearSearch,
setSearchSettings,
toggleShowSearchBar,
toggleShowMigrationBar,
toggleShowPenetrateSettingsBar,

// 文件列表
setItems,
removeItem,
setLoading,
setError,

// 选择
selectItem,
selectRange,
getLastSelectedIndex,
setLastSelectedIndex,
selectAll,
deselectAll,
setSelectedItems,
invertSelection,
setFocusedItem,
focusOnPath,
clearPendingFocusPath,

// 文件夹树
toggleFolderTree,
setFolderTreeLayout,
setFolderTreeSize,
toggleInlineTreeMode,
expandFolder,
collapseFolder,
toggleFolderExpand,

// 层叠栈
setStackLayers,
getStackLayers,
setStackActiveIndex,
setThumbnailWidthPercent,
setBannerWidthPercent,

// 布局设置
setTabBarLayout,
getTabBarLayout,
setTabBarWidth,
getTabBarWidth,
setBreadcrumbPosition,
getBreadcrumbPosition,
setToolbarPosition,
getToolbarPosition
};
