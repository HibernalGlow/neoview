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
SortDefaultScope,
SortSource,
SortInheritStrategy
} from './types';
import { updateActiveTab, getActiveTab, getSharedSortSettings } from './tabManagement.svelte';
import { saveSharedSortSettings, resolveSortForPath, normalizeSortPathKey, isVirtualPath } from './utils.svelte';

// ============ 全局搜索结果 Store ============

/** 全局搜索结果（独立于标签页，用于虚拟路径 virtual://search） */
export const globalSearchResults = writable<FsItem[]>([]);

// ============ 内部排序设置状态 ============

let sharedSortSettings = getSharedSortSettings();

function persistSharedSortSettings(): void {
saveSharedSortSettings(sharedSortSettings);
}

function resolveForCurrentPath(tab: FolderTabState): { sortField: FolderSortField; sortOrder: FolderSortOrder; source: SortSource } {
if (!tab.currentPath) {
return {
sortField: tab.tabDefaultSortField,
sortOrder: tab.tabDefaultSortOrder,
source: 'tab-default'
};
}
return resolveSortForPath(tab, tab.currentPath, sharedSortSettings);
}

// ============ 视图和排序操作 ============

/** 设置视图样式 */
export function setViewStyle(style: FolderViewStyle): void {
updateActiveTab((tab) => ({ ...tab, viewStyle: style }));
}

/** 设置排序 */
export function setSort(field: FolderSortField, order?: FolderSortOrder): void {
updateActiveTab((tab) => {
const newOrder = order ?? (tab.sortField === field && tab.sortOrder === 'asc' ? 'desc' : 'asc');

const normalizedCurrentPath = tab.currentPath ? normalizeSortPathKey(tab.currentPath) : '';
const hasTempRuleForCurrentPath =
tab.temporarySortRule && normalizeSortPathKey(tab.temporarySortRule.path) === normalizedCurrentPath;

let nextTab: FolderTabState = {
...tab,
sortField: field,
sortOrder: newOrder,
sortSource: hasTempRuleForCurrentPath ? 'temporary' : 'memory'
};

if (hasTempRuleForCurrentPath && tab.temporarySortRule) {
nextTab.temporarySortRule = {
...tab.temporarySortRule,
sortField: field,
sortOrder: newOrder
};
} else if (tab.currentPath && !isVirtualPath(tab.currentPath)) {
sharedSortSettings.folderSortMemory[normalizedCurrentPath] = {
sortField: field,
sortOrder: newOrder,
updatedAt: Date.now()
};
persistSharedSortSettings();
}

return nextTab;
});
}

// ============ 排序锁定操作 ============

/** 获取共享排序设置 */
export function getSortSettings(): {
defaultScope: SortDefaultScope;
globalDefaultSortField: FolderSortField;
globalDefaultSortOrder: FolderSortOrder;
tabDefaultSortField: FolderSortField;
tabDefaultSortOrder: FolderSortOrder;
hasTemporaryRule: boolean;
temporaryRulePath: string | null;
sortSource: SortSource;
} {
const tab = getActiveTab();
return {
defaultScope: sharedSortSettings.defaultScope,
globalDefaultSortField: sharedSortSettings.globalDefaultSortField,
globalDefaultSortOrder: sharedSortSettings.globalDefaultSortOrder,
tabDefaultSortField: tab?.tabDefaultSortField ?? sharedSortSettings.globalDefaultSortField,
tabDefaultSortOrder: tab?.tabDefaultSortOrder ?? sharedSortSettings.globalDefaultSortOrder,
hasTemporaryRule: !!tab?.temporarySortRule,
temporaryRulePath: tab?.temporarySortRule?.path ?? null,
sortSource: tab?.sortSource ?? 'global-default'
};
}

/** 切换当前文件夹临时规则（兼容旧 API 名） */
export function toggleSortLock(): void {
const tab = getActiveTab();
if (!tab) return;
setSortLocked(!tab.temporarySortRule);
}

/** 设置当前文件夹临时规则状态（兼容旧 API 名） */
export function setSortLocked(enabled: boolean): void {
updateActiveTab((tab) => {
let nextTab: FolderTabState = {
...tab,
temporarySortRule: enabled && tab.currentPath
? {
path: tab.currentPath,
sortField: tab.sortField,
sortOrder: tab.sortOrder
}
: null
};

const resolved = resolveForCurrentPath(nextTab);
nextTab = {
...nextTab,
sortField: resolved.sortField,
sortOrder: resolved.sortOrder,
sortSource: resolved.source
};

return nextTab;
});
}

/** 设置默认排序作用域 */
export function setDefaultSortScope(scope: SortDefaultScope): void {
sharedSortSettings.defaultScope = scope;
persistSharedSortSettings();
}

/** 将当前排序设为默认（可指定全局或当前标签） */
export function setCurrentSortAsDefault(scope?: SortDefaultScope): void {
const tab = getActiveTab();
if (!tab) return;

const finalScope = scope ?? sharedSortSettings.defaultScope;
if (finalScope === 'global') {
sharedSortSettings.globalDefaultSortField = tab.sortField;
sharedSortSettings.globalDefaultSortOrder = tab.sortOrder;
persistSharedSortSettings();
return;
}

updateActiveTab((current) => ({
...current,
tabDefaultSortField: tab.sortField,
tabDefaultSortOrder: tab.sortOrder
}));
}

/** 清理文件夹排序记忆 */
export function clearFolderSortMemory(path?: string): void {
if (path) {
delete sharedSortSettings.folderSortMemory[normalizeSortPathKey(path)];
} else {
sharedSortSettings.folderSortMemory = {};
}
persistSharedSortSettings();
}

/** 获取文件夹排序记忆（按更新时间倒序） */
export function getFolderSortMemoryEntries(limit = 30): Array<{
path: string;
sortField: FolderSortField;
sortOrder: FolderSortOrder;
updatedAt: number;
}> {
return Object.entries(sharedSortSettings.folderSortMemory)
.map(([path, value]) => ({
path,
sortField: value.sortField,
sortOrder: value.sortOrder,
updatedAt: value.updatedAt
}))
.sort((a, b) => b.updatedAt - a.updatedAt)
.slice(0, limit);
}

/** 解析指定路径应该使用的排序（导航时调用） */
export function resolveSortForTab(tab: FolderTabState, path: string): {
sortField: FolderSortField;
sortOrder: FolderSortOrder;
source: SortSource;
} {
return resolveSortForPath(tab, path, sharedSortSettings);
}

/** 设置排序继承策略（兼容旧 API，映射为默认作用域） */
export function setSortStrategy(strategy: SortInheritStrategy): void {
setDefaultSortScope(strategy === 'inherit' ? 'tab' : 'global');
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

// ============ 已排序列表缓存（供切换书籍直读，不再二次排序） ============

let _cachedSortedState: {
	items: FsItem[];
	path: string;
	source: string;
	updatedAt: number;
} = {
	items: [],
	path: '',
	source: 'init',
	updatedAt: 0
};

/** UI 组件排序完成后调用，将结果缓存起来 */
export function setCachedSortedItems(items: FsItem[], path = '', source = 'unknown'): void {
	_cachedSortedState = {
		items,
		path,
		source,
		updatedAt: Date.now()
	};
}

/** 读取 UI 已排好序的列表（切换书籍时使用） */
export function getCachedSortedItems(): FsItem[] {
	return _cachedSortedState.items;
}

/** 读取 UI 已排好序列表的元信息 */
export function getCachedSortedMeta(): { path: string; source: string; updatedAt: number; count: number } {
	return {
		path: _cachedSortedState.path,
		source: _cachedSortedState.source,
		updatedAt: _cachedSortedState.updatedAt,
		count: _cachedSortedState.items.length
	};
}
