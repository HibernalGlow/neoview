/**
 * Core Module - 核心模块
 * 整合所有子模块，提供统一的 API 接口，保持原有 API 兼容性
 */

import { get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import { browseDirectory } from '$lib/api/filesystem';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';

import type {
FolderPanelState,
FolderHistoryEntry,
FolderItemPosition,
FolderViewStyle,
FolderSortField,
FolderSortOrder,
DeleteStrategy,
HistoryRecord
} from './types';

import {
state,
historyStack,
historyIndex,
homePath,
externalNavigationRequest,
initialState,
normalizePath,
getDisplayName,
getParentPath,
getRandomSeedForPath,
getCachedDirectory,
setCachedDirectory,
clearDirectoryCache,
savePlace as savePlaceInternal,
getSavedPosition,
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

import {
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

// ============ Sorting Utilities ============

function seededRandom(seed: number): () => number {
return function() {
let t = seed += 0x6D2B79F5;
t = Math.imul(t ^ t >>> 15, t | 1);
t ^= t + Math.imul(t ^ t >>> 7, t | 61);
return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
}

function seededShuffle<T>(items: T[], seed: number): T[] {
const shuffled = [...items];
const random = seededRandom(seed);
for (let i = shuffled.length - 1; i > 0; i--) {
const j = Math.floor(random() * (i + 1));
[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
return shuffled;
}

export function sortItems(items: FsItem[], field: FolderSortField, order: FolderSortOrder, path?: string): FsItem[] {
if (field === 'random') {
const seed = path ? getRandomSeedForPath(path) : Math.random() * 2147483647 | 0;
const folders = items.filter(item => item.isDir);
const files = items.filter(item => !item.isDir);
const shuffledFolders = seededShuffle(folders, seed);
const shuffledFiles = seededShuffle(files, seed + 1);
const result = [...shuffledFolders, ...shuffledFiles];
return order === 'asc' ? result : result.reverse();
}

if (field === 'rating') {
const defaultRating = getDefaultRating();
const sorted = [...items].sort((a, b) => {
if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;
if (ratingA === ratingB) {
return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}
const comparison = ratingA - ratingB;
return order === 'asc' ? comparison : -comparison;
});
return sorted;
}

const sorted = [...items].sort((a, b) => {
if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
let comparison = 0;
switch (field) {
case 'name':
comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
break;
case 'date':
comparison = (a.modified || 0) - (b.modified || 0);
break;
case 'size':
comparison = (a.size || 0) - (b.size || 0);
break;
case 'type': {
const extA = a.name.split('.').pop()?.toLowerCase() || '';
const extB = b.name.split('.').pop()?.toLowerCase() || '';
comparison = extA.localeCompare(extB);
break;
}
}
return order === 'asc' ? comparison : -comparison;
});
return sorted;
}

// ============ Book Candidate Utilities ============

const archiveExtensions = ['.zip', '.cbz', '.rar', '.cbr', '.7z', '.cb7', '.tar', '.tar.gz', '.tgz'];
const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', 'nov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'];

function isArchiveFile(path: string): boolean {
const lower = path.toLowerCase();
return archiveExtensions.some((ext) => lower.endsWith(ext)) || lower.endsWith('.pdf');
}

function isVideoFile(path: string): boolean {
const lower = path.toLowerCase();
return videoExtensions.some((ext) => lower.endsWith(ext));
}

function isBookCandidate(item: FsItem): boolean {
return isArchiveFile(item.path) || isVideoFile(item.path);
}

// ============ Scroll Position ============

let currentScrollTop = 0;

// ============ Folder Panel Actions ============

export const folderPanelActions = {
getState,

updateScrollPosition(scrollTop: number) {
currentScrollTop = scrollTop;
},

savePlace(selectedItem: FsItem | null, selectedIndex: number) {
const currentState = get(state);
if (!currentState.currentPath || !selectedItem) return;
savePlaceInternal(currentState.currentPath, selectedItem, selectedIndex);
},

getSavedPosition,
setPath,
setItems,

getCachedItems(path: string): FsItem[] | null {
return getCachedDirectory(path);
},

clearCache(path?: string) {
clearDirectoryCache(path);
},

setLoading,
setError,

goBack(): { path: string; position: FolderItemPosition | null } | null {
const stack = get(historyStack);
const index = get(historyIndex);
if (index > 0) {
const newIndex = index - 1;
historyIndex.set(newIndex);
const entry = stack[newIndex];
const position = getSavedPosition(entry.path);
state.update((s) => ({ ...s, currentPath: entry.path }));
return { path: entry.path, position };
}
return null;
},

goForward(): { path: string; position: FolderItemPosition | null } | null {
const stack = get(historyStack);
const index = get(historyIndex);
if (index < stack.length - 1) {
const newIndex = index + 1;
historyIndex.set(newIndex);
const entry = stack[newIndex];
const position = getSavedPosition(entry.path);
state.update((s) => ({ ...s, currentPath: entry.path }));
return { path: entry.path, position };
}
return null;
},

goUp(): string | null {
const currentState = get(state);
const parent = getParentPath(currentState.currentPath);
if (parent) {
setPath(parent);
return parent;
}
return null;
},

goHome(): string | null {
const home = get(homePath);
if (home) {
setPath(home);
return home;
}
return null;
},

setHomePath(path: string) {
homePath.set(path);
},

async navigateToPath(targetPath: string | null | undefined) {
		if (!targetPath) return;
		let normalizedPath = targetPath.replace(/\\/g, '/');
		if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
			normalizedPath = normalizedPath.slice(0, -1);
		}
const lastPart = normalizedPath.split('/').pop() || '';
const hasExtension = lastPart.includes('.') && !lastPart.startsWith('.');
let dirPath = normalizedPath;
if (hasExtension) {
const lastSlash = normalizedPath.lastIndexOf('/');
if (lastSlash > 0) {
dirPath = normalizedPath.substring(0, lastSlash);
}
}
externalNavigationRequest.set({ path: dirPath, timestamp: Date.now() });
console.log('[FolderPanelStore] navigateToPath:', dirPath);
},

getHistory(): HistoryRecord {
const stack = get(historyStack);
const index = get(historyIndex);
return {
previous: stack.slice(0, index).reverse(),
next: stack.slice(index + 1)
};
},

goToHistory(targetIndex: number): string | null {
const stack = get(historyStack);
if (targetIndex >= 0 && targetIndex < stack.length) {
historyIndex.set(targetIndex);
const entry = stack[targetIndex];
state.update((s) => ({ ...s, currentPath: entry.path }));
return entry.path;
}
return null;
},

setViewStyle,
setSort,
toggleMultiSelectMode,
toggleDeleteMode,
toggleRecursiveMode,
setSearchKeyword,
setSearchResults,
setIsSearching,
clearSearch,
setSearchSettings,
toggleFolderTree,
setFolderTreeLayout,
setFolderTreeSize,
toggleShowSearchBar,
toggleShowMigrationBar,
togglePenetrateMode,
setDeleteStrategy,
toggleDeleteStrategy,
toggleInlineTreeMode,
expandFolder,
collapseFolder,
toggleFolderExpand,
clearExpandedFolders,
selectItem,
selectAll,
deselectAll,
setFocusedItem,

clearHistory() {
const currentState = get(state);
historyStack.set([{
path: currentState.currentPath,
displayName: getDisplayName(currentState.currentPath),
timestamp: Date.now(),
scrollTop: 0,
selectedItemPath: null,
sortField: currentState.sortField,
sortOrder: currentState.sortOrder
}]);
historyIndex.set(0);
},

getRestoreState(entry: FolderHistoryEntry): { scrollTop: number; selectedItemPath: string | null } {
return {
scrollTop: entry.scrollTop,
selectedItemPath: entry.selectedItemPath
};
},

reset,

findAdjacentBookPath(currentBookPath: string | null, direction: 'next' | 'previous'): string | null {
const currentState = get(state);
let itemsToUse = currentState.items;
if (itemsToUse.length === 0 && currentState.currentPath) {
const cached = getCachedDirectory(currentState.currentPath);
if (cached) itemsToUse = cached;
}
if (itemsToUse.length === 0) return null;
const sortedItemList = sortItems(itemsToUse, currentState.sortField, currentState.sortOrder, currentState.currentPath);
const bookItems = sortedItemList.filter(isBookCandidate);
if (bookItems.length === 0) return null;
const normalizedCurrent = currentBookPath ? normalizePath(currentBookPath) : null;
let currentIndex = bookItems.findIndex(item => normalizedCurrent && normalizePath(item.path) === normalizedCurrent);
if (currentIndex === -1) {
currentIndex = direction === 'next' ? -1 : bookItems.length;
}
const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
if (targetIndex < 0 || targetIndex >= bookItems.length) return null;
return bookItems[targetIndex].path;
},

async findAdjacentBookPathAsync(currentBookPath: string | null, direction: 'next' | 'previous'): Promise<string | null> {
const currentState = get(state);
let itemsToUse = currentState.items;
let dirPath = currentState.currentPath;
if (itemsToUse.length === 0) {
			if (!dirPath && currentBookPath) {
				const normalized = currentBookPath.replace(/\\/g, '/');
				const lastSlash = normalized.lastIndexOf('/');
				if (lastSlash > 0) dirPath = normalized.substring(0, lastSlash);
			}
if (dirPath) {
try {
itemsToUse = await browseDirectory(dirPath);
setCachedDirectory(dirPath, itemsToUse);
} catch (e) {
console.error('[FolderPanel] Failed to load directory:', e);
return null;
}
}
}
if (itemsToUse.length === 0) return null;
const sortedItemList = sortItems(itemsToUse, currentState.sortField, currentState.sortOrder, dirPath);
const bookItems = sortedItemList.filter(isBookCandidate);
if (bookItems.length === 0) return null;
const normalizedCurrent = currentBookPath ? normalizePath(currentBookPath) : null;
let currentIndex = bookItems.findIndex(item => normalizedCurrent && normalizePath(item.path) === normalizedCurrent);
if (currentIndex === -1) {
currentIndex = direction === 'next' ? -1 : bookItems.length;
}
const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
if (targetIndex < 0 || targetIndex >= bookItems.length) return null;
return bookItems[targetIndex].path;
}
};

// ============ Export State Subscription ============

export const folderPanelState = {
subscribe: state.subscribe
};
