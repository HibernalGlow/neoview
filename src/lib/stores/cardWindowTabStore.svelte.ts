/**
 * CardWindowTabStore - 卡片窗口标签页状态管理
 * 管理单个卡片窗口内的标签页状态，使用 Svelte 5 Runes
 * Requirements: 2.1, 2.2, 2.3, 2.5, 3.3, 6.2, 6.3, 8.2, 8.3
 */

import { cardRegistry } from '$lib/cards/registry';
import type { Component } from 'svelte';

// ============ Types ============

export interface CardTab {
	id: string;
	cardId: string;
	title: string;
	icon?: Component;
	order: number;
}

export interface CardTabConfig {
	tabId: string;
	cardId: string;
	title: string;
	order: number;
}

export interface CardWindowTabState {
	windowId: string;
	tabs: CardTab[];
	activeTabId: string;
}

// ============ Utility Functions ============

/**
 * 生成唯一标签页 ID
 */
function generateTabId(): string {
	return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 从卡片 ID 创建标签页
 */
function createTabFromCardId(cardId: string, order: number): CardTab | null {
	const cardDef = cardRegistry[cardId];
	if (!cardDef) {
		console.warn(`[CardWindowTabStore] Invalid card ID: ${cardId}`);
		return null;
	}
	
	return {
		id: generateTabId(),
		cardId,
		title: cardDef.title,
		icon: cardDef.icon,
		order
	};
}

// ============ CardWindowTabStore Class ============

export class CardWindowTabStore {
	// 响应式状态
	tabs = $state<CardTab[]>([]);
	activeTabId = $state<string>('');
	windowId: string;

	constructor(windowId: string, initialTabs: CardTab[] = [], initialActiveTabId?: string) {
		this.windowId = windowId;
		this.tabs = initialTabs;
		this.activeTabId = initialActiveTabId || (initialTabs.length > 0 ? initialTabs[0].id : '');
	}

	// ============ Derived State ============

	/**
	 * 获取当前活动标签页
	 */
	get activeTab(): CardTab | undefined {
		return this.tabs.find(tab => tab.id === this.activeTabId);
	}

	/**
	 * 获取当前活动标签页索引
	 */
	get activeTabIndex(): number {
		return this.sortedTabs.findIndex(tab => tab.id === this.activeTabId);
	}

	/**
	 * 获取排序后的标签页列表
	 */
	get sortedTabs(): CardTab[] {
		return [...this.tabs].sort((a, b) => a.order - b.order);
	}

	/**
	 * 获取标签页数量
	 */
	get tabCount(): number {
		return this.tabs.length;
	}

	// ============ Tab Operations ============

	/**
	 * 添加新标签页
	 * Requirements: 3.3
	 */
	addTab(cardId: string): string | null {
		const maxOrder = this.tabs.length > 0 
			? Math.max(...this.tabs.map(t => t.order)) 
			: -1;
		
		const newTab = createTabFromCardId(cardId, maxOrder + 1);
		if (!newTab) return null;

		this.tabs = [...this.tabs, newTab];
		this.activeTabId = newTab.id;
		
		return newTab.id;
	}

	/**
	 * 移除标签页
	 * Requirements: 2.3
	 */
	removeTab(tabId: string): boolean {
		const tabIndex = this.tabs.findIndex(t => t.id === tabId);
		if (tabIndex === -1) return false;

		const wasActive = this.activeTabId === tabId;
		const sortedTabs = this.sortedTabs;
		const sortedIndex = sortedTabs.findIndex(t => t.id === tabId);

		// 移除标签页
		this.tabs = this.tabs.filter(t => t.id !== tabId);

		// 如果移除的是活动标签页，切换到相邻标签页
		if (wasActive && this.tabs.length > 0) {
			const newSortedTabs = this.sortedTabs;
			// 优先切换到右边的标签页，如果没有则切换到左边
			const newIndex = Math.min(sortedIndex, newSortedTabs.length - 1);
			this.activeTabId = newSortedTabs[newIndex].id;
		} else if (this.tabs.length === 0) {
			this.activeTabId = '';
		}

		// 重新排序
		this.reorderTabs();

		return true;
	}

	/**
	 * 设置活动标签页
	 * Requirements: 2.2
	 */
	setActiveTab(tabId: string): boolean {
		const tab = this.tabs.find(t => t.id === tabId);
		if (!tab) return false;
		
		this.activeTabId = tabId;
		return true;
	}

	/**
	 * 移动标签页到新位置
	 * Requirements: 2.5
	 */
	moveTab(tabId: string, newOrder: number): boolean {
		const tab = this.tabs.find(t => t.id === tabId);
		if (!tab) return false;

		const oldOrder = tab.order;
		if (oldOrder === newOrder) return true;

		// 更新所有标签页的顺序
		this.tabs = this.tabs.map(t => {
			if (t.id === tabId) {
				return { ...t, order: newOrder };
			}
			if (oldOrder < newOrder) {
				// 向右移动：中间的标签页向左移
				if (t.order > oldOrder && t.order <= newOrder) {
					return { ...t, order: t.order - 1 };
				}
			} else {
				// 向左移动：中间的标签页向右移
				if (t.order >= newOrder && t.order < oldOrder) {
					return { ...t, order: t.order + 1 };
				}
			}
			return t;
		});

		return true;
	}

	/**
	 * 复制标签页
	 * Requirements: 8.2, 8.3
	 */
	duplicateTab(tabId: string): string | null {
		const tab = this.tabs.find(t => t.id === tabId);
		if (!tab) return null;

		const maxOrder = Math.max(...this.tabs.map(t => t.order));
		const newTab: CardTab = {
			id: generateTabId(),
			cardId: tab.cardId,
			title: tab.title,
			icon: tab.icon,
			order: maxOrder + 1
		};

		this.tabs = [...this.tabs, newTab];
		this.activeTabId = newTab.id;

		return newTab.id;
	}

	// ============ Navigation ============

	/**
	 * 切换到下一个标签页
	 * Requirements: 6.2
	 */
	nextTab(): void {
		if (this.tabs.length <= 1) return;
		
		const sortedTabs = this.sortedTabs;
		const currentIndex = sortedTabs.findIndex(t => t.id === this.activeTabId);
		const nextIndex = (currentIndex + 1) % sortedTabs.length;
		this.activeTabId = sortedTabs[nextIndex].id;
	}

	/**
	 * 切换到上一个标签页
	 * Requirements: 6.3
	 */
	previousTab(): void {
		if (this.tabs.length <= 1) return;
		
		const sortedTabs = this.sortedTabs;
		const currentIndex = sortedTabs.findIndex(t => t.id === this.activeTabId);
		const prevIndex = (currentIndex - 1 + sortedTabs.length) % sortedTabs.length;
		this.activeTabId = sortedTabs[prevIndex].id;
	}

	// ============ Bulk Operations ============

	/**
	 * 关闭其他所有标签页
	 */
	closeOtherTabs(keepTabId: string): void {
		const keepTab = this.tabs.find(t => t.id === keepTabId);
		if (!keepTab) return;

		this.tabs = [{ ...keepTab, order: 0 }];
		this.activeTabId = keepTabId;
	}

	/**
	 * 关闭右侧所有标签页
	 */
	closeTabsToRight(tabId: string): void {
		const tab = this.tabs.find(t => t.id === tabId);
		if (!tab) return;

		this.tabs = this.tabs.filter(t => t.order <= tab.order);
		
		// 如果活动标签页被关闭，切换到指定标签页
		if (!this.tabs.find(t => t.id === this.activeTabId)) {
			this.activeTabId = tabId;
		}
	}

	// ============ Serialization ============

	/**
	 * 转换为配置对象（用于持久化）
	 */
	toConfig(): CardTabConfig[] {
		return this.sortedTabs.map(tab => ({
			tabId: tab.id,
			cardId: tab.cardId,
			title: tab.title,
			order: tab.order
		}));
	}

	/**
	 * 从配置创建 store
	 */
	static fromConfig(windowId: string, configs: CardTabConfig[]): CardWindowTabStore {
		// 过滤无效的卡片 ID
		const validConfigs = configs.filter(config => cardRegistry[config.cardId]);
		
		const tabs: CardTab[] = validConfigs.map((config, index) => {
			const cardDef = cardRegistry[config.cardId];
			return {
				id: config.tabId || generateTabId(),
				cardId: config.cardId,
				title: cardDef?.title || config.title,
				icon: cardDef?.icon,
				order: config.order ?? index
			};
		});

		const activeTabId = tabs.length > 0 ? tabs[0].id : '';
		return new CardWindowTabStore(windowId, tabs, activeTabId);
	}

	// ============ Internal Methods ============

	/**
	 * 重新排序标签页（确保 order 连续）
	 */
	private reorderTabs(): void {
		const sortedTabs = this.sortedTabs;
		this.tabs = sortedTabs.map((tab, index) => ({
			...tab,
			order: index
		}));
	}
}

// ============ Store Registry ============

/**
 * 全局标签页 store 注册表
 * 用于跨窗口通信和状态管理
 */
const tabStoreRegistry = new Map<string, CardWindowTabStore>();

/**
 * 获取或创建窗口的标签页 store
 */
export function getOrCreateTabStore(windowId: string, initialCardId?: string): CardWindowTabStore {
	let store = tabStoreRegistry.get(windowId);
	
	if (!store) {
		store = new CardWindowTabStore(windowId);
		if (initialCardId) {
			store.addTab(initialCardId);
		}
		tabStoreRegistry.set(windowId, store);
	}
	
	return store;
}

/**
 * 获取窗口的标签页 store
 */
export function getTabStore(windowId: string): CardWindowTabStore | undefined {
	return tabStoreRegistry.get(windowId);
}

/**
 * 注册标签页 store
 */
export function registerTabStore(windowId: string, store: CardWindowTabStore): void {
	tabStoreRegistry.set(windowId, store);
}

/**
 * 移除窗口的标签页 store
 */
export function removeTabStore(windowId: string): void {
	tabStoreRegistry.delete(windowId);
}

/**
 * 获取所有窗口 ID
 */
export function getAllWindowIds(): string[] {
	return Array.from(tabStoreRegistry.keys());
}
