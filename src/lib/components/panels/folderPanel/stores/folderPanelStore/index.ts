/**
 * FolderPanel Store - 文件面板状态管理
 * 参考 NeeView 的 FolderListViewModel 设计
 * 
 * 模块结构:
 * - types.ts: 类型定义
 * - panelState.svelte.ts: 面板状态管理
 * - selectionState.svelte.ts: 选择状态管理
 * - core.svelte.ts: 核心模块和 Actions
 */

// ============ Re-export Types ============

export type {
FolderViewStyle,
FolderSortField,
FolderSortOrder,
DeleteStrategy,
FolderHistoryEntry,
FolderItemPosition,
SearchSettings,
FolderPanelState,
SortConfig,
FolderTreeConfig,
HistoryRecord
} from './types';

// ============ Re-export Panel State ============

export {
// Stores
state,
historyStack,
historyIndex,
homePath,
externalNavigationRequest,
// Derived stores
currentPath,
items,
loading,
error,
viewStyle,
recursiveMode,
penetrateMode,
deleteStrategy,
inlineTreeMode,
expandedFolders,
sortConfig,
folderTreeConfig,
canGoBack,
canGoForward,
canGoUp,
itemCount,
// Utilities
normalizePath,
getDisplayName,
getParentPath,
getRandomSeedForPath,
clearRandomSeedForPath,
getCachedDirectory,
setCachedDirectory,
clearDirectoryCache,
savePlace,
getSavedPosition,
// State operations
getState,
setPath,
setItems,
setLoading,
setError,
setViewStyle,
setSort,
toggleRecursiveMode,
togglePenetrateMode,
setDeleteStrategy,
toggleDeleteStrategy,
toggleFolderTree,
setFolderTreeLayout,
setFolderTreeSize,
toggleInlineTreeMode,
expandFolder,
collapseFolder,
toggleFolderExpand,
clearExpandedFolders,
reset
} from './panelState.svelte';

// ============ Re-export Selection State ============

export {
selectedItems,
multiSelectMode,
deleteMode,
searchKeyword,
searchResults,
isSearching,
searchSettings,
showSearchBar,
showMigrationBar,
selectItem,
selectAll,
deselectAll,
setFocusedItem,
toggleMultiSelectMode,
toggleDeleteMode,
setSearchKeyword,
setSearchResults,
setIsSearching,
clearSearch,
setSearchSettings,
toggleShowSearchBar,
toggleShowMigrationBar
} from './selectionState.svelte';

// ============ Re-export Core ============

export {
sortItems,
isBookCandidate,
folderPanelActions,
folderPanelState
} from './core.svelte';

// ============ Re-export Sorted Items (derived) ============

import { derived } from 'svelte/store';
import { state } from './panelState.svelte';
import { sortItems } from './core.svelte';

export const sortedItems = derived(state, ($s) => {
return sortItems($s.items, $s.sortField, $s.sortOrder, $s.currentPath);
});
