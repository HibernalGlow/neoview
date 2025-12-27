/**
 * FolderTabStore 类型定义模块
 * 包含所有共享的类型、接口和常量定义
 */

import { SvelteSet } from 'svelte/reactivity';
import type { FsItem } from '$lib/types';
import type { FolderViewStyle, FolderSortField, FolderSortOrder, DeleteStrategy } from '../folderPanelStore';

// ============ 历史记录类型 ============

/** 文件夹历史记录条目 */
export interface FolderHistoryEntry {
path: string;
displayName: string;
timestamp: number;
scrollTop: number;
selectedItemPath: string | null;
sortField: FolderSortField;
sortOrder: FolderSortOrder;
}

/** 层叠栈中的单个层 */
export interface FolderStackLayer {
id: string;
path: string;
items: FsItem[];
selectedIndex: number;
scrollTop: number;
}

// ============ 最近关闭标签页类型 ============

/** 最近关闭的标签页 */
export interface RecentlyClosedTab {
path: string;
title: string;
closedAt: number;
}

// ============ 布局设置类型 ============

/** 标签栏位置（none = 隐藏） */
export type TabBarLayout = 'none' | 'top' | 'left' | 'right' | 'bottom';

/** 面包屑位置 */
export type BreadcrumbPosition = 'none' | 'top' | 'left' | 'right' | 'bottom';

/** 工具栏位置 */
export type ToolbarPosition = 'none' | 'top' | 'left' | 'right' | 'bottom';

/** 面板模式类型 */
export type PanelMode = 'folder' | 'bookmark' | 'history';

/** 面板布局设置 */
export interface PanelLayoutSettings {
tabBarLayout: TabBarLayout;
tabBarWidth: number;
breadcrumbPosition: BreadcrumbPosition;
toolbarPosition: ToolbarPosition;
}

/** 按面板类型存储的布局设置 */
export interface PerPanelLayoutSettings {
folder: PanelLayoutSettings;
bookmark: PanelLayoutSettings;
history: PanelLayoutSettings;
}

// ============ 排序设置类型 ============

/** 排序继承策略 */
export type SortInheritStrategy = 'default' | 'inherit';

/** 共享排序设置 */
export interface SharedSortSettings {
locked: boolean;
strategy: SortInheritStrategy;
lockedSortField: FolderSortField;
lockedSortOrder: FolderSortOrder;
}

/** 共享文件夹树设置 */
export interface SharedFolderTreeSettings {
folderTreeVisible: boolean;
folderTreeLayout: 'top' | 'left' | 'right' | 'bottom';
folderTreeSize: number;
}

// ============ 标签页状态类型 ============

/** 单个标签页的完整状态 */
export interface FolderTabState {
id: string;
title: string;
pinned: boolean;
currentPath: string;
items: FsItem[];
selectedItems: SvelteSet<string>;
focusedItem: FsItem | null;
lastSelectedIndex: number;
loading: boolean;
error: string | null;
viewStyle: FolderViewStyle;
sortField: FolderSortField;
sortOrder: FolderSortOrder;
ratingVersion: number;
multiSelectMode: boolean;
deleteMode: boolean;
recursiveMode: boolean;
searchKeyword: string;
searchResults: FsItem[];
isSearching: boolean;
showSearchBar: boolean;
showMigrationBar: boolean;
showPenetrateSettingsBar: boolean;
penetrateMode: boolean;
openInNewTabMode: boolean;
deleteStrategy: DeleteStrategy;
searchSettings: {
includeSubfolders: boolean;
showHistoryOnFocus: boolean;
searchInPath: boolean;
};
inlineTreeMode: boolean;
expandedFolders: SvelteSet<string>;
folderTreeVisible: boolean;
folderTreeLayout: 'top' | 'left' | 'right' | 'bottom';
folderTreeSize: number;
historyStack: FolderHistoryEntry[];
historyIndex: number;
homePath: string;
stackLayers: FolderStackLayer[];
stackActiveIndex: number;
thumbnailWidthPercent: number;
bannerWidthPercent: number;
pendingFocusPath: string | null;
}

/** 标签页集合状态 */
export interface FolderTabsState {
tabs: FolderTabState[];
activeTabId: string;
tabNavHistory: string[];
tabNavHistoryIndex: number;
}

// ============ 常量定义 ============

export const MAX_RECENTLY_CLOSED = 10;

export const STORAGE_KEYS = {
TABS: 'neoview-folder-tabs',
RECENTLY_CLOSED: 'neoview-recently-closed-tabs',
SHARED_TREE: 'neoview-folder-tree-shared',
SHARED_SORT: 'neoview-folder-sort-shared',
SHARED_TAB_BAR: 'neoview-tab-bar-shared'
} as const;

export const VIRTUAL_PATHS = {
BOOKMARK: 'virtual://bookmark',
HISTORY: 'virtual://history',
SEARCH: 'virtual://search'
} as const;

export type VirtualPathType = 'bookmark' | 'history' | 'search' | null;

export const DEFAULT_PANEL_LAYOUT_SETTINGS: PanelLayoutSettings = {
tabBarLayout: 'none',
tabBarWidth: 160,
breadcrumbPosition: 'none',
toolbarPosition: 'top'
};

// ============ 重新导出依赖类型 ============

export type { FsItem } from '$lib/types';
export type { FolderViewStyle, FolderSortField, FolderSortOrder, DeleteStrategy } from '../folderPanelStore';
