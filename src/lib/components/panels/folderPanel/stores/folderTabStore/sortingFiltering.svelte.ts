/**
 * 排序和过滤模块
 * 包含排序字段/顺序管理、搜索和过滤逻辑
 */

import { writable, get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import type {
FolderTabState,
FolderViewStyle,
FolderSortField,
FolderSortOrder,
DeleteStrategy,
SharedSortSettings,
SortInheritStrategy
} from './types';
import { updateActiveTab, getActiveTab, getSharedSortSettings } from './tabManagement.svelte';
import { saveSharedSortSettings } from './utils.svelte';

// ============ 全局搜索结果 Store ============

/** 全局搜索结果（独立于标签页，用于虚拟路径 virtual://search） */
export const globalSearchResults = writable<FsItem[]>([]);

// ============ 内部排序设置状态 ============

let sharedSortSettings = getSharedSortSettings();

// ============ 视图和排序操作 ============

/** 设置视图样式 */
export function setViewStyle(style: FolderViewStyle): void {
updateActiveTab((tab) => ({ ...tab, viewStyle: style }));
}

/** 设置排序 */
export function setSort(field: FolderSortField, order?: FolderSortOrder): void {
updateActiveTab((tab) => {
const newOrder = order ?? (tab.sortField === field && tab.sortOrder === 'asc' ? 'desc' : 'asc');

// 如果排序已锁定，同步更新锁定的排序设置
if (sharedSortSettings.locked) {
sharedSortSettings.lockedSortField = field;
sharedSortSettings.lockedSortOrder = newOrder;
saveSharedSortSettings(sharedSortSettings);
}

return { ...tab, sortField: field, sortOrder: newOrder };
});
}

// ============ 排序锁定操作 ============

/** 获取共享排序设置 */
export function getSortSettings(): SharedSortSettings {
return { ...sharedSortSettings };
}

/** 切换排序锁定 */
export function toggleSortLock(): void {
const tab = getActiveTab();
if (!tab) return;

sharedSortSettings.locked = !sharedSortSettings.locked;

if (sharedSortSettings.locked) {
sharedSortSettings.lockedSortField = tab.sortField;
sharedSortSettings.lockedSortOrder = tab.sortOrder;
}

saveSharedSortSettings(sharedSortSettings);
}

/** 设置排序锁定状态 */
export function setSortLocked(locked: boolean): void {
const tab = getActiveTab();
if (!tab) return;

sharedSortSettings.locked = locked;

if (locked) {
sharedSortSettings.lockedSortField = tab.sortField;
sharedSortSettings.lockedSortOrder = tab.sortOrder;
}

saveSharedSortSettings(sharedSortSettings);
}

/** 设置排序继承策略 */
export function setSortStrategy(strategy: SortInheritStrategy): void {
sharedSortSettings.strategy = strategy;
saveSharedSortSettings(sharedSortSettings);
}

// ============ 模式切换操作 ============

/** 切换多选模式 */
export function toggleMultiSelectMode(): void {
updateActiveTab((tab) => ({ ...tab, multiSelectMode: !tab.multiSelectMode }));
}

/** 切换删除模式 */
export function toggleDeleteMode(): void {
updateActiveTab((tab) => ({ ...tab, deleteMode: !tab.deleteMode }));
}

/** 切换递归模式 */
export function toggleRecursiveMode(): void {
updateActiveTab((tab) => ({ ...tab, recursiveMode: !tab.recursiveMode }));
}

/** 切换穿透模式 */
export function togglePenetrateMode(): void {
updateActiveTab((tab) => ({ ...tab, penetrateMode: !tab.penetrateMode }));
}

/** 切换点击文件夹在新标签页打开模式 */
export function toggleOpenInNewTabMode(): void {
updateActiveTab((tab) => ({ ...tab, openInNewTabMode: !tab.openInNewTabMode }));
}

/** 设置删除策略 */
export function setDeleteStrategy(strategy: DeleteStrategy): void {
updateActiveTab((tab) => ({ ...tab, deleteStrategy: strategy }));
}

/** 切换删除策略 */
export function toggleDeleteStrategy(): void {
updateActiveTab((tab) => ({
...tab,
deleteStrategy: tab.deleteStrategy === 'trash' ? 'permanent' : 'trash'
}));
}

// ============ 搜索操作 ============

/** 设置搜索关键词 */
export function setSearchKeyword(keyword: string): void {
updateActiveTab((tab) => ({ ...tab, searchKeyword: keyword }));
}

/** 设置搜索结果（更新全局 store） */
export function setSearchResults(results: FsItem[]): void {
globalSearchResults.set(results);
}

/** 设置搜索状态 */
export function setIsSearching(searching: boolean): void {
updateActiveTab((tab) => ({ ...tab, isSearching: searching }));
}

/** 清除搜索 */
export function clearSearch(): void {
updateActiveTab((tab) => ({
...tab,
searchKeyword: '',
searchResults: [],
isSearching: false
}));
}

/** 设置搜索设置 */
export function setSearchSettings(settings: Partial<FolderTabState['searchSettings']>): void {
updateActiveTab((tab) => ({
...tab,
searchSettings: { ...tab.searchSettings, ...settings }
}));
}

/** 切换搜索栏可见性 */
export function toggleShowSearchBar(): void {
updateActiveTab((tab) => ({ ...tab, showSearchBar: !tab.showSearchBar }));
}

/** 切换迁移栏可见性 */
export function toggleShowMigrationBar(): void {
updateActiveTab((tab) => ({ ...tab, showMigrationBar: !tab.showMigrationBar }));
}

/** 切换穿透设置栏可见性 */
export function toggleShowPenetrateSettingsBar(): void {
updateActiveTab((tab) => ({ ...tab, showPenetrateSettingsBar: !tab.showPenetrateSettingsBar }));
}

// ============ 文件列表操作 ============

/** 设置文件列表 */
export function setItems(items: FsItem[]): void {
updateActiveTab((tab) => ({
...tab,
items,
loading: false,
error: null
}));
}

/** 从列表中移除单个项目（乐观更新） */
export function removeItem(path: string): void {
updateActiveTab((tab) => ({
...tab,
items: tab.items.filter((item) => item.path !== path)
}));
}

/** 设置加载状态 */
export function setLoading(loading: boolean): void {
updateActiveTab((tab) => ({ ...tab, loading }));
}

/** 设置错误 */
export function setError(error: string | null): void {
updateActiveTab((tab) => ({ ...tab, error, loading: false }));
}
