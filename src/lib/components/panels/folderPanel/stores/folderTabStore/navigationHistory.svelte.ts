/**
 * 导航历史模块
 * 包含前进/后退逻辑、历史栈管理
 */

import { get } from 'svelte/store';
import type { FolderHistoryEntry, FolderTabState } from './types';
import { store, updateActiveTab, getActiveTab } from './tabManagement.svelte';
import { getDisplayName, normalizePath, isVirtualPath } from './utils.svelte';
import { saveTabsState } from './utils.svelte';

// ============ 路径导航 ============

/** 设置当前路径（支持虚拟路径） */
export function setPath(path: string, addToHistory = true): void {
const normalizedPath = normalizePath(path);

updateActiveTab((tab) => {
const newTab = { ...tab, currentPath: normalizedPath, loading: true, error: null };
newTab.title = getDisplayName(normalizedPath);

if (addToHistory && normalizedPath) {
const entry: FolderHistoryEntry = {
path: normalizedPath,
displayName: getDisplayName(normalizedPath),
timestamp: Date.now(),
scrollTop: 0,
selectedItemPath: null,
sortField: tab.sortField,
sortOrder: tab.sortOrder
};

// 截断当前位置之后的历史
const newStack = tab.historyStack.slice(0, tab.historyIndex + 1);
newStack.push(entry);
// 限制历史长度
if (newStack.length > 50) {
newStack.shift();
}

newTab.historyStack = newStack;
newTab.historyIndex = newStack.length - 1;
}

return newTab;
});
}

/** 查看后退一步的历史（不修改状态） */
export function peekBack(): { path: string } | null {
const tab = getActiveTab();
if (!tab || tab.historyIndex <= 0) return null;
const entry = tab.historyStack[tab.historyIndex - 1];
return entry ? { path: entry.path } : null;
}

/** 在历史记录中查找指定路径 */
export function findPathInHistory(targetPath: string): number {
const tab = getActiveTab();
if (!tab || tab.historyIndex <= 0) return -1;

// 第一轮：精确匹配
for (let i = tab.historyIndex - 1; i >= 0; i--) {
const entry = tab.historyStack[i];
if (entry && entry.path === targetPath) {
return i;
}
}

// 第二轮：规范化匹配
const normalizePathForCompare = (p: string) => p.replace(/\\/g, '/').toLowerCase();
const normalizedTarget = normalizePathForCompare(targetPath);

for (let i = tab.historyIndex - 1; i >= 0; i--) {
const entry = tab.historyStack[i];
if (entry && normalizePathForCompare(entry.path) === normalizedTarget) {
return i;
}
}

return -1;
}

/** 导航到历史中的指定索引 */
export function goToHistoryIndex(index: number): { path: string } | null {
const tab = getActiveTab();
if (!tab || index < 0 || index >= tab.historyStack.length) return null;

const entry = tab.historyStack[index];
if (!entry) return null;

updateActiveTab((t) => ({
...t,
currentPath: entry.path,
historyIndex: index,
title: getDisplayName(entry.path)
}));

return { path: entry.path };
}

/** 后退 */
export function goBack(): { path: string } | null {
const tab = getActiveTab();
if (!tab || tab.historyIndex <= 0) return null;

const newIndex = tab.historyIndex - 1;
const entry = tab.historyStack[newIndex];

updateActiveTab((t) => ({
...t,
currentPath: entry.path,
historyIndex: newIndex,
title: getDisplayName(entry.path)
}));

return { path: entry.path };
}

/** 前进 */
export function goForward(): { path: string } | null {
const tab = getActiveTab();
if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return null;

const newIndex = tab.historyIndex + 1;
const entry = tab.historyStack[newIndex];

updateActiveTab((t) => ({
...t,
currentPath: entry.path,
historyIndex: newIndex,
title: getDisplayName(entry.path)
}));

return { path: entry.path };
}

// ============ 标签页导航历史 ============

/** 检查是否可以后退到上一个标签页 */
export function canGoBackTab(): boolean {
const state = get(store);
return state.tabNavHistoryIndex > 0;
}

/** 检查是否可以前进到下一个标签页 */
export function canGoForwardTab(): boolean {
const state = get(store);
return state.tabNavHistoryIndex < state.tabNavHistory.length - 1;
}

/** 后退到上一个标签页 */
export function goBackTab(): string | null {
const state = get(store);
if (state.tabNavHistoryIndex <= 0) return null;

const newIndex = state.tabNavHistoryIndex - 1;
const targetTabId = state.tabNavHistory[newIndex];

if (!state.tabs.some(t => t.id === targetTabId)) {
return null;
}

store.update(($store) => ({
...$store,
activeTabId: targetTabId,
tabNavHistoryIndex: newIndex
}));

return targetTabId;
}

/** 前进到下一个标签页 */
export function goForwardTab(): string | null {
const state = get(store);
if (state.tabNavHistoryIndex >= state.tabNavHistory.length - 1) return null;

const newIndex = state.tabNavHistoryIndex + 1;
const targetTabId = state.tabNavHistory[newIndex];

if (!state.tabs.some(t => t.id === targetTabId)) {
return null;
}

store.update(($store) => ({
...$store,
activeTabId: targetTabId,
tabNavHistoryIndex: newIndex
}));

return targetTabId;
}

/** 回到 Home */
export function goHome(): string | null {
const tab = getActiveTab();
if (!tab || !tab.homePath) return null;

setPath(tab.homePath);
return tab.homePath;
}

/** 设置 Home 路径 */
export function setHomePath(path: string): void {
updateActiveTab((tab) => ({ ...tab, homePath: path }));
}

/** 更新滚动位置（用于历史记录恢复） */
export function updateScrollPosition(scrollTop: number): void {
updateActiveTab((tab) => {
if (tab.historyIndex >= 0 && tab.historyIndex < tab.historyStack.length) {
const newStack = [...tab.historyStack];
newStack[tab.historyIndex] = {
...newStack[tab.historyIndex],
scrollTop
};
return { ...tab, historyStack: newStack };
}
return tab;
});
}

/** 清除历史 */
export function clearHistory(): void {
updateActiveTab((tab) => {
const entry: FolderHistoryEntry = {
path: tab.currentPath,
displayName: getDisplayName(tab.currentPath),
timestamp: Date.now(),
scrollTop: 0,
selectedItemPath: null,
sortField: tab.sortField,
sortOrder: tab.sortOrder
};
return {
...tab,
historyStack: [entry],
historyIndex: 0
};
});
}

/** 获取历史记录 */
export function getHistory(): { previous: FolderHistoryEntry[]; next: FolderHistoryEntry[] } {
const tab = getActiveTab();
if (!tab) return { previous: [], next: [] };

return {
previous: tab.historyStack.slice(0, tab.historyIndex).reverse(),
next: tab.historyStack.slice(tab.historyIndex + 1)
};
}
