/**
 * FolderStack 选择逻辑模块
 * 处理项目选择、链选、范围选择等交互
 */

import type { FsItem } from '$lib/types';
import {
	handleChainSelect as chainSelect,
	type SelectionContext,
	type ChainSelectResult
} from './folderStackEventHandlers';
import * as FileSystemAPI from '$lib/api/filesystem';
import { get } from 'svelte/store';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';

/**
 * 附属文件扩展名（穿透时忽略这些文件）
 * 包括：字幕、信息文件、日志等
 */
const AUXILIARY_EXTENSIONS = [
	// 字幕文件
	'srt', 'ass', 'ssa', 'vtt', 'sub', 'idx',
	// 信息文件
	'nfo', 'txt', 'log', 'url',
	// 元数据
	'xml', 'json',
	// 封面图（通常是附属的）
	'jpg', 'jpeg', 'png', 'gif', 'webp'
];

/**
 * 判断是否为附属文件（穿透时应忽略）
 */
function isAuxiliaryFile(name: string): boolean {
	const ext = name.split('.').pop()?.toLowerCase() || '';
	return AUXILIARY_EXTENSIONS.includes(ext);
}

/** 选择操作回调 */
export interface SelectionCallbacks {
	selectItem: (path: string, toggle?: boolean, index?: number) => void;
	setSelectedItems: (items: Set<string>) => void;
	selectRange: (index: number, items: FsItem[]) => void;
	deselectAll: () => void;
}

/** 项目打开回调 */
export interface ItemOpenCallbacks {
	onItemOpen?: (item: FsItem) => void;
	onOpenFolderAsBook?: (item: FsItem) => void;
	onOpenInNewTab?: (item: FsItem) => void;
	onNavigate: (path: string) => void;
}

/**
 * 处理项目选择
 */
export async function handleItemSelection(
	payload: {
		item: FsItem;
		index: number;
		multiSelect: boolean;
		shiftKey?: boolean;
	},
	context: {
		tabId: string;
		multiSelectMode: boolean;
		penetrateMode: boolean;
		openInNewTabMode: boolean;
		skipGlobalStore: boolean;
		displayItems: FsItem[];
		selectedItems: Set<string>;
	},
	callbacks: SelectionCallbacks & ItemOpenCallbacks,
	setChainAnchor: (tabId: string, index: number) => void
): Promise<{ handled: boolean; navigated?: boolean }> {
	const { item, index, multiSelect, shiftKey } = payload;
	const { tabId, multiSelectMode, penetrateMode, openInNewTabMode, skipGlobalStore, displayItems, selectedItems } = context;

	// 构建链选上下文
	const chainCtx: SelectionContext = {
		tabId,
		multiSelectMode: multiSelectMode || multiSelect,
		displayItems,
		selectedItems
	};
	
	// 尝试链选处理
	const chainResult = chainSelect(chainCtx, index, item.path);
	
	if (chainResult.handled) {
		applyChainSelectResult(chainResult, callbacks, setChainAnchor, tabId, index);
		return { handled: true };
	}

	// Shift + 点击：范围选择
	if ((multiSelectMode || multiSelect) && shiftKey) {
		callbacks.selectRange(index, displayItems);
		return { handled: true };
	}
	
	// 多选模式：切换选中状态
	if (multiSelect || multiSelectMode) {
		callbacks.selectItem(item.path, true, index);
		return { handled: true };
	}

	// 单选模式
	if (item.isDir) {
		return await handleDirectoryClick(item, {
			skipGlobalStore,
			penetrateMode,
			openInNewTabMode
		}, callbacks);
	} else {
		// 文件：选中并打开
		callbacks.selectItem(item.path);
		callbacks.onItemOpen?.(item);
		return { handled: true };
	}
}

/**
 * 应用链选结果
 */
function applyChainSelectResult(
	result: ChainSelectResult,
	callbacks: SelectionCallbacks,
	setChainAnchor: (tabId: string, index: number) => void,
	tabId: string,
	index: number
): void {
	if (result.newSelection) {
		callbacks.setSelectedItems(result.newSelection);
	} else if (result.toggleItem) {
		callbacks.selectItem(result.toggleItem, true, index);
	}
	if (result.newAnchor !== undefined) {
		setChainAnchor(tabId, result.newAnchor);
	}
}

/**
 * 处理目录点击
 */
async function handleDirectoryClick(
	item: FsItem,
	options: {
		skipGlobalStore: boolean;
		penetrateMode: boolean;
		openInNewTabMode: boolean;
	},
	callbacks: ItemOpenCallbacks & { deselectAll: () => void }
): Promise<{ handled: boolean; navigated?: boolean }> {
	const { skipGlobalStore, penetrateMode, openInNewTabMode } = options;
	
	// 虚拟实例：通过回调处理
	if (skipGlobalStore) {
		callbacks.onItemOpen?.(item);
		return { handled: true };
	}
	
	// 穿透模式
	if (penetrateMode) {
		const penetrated = await tryPenetrateFolder(item.path);
		if (penetrated) {
			// 穿透成功：文件用 onItemOpen，文件夹用 onOpenFolderAsBook
			if (penetrated.isDir) {
				callbacks.onOpenFolderAsBook?.(penetrated);
			} else {
				callbacks.onItemOpen?.(penetrated);
			}
			return { handled: true };
		}
		if (openInNewTabMode) {
			callbacks.onOpenInNewTab?.(item);
			return { handled: true };
		}
	}
	
	// 正常进入目录
	callbacks.deselectAll();
	callbacks.onNavigate(item.path);
	return { handled: true, navigated: true };
}

/**
 * 尝试穿透文件夹
 * 递归穿透只有单个子文件夹的目录，直到找到可打开的目标
 * @param folderPath 起始文件夹路径
 * @returns 穿透后的目标项（文件或最终文件夹），如果无法穿透则返回 null
 */
async function tryPenetrateFolder(folderPath: string): Promise<FsItem | null> {
	const maxDepth = get(fileBrowserStore).penetrateMaxDepth;
	return await tryPenetrateFolderRecursive(folderPath, 0, maxDepth);
}

/**
 * 递归穿透文件夹
 * @param folderPath 当前文件夹路径
 * @param currentDepth 当前穿透深度
 * @param maxDepth 最大穿透深度
 */
async function tryPenetrateFolderRecursive(
	folderPath: string,
	currentDepth: number,
	maxDepth: number
): Promise<FsItem | null> {
	// 超过最大深度，返回 null 表示无法穿透
	if (currentDepth >= maxDepth) {
		return null;
	}
	
	try {
		const children = await FileSystemAPI.browseDirectory(folderPath);
		
		// 没有子项，无法穿透
		if (children.length === 0) {
			return null;
		}
		
		// 只有一个子项
		if (children.length === 1) {
			const child = children[0];
			
			// 子项是文件 -> 穿透成功，返回这个文件
			if (!child.isDir) {
				return child;
			}
			
			// 子项是文件夹 -> 递归穿透
			const result = await tryPenetrateFolderRecursive(child.path, currentDepth + 1, maxDepth);
			// 如果递归穿透成功，返回结果；否则返回这个子文件夹本身
			return result ?? child;
		}
		
		// 多个子项，无法自动穿透
		return null;
	} catch {
		return null;
	}
}
