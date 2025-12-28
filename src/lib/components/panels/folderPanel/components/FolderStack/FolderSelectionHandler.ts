/**
 * FolderStack 选择逻辑模块
 * 处理项目选择、链选、范围选择等交互
 */

import type { FsItem } from '$lib/types';
import {
	handleChainSelect as chainSelect,
	tryPenetrateChildren,
	type SelectionContext,
	type ChainSelectResult
} from './folderStackEventHandlers';
import * as FileSystemAPI from '$lib/api/filesystem';

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
			callbacks.onItemOpen?.(penetrated);
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
 */
async function tryPenetrateFolder(folderPath: string): Promise<FsItem | null> {
	try {
		const children = await FileSystemAPI.browseDirectory(folderPath);
		const result = tryPenetrateChildren(children);
		return result.success ? result.targetItem ?? null : null;
	} catch {
		return null;
	}
}
