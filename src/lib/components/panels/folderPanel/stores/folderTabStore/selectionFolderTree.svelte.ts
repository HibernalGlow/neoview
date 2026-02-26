/**
 * 选择和文件夹树模块
 * 包含选择操作、焦点管理、文件夹树操作、层叠栈管理
 */

import { SvelteSet } from 'svelte/reactivity';
import type { FsItem } from '$lib/types';
import type { FolderStackLayer, FolderTabState } from './types';
import { store, updateActiveTab, getActiveTab, getSharedTreeSettings } from './tabManagement.svelte';
import { saveSharedTreeSettings } from './utils.svelte';
import { isVirtualPath, saveTabsState } from './utils.svelte';

// ============ 内部状态 ============

const sharedTreeSettings = getSharedTreeSettings();

// ============ 选择操作 ============

/** 选择项 */
export function selectItem(path: string, toggle = false, index?: number): void {
updateActiveTab((tab) => {
const newSelected = new SvelteSet(tab.selectedItems);
if (toggle) {
if (newSelected.has(path)) {
newSelected.delete(path);
} else {
newSelected.add(path);
}
} else {
newSelected.clear();
newSelected.add(path);
}
const newLastIndex = index !== undefined ? index : tab.lastSelectedIndex;
return { ...tab, selectedItems: newSelected, lastSelectedIndex: newLastIndex };
});
}

/** 范围选择（shift + 点击） */
export function selectRange(endIndex: number, items: FsItem[]): void {
updateActiveTab((tab) => {
const startIndex = tab.lastSelectedIndex >= 0 ? tab.lastSelectedIndex : 0;
const minIndex = Math.min(startIndex, endIndex);
const maxIndex = Math.max(startIndex, endIndex);

const newSelected = new SvelteSet(tab.selectedItems);
for (let i = minIndex; i <= maxIndex; i++) {
if (i >= 0 && i < items.length) {
newSelected.add(items[i].path);
}
}

return { ...tab, selectedItems: newSelected };
});
}

/** 获取最后选中的索引 */
export function getLastSelectedIndex(): number {
const tab = getActiveTab();
return tab?.lastSelectedIndex ?? -1;
}

/** 设置最后选中的索引 */
export function setLastSelectedIndex(index: number): void {
updateActiveTab((tab) => ({ ...tab, lastSelectedIndex: index }));
}

/** 全选 */
export function selectAll(): void {
updateActiveTab((tab) => ({
...tab,
selectedItems: new SvelteSet(tab.items.map((item) => item.path))
}));
}

/** 取消全选 */
export function deselectAll(): void {
updateActiveTab((tab) => ({ ...tab, selectedItems: new SvelteSet() }));
}

/** 直接设置选中项 */
export function setSelectedItems(items: Set<string>): void {
updateActiveTab((tab) => ({ ...tab, selectedItems: new SvelteSet(items) }));
}

/** 反选 */
export function invertSelection(): void {
updateActiveTab((tab) => {
const newSelected = new SvelteSet<string>();
for (const item of tab.items) {
if (!tab.selectedItems.has(item.path)) {
newSelected.add(item.path);
}
}
return { ...tab, selectedItems: newSelected };
});
}

/** 设置焦点项 */
export function setFocusedItem(item: FsItem | null): void {
updateActiveTab((tab) => ({ ...tab, focusedItem: item }));
}

/** 设置待聚焦的文件路径 */
export function focusOnPath(path: string): void {
updateActiveTab((tab) => ({ ...tab, pendingFocusPath: path }));
}

/** 清除待聚焦的文件路径 */
export function clearPendingFocusPath(): void {
updateActiveTab((tab) => ({ ...tab, pendingFocusPath: null }));
}

// ============ 文件夹树操作 ============

/** 切换文件夹树可见性（同步到所有页签） */
export function toggleFolderTree(): void {
const currentTab = getActiveTab();
const newVisible = !currentTab?.folderTreeVisible;

sharedTreeSettings.folderTreeVisible = newVisible;
saveSharedTreeSettings(sharedTreeSettings);

store.update(($store) => {
const tabs = $store.tabs.map((tab) => {
if (!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)) {
return { ...tab, folderTreeVisible: newVisible };
}
return tab;
});
const newState = { ...$store, tabs };
requestAnimationFrame(() => saveTabsState(newState));
return newState;
});
}

/** 设置文件夹树布局（同步到所有页签） */
export function setFolderTreeLayout(layout: 'top' | 'left' | 'right' | 'bottom'): void {
sharedTreeSettings.folderTreeLayout = layout;
saveSharedTreeSettings(sharedTreeSettings);

store.update(($store) => {
const tabs = $store.tabs.map((tab) => {
if (!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)) {
return { ...tab, folderTreeLayout: layout };
}
return tab;
});
const newState = { ...$store, tabs };
requestAnimationFrame(() => saveTabsState(newState));
return newState;
});
}

/** 设置文件夹树大小（同步到所有页签） */
export function setFolderTreeSize(size: number): void {
sharedTreeSettings.folderTreeSize = size;
saveSharedTreeSettings(sharedTreeSettings);

store.update(($store) => {
const tabs = $store.tabs.map((tab) => {
if (!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)) {
return { ...tab, folderTreeSize: size };
}
return tab;
});
const newState = { ...$store, tabs };
requestAnimationFrame(() => saveTabsState(newState));
return newState;
});
}

/** 切换主视图树模式 */
export function toggleInlineTreeMode(): void {
updateActiveTab((tab) => ({ ...tab, inlineTreeMode: !tab.inlineTreeMode }));
}

/** 展开文件夹 */
export function expandFolder(path: string): void {
updateActiveTab((tab) => {
const newExpanded = new SvelteSet(tab.expandedFolders);
newExpanded.add(path);
return { ...tab, expandedFolders: newExpanded };
});
}

/** 折叠文件夹 */
export function collapseFolder(path: string): void {
updateActiveTab((tab) => {
const newExpanded = new SvelteSet(tab.expandedFolders);
newExpanded.delete(path);
// 同时折叠所有子文件夹
for (const p of newExpanded) {
if (p.startsWith(path + '/') || p.startsWith(path + '\\')) {
newExpanded.delete(p);
}
}
return { ...tab, expandedFolders: newExpanded };
});
}

/** 切换文件夹展开状态 */
export function toggleFolderExpand(path: string): void {
const tab = getActiveTab();
if (tab?.expandedFolders.has(path)) {
collapseFolder(path);
} else {
expandFolder(path);
}
}

// ============ 层叠栈操作 ============

/** 设置层叠栈 */
export function setStackLayers(layers: FolderStackLayer[], activeIndex: number): void {
updateActiveTab((tab) => ({
...tab,
stackLayers: layers,
stackActiveIndex: activeIndex
}));
}

/** 获取层叠栈 */
export function getStackLayers(): { layers: FolderStackLayer[]; activeIndex: number } {
const tab = getActiveTab();
if (!tab) return { layers: [], activeIndex: 0 };
return { layers: tab.stackLayers, activeIndex: tab.stackActiveIndex };
}

/** 更新层叠栈活动索引 */
export function setStackActiveIndex(index: number): void {
updateActiveTab((tab) => ({
...tab,
stackActiveIndex: index
}));
}

/** 设置缩略图宽度百分比 */
export function setThumbnailWidthPercent(percent: number): void {
const clampedPercent = Math.max(10, Math.min(90, percent));
updateActiveTab((tab) => ({
...tab,
thumbnailWidthPercent: clampedPercent
}));
}

/** 设置横幅视图宽度百分比 */
export function setBannerWidthPercent(percent: number): void {
const clampedPercent = Math.max(20, Math.min(100, percent));
updateActiveTab((tab) => ({
...tab,
bannerWidthPercent: clampedPercent
}));
}
