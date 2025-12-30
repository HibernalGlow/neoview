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
// 文件夹、压缩包和视频都可以作为书籍打开
return item.isDir || isArchiveFile(item.path) || isVideoFile(item.path);
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
let dirPath = currentState.currentPath;

// 从 currentBookPath 推断出应该在哪个目录中查找相邻书籍
let expectedParentDir: string | null = null;
if (currentBookPath) {
	const normalized = currentBookPath.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	if (lastSlash > 0) {
		expectedParentDir = normalized.substring(0, lastSlash);
	}
}

const normalizedCurrentPath = dirPath ? normalizePath(dirPath) : null;
const normalizedBookPath = currentBookPath ? normalizePath(currentBookPath) : null;
const normalizedExpectedParent = expectedParentDir ? normalizePath(expectedParentDir) : null;

// 检查当前目录是否就是 book 本身（文件夹作为 book 打开的情况）
if (normalizedCurrentPath && normalizedBookPath && normalizedCurrentPath === normalizedBookPath) {
	if (expectedParentDir) {
		const cachedParent = getCachedDirectory(expectedParentDir);
		if (cachedParent && cachedParent.length > 0) {
			itemsToUse = cachedParent;
			dirPath = expectedParentDir;
		} else {
			// 没有缓存的父目录，返回 null 让异步版本处理
			return null;
		}
	}
}
// 检查当前 folderPanel 显示的目录是否是书籍所在的父目录
else if (normalizedExpectedParent && normalizedCurrentPath !== normalizedExpectedParent) {
	// folderPanel 当前显示的不是书籍所在目录，尝试从缓存获取
	if (expectedParentDir) {
		const cached = getCachedDirectory(expectedParentDir);
		if (cached && cached.length > 0) {
			itemsToUse = cached;
			dirPath = expectedParentDir;
		} else {
			// 没有缓存，返回 null 让异步版本处理
			return null;
		}
	}
}

if (itemsToUse.length === 0 && expectedParentDir) {
	const cached = getCachedDirectory(expectedParentDir);
	if (cached && cached.length > 0) {
		itemsToUse = cached;
		dirPath = expectedParentDir;
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
},

async findAdjacentBookPathAsync(
	currentBookPath: string | null, 
	direction: 'next' | 'previous',
	options?: { sortField?: FolderSortField; sortOrder?: FolderSortOrder }
): Promise<string | null> {
const currentState = get(state);
// 使用传入的排序参数，如果没有则使用 folderPanel 的设置
const sortField = options?.sortField ?? currentState.sortField;
const sortOrder = options?.sortOrder ?? currentState.sortOrder;

console.log('[findAdjacentBookPathAsync] 开始查找', { currentBookPath, direction, sortField, sortOrder });
let itemsToUse = currentState.items;
let dirPath = currentState.currentPath;

console.log('[findAdjacentBookPathAsync] 当前状态', {
	currentPath: dirPath,
	itemsCount: itemsToUse.length,
	sortField,
	sortOrder
});

// 从 currentBookPath 推断出应该在哪个目录中查找相邻书籍
let expectedParentDir: string | null = null;
if (currentBookPath) {
	const normalized = currentBookPath.replace(/\\/g, '/');
	const lastSlash = normalized.lastIndexOf('/');
	if (lastSlash > 0) {
		expectedParentDir = normalized.substring(0, lastSlash);
	}
}

console.log('[findAdjacentBookPathAsync] 推断的父目录', { expectedParentDir });

const normalizedCurrentPath = dirPath ? normalizePath(dirPath) : null;
const normalizedBookPath = currentBookPath ? normalizePath(currentBookPath) : null;
const normalizedExpectedParent = expectedParentDir ? normalizePath(expectedParentDir) : null;

console.log('[findAdjacentBookPathAsync] 路径比较', {
	normalizedCurrentPath,
	normalizedBookPath,
	normalizedExpectedParent,
	isBookSameAsCurrentPath: normalizedCurrentPath === normalizedBookPath,
	isCurrentPathSameAsExpectedParent: normalizedCurrentPath === normalizedExpectedParent
});

// 检查当前目录是否就是 book 本身（文件夹作为 book 打开的情况）
if (normalizedCurrentPath && normalizedBookPath && normalizedCurrentPath === normalizedBookPath) {
	console.log('[findAdjacentBookPathAsync] 当前目录就是 book 本身，切换到父目录');
	// 当前目录就是 book 本身，需要切换到父目录
	if (expectedParentDir) {
		dirPath = expectedParentDir;
		try {
			itemsToUse = await browseDirectory(dirPath);
			setCachedDirectory(dirPath, itemsToUse);
			console.log('[findAdjacentBookPathAsync] 加载父目录成功', { itemsCount: itemsToUse.length });
		} catch (e) {
			console.error('[FolderPanel] Failed to load parent directory:', e);
			return null;
		}
	}
}
// 检查当前 folderPanel 显示的目录是否是书籍所在的父目录
// 如果不是（例如用户导航到了别处），需要加载正确的目录
else if (normalizedExpectedParent && normalizedCurrentPath !== normalizedExpectedParent) {
	console.log('[findAdjacentBookPathAsync] folderPanel 显示的不是书籍所在目录，需要加载正确目录');
	// folderPanel 当前显示的不是书籍所在目录，需要加载正确的父目录
	if (expectedParentDir) {
		dirPath = expectedParentDir;
		// 先尝试缓存
		const cached = getCachedDirectory(dirPath);
		if (cached && cached.length > 0) {
			itemsToUse = cached;
			console.log('[findAdjacentBookPathAsync] 使用缓存', { itemsCount: itemsToUse.length });
		} else {
			try {
				itemsToUse = await browseDirectory(dirPath);
				setCachedDirectory(dirPath, itemsToUse);
				console.log('[findAdjacentBookPathAsync] 加载目录成功', { itemsCount: itemsToUse.length });
			} catch (e) {
				console.error('[FolderPanel] Failed to load book parent directory:', e);
				return null;
			}
		}
	}
} else {
	console.log('[findAdjacentBookPathAsync] 使用当前 folderPanel 的 items');
}

if (itemsToUse.length === 0) {
	console.log('[findAdjacentBookPathAsync] items 为空，尝试加载目录');
	if (expectedParentDir) {
		dirPath = expectedParentDir;
		try {
			itemsToUse = await browseDirectory(dirPath);
			setCachedDirectory(dirPath, itemsToUse);
		} catch (e) {
			console.error('[FolderPanel] Failed to load directory:', e);
			return null;
		}
	}
}
if (itemsToUse.length === 0) {
	console.log('[findAdjacentBookPathAsync] 没有可用的 items，返回 null');
	return null;
}

console.log('[findAdjacentBookPathAsync] 排序前 items 样本', itemsToUse.slice(0, 5).map(i => ({ name: i.name, path: i.path, isDir: i.isDir })));

const sortedItemList = sortItems(itemsToUse, sortField, sortOrder, dirPath);

console.log('[findAdjacentBookPathAsync] 排序后 items 样本', sortedItemList.slice(0, 5).map(i => ({ name: i.name, path: i.path, isDir: i.isDir })));

const bookItems = sortedItemList.filter(isBookCandidate);

console.log('[findAdjacentBookPathAsync] 过滤后 bookItems', {
	count: bookItems.length,
	sample: bookItems.slice(0, 10).map(i => ({ name: i.name, path: i.path, isDir: i.isDir }))
});

if (bookItems.length === 0) {
	console.log('[findAdjacentBookPathAsync] 没有 bookItems，返回 null');
	return null;
}

const normalizedCurrent = currentBookPath ? normalizePath(currentBookPath) : null;
let currentIndex = bookItems.findIndex(item => normalizedCurrent && normalizePath(item.path) === normalizedCurrent);

console.log('[findAdjacentBookPathAsync] 查找当前书籍索引', {
	normalizedCurrent,
	currentIndex,
	matchedItem: currentIndex >= 0 ? bookItems[currentIndex]?.name : null
});

if (currentIndex === -1) {
	console.log('[findAdjacentBookPathAsync] 未找到当前书籍，使用边界值');
	currentIndex = direction === 'next' ? -1 : bookItems.length;
}

const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

console.log('[findAdjacentBookPathAsync] 计算目标索引', { currentIndex, targetIndex, direction });

if (targetIndex < 0 || targetIndex >= bookItems.length) {
	console.log('[findAdjacentBookPathAsync] 目标索引越界，返回 null');
	return null;
}

const result = bookItems[targetIndex].path;
console.log('[findAdjacentBookPathAsync] 返回结果', { targetPath: result, targetName: bookItems[targetIndex].name });
return result;
}
};

// ============ Export State Subscription ============

export const folderPanelState = {
subscribe: state.subscribe
};
