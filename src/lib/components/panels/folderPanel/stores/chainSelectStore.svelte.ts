/**
 * ChainSelectStore - 链接选中模式状态管理
 * 独立模块，用于管理链式选择功能
 */

import { writable, derived, get } from 'svelte/store';

// 链选模式状态（按页签ID存储）- 导出用于响应式订阅
export const chainSelectModeByTab = writable<Record<string, boolean>>({});

// 链选锚点索引（按页签ID存储）- 记录上一次选中的索引
const chainAnchorByTab = writable<Record<string, number>>({});

// 当前活动页签ID（从外部获取）
let currentActiveTabId = '';

/**
 * 设置当前活动页签ID
 */
export function setActiveTabId(tabId: string) {
	currentActiveTabId = tabId;
}

/**
 * 获取当前页签的链选模式状态
 */
export const chainSelectMode = derived(chainSelectModeByTab, ($modes) => {
	return $modes[currentActiveTabId] || false;
});

/**
 * 切换指定页签的链选模式
 */
export function toggleChainSelectMode(tabId: string) {
	console.log('[ChainSelectStore] toggleChainSelectMode called, tabId:', tabId);
	chainSelectModeByTab.update((modes) => {
		const newEnabled = !modes[tabId];
		console.log('[ChainSelectStore] 当前状态:', modes[tabId], '-> 新状态:', newEnabled);
		// 关闭链选模式时清除锚点
		if (!newEnabled) {
			chainAnchorByTab.update((anchors) => {
				const newAnchors = { ...anchors };
				delete newAnchors[tabId];
				return newAnchors;
			});
		}
		return {
			...modes,
			[tabId]: newEnabled
		};
	});
}

/**
 * 获取指定页签的链选模式
 */
export function getChainSelectMode(tabId: string): boolean {
	const modes = get(chainSelectModeByTab);
	const result = modes[tabId] || false;
	console.log('[ChainSelectStore] getChainSelectMode tabId:', tabId, 'modes:', modes, 'result:', result);
	return result;
}

/**
 * 设置指定页签的链选模式
 */
export function setChainSelectMode(tabId: string, enabled: boolean) {
	chainSelectModeByTab.update((modes) => ({
		...modes,
		[tabId]: enabled
	}));
	// 关闭时清除锚点
	if (!enabled) {
		chainAnchorByTab.update((anchors) => {
			const newAnchors = { ...anchors };
			delete newAnchors[tabId];
			return newAnchors;
		});
	}
}

/**
 * 获取指定页签的链选锚点索引
 */
export function getChainAnchor(tabId: string): number {
	const anchors = get(chainAnchorByTab);
	return anchors[tabId] ?? -1;
}

/**
 * 设置指定页签的链选锚点索引
 */
export function setChainAnchor(tabId: string, index: number) {
	chainAnchorByTab.update((anchors) => ({
		...anchors,
		[tabId]: index
	}));
}

/**
 * 清除指定页签的链选锚点
 */
export function clearChainAnchor(tabId: string) {
	chainAnchorByTab.update((anchors) => {
		const newAnchors = { ...anchors };
		delete newAnchors[tabId];
		return newAnchors;
	});
}
