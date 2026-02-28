/**
 * 标签页管理模块
 * 包含标签页创建、关闭、切换、固定等操作
 */

import { writable, derived, get } from 'svelte/store';
import { SvelteSet } from 'svelte/reactivity';
import type {
FolderTabState,
FolderTabsState,
RecentlyClosedTab,
SharedFolderTreeSettings,
SharedSortSettings,
TabBarLayout,
BreadcrumbPosition,
ToolbarPosition,
PanelMode,
PerPanelLayoutSettings
} from './types';
import { MAX_RECENTLY_CLOSED } from './types';
import {
generateTabId,
getDisplayName,
isVirtualPath,
loadTabsState,
saveTabsState,
loadRecentlyClosedTabs,
saveRecentlyClosedTabs,
loadSharedTreeSettings,
loadSharedSortSettings,
getSortSettingsForNewTab,
loadPerPanelLayoutSettings,
savePerPanelLayoutSettings
} from './utils.svelte';

// ============ 共享设置状态 ============

// 加载共享设置
const sharedTreeSettings = loadSharedTreeSettings();
const sharedSortSettings = loadSharedSortSettings();
let perPanelLayoutSettings = loadPerPanelLayoutSettings();

// 最近关闭的标签页 store
export const recentlyClosedTabsStore = writable<RecentlyClosedTab[]>(loadRecentlyClosedTabs());

// ============ 创建默认标签页状态 ============

export function createDefaultTabState(
id: string,
homePath: string = '',
sourceTab?: FolderTabState
): FolderTabState {
const treeSettings = sharedTreeSettings;
const sortSettings = getSortSettingsForNewTab(sharedSortSettings, sourceTab);
const title = homePath ? getDisplayName(homePath) : '新标签页';

return {
id,
title,
pinned: false,
currentPath: homePath,
items: [],
selectedItems: new SvelteSet(),
focusedItem: null,
lastSelectedIndex: -1,
loading: false,
error: null,
viewStyle: 'list',
sortField: sortSettings.sortField,
sortOrder: sortSettings.sortOrder,
tabDefaultSortField: sortSettings.sortField,
tabDefaultSortOrder: sortSettings.sortOrder,
temporarySortRule: null,
sortSource: sourceTab ? 'tab-default' : 'global-default',
ratingVersion: 0,
multiSelectMode: false,
deleteMode: false,
recursiveMode: false,
searchKeyword: '',
searchResults: [],
isSearching: false,
showSearchBar: false,
showMigrationBar: false,
showPenetrateSettingsBar: false,
penetrateMode: false,
openInNewTabMode: false,
deleteStrategy: 'trash',
searchSettings: {
includeSubfolders: true,
showHistoryOnFocus: true,
searchInPath: false
},
inlineTreeMode: false,
expandedFolders: new SvelteSet(),
folderTreeVisible: treeSettings.folderTreeVisible,
folderTreeLayout: treeSettings.folderTreeLayout,
folderTreeSize: treeSettings.folderTreeSize,
historyStack: [],
historyIndex: -1,
homePath,
stackLayers: [],
stackActiveIndex: 0,
thumbnailWidthPercent: 20,
bannerWidthPercent: 50,
pendingFocusPath: null
};
}

// ============ 初始化 Store ============

const savedState = loadTabsState();
const firstTabId = generateTabId();

const initialState: FolderTabsState = savedState || {
tabs: [createDefaultTabState(firstTabId)],
activeTabId: firstTabId,
tabNavHistory: [firstTabId],
tabNavHistoryIndex: 0
};

const STATE_SAVE_DEBOUNCE_MS = 180;
let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveState: FolderTabsState | null = null;

function scheduleSaveTabsState(state: FolderTabsState): void {
pendingSaveState = state;
if (pendingSaveTimer) {
clearTimeout(pendingSaveTimer);
}
pendingSaveTimer = setTimeout(() => {
if (pendingSaveState) {
saveTabsState(pendingSaveState);
pendingSaveState = null;
}
pendingSaveTimer = null;
}, STATE_SAVE_DEBOUNCE_MS);
}

// 确保 tabNavHistory 存在（兼容旧数据）
if (!initialState.tabNavHistory) {
initialState.tabNavHistory = [initialState.activeTabId];
initialState.tabNavHistoryIndex = 0;
}

// 确保至少有一个标签
if (initialState.tabs.length === 0) {
const newId = generateTabId();
initialState.tabs = [createDefaultTabState(newId)];
initialState.activeTabId = newId;
}

// 主 Store
export const store = writable<FolderTabsState>(initialState);

// ============ 更新活动标签页辅助函数 ============

export function updateActiveTab(updater: (tab: FolderTabState) => FolderTabState): void {
store.update(($store) => {
const tabs = $store.tabs.map((tab) => {
if (tab.id === $store.activeTabId) {
return updater(tab);
}
return tab;
});
const newState = { ...$store, tabs };
scheduleSaveTabsState(newState);
return newState;
});
}

// ============ 获取共享设置 ============

export function getSharedTreeSettings(): SharedFolderTreeSettings {
return sharedTreeSettings;
}

export function getSharedSortSettings(): SharedSortSettings {
return { ...sharedSortSettings };
}

export function getPerPanelLayoutSettings(): PerPanelLayoutSettings {
return perPanelLayoutSettings;
}

export function setPerPanelLayoutSettings(settings: PerPanelLayoutSettings): void {
perPanelLayoutSettings = settings;
}

// ============ 标签页管理操作 ============

/** 创建新页签 */
export function createTab(homePath: string = ''): string {
const newId = generateTabId();
console.log('[FolderTabStore] createTab 被调用, homePath:', homePath, 'newId:', newId);
store.update(($store) => {
const sourceTab = $store.tabs.find(t => t.id === $store.activeTabId);
const newTab = createDefaultTabState(newId, homePath, sourceTab);
console.log('[FolderTabStore] 新标签页状态:', {
id: newTab.id,
title: newTab.title,
currentPath: newTab.currentPath,
homePath: newTab.homePath
});
const newTabNavHistory = $store.tabNavHistory.slice(0, $store.tabNavHistoryIndex + 1);
newTabNavHistory.push(newId);
const newState: FolderTabsState = {
tabs: [...$store.tabs, newTab],
activeTabId: newId,
tabNavHistory: newTabNavHistory,
tabNavHistoryIndex: newTabNavHistory.length - 1
};
saveTabsState(newState);
return newState;
});
return newId;
}

/** 关闭页签 */
export function closeTab(tabId: string): void {
store.update(($store) => {
const unpinnedCount = $store.tabs.filter(t => !t.pinned).length;
const tabToClose = $store.tabs.find(t => t.id === tabId);

if (tabToClose && !tabToClose.pinned && unpinnedCount <= 1) {
return $store;
}

const tabIndex = $store.tabs.findIndex((t) => t.id === tabId);

if (tabToClose && !isVirtualPath(tabToClose.currentPath)) {
recentlyClosedTabsStore.update(($closed) => {
const newClosed = [
{ path: tabToClose.currentPath, title: tabToClose.title, closedAt: Date.now() },
...$closed
].slice(0, MAX_RECENTLY_CLOSED);
saveRecentlyClosedTabs(newClosed);
return newClosed;
});
}

const newTabs = $store.tabs.filter((t) => t.id !== tabId);

let newActiveId = $store.activeTabId;
if ($store.activeTabId === tabId) {
const newIndex = Math.min(tabIndex, newTabs.length - 1);
newActiveId = newTabs[newIndex].id;
}

const newTabNavHistory = $store.tabNavHistory.filter(id => id !== tabId);
let newTabNavHistoryIndex = $store.tabNavHistoryIndex;
if (newTabNavHistory.length === 0) {
newTabNavHistory.push(newActiveId);
newTabNavHistoryIndex = 0;
} else {
const lastIndex = newTabNavHistory.lastIndexOf(newActiveId);
newTabNavHistoryIndex = lastIndex >= 0 ? lastIndex : newTabNavHistory.length - 1;
}

const newState: FolderTabsState = {
tabs: newTabs,
activeTabId: newActiveId,
tabNavHistory: newTabNavHistory,
tabNavHistoryIndex: newTabNavHistoryIndex
};
saveTabsState(newState);
return newState;
});
}

/** 关闭其他页签（保留目标页签和固定页签） */
export function closeOthers(tabId: string): void {
store.update(($store) => {
const tabsToClose = $store.tabs.filter(t => t.id !== tabId && !t.pinned);

recentlyClosedTabsStore.update(($closed) => {
const newEntries = tabsToClose
.filter(t => !isVirtualPath(t.currentPath))
.map(t => ({ path: t.currentPath, title: t.title, closedAt: Date.now() }));
const newClosed = [...newEntries, ...$closed].slice(0, MAX_RECENTLY_CLOSED);
saveRecentlyClosedTabs(newClosed);
return newClosed;
});

const newTabs = $store.tabs.filter(t => t.id === tabId || t.pinned);

let newActiveId = $store.activeTabId;
if (!newTabs.some(t => t.id === newActiveId)) {
newActiveId = tabId;
}

const newState: FolderTabsState = {
tabs: newTabs,
activeTabId: newActiveId,
tabNavHistory: [newActiveId],
tabNavHistoryIndex: 0
};
saveTabsState(newState);
return newState;
});
}

/** 关闭左侧页签（保留固定页签） */
export function closeLeft(tabId: string): void {
store.update(($store) => {
const tabIndex = $store.tabs.findIndex(t => t.id === tabId);
if (tabIndex <= 0) return $store;

const tabsToClose = $store.tabs.slice(0, tabIndex).filter(t => !t.pinned);

recentlyClosedTabsStore.update(($closed) => {
const newEntries = tabsToClose
.filter(t => !isVirtualPath(t.currentPath))
.map(t => ({ path: t.currentPath, title: t.title, closedAt: Date.now() }));
const newClosed = [...newEntries, ...$closed].slice(0, MAX_RECENTLY_CLOSED);
saveRecentlyClosedTabs(newClosed);
return newClosed;
});

const newTabs = $store.tabs.filter((t, i) => i >= tabIndex || t.pinned);

let newActiveId = $store.activeTabId;
if (!newTabs.some(t => t.id === newActiveId)) {
newActiveId = tabId;
}

const newState: FolderTabsState = {
tabs: newTabs,
activeTabId: newActiveId,
tabNavHistory: [newActiveId],
tabNavHistoryIndex: 0
};
saveTabsState(newState);
return newState;
});
}

/** 关闭右侧页签（保留固定页签） */
export function closeRight(tabId: string): void {
store.update(($store) => {
const tabIndex = $store.tabs.findIndex(t => t.id === tabId);
if (tabIndex < 0 || tabIndex >= $store.tabs.length - 1) return $store;

const tabsToClose = $store.tabs.slice(tabIndex + 1).filter(t => !t.pinned);

recentlyClosedTabsStore.update(($closed) => {
const newEntries = tabsToClose
.filter(t => !isVirtualPath(t.currentPath))
.map(t => ({ path: t.currentPath, title: t.title, closedAt: Date.now() }));
const newClosed = [...newEntries, ...$closed].slice(0, MAX_RECENTLY_CLOSED);
saveRecentlyClosedTabs(newClosed);
return newClosed;
});

const newTabs = $store.tabs.filter((t, i) => i <= tabIndex || t.pinned);

let newActiveId = $store.activeTabId;
if (!newTabs.some(t => t.id === newActiveId)) {
newActiveId = tabId;
}

const newState: FolderTabsState = {
tabs: newTabs,
activeTabId: newActiveId,
tabNavHistory: [newActiveId],
tabNavHistoryIndex: 0
};
saveTabsState(newState);
return newState;
});
}

/** 切换页签固定状态 */
export function togglePinned(tabId: string): void {
store.update(($store) => {
const tabs = $store.tabs.map(tab => {
if (tab.id === tabId) {
return { ...tab, pinned: !tab.pinned };
}
return tab;
});
const newState = { ...$store, tabs };
saveTabsState(newState);
return newState;
});
}

/** 设置页签固定状态 */
export function setPinned(tabId: string, pinned: boolean): void {
store.update(($store) => {
const tabs = $store.tabs.map(tab => {
if (tab.id === tabId) {
return { ...tab, pinned };
}
return tab;
});
const newState = { ...$store, tabs };
saveTabsState(newState);
return newState;
});
}

/** 重新打开最近关闭的页签 */
export function reopenClosedTab(): string | null {
const closedTabs = get(recentlyClosedTabsStore);
if (closedTabs.length === 0) return null;

const [mostRecent, ...rest] = closedTabs;
recentlyClosedTabsStore.set(rest);
saveRecentlyClosedTabs(rest);

return createTab(mostRecent.path);
}

/** 获取最近关闭的页签列表 */
export function getRecentlyClosedTabs(): RecentlyClosedTab[] {
return get(recentlyClosedTabsStore);
}

/** 切换页签（记录到历史） */
export function switchTab(tabId: string, addToHistory = true): void {
store.update(($store) => {
if (!$store.tabs.some((t) => t.id === tabId)) {
return $store;
}

let tabNavHistory = $store.tabNavHistory;
let tabNavHistoryIndex = $store.tabNavHistoryIndex;

if (addToHistory && tabId !== $store.activeTabId) {
tabNavHistory = tabNavHistory.slice(0, tabNavHistoryIndex + 1);
tabNavHistory.push(tabId);
tabNavHistoryIndex = tabNavHistory.length - 1;
}

const newState: FolderTabsState = {
...$store,
activeTabId: tabId,
tabNavHistory,
tabNavHistoryIndex
};
saveTabsState(newState);
return newState;
});
}

/** 复制页签 */
export function duplicateTab(tabId: string): string {
const state = get(store);
const sourceTab = state.tabs.find((t) => t.id === tabId);
if (!sourceTab) return '';

const newId = generateTabId();
store.update(($store) => {
const newTab: FolderTabState = {
...sourceTab,
id: newId,
title: sourceTab.title + ' (副本)',
selectedItems: new SvelteSet(sourceTab.selectedItems),
expandedFolders: new SvelteSet(sourceTab.expandedFolders),
historyStack: [...sourceTab.historyStack]
};

const sourceIndex = $store.tabs.findIndex((t) => t.id === tabId);
const newTabs = [...$store.tabs];
newTabs.splice(sourceIndex + 1, 0, newTab);

const newTabNavHistory = $store.tabNavHistory.slice(0, $store.tabNavHistoryIndex + 1);
newTabNavHistory.push(newId);

const newState: FolderTabsState = {
tabs: newTabs,
activeTabId: newId,
tabNavHistory: newTabNavHistory,
tabNavHistoryIndex: newTabNavHistory.length - 1
};
saveTabsState(newState);
return newState;
});
return newId;
}

/** 获取当前活动页签 */
export function getActiveTab(): FolderTabState | undefined {
const state = get(store);
return state.tabs.find((t) => t.id === state.activeTabId);
}

/** 获取所有页签 */
export function getAllTabs(): FolderTabState[] {
return get(store).tabs;
}
