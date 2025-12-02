/**
 * FolderTabStore - 文件面板页签状态管理
 * 支持多页签独立状态：路径、历史、工具栏、搜索等
 */

import { writable, derived, get } from 'svelte/store';
import { SvelteSet } from 'svelte/reactivity';
import type { FsItem } from '$lib/types';
import type { FolderViewStyle, FolderSortField, FolderSortOrder, DeleteStrategy } from './folderPanelStore.svelte';

// ============ Types ============

export interface FolderHistoryEntry {
	path: string;
	displayName: string;
	timestamp: number;
	scrollTop: number;
	selectedItemPath: string | null;
	sortField: FolderSortField;
	sortOrder: FolderSortOrder;
}

// 层叠栈中的单个层
export interface FolderStackLayer {
	id: string;
	path: string;
	items: FsItem[];
	selectedIndex: number;
	scrollTop: number;
}

export interface FolderTabState {
	id: string;
	// 显示名称
	title: string;
	// 当前路径
	currentPath: string;
	// 文件列表
	items: FsItem[];
	// 选中项
	selectedItems: SvelteSet<string>;
	// 当前焦点项
	focusedItem: FsItem | null;
	// 加载状态
	loading: boolean;
	// 错误信息
	error: string | null;
	// 视图样式
	viewStyle: FolderViewStyle;
	// 排序字段
	sortField: FolderSortField;
	// 排序顺序
	sortOrder: FolderSortOrder;
	// 评分版本号
	ratingVersion: number;
	// 多选模式
	multiSelectMode: boolean;
	// 删除模式
	deleteMode: boolean;
	// 递归模式
	recursiveMode: boolean;
	// 搜索关键词
	searchKeyword: string;
	// 搜索结果
	searchResults: FsItem[];
	// 是否正在搜索
	isSearching: boolean;
	// 搜索栏可见
	showSearchBar: boolean;
	// 迁移栏可见
	showMigrationBar: boolean;
	// 穿透模式
	penetrateMode: boolean;
	// 删除策略
	deleteStrategy: DeleteStrategy;
	// 搜索设置
	searchSettings: {
		includeSubfolders: boolean;
		showHistoryOnFocus: boolean;
		searchInPath: boolean;
	};
	// 主视图树模式
	inlineTreeMode: boolean;
	// 展开的文件夹路径
	expandedFolders: SvelteSet<string>;
	// 文件夹树配置
	folderTreeVisible: boolean;
	folderTreeLayout: 'top' | 'left';
	folderTreeSize: number;
	// 导航历史
	historyStack: FolderHistoryEntry[];
	historyIndex: number;
	// Home 路径
	homePath: string;
	// 层叠栈状态
	stackLayers: FolderStackLayer[];
	stackActiveIndex: number;
}

// ============ Initial State ============

const TAB_STORAGE_KEY = 'neoview-folder-tabs';

function generateTabId(): string {
	return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getDisplayName(path: string): string {
	if (!path) return '新标签页';
	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	return parts[parts.length - 1] || path;
}

function createDefaultTabState(id: string, homePath: string = ''): FolderTabState {
	return {
		id,
		title: '新标签页',
		currentPath: homePath,
		items: [],
		selectedItems: new SvelteSet(),
		focusedItem: null,
		loading: false,
		error: null,
		viewStyle: 'list',
		sortField: 'name',
		sortOrder: 'asc',
		ratingVersion: 0,
		multiSelectMode: false,
		deleteMode: false,
		recursiveMode: false,
		searchKeyword: '',
		searchResults: [],
		isSearching: false,
		showSearchBar: false,
		showMigrationBar: false,
		penetrateMode: false,
		deleteStrategy: 'trash',
		searchSettings: {
			includeSubfolders: true,
			showHistoryOnFocus: true,
			searchInPath: false
		},
		inlineTreeMode: false,
		expandedFolders: new SvelteSet(),
		folderTreeVisible: false,
		folderTreeLayout: 'left',
		folderTreeSize: 200,
		historyStack: [],
		historyIndex: -1,
		homePath,
		stackLayers: [],
		stackActiveIndex: 0
	};
}

// ============ Store ============

interface FolderTabsState {
	tabs: FolderTabState[];
	activeTabId: string;
}

function loadTabsState(): FolderTabsState | null {
	try {
		const saved = localStorage.getItem(TAB_STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// 重建 Set 类型
			if (parsed.tabs) {
				parsed.tabs = parsed.tabs.map((tab: FolderTabState) => ({
					...tab,
					selectedItems: new SvelteSet(tab.selectedItems || []),
					expandedFolders: new SvelteSet(tab.expandedFolders || [])
				}));
			}
			return parsed;
		}
	} catch (e) {
		console.error('[FolderTabStore] Failed to load state:', e);
	}
	return null;
}

function saveTabsState(state: FolderTabsState) {
	try {
		// 序列化前转换 Set 为数组
		const toSave = {
			...state,
			tabs: state.tabs.map((tab) => ({
				...tab,
				// 只保存必要状态，不保存临时数据
				items: [], // 不保存文件列表
				searchResults: [], // 不保存搜索结果
				loading: false,
				error: null,
				selectedItems: Array.from(tab.selectedItems),
				expandedFolders: Array.from(tab.expandedFolders)
			}))
		};
		localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(toSave));
	} catch (e) {
		console.error('[FolderTabStore] Failed to save state:', e);
	}
}

// 初始化状态
const savedState = loadTabsState();
const firstTabId = generateTabId();

const initialState: FolderTabsState = savedState || {
	tabs: [createDefaultTabState(firstTabId)],
	activeTabId: firstTabId
};

// 确保至少有一个标签
if (initialState.tabs.length === 0) {
	const newId = generateTabId();
	initialState.tabs = [createDefaultTabState(newId)];
	initialState.activeTabId = newId;
}

const store = writable<FolderTabsState>(initialState);

// ============ Derived Stores ============

export const allTabs = derived(store, ($store) => $store.tabs);

export const activeTabId = derived(store, ($store) => $store.activeTabId);

export const activeTab = derived(store, ($store) => {
	return $store.tabs.find((tab) => tab.id === $store.activeTabId) || $store.tabs[0];
});

// 当前活动页签的各种状态
export const tabCurrentPath = derived(activeTab, ($tab) => $tab?.currentPath || '');
export const tabItems = derived(activeTab, ($tab) => $tab?.items || []);
export const tabSelectedItems = derived(activeTab, ($tab) => $tab?.selectedItems || new SvelteSet());
export const tabLoading = derived(activeTab, ($tab) => $tab?.loading || false);
export const tabError = derived(activeTab, ($tab) => $tab?.error || null);
export const tabViewStyle = derived(activeTab, ($tab) => $tab?.viewStyle || 'list');
export const tabSortConfig = derived(activeTab, ($tab) => ({
	field: $tab?.sortField || 'name',
	order: $tab?.sortOrder || 'asc'
}));
export const tabMultiSelectMode = derived(activeTab, ($tab) => $tab?.multiSelectMode || false);
export const tabDeleteMode = derived(activeTab, ($tab) => $tab?.deleteMode || false);
export const tabSearchKeyword = derived(activeTab, ($tab) => $tab?.searchKeyword || '');
export const tabSearchResults = derived(activeTab, ($tab) => $tab?.searchResults || []);
export const tabIsSearching = derived(activeTab, ($tab) => $tab?.isSearching || false);
export const tabShowSearchBar = derived(activeTab, ($tab) => $tab?.showSearchBar || false);
export const tabShowMigrationBar = derived(activeTab, ($tab) => $tab?.showMigrationBar || false);
export const tabPenetrateMode = derived(activeTab, ($tab) => $tab?.penetrateMode || false);
export const tabDeleteStrategy = derived(activeTab, ($tab) => $tab?.deleteStrategy || 'trash');
export const tabSearchSettings = derived(activeTab, ($tab) => $tab?.searchSettings || {
	includeSubfolders: true,
	showHistoryOnFocus: true,
	searchInPath: false
});
export const tabInlineTreeMode = derived(activeTab, ($tab) => $tab?.inlineTreeMode || false);
export const tabExpandedFolders = derived(activeTab, ($tab) => $tab?.expandedFolders || new SvelteSet());
export const tabFolderTreeConfig = derived(activeTab, ($tab) => ({
	visible: $tab?.folderTreeVisible || false,
	layout: $tab?.folderTreeLayout || 'left',
	size: $tab?.folderTreeSize || 200
}));

export const tabCanGoBack = derived(activeTab, ($tab) => ($tab?.historyIndex || 0) > 0);
export const tabCanGoForward = derived(activeTab, ($tab) => {
	const index = $tab?.historyIndex ?? -1;
	const stackLength = $tab?.historyStack?.length ?? 0;
	return index < stackLength - 1;
});
export const tabCanGoUp = derived(activeTab, ($tab) => {
	if (!$tab?.currentPath) return false;
	const normalized = $tab.currentPath.replace(/\\/g, '/');
	return normalized.split('/').filter(Boolean).length > 1;
});
export const tabItemCount = derived(activeTab, ($tab) => $tab?.items?.length || 0);

// 层叠栈状态
export const tabStackLayers = derived(activeTab, ($tab) => $tab?.stackLayers || []);
export const tabStackActiveIndex = derived(activeTab, ($tab) => $tab?.stackActiveIndex || 0);

// ============ Actions ============

function updateActiveTab(updater: (tab: FolderTabState) => FolderTabState) {
	store.update(($store) => {
		const tabs = $store.tabs.map((tab) => {
			if (tab.id === $store.activeTabId) {
				return updater(tab);
			}
			return tab;
		});
		const newState = { ...$store, tabs };
		// 延迟保存，避免频繁写入
		requestAnimationFrame(() => saveTabsState(newState));
		return newState;
	});
}

export const folderTabActions = {
	// ============ Tab Management ============

	/**
	 * 创建新页签
	 */
	createTab(homePath: string = ''): string {
		const newId = generateTabId();
		store.update(($store) => {
			const newTab = createDefaultTabState(newId, homePath);
			const newState = {
				tabs: [...$store.tabs, newTab],
				activeTabId: newId
			};
			saveTabsState(newState);
			return newState;
		});
		return newId;
	},

	/**
	 * 关闭页签
	 */
	closeTab(tabId: string) {
		store.update(($store) => {
			if ($store.tabs.length <= 1) {
				// 至少保留一个页签
				return $store;
			}

			const tabIndex = $store.tabs.findIndex((t) => t.id === tabId);
			const newTabs = $store.tabs.filter((t) => t.id !== tabId);
			
			let newActiveId = $store.activeTabId;
			if ($store.activeTabId === tabId) {
				// 如果关闭的是活动页签，切换到相邻页签
				const newIndex = Math.min(tabIndex, newTabs.length - 1);
				newActiveId = newTabs[newIndex].id;
			}

			const newState = { tabs: newTabs, activeTabId: newActiveId };
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 切换页签
	 */
	switchTab(tabId: string) {
		store.update(($store) => {
			if ($store.tabs.some((t) => t.id === tabId)) {
				const newState = { ...$store, activeTabId: tabId };
				saveTabsState(newState);
				return newState;
			}
			return $store;
		});
	},

	/**
	 * 复制页签
	 */
	duplicateTab(tabId: string): string {
		const state = get(store);
		const sourceTab = state.tabs.find((t) => t.id === tabId);
		if (!sourceTab) return '';

		const newId = generateTabId();
		store.update(($store) => {
			const newTab: FolderTabState = {
				...sourceTab,
				id: newId,
				title: sourceTab.title + ' (副本)',
				selectedItems: new SvelteSet(sourceTab.selectedItems),
				expandedFolders: new SvelteSet(sourceTab.expandedFolders),
				historyStack: [...sourceTab.historyStack]
			};

			const sourceIndex = $store.tabs.findIndex((t) => t.id === tabId);
			const newTabs = [...$store.tabs];
			newTabs.splice(sourceIndex + 1, 0, newTab);

			const newState = { tabs: newTabs, activeTabId: newId };
			saveTabsState(newState);
			return newState;
		});
		return newId;
	},

	/**
	 * 获取当前活动页签
	 */
	getActiveTab(): FolderTabState | undefined {
		const state = get(store);
		return state.tabs.find((t) => t.id === state.activeTabId);
	},

	/**
	 * 获取所有页签
	 */
	getAllTabs(): FolderTabState[] {
		return get(store).tabs;
	},

	// ============ Navigation ============

	/**
	 * 设置当前路径
	 */
	setPath(path: string, addToHistory = true) {
		updateActiveTab((tab) => {
			const newTab = { ...tab, currentPath: path, loading: true, error: null };
			newTab.title = getDisplayName(path);

			if (addToHistory && path) {
				const entry: FolderHistoryEntry = {
					path,
					displayName: getDisplayName(path),
					timestamp: Date.now(),
					scrollTop: 0,
					selectedItemPath: null,
					sortField: tab.sortField,
					sortOrder: tab.sortOrder
				};

				// 截断当前位置之后的历史
				const newStack = tab.historyStack.slice(0, tab.historyIndex + 1);
				newStack.push(entry);
				// 限制历史长度
				if (newStack.length > 50) {
					newStack.shift();
				}

				newTab.historyStack = newStack;
				newTab.historyIndex = newStack.length - 1;
			}

			return newTab;
		});
	},

	/**
	 * 设置文件列表
	 */
	setItems(items: FsItem[]) {
		updateActiveTab((tab) => ({
			...tab,
			items,
			loading: false,
			error: null
		}));
	},

	/**
	 * 从列表中移除单个项目（乐观更新）
	 */
	removeItem(path: string) {
		updateActiveTab((tab) => ({
			...tab,
			items: tab.items.filter((item) => item.path !== path)
		}));
	},

	/**
	 * 设置加载状态
	 */
	setLoading(loading: boolean) {
		updateActiveTab((tab) => ({ ...tab, loading }));
	},

	/**
	 * 设置错误
	 */
	setError(error: string | null) {
		updateActiveTab((tab) => ({ ...tab, error, loading: false }));
	},

	/**
	 * 后退
	 */
	goBack(): { path: string } | null {
		const tab = this.getActiveTab();
		if (!tab || tab.historyIndex <= 0) return null;

		const newIndex = tab.historyIndex - 1;
		const entry = tab.historyStack[newIndex];

		updateActiveTab((t) => ({
			...t,
			currentPath: entry.path,
			historyIndex: newIndex,
			title: getDisplayName(entry.path)
		}));

		return { path: entry.path };
	},

	/**
	 * 前进
	 */
	goForward(): { path: string } | null {
		const tab = this.getActiveTab();
		if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return null;

		const newIndex = tab.historyIndex + 1;
		const entry = tab.historyStack[newIndex];

		updateActiveTab((t) => ({
			...t,
			currentPath: entry.path,
			historyIndex: newIndex,
			title: getDisplayName(entry.path)
		}));

		return { path: entry.path };
	},

	/**
	 * 回到 Home
	 */
	goHome(): string | null {
		const tab = this.getActiveTab();
		if (!tab || !tab.homePath) return null;

		this.setPath(tab.homePath);
		return tab.homePath;
	},

	/**
	 * 设置 Home 路径
	 */
	setHomePath(path: string) {
		updateActiveTab((tab) => ({ ...tab, homePath: path }));
	},

	/**
	 * 更新滚动位置（用于历史记录恢复）
	 */
	updateScrollPosition(scrollTop: number) {
		// 更新当前历史条目的滚动位置
		updateActiveTab((tab) => {
			if (tab.historyIndex >= 0 && tab.historyIndex < tab.historyStack.length) {
				const newStack = [...tab.historyStack];
				newStack[tab.historyIndex] = {
					...newStack[tab.historyIndex],
					scrollTop
				};
				return { ...tab, historyStack: newStack };
			}
			return tab;
		});
	},

	// ============ View & Sort ============

	/**
	 * 设置视图样式
	 */
	setViewStyle(style: FolderViewStyle) {
		updateActiveTab((tab) => ({ ...tab, viewStyle: style }));
	},

	/**
	 * 设置排序
	 */
	setSort(field: FolderSortField, order?: FolderSortOrder) {
		updateActiveTab((tab) => {
			const newOrder = order ?? (tab.sortField === field && tab.sortOrder === 'asc' ? 'desc' : 'asc');
			return { ...tab, sortField: field, sortOrder: newOrder };
		});
	},

	// ============ Modes ============

	/**
	 * 切换多选模式
	 */
	toggleMultiSelectMode() {
		updateActiveTab((tab) => ({ ...tab, multiSelectMode: !tab.multiSelectMode }));
	},

	/**
	 * 切换删除模式
	 */
	toggleDeleteMode() {
		updateActiveTab((tab) => ({ ...tab, deleteMode: !tab.deleteMode }));
	},

	/**
	 * 切换递归模式
	 */
	toggleRecursiveMode() {
		updateActiveTab((tab) => ({ ...tab, recursiveMode: !tab.recursiveMode }));
	},

	/**
	 * 切换穿透模式
	 */
	togglePenetrateMode() {
		updateActiveTab((tab) => ({ ...tab, penetrateMode: !tab.penetrateMode }));
	},

	/**
	 * 设置删除策略
	 */
	setDeleteStrategy(strategy: DeleteStrategy) {
		updateActiveTab((tab) => ({ ...tab, deleteStrategy: strategy }));
	},

	/**
	 * 切换删除策略
	 */
	toggleDeleteStrategy() {
		updateActiveTab((tab) => ({
			...tab,
			deleteStrategy: tab.deleteStrategy === 'trash' ? 'permanent' : 'trash'
		}));
	},

	// ============ Search ============

	/**
	 * 设置搜索关键词
	 */
	setSearchKeyword(keyword: string) {
		updateActiveTab((tab) => ({ ...tab, searchKeyword: keyword }));
	},

	/**
	 * 设置搜索结果
	 */
	setSearchResults(results: FsItem[]) {
		updateActiveTab((tab) => ({ ...tab, searchResults: results }));
	},

	/**
	 * 设置搜索状态
	 */
	setIsSearching(searching: boolean) {
		updateActiveTab((tab) => ({ ...tab, isSearching: searching }));
	},

	/**
	 * 清除搜索
	 */
	clearSearch() {
		updateActiveTab((tab) => ({
			...tab,
			searchKeyword: '',
			searchResults: [],
			isSearching: false
		}));
	},

	/**
	 * 设置搜索设置
	 */
	setSearchSettings(settings: Partial<FolderTabState['searchSettings']>) {
		updateActiveTab((tab) => ({
			...tab,
			searchSettings: { ...tab.searchSettings, ...settings }
		}));
	},

	/**
	 * 切换搜索栏可见性
	 */
	toggleShowSearchBar() {
		updateActiveTab((tab) => ({ ...tab, showSearchBar: !tab.showSearchBar }));
	},

	/**
	 * 切换迁移栏可见性
	 */
	toggleShowMigrationBar() {
		updateActiveTab((tab) => ({ ...tab, showMigrationBar: !tab.showMigrationBar }));
	},

	// ============ Folder Tree ============

	/**
	 * 切换文件夹树可见性
	 */
	toggleFolderTree() {
		updateActiveTab((tab) => ({ ...tab, folderTreeVisible: !tab.folderTreeVisible }));
	},

	/**
	 * 设置文件夹树布局
	 */
	setFolderTreeLayout(layout: 'top' | 'left') {
		updateActiveTab((tab) => ({ ...tab, folderTreeLayout: layout }));
	},

	/**
	 * 设置文件夹树大小
	 */
	setFolderTreeSize(size: number) {
		updateActiveTab((tab) => ({ ...tab, folderTreeSize: size }));
	},

	/**
	 * 切换主视图树模式
	 */
	toggleInlineTreeMode() {
		updateActiveTab((tab) => ({ ...tab, inlineTreeMode: !tab.inlineTreeMode }));
	},

	/**
	 * 展开文件夹
	 */
	expandFolder(path: string) {
		updateActiveTab((tab) => {
			const newExpanded = new SvelteSet(tab.expandedFolders);
			newExpanded.add(path);
			return { ...tab, expandedFolders: newExpanded };
		});
	},

	/**
	 * 折叠文件夹
	 */
	collapseFolder(path: string) {
		updateActiveTab((tab) => {
			const newExpanded = new SvelteSet(tab.expandedFolders);
			newExpanded.delete(path);
			// 同时折叠所有子文件夹
			for (const p of newExpanded) {
				if (p.startsWith(path + '/') || p.startsWith(path + '\\')) {
					newExpanded.delete(p);
				}
			}
			return { ...tab, expandedFolders: newExpanded };
		});
	},

	/**
	 * 切换文件夹展开状态
	 */
	toggleFolderExpand(path: string) {
		const tab = this.getActiveTab();
		if (tab?.expandedFolders.has(path)) {
			this.collapseFolder(path);
		} else {
			this.expandFolder(path);
		}
	},

	// ============ Selection ============

	/**
	 * 选择项
	 */
	selectItem(path: string, toggle = false) {
		updateActiveTab((tab) => {
			const newSelected = new SvelteSet(tab.selectedItems);
			if (toggle) {
				if (newSelected.has(path)) {
					newSelected.delete(path);
				} else {
					newSelected.add(path);
				}
			} else {
				newSelected.clear();
				newSelected.add(path);
			}
			return { ...tab, selectedItems: newSelected };
		});
	},

	/**
	 * 全选
	 */
	selectAll() {
		updateActiveTab((tab) => ({
			...tab,
			selectedItems: new SvelteSet(tab.items.map((item) => item.path))
		}));
	},

	/**
	 * 取消全选
	 */
	deselectAll() {
		updateActiveTab((tab) => ({ ...tab, selectedItems: new SvelteSet() }));
	},

	/**
	 * 设置焦点项
	 */
	setFocusedItem(item: FsItem | null) {
		updateActiveTab((tab) => ({ ...tab, focusedItem: item }));
	},

	// ============ History ============

	/**
	 * 清除历史
	 */
	clearHistory() {
		updateActiveTab((tab) => {
			const entry: FolderHistoryEntry = {
				path: tab.currentPath,
				displayName: getDisplayName(tab.currentPath),
				timestamp: Date.now(),
				scrollTop: 0,
				selectedItemPath: null,
				sortField: tab.sortField,
				sortOrder: tab.sortOrder
			};
			return {
				...tab,
				historyStack: [entry],
				historyIndex: 0
			};
		});
	},

	/**
	 * 获取历史记录
	 */
	getHistory(): { previous: FolderHistoryEntry[]; next: FolderHistoryEntry[] } {
		const tab = this.getActiveTab();
		if (!tab) return { previous: [], next: [] };

		return {
			previous: tab.historyStack.slice(0, tab.historyIndex).reverse(),
			next: tab.historyStack.slice(tab.historyIndex + 1)
		};
	},

	// ============ Stack Layers ============

	/**
	 * 设置层叠栈
	 */
	setStackLayers(layers: FolderStackLayer[], activeIndex: number) {
		updateActiveTab((tab) => ({
			...tab,
			stackLayers: layers,
			stackActiveIndex: activeIndex
		}));
	},

	/**
	 * 获取层叠栈
	 */
	getStackLayers(): { layers: FolderStackLayer[]; activeIndex: number } {
		const tab = this.getActiveTab();
		if (!tab) return { layers: [], activeIndex: 0 };
		return { layers: tab.stackLayers, activeIndex: tab.stackActiveIndex };
	},

	/**
	 * 更新层叠栈活动索引
	 */
	setStackActiveIndex(index: number) {
		updateActiveTab((tab) => ({
			...tab,
			stackActiveIndex: index
		}));
	}
};

// 导出 store 订阅
export const folderTabsStore = {
	subscribe: store.subscribe
};
