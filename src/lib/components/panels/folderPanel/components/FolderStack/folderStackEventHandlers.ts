/**
 * FolderStack Event Handlers
 * 文件夹栈事件处理工具
 *
 * 将 FolderStack.svelte 中的复杂事件处理逻辑提取出来，
 * 减少组件大小并提高可测试性。
 */

import type { FsItem } from '$lib/types';
import { get, type Writable } from 'svelte/store';
import {
	getChainSelectMode,
	getChainAnchor,
	setChainAnchor
} from '../../stores/chainSelectStore.svelte';

/**
 * 选择操作上下文
 */
export interface SelectionContext {
	tabId: string;
	multiSelectMode: boolean;
	displayItems: FsItem[];
	selectedItems: Set<string>;
}

/**
 * 链选处理结果
 */
export interface ChainSelectResult {
	handled: boolean;
	newSelection?: Set<string>;
	newAnchor?: number;
	toggleItem?: string;
}

/**
 * 处理链选逻辑
 * 
 * @param ctx 选择上下文
 * @param currentIndex 当前点击的索引
 * @param itemPath 当前点击项的路径
 * @returns 链选处理结果
 */
export function handleChainSelect(
	ctx: SelectionContext,
	currentIndex: number,
	itemPath: string
): ChainSelectResult {
	const { tabId, multiSelectMode, displayItems, selectedItems } = ctx;

	// 检查链选模式
	const isChainSelectMode = getChainSelectMode(tabId);
	if (!isChainSelectMode || !multiSelectMode) {
		return { handled: false };
	}

	let anchor = getChainAnchor(tabId);

	// 如果没有锚点，尝试从已选中项中找到最近的一个作为锚点
	if (anchor === -1) {
		if (selectedItems.size > 0) {
			// 找到离当前点击位置最近的已选中项作为锚点
			let nearestIndex = -1;
			let nearestDistance = Infinity;
			for (let i = 0; i < displayItems.length; i++) {
				if (selectedItems.has(displayItems[i].path)) {
					const distance = Math.abs(i - currentIndex);
					if (distance < nearestDistance) {
						nearestDistance = distance;
						nearestIndex = i;
					}
				}
			}
			if (nearestIndex !== -1) {
				anchor = nearestIndex;
			}
		}
	}

	if (anchor === -1 || anchor === currentIndex) {
		// 没有锚点，或点击的是锚点本身：切换该项的选中状态并设置为新锚点
		return {
			handled: true,
			toggleItem: itemPath,
			newAnchor: currentIndex
		};
	}

	// 有锚点且点击不同位置，选中从锚点到当前位置的所有项目
	const startIndex = Math.min(anchor, currentIndex);
	const endIndex = Math.max(anchor, currentIndex);

	// 批量收集需要选中的路径
	const newSelection = new Set(selectedItems);
	for (let i = startIndex; i <= endIndex; i++) {
		if (i >= 0 && i < displayItems.length) {
			newSelection.add(displayItems[i].path);
		}
	}

	return {
		handled: true,
		newSelection,
		newAnchor: currentIndex
	};
}

/**
 * 处理范围选择（Shift + 点击）
 * 
 * @param displayItems 显示的项目列表
 * @param selectedItems 当前选中的项目
 * @param anchorIndex 锚点索引（最后一次选择的位置）
 * @param targetIndex 目标索引（当前点击的位置）
 * @returns 新的选中项集合
 */
export function handleRangeSelect(
	displayItems: FsItem[],
	selectedItems: Set<string>,
	anchorIndex: number,
	targetIndex: number
): Set<string> {
	const newSelection = new Set(selectedItems);
	const startIndex = Math.min(anchorIndex, targetIndex);
	const endIndex = Math.max(anchorIndex, targetIndex);

	for (let i = startIndex; i <= endIndex; i++) {
		if (i >= 0 && i < displayItems.length) {
			newSelection.add(displayItems[i].path);
		}
	}

	return newSelection;
}

/**
 * 计算点击空白区域后的行为
 */
export type EmptyClickAction = 'none' | 'goUp' | 'goBack';

/**
 * 判断是否应该响应空白区域点击
 * 
 * @param action 用户设置的点击行为
 * @param isVirtualPath 当前路径是否为虚拟路径
 * @returns 是否应该执行导航
 */
export function shouldHandleEmptyClick(
	action: EmptyClickAction,
	isVirtualPath: boolean
): boolean {
	// 虚拟路径模式下不响应
	if (isVirtualPath) return false;
	// 无操作模式下不响应
	if (action === 'none') return false;
	return true;
}

/**
 * 穿透文件夹结果
 */
export interface PenetrationResult {
	success: boolean;
	targetItem?: FsItem;
}

/**
 * 尝试穿透单文件文件夹
 * 
 * @param children 文件夹的子项
 * @returns 穿透结果
 */
export function tryPenetrateChildren(children: FsItem[]): PenetrationResult {
	// 只有当文件夹只有一个子文件时才穿透
	if (children.length === 1 && !children[0].isDir) {
		return { success: true, targetItem: children[0] };
	}
	return { success: false };
}
