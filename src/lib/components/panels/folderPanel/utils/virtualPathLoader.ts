/**
 * virtualPathLoader - 虚拟路径数据加载器
 * 支持从书签和历史 store 加载数据到文件列表
 */

import type { FsItem } from '$lib/types';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
import { get } from 'svelte/store';
import { getVirtualPathType, type VirtualPathType } from '../stores/folderTabStore.svelte';
import { isVideoFile } from '$lib/utils/videoUtils';

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
 * 判断是否为压缩包
 */
function isArchivePath(path: string): boolean {
	const ext = path.toLowerCase();
	return ext.endsWith('.zip') || ext.endsWith('.cbz') || ext.endsWith('.rar') ||
		ext.endsWith('.cbr') || ext.endsWith('.7z') || ext.endsWith('.cb7');
}

/**
 * 将历史条目转换为 FsItem
 * 正确识别压缩包和视频文件，将它们标记为文件而非目录
 */
function historyToFsItem(entry: HistoryEntry): FsItem {
	const isArchive = isArchivePath(entry.path);
	const isVideo = isVideoFile(entry.path);
	// 压缩包和视频文件是文件（isDir = false），其他是目录
	const isDirectory = !isArchive && !isVideo;
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
			const bookmarks = get(bookmarkStore) as BookmarkEntry[];
			return bookmarks.map(bookmarkToFsItem);
		}
		case 'history': {
			const history = get(historyStore) as HistoryEntry[];
			return history.map(historyToFsItem);
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
		default:
			return null;
	}
}
