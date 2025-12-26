/**
 * Panel State Module - 面板状态管理模块
 * 负责面板的核心状态、持久化、缓存和历史记录管理
 */

import { writable, derived, get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import type {
FolderPanelState,
FolderHistoryEntry,
FolderItemPosition,
FolderViewStyle,
FolderSortField,
FolderSortOrder,
DeleteStrategy,
SortConfig,
FolderTreeConfig
} from './types';

// ============ Constants ============

const STORAGE_KEY = 'neoview-folder-panel';
const CACHE_TTL = 30000;
const MAX_HISTORY_LENGTH = 50;

// ============ Random Seed Cache ============

const randomSeedCache = new Map<string, number>();
const MAX_SEED_CACHE_SIZE = 100;

export function getRandomSeedForPath(path: string): number {
	const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
if (randomSeedCache.has(normalizedPath)) {
return randomSeedCache.get(normalizedPath)!;
}
const seed = Math.random() * 2147483647 | 0;
if (randomSeedCache.size >= MAX_SEED_CACHE_SIZE) {
const firstKey = randomSeedCache.keys().next().value;
if (firstKey) randomSeedCache.delete(firstKey);
}
randomSeedCache.set(normalizedPath, seed);
return seed;
}

export function clearRandomSeedForPath(path: string): void {
	const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
randomSeedCache.delete(normalizedPath);
}

// ============ Persistence ============

function loadState(): Partial<FolderPanelState> {
try {
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) return JSON.parse(saved);
} catch (e) {
console.error('[FolderPanelStore] Failed to load state:', e);
}
return {};
}

export function saveState(state: Partial<FolderPanelState>) {
try {
const toSave = {
viewStyle: state.viewStyle,
sortField: state.sortField,
sortOrder: state.sortOrder,
folderTreeVisible: state.folderTreeVisible,
folderTreeLayout: state.folderTreeLayout,
folderTreeSize: state.folderTreeSize,
recursiveMode: state.recursiveMode,
deleteStrategy: state.deleteStrategy
};
localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
} catch (e) {
console.error('[FolderPanelStore] Failed to save state:', e);
}
}

// ============ Initial State ============

const savedState = loadState();

export const initialState: FolderPanelState = {
currentPath: '',
items: [],
selectedItems: new Set(),
focusedItem: null,
loading: false,
error: null,
viewStyle: savedState.viewStyle ?? 'list',
sortField: savedState.sortField ?? 'name',
sortOrder: savedState.sortOrder ?? 'asc',
ratingVersion: 0,
multiSelectMode: false,
deleteMode: false,
recursiveMode: savedState.recursiveMode ?? false,
searchKeyword: '',
searchResults: [],
isSearching: false,
folderTreeVisible: savedState.folderTreeVisible ?? false,
folderTreeLayout: savedState.folderTreeLayout ?? 'left',
folderTreeSize: savedState.folderTreeSize ?? 200,
showSearchBar: false,
showMigrationBar: false,
penetrateMode: false,
deleteStrategy: savedState.deleteStrategy ?? 'trash',
searchHistory: [],
searchSettings: {
includeSubfolders: true,
showHistoryOnFocus: true,
searchInPath: false
},
inlineTreeMode: false,
expandedFolders: new Set<string>()
};

// ============ Core Stores ============

export const state = writable<FolderPanelState>(initialState);
export const historyStack = writable<FolderHistoryEntry[]>([]);
export const historyIndex = writable<number>(-1);
export const homePath = writable<string>('');
export const externalNavigationRequest = writable<{ path: string; timestamp: number } | null>(null);

// ============ Directory Cache ============

const directoryCache = new Map<string, { items: FsItem[]; timestamp: number }>();

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

export function getCachedDirectory(path: string): FsItem[] | null {
const key = normalizePath(path);
const cached = directoryCache.get(key);
if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
return cached.items;
}
return null;
}

export function setCachedDirectory(path: string, items: FsItem[]) {
const key = normalizePath(path);
directoryCache.set(key, { items, timestamp: Date.now() });
}

export function clearDirectoryCache(path?: string) {
if (path) {
directoryCache.delete(normalizePath(path));
} else {
directoryCache.clear();
}
}

// ============ Position Dictionary ============

const lastPlaceDictionary = new Map<string, FolderItemPosition>();

export function savePlace(currentPath: string, selectedItem: FsItem | null, selectedIndex: number) {
if (!currentPath || !selectedItem) return;
const key = normalizePath(currentPath);
lastPlaceDictionary.set(key, { path: selectedItem.path, index: selectedIndex });
}

export function getSavedPosition(path: string): FolderItemPosition | null {
return lastPlaceDictionary.get(normalizePath(path)) ?? null;
}

// ============ Helper Functions ============

export function getDisplayName(path: string): string {
	if (!path) return '';
	const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
	return parts[parts.length - 1] || path;
}

export function getParentPath(path: string): string | null {
	if (!path) return null;
	const parts = path.replace(/\//g, '\\').split('\\').filter(Boolean);
	if (parts.length <= 1) return null;
	parts.pop();
	let parentPath = parts.join('\\');
	if (/^[a-zA-Z]:$/.test(parentPath)) parentPath += '\\';
	return parentPath;
}

// ============ Derived Stores ============

export const currentPath = derived(state, ($s) => $s.currentPath);
export const items = derived(state, ($s) => $s.items);
export const loading = derived(state, ($s) => $s.loading);
export const error = derived(state, ($s) => $s.error);
export const viewStyle = derived(state, ($s) => $s.viewStyle);
export const recursiveMode = derived(state, ($s) => $s.recursiveMode);
export const penetrateMode = derived(state, ($s) => $s.penetrateMode);
export const deleteStrategy = derived(state, ($s) => $s.deleteStrategy);
export const inlineTreeMode = derived(state, ($s) => $s.inlineTreeMode);
export const expandedFolders = derived(state, ($s) => $s.expandedFolders);
export const sortConfig = derived(state, ($s): SortConfig => ({ field: $s.sortField, order: $s.sortOrder }));
export const folderTreeConfig = derived(state, ($s): FolderTreeConfig => ({
visible: $s.folderTreeVisible,
layout: $s.folderTreeLayout,
size: $s.folderTreeSize
}));
export const canGoBack = derived([historyStack, historyIndex], ([, $idx]) => $idx > 0);
export const canGoForward = derived([historyStack, historyIndex], ([$stk, $idx]) => $idx < $stk.length - 1);
export const canGoUp = derived(state, ($s) => {
	if (!$s.currentPath) return false;
	return $s.currentPath.replace(/\\/g, '/').split('/').filter(Boolean).length > 1;
});
export const itemCount = derived(state, ($s) => $s.items.length);

// ============ State Operations ============

export function getState(): FolderPanelState {
return get(state);
}

export function setPath(path: string, addToHistory = true): FolderItemPosition | null {
const targetPosition = getSavedPosition(path);
state.update((s) => ({ ...s, currentPath: path, loading: true, error: null }));

if (addToHistory && path) {
const currentState = get(state);
const entry: FolderHistoryEntry = {
path,
displayName: getDisplayName(path),
timestamp: Date.now(),
scrollTop: 0,
selectedItemPath: targetPosition?.path ?? null,
sortField: currentState.sortField,
sortOrder: currentState.sortOrder
};
historyStack.update((stack) => {
const idx = get(historyIndex);
const newStack = stack.slice(0, idx + 1);
newStack.push(entry);
if (newStack.length > MAX_HISTORY_LENGTH) newStack.shift();
return newStack;
});
historyIndex.update(() => get(historyStack).length - 1);
}
return targetPosition;
}

export function setItems(newItems: FsItem[]) {
const currentState = get(state);
if (currentState.currentPath) setCachedDirectory(currentState.currentPath, newItems);
state.update((s) => ({ ...s, items: newItems, loading: false, error: null }));
}

export function setLoading(isLoading: boolean) {
state.update((s) => ({ ...s, loading: isLoading }));
}

export function setError(err: string | null) {
state.update((s) => ({ ...s, error: err, loading: false }));
}

export function setViewStyle(style: FolderViewStyle) {
state.update((s) => {
const newState = { ...s, viewStyle: style };
saveState(newState);
return newState;
});
}

export function setSort(field: FolderSortField, order?: FolderSortOrder) {
state.update((s) => {
const newOrder = order ?? (s.sortField === field && s.sortOrder === 'asc' ? 'desc' : 'asc');
const newState = { ...s, sortField: field, sortOrder: newOrder };
saveState(newState);
return newState;
});
}

export function toggleRecursiveMode() {
state.update((s) => {
const newState = { ...s, recursiveMode: !s.recursiveMode };
saveState(newState);
return newState;
});
}

export function togglePenetrateMode() {
state.update((s) => ({ ...s, penetrateMode: !s.penetrateMode }));
}

export function setDeleteStrategy(strategy: DeleteStrategy) {
state.update((s) => {
const newState = { ...s, deleteStrategy: strategy };
saveState(newState);
return newState;
});
}

export function toggleDeleteStrategy() {
state.update((s) => {
const next: DeleteStrategy = s.deleteStrategy === 'trash' ? 'permanent' : 'trash';
const newState = { ...s, deleteStrategy: next };
saveState(newState);
return newState;
});
}

export function toggleFolderTree() {
state.update((s) => {
const newState = { ...s, folderTreeVisible: !s.folderTreeVisible };
saveState(newState);
return newState;
});
}

export function setFolderTreeLayout(layout: 'top' | 'left') {
state.update((s) => {
const newState = { ...s, folderTreeLayout: layout };
saveState(newState);
return newState;
});
}

export function setFolderTreeSize(size: number) {
state.update((s) => {
const newState = { ...s, folderTreeSize: size };
saveState(newState);
return newState;
});
}

export function toggleInlineTreeMode() {
state.update((s) => ({ ...s, inlineTreeMode: !s.inlineTreeMode }));
}

export function expandFolder(path: string) {
state.update((s) => {
const newExpanded = new Set(s.expandedFolders);
newExpanded.add(path);
return { ...s, expandedFolders: newExpanded };
});
}

export function collapseFolder(path: string) {
	state.update((s) => {
		const newExpanded = new Set(s.expandedFolders);
		newExpanded.delete(path);
		for (const p of newExpanded) {
			if (p.startsWith(path + '/') || p.startsWith(path + '\\')) {
				newExpanded.delete(p);
			}
		}
		return { ...s, expandedFolders: newExpanded };
	});
}

export function toggleFolderExpand(path: string) {
if (get(state).expandedFolders.has(path)) {
collapseFolder(path);
} else {
expandFolder(path);
}
}

export function clearExpandedFolders() {
state.update((s) => ({ ...s, expandedFolders: new Set<string>() }));
}

export function reset() {
state.set(initialState);
historyStack.set([]);
historyIndex.set(-1);
}
