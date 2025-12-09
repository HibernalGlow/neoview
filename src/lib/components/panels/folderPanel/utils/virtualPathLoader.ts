/**
 * virtualPathLoader - 虚拟路径数据加载器
 * 支持从书签和历史 store 加载数据到文件列表
 */

import type { FsItem } from '$lib/types';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
import { get } from 'svelte/store';
import { getVirtualPathType, tabSearchResults, type VirtualPathType } from '../stores/folderTabStore.svelte';

// 清理状态追踪，避免重复清理
let bookmarkCleanedUp = false;
let historyCleanedUp = false;

/**
 * 触发书签清理（首次加载时执行一次）
 */
async function triggerBookmarkCleanup(): Promise<void> {
	if (bookmarkCleanedUp) return;
	bookmarkCleanedUp = true;
	try {
		await bookmarkStore.cleanupInvalid();
	} catch (e) {
		console.error('[VirtualPathLoader] 书签清理失败:', e);
	}
}

/**
 * 触发历史清理（首次加载时执行一次）
 */
async function triggerHistoryCleanup(): Promise<void> {
	if (historyCleanedUp) return;
	historyCleanedUp = true;
	try {
		await historyStore.cleanupInvalid();
	} catch (e) {
		console.error('[VirtualPathLoader] 历史清理失败:', e);
	}
}

// 书签条目类型（与 bookmarkStore 中的 Bookmark 类型一致）
interface BookmarkEntry {
	id: string;
	path: string;
	name: string;
	type: 'folder' | 'file';
	starred?: boolean;
	createdAt: Date;
}

/**
 * 将书签条目转换为 FsItem
 */
function bookmarkToFsItem(bookmark: BookmarkEntry): FsItem {
	// createdAt 可能是 Date 对象或字符串（从 JSON 反序列化）
	let modified = 0;
	if (bookmark.createdAt) {
		if (bookmark.createdAt instanceof Date) {
			modified = bookmark.createdAt.getTime();
		} else if (typeof bookmark.createdAt === 'string') {
			modified = new Date(bookmark.createdAt).getTime();
		} else if (typeof bookmark.createdAt === 'number') {
			modified = bookmark.createdAt;
		}
	}
	return {
		path: bookmark.path,
		name: bookmark.name,
		isDir: bookmark.type === 'folder',
		isImage: false,
		size: 0,
		modified
	};
}

/**
 * 判断路径是否为文件夹
 * 使用反向逻辑：只有没有常见文件扩展名的路径才可能是文件夹
 */
function isDirectoryPath(path: string): boolean {
	const lastDot = path.lastIndexOf('.');
	const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));

	// 如果没有点号，或者点号在最后一个路径分隔符之前（意味着扩展名属于父目录），则是文件夹
	if (lastDot < 0 || lastDot < lastSep) {
		return true;
	}

	// 获取扩展名
	const ext = path.substring(lastDot + 1).toLowerCase();

	// 如果扩展名为空或太长（超过10字符），可能是文件夹
	if (!ext || ext.length > 10) {
		return true;
	}

	// 其他情况都视为文件（有扩展名）
	return false;
}

/**
 * 将历史条目转换为 FsItem
 * 使用反向逻辑：只有没有文件扩展名的路径才是文件夹，其他都是文件
 */
function historyToFsItem(entry: HistoryEntry): FsItem {
	// 使用反向逻辑判断是否为目录
	const isDirectory = isDirectoryPath(entry.path);
	return {
		path: entry.path,
		name: entry.name,
		isDir: isDirectory,
		isImage: false,
		size: 0,
		modified: entry.timestamp
	};
}

/**
 * 加载虚拟路径数据
 */
export function loadVirtualPathData(path: string): FsItem[] {
	const type = getVirtualPathType(path);

	switch (type) {
		case 'bookmark': {
			// 触发后台清理（首次加载时执行一次，不阻塞）
			triggerBookmarkCleanup();
			const bookmarks = get(bookmarkStore) as BookmarkEntry[];
			return bookmarks.map(bookmarkToFsItem);
		}
		case 'history': {
			// 触发后台清理（首次加载时执行一次，不阻塞）
			triggerHistoryCleanup();
			const history = get(historyStore) as HistoryEntry[];
			return history.map(historyToFsItem);
		}
		case 'search': {
			// 搜索结果从 tabSearchResults 获取
			return get(tabSearchResults) as FsItem[];
		}
		default:
			return [];
	}
}

/**
 * 订阅虚拟路径数据变化
 */
export function subscribeVirtualPathData(
	path: string,
	callback: (items: FsItem[]) => void
): () => void {
	const type = getVirtualPathType(path);

	switch (type) {
		case 'bookmark': {
			return bookmarkStore.subscribe((bookmarks: BookmarkEntry[]) => {
				callback(bookmarks.map(bookmarkToFsItem));
			});
		}
		case 'history': {
			return historyStore.subscribe((history: HistoryEntry[]) => {
				callback(history.map(historyToFsItem));
			});
		}
		case 'search': {
			// 搜索结果订阅
			return tabSearchResults.subscribe((results: FsItem[]) => {
				callback(results);
			});
		}
		default:
			return () => { };
	}
}

/**
 * 删除虚拟路径中的项目
 */
export function removeVirtualPathItem(path: string, itemPath: string): boolean {
	const type = getVirtualPathType(path);

	switch (type) {
		case 'bookmark': {
			const bookmarks = get(bookmarkStore) as BookmarkEntry[];
			const bookmark = bookmarks.find(b => b.path === itemPath);
			if (bookmark) {
				bookmarkStore.remove(bookmark.id);
				return true;
			}
			return false;
		}
		case 'history': {
			const history = get(historyStore) as HistoryEntry[];
			const entry = history.find(h => h.path === itemPath);
			if (entry) {
				historyStore.remove(entry.id);
				return true;
			}
			return false;
		}
		default:
			return false;
	}
}

/**
 * 清空虚拟路径数据
 */
export function clearVirtualPathData(path: string): boolean {
	const type = getVirtualPathType(path);

	switch (type) {
		case 'history': {
			historyStore.clear();
			return true;
		}
		default:
			return false;
	}
}

/**
 * 获取虚拟路径的配置
 */
export function getVirtualPathConfig(type: VirtualPathType) {
	switch (type) {
		case 'bookmark':
			return {
				canClear: false,
				canAddBookmark: false,
				showFolderTree: false,
				showMigrationBar: false,
				defaultSortField: 'date' as const,
				defaultSortOrder: 'desc' as const
			};
		case 'history':
			return {
				canClear: true,
				canAddBookmark: true,
				showFolderTree: false,
				showMigrationBar: false,
				defaultSortField: 'date' as const,
				defaultSortOrder: 'desc' as const
			};
		case 'search':
			return {
				canClear: false,
				canAddBookmark: true,
				showFolderTree: false,
				showMigrationBar: false,
				defaultSortField: 'name' as const,
				defaultSortOrder: 'asc' as const
			};
		default:
			return null;
	}
}
