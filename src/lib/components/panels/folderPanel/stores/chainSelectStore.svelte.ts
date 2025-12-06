/**
 * ChainSelectStore - 链接选中模式状态管理
 * 独立模块，用于管理链式选择功能
 */

import { writable, derived } from 'svelte/store';

// 链选模式状态（按页签ID存储）
const chainSelectModeByTab = writable<Record<string, boolean>>({});

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
 * 切换链选模式
 */
export function toggleChainSelectMode() {
	chainSelectModeByTab.update((modes) => ({
		...modes,
		[currentActiveTabId]: !modes[currentActiveTabId]
	}));
}

/**
 * 获取指定页签的链选模式
 */
export function getChainSelectMode(tabId: string): boolean {
	let result = false;
	chainSelectModeByTab.subscribe((modes) => {
		result = modes[tabId] || false;
	})();
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
}
