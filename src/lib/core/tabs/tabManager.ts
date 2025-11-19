/**
 * Tab Manager
 * 多标签管理器 - 支持多个书籍在不同标签中打开
 */

import { bookStore } from '$lib/stores/book.svelte';
import type { BookInfo } from '$lib/types';

export interface TabInfo {
	id: string;
	title: string;
	bookPath: string | null;
	bookInfo: BookInfo | null;
	createdAt: number;
	lastAccessed: number;
}

class TabManager {
	private tabs = $state<Map<string, TabInfo>>(new Map());
	private activeTabId = $state<string | null>(null);
	private tabCounter = 0;

	/**
	 * 创建新标签
	 */
	createTab(bookPath?: string, bookInfo?: BookInfo): string {
		const id = `tab-${++this.tabCounter}-${Date.now()}`;
		const tab: TabInfo = {
			id,
			title: bookInfo?.name || bookPath?.split(/[/\\]/).pop() || '新标签',
			bookPath: bookPath || null,
			bookInfo: bookInfo || null,
			createdAt: Date.now(),
			lastAccessed: Date.now()
		};

		this.tabs.set(id, tab);
		this.activeTabId = id;

		// 如果提供了书籍信息，切换到该标签
		if (bookInfo) {
			this.switchToTab(id);
		}

		return id;
	}

	/**
	 * 切换到指定标签
	 */
	switchToTab(tabId: string): boolean {
		const tab = this.tabs.get(tabId);
		if (!tab) {
			return false;
		}

		this.activeTabId = tabId;
		tab.lastAccessed = Date.now();

		// 如果标签有书籍信息，加载到 bookStore
		if (tab.bookInfo) {
			// 这里需要更新 bookStore 以支持多标签
			// 暂时先直接设置
			bookStore.openBook(tab.bookInfo.path, tab.bookInfo.type);
		}

		return true;
	}

	/**
	 * 关闭标签
	 */
	closeTab(tabId: string): boolean {
		if (this.tabs.size <= 1) {
			// 至少保留一个标签
			return false;
		}

		const tab = this.tabs.get(tabId);
		if (!tab) {
			return false;
		}

		this.tabs.delete(tabId);

		// 如果关闭的是当前活动标签，切换到其他标签
		if (this.activeTabId === tabId) {
			const remainingTabs = Array.from(this.tabs.keys());
			if (remainingTabs.length > 0) {
				this.switchToTab(remainingTabs[0]);
			} else {
				this.activeTabId = null;
			}
		}

		return true;
	}

	/**
	 * 更新标签信息
	 */
	updateTab(tabId: string, updates: Partial<Pick<TabInfo, 'title' | 'bookPath' | 'bookInfo'>>): boolean {
		const tab = this.tabs.get(tabId);
		if (!tab) {
			return false;
		}

		Object.assign(tab, updates);
		tab.lastAccessed = Date.now();
		return true;
	}

	/**
	 * 获取所有标签
	 */
	getAllTabs(): TabInfo[] {
		return Array.from(this.tabs.values()).sort((a, b) => a.lastAccessed - b.lastAccessed);
	}

	/**
	 * 获取当前活动标签
	 */
	getActiveTab(): TabInfo | null {
		if (!this.activeTabId) {
			return null;
		}
		return this.tabs.get(this.activeTabId) || null;
	}

	/**
	 * 获取标签数量
	 */
	getTabCount(): number {
		return this.tabs.size;
	}
}

// 单例
export const tabManager = new TabManager();






