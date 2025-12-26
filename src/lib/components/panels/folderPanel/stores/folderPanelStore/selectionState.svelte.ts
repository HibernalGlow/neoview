/**
 * Selection State Module - 选择状态管理模块
 * 负责选择状态、多选逻辑、搜索状态和模式切换
 */

import { derived, get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import { state, saveState } from './panelState.svelte';

// ============ Derived Stores ============

export const selectedItems = derived(state, ($s) => $s.selectedItems);
export const multiSelectMode = derived(state, ($s) => $s.multiSelectMode);
export const deleteMode = derived(state, ($s) => $s.deleteMode);
export const searchKeyword = derived(state, ($s) => $s.searchKeyword);
export const searchResults = derived(state, ($s) => $s.searchResults);
export const isSearching = derived(state, ($s) => $s.isSearching);
export const searchSettings = derived(state, ($s) => $s.searchSettings);
export const showSearchBar = derived(state, ($s) => $s.showSearchBar);
export const showMigrationBar = derived(state, ($s) => $s.showMigrationBar);

// ============ Selection Actions ============

export function selectItem(path: string, toggle = false) {
state.update((s) => {
const newSelected = new Set<string>(s.selectedItems);
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
return { ...s, selectedItems: newSelected };
});
}

export function selectAll() {
state.update((s) => {
const newSelected = new Set<string>(s.items.map((item) => item.path));
return { ...s, selectedItems: newSelected };
});
}

export function deselectAll() {
state.update((s) => ({ ...s, selectedItems: new Set<string>() }));
}

export function setFocusedItem(item: FsItem | null) {
state.update((s) => ({ ...s, focusedItem: item }));
}

// ============ Mode Actions ============

export function toggleMultiSelectMode() {
state.update((s) => ({ ...s, multiSelectMode: !s.multiSelectMode }));
}

export function toggleDeleteMode() {
state.update((s) => ({ ...s, deleteMode: !s.deleteMode }));
}

// ============ Search Actions ============

export function setSearchKeyword(keyword: string) {
state.update((s) => ({ ...s, searchKeyword: keyword }));
}

export function setSearchResults(results: FsItem[]) {
state.update((s) => ({ ...s, searchResults: results }));
}

export function setIsSearching(searching: boolean) {
state.update((s) => ({ ...s, isSearching: searching }));
}

export function clearSearch() {
state.update((s) => ({ ...s, searchKeyword: '', searchResults: [], isSearching: false }));
}

export function setSearchSettings(settings: { includeSubfolders?: boolean; showHistoryOnFocus?: boolean; searchInPath?: boolean }) {
state.update((s) => ({
...s,
searchSettings: { ...s.searchSettings, ...settings }
}));
}

export function toggleShowSearchBar() {
state.update((s) => ({ ...s, showSearchBar: !s.showSearchBar }));
}

export function toggleShowMigrationBar() {
state.update((s) => ({ ...s, showMigrationBar: !s.showMigrationBar }));
}
