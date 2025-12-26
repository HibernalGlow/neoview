/**
 * FolderTabStore 工具函数模块
 * 包含虚拟路径处理、存储加载/保存、辅助函数等
 */

import { SvelteSet } from 'svelte/reactivity';
import type {
FolderTabState,
FolderTabsState,
RecentlyClosedTab,
SharedFolderTreeSettings,
SharedSortSettings,
PanelLayoutSettings,
PerPanelLayoutSettings,
VirtualPathType,
FolderSortField,
FolderSortOrder
} from './types';
import {
STORAGE_KEYS,
VIRTUAL_PATHS,
DEFAULT_PANEL_LAYOUT_SETTINGS
} from './types';

// ============ 虚拟路径工具函数 ============

/** 判断是否为虚拟路径 */
export function isVirtualPath(path: string): boolean {
return path.startsWith('virtual://');
}

/** 获取虚拟路径类型 */
export function getVirtualPathType(path: string): VirtualPathType {
if (path === VIRTUAL_PATHS.BOOKMARK) return 'bookmark';
if (path === VIRTUAL_PATHS.HISTORY) return 'history';
if (path.startsWith(VIRTUAL_PATHS.SEARCH)) return 'search';
return null;
}

/** 获取虚拟路径的显示名称 */
export function getVirtualDisplayName(path: string): string {
const type = getVirtualPathType(path);
switch (type) {
case 'bookmark': return '书签';
case 'history': return '历史';
case 'search': return '搜索结果';
default: return path;
}
}

/** 获取路径的显示名称 */
export function getDisplayName(path: string): string {
if (!path) return '新标签页';
if (isVirtualPath(path)) return getVirtualDisplayName(path);
const normalized = path.replace(/\\/g, '/');
const parts = normalized.split('/').filter(Boolean);
return parts[parts.length - 1] || path;
}

/** 生成唯一的标签页 ID */
export function generateTabId(): string {
return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============ 最近关闭标签页存储 ============

/** 加载最近关闭的标签页 */
export function loadRecentlyClosedTabs(): RecentlyClosedTab[] {
try {
const saved = localStorage.getItem(STORAGE_KEYS.RECENTLY_CLOSED);
if (saved) {
return JSON.parse(saved);
}
} catch (e) {
console.error('[FolderTabStore] Failed to load recently closed tabs:', e);
}
return [];
}

/** 保存最近关闭的标签页 */
export function saveRecentlyClosedTabs(tabs: RecentlyClosedTab[]): void {
try {
localStorage.setItem(STORAGE_KEYS.RECENTLY_CLOSED, JSON.stringify(tabs));
} catch (e) {
console.error('[FolderTabStore] Failed to save recently closed tabs:', e);
}
}

// ============ 共享设置存储 ============

/** 加载共享文件夹树设置 */
export function loadSharedTreeSettings(): SharedFolderTreeSettings {
try {
const saved = localStorage.getItem(STORAGE_KEYS.SHARED_TREE);
if (saved) {
return JSON.parse(saved);
}
} catch (e) {
console.error('[FolderTabStore] Failed to load shared tree settings:', e);
}
return {
folderTreeVisible: false,
folderTreeLayout: 'left',
folderTreeSize: 200
};
}

/** 保存共享文件夹树设置 */
export function saveSharedTreeSettings(settings: SharedFolderTreeSettings): void {
try {
localStorage.setItem(STORAGE_KEYS.SHARED_TREE, JSON.stringify(settings));
} catch (e) {
console.error('[FolderTabStore] Failed to save shared tree settings:', e);
}
}

/** 加载共享排序设置 */
export function loadSharedSortSettings(): SharedSortSettings {
try {
const saved = localStorage.getItem(STORAGE_KEYS.SHARED_SORT);
if (saved) {
const parsed = JSON.parse(saved);
return {
locked: parsed.locked ?? false,
strategy: parsed.strategy ?? 'default',
lockedSortField: parsed.lockedSortField ?? 'name',
lockedSortOrder: parsed.lockedSortOrder ?? 'asc'
};
}
} catch (e) {
console.error('[FolderTabStore] Failed to load shared sort settings:', e);
}
return {
locked: false,
strategy: 'default',
lockedSortField: 'name',
lockedSortOrder: 'asc'
};
}

/** 保存共享排序设置 */
export function saveSharedSortSettings(settings: SharedSortSettings): void {
try {
localStorage.setItem(STORAGE_KEYS.SHARED_SORT, JSON.stringify(settings));
} catch (e) {
console.error('[FolderTabStore] Failed to save shared sort settings:', e);
}
}

// ============ 面板布局设置存储 ============

/** 加载按面板类型的布局设置 */
export function loadPerPanelLayoutSettings(): PerPanelLayoutSettings {
try {
const saved = localStorage.getItem(STORAGE_KEYS.SHARED_TAB_BAR);
if (saved) {
const parsed = JSON.parse(saved);
// 兼容旧版本：如果是旧格式，迁移到新格式
if (parsed.tabBarLayout !== undefined && parsed.folder === undefined) {
const oldSettings: PanelLayoutSettings = {
tabBarLayout: parsed.tabBarLayout ?? 'none',
tabBarWidth: parsed.tabBarWidth ?? 160,
breadcrumbPosition: parsed.breadcrumbPosition ?? 'none',
toolbarPosition: parsed.toolbarPosition ?? 'top'
};
return {
folder: oldSettings,
bookmark: { ...DEFAULT_PANEL_LAYOUT_SETTINGS },
history: { ...DEFAULT_PANEL_LAYOUT_SETTINGS }
};
}
return {
folder: { ...DEFAULT_PANEL_LAYOUT_SETTINGS, ...parsed.folder },
bookmark: { ...DEFAULT_PANEL_LAYOUT_SETTINGS, ...parsed.bookmark },
history: { ...DEFAULT_PANEL_LAYOUT_SETTINGS, ...parsed.history }
};
}
} catch (e) {
console.error('[FolderTabStore] Failed to load per-panel layout settings:', e);
}
return {
folder: { ...DEFAULT_PANEL_LAYOUT_SETTINGS },
bookmark: { ...DEFAULT_PANEL_LAYOUT_SETTINGS },
history: { ...DEFAULT_PANEL_LAYOUT_SETTINGS }
};
}

/** 保存按面板类型的布局设置 */
export function savePerPanelLayoutSettings(settings: PerPanelLayoutSettings): void {
try {
localStorage.setItem(STORAGE_KEYS.SHARED_TAB_BAR, JSON.stringify(settings));
} catch (e) {
console.error('[FolderTabStore] Failed to save per-panel layout settings:', e);
}
}

// ============ 标签页状态存储 ============

/** 加载标签页状态 */
export function loadTabsState(): FolderTabsState | null {
try {
const saved = localStorage.getItem(STORAGE_KEYS.TABS);
if (saved) {
const parsed = JSON.parse(saved);
if (parsed.tabs) {
parsed.tabs = parsed.tabs.map((tab: FolderTabState) => ({
...tab,
pinned: tab.pinned ?? false,
selectedItems: new SvelteSet(tab.selectedItems || []),
expandedFolders: new SvelteSet(tab.expandedFolders || [])
}));
}
return parsed;
}
} catch (e) {
console.error('[FolderTabStore] Failed to load state:', e);
}
return null;
}

/** 保存标签页状态 */
export function saveTabsState(state: FolderTabsState): void {
try {
const realTabs = state.tabs.filter(tab => 
!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)
);

if (realTabs.length === 0) {
localStorage.removeItem(STORAGE_KEYS.TABS);
return;
}

let activeId = state.activeTabId;
const activeTab = realTabs.find(t => t.id === activeId);
if (!activeTab) {
activeId = realTabs[0].id;
}

const toSave = {
activeTabId: activeId,
tabs: realTabs.map((tab) => ({
...tab,
items: [],
searchResults: [],
loading: false,
error: null,
selectedItems: Array.from(tab.selectedItems),
expandedFolders: Array.from(tab.expandedFolders)
}))
};
localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(toSave));
} catch (e) {
console.error('[FolderTabStore] Failed to save state:', e);
}
}

// ============ 排序设置辅助函数 ============

/** 获取新标签页应该使用的排序设置 */
export function getSortSettingsForNewTab(
sharedSortSettings: SharedSortSettings,
sourceTab?: FolderTabState
): { sortField: FolderSortField; sortOrder: FolderSortOrder } {
if (sharedSortSettings.locked) {
return {
sortField: sharedSortSettings.lockedSortField,
sortOrder: sharedSortSettings.lockedSortOrder
};
}

if (sharedSortSettings.strategy === 'inherit' && sourceTab) {
return {
sortField: sourceTab.sortField,
sortOrder: sourceTab.sortOrder
};
}

return {
sortField: 'name',
sortOrder: 'asc'
};
}

// ============ 路径规范化 ============

/** 规范化文件路径（Windows 格式） */
export function normalizePath(path: string): string {
if (isVirtualPath(path)) return path;

let normalizedPath = path.replace(/\//g, '\\');

if (/^[a-zA-Z]:$/.test(normalizedPath)) {
normalizedPath += '\\';
}

if (/^[a-zA-Z]:[^\\]/.test(normalizedPath)) {
normalizedPath = normalizedPath.slice(0, 2) + '\\' + normalizedPath.slice(2);
}

return normalizedPath;
}
