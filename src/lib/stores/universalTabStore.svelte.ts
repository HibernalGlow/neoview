/**
 * UniversalTabStore - 通用标签页状态管理
 * 支持混合模式：folder/history/bookmark 可以在同一标签栏
 * 支持独立实例：每个面板可以有自己的 store
 */

import { writable, derived, get, type Writable } from 'svelte/store';
import { SvelteSet } from 'svelte/reactivity';
import type { FsItem } from '$lib/types';

// ============ Types ============

export type TabMode = 'folder' | 'history' | 'bookmark';

export type ViewStyle = 'list' | 'content' | 'banner' | 'thumbnail';
export type SortField = 'name' | 'size' | 'date' | 'type' | 'rating';
export type SortOrder = 'asc' | 'desc';
export type DeleteStrategy = 'trash' | 'permanent';

export const VIRTUAL_PATHS = {
	BOOKMARK: 'virtual://bookmark',
	HISTORY: 'virtual://history',
	SEARCH: 'virtual://search'
} as const;

/**
 * 判断是否为虚拟路径
 */
export function isVirtualPath(path: string): boolean {
	return path.startsWith('virtual://');
}

/**
 * 从路径推断模式
 */
export function getModeFromPath(path: string): TabMode {
	if (path === VIRTUAL_PATHS.BOOKMARK) return 'bookmark';
	if (path === VIRTUAL_PATHS.HISTORY) return 'history';
	return 'folder';
}

/**
 * 获取虚拟路径的显示名称
 */
export function getVirtualDisplayName(path: string): string {
	if (path === VIRTUAL_PATHS.BOOKMARK) return '📑 书签';
	if (path === VIRTUAL_PATHS.HISTORY) return '🕒 历史';
	if (path.startsWith(VIRTUAL_PATHS.SEARCH)) return '🔍 搜索结果';
	return path;
}

export function getDisplayName(path: string): string {
	if (!path) return '新标签页';
	if (isVirtualPath(path)) return getVirtualDisplayName(path);
	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	return parts[parts.length - 1] || path;
}

// ============ Tab State ============

export interface HistoryEntry {
	path: string;
	displayName: string;
	timestamp: number;
	scrollTop: number;
	selectedItemPath: string | null;
	sortField: SortField;
	sortOrder: SortOrder;
}

export interface StackLayer {
	id: string;
	path: string;
	items: FsItem[];
	selectedIndex: number;
	scrollTop: number;
}

export interface TabState {
	id: string;
	/** 标签页模式 */
	mode: TabMode;
	/** 显示名称 */
	title: string;
	/** 当前路径 */
	currentPath: string;
	/** 文件列表 */
	items: FsItem[];
	/** 选中项 */
	selectedItems: SvelteSet<string>;
	/** 当前焦点项 */
	focusedItem: FsItem | null;
	/** 最后选中的索引 */
	lastSelectedIndex: number;
	/** 加载状态 */
	loading: boolean;
	/** 错误信息 */
	error: string | null;
	/** 视图样式 */
	viewStyle: ViewStyle;
	/** 排序字段 */
	sortField: SortField;
	/** 排序顺序 */
	sortOrder: SortOrder;
	/** 评分版本号 */
	ratingVersion: number;
	/** 多选模式 */
	multiSelectMode: boolean;
	/** 删除模式 */
	deleteMode: boolean;
	/** 递归模式 */
	recursiveMode: boolean;
	/** 搜索关键词 */
	searchKeyword: string;
	/** 搜索结果 */
	searchResults: FsItem[];
	/** 是否正在搜索 */
	isSearching: boolean;
	/** 搜索栏可见 */
	showSearchBar: boolean;
	/** 迁移栏可见 */
	showMigrationBar: boolean;
	/** 穿透模式 */
	penetrateMode: boolean;
	/** 点击文件夹在新标签页打开模式 */
	openInNewTabMode: boolean;
	/** 删除策略 */
	deleteStrategy: DeleteStrategy;
	/** 搜索设置 */
	searchSettings: {
		includeSubfolders: boolean;
		showHistoryOnFocus: boolean;
		searchInPath: boolean;
	};
	/** 主视图树模式 */
	inlineTreeMode: boolean;
	/** 展开的文件夹路径 */
	expandedFolders: SvelteSet<string>;
	/** 文件夹树配置 */
	folderTreeVisible: boolean;
	folderTreeLayout: 'top' | 'left' | 'right' | 'bottom';
	folderTreeSize: number;
	/** 导航历史 */
	historyStack: HistoryEntry[];
	historyIndex: number;
	/** Home 路径 */
	homePath: string;
	/** 层叠栈状态 */
	stackLayers: StackLayer[];
	stackActiveIndex: number;
	/** 缩略图宽度百分比 */
	thumbnailWidthPercent: number;
	/** 横幅视图宽度百分比 */
	bannerWidthPercent: number;
}

// ============ Store State ============

interface TabsState {
	tabs: TabState[];
	activeTabId: string;
	tabNavHistory: string[];
	tabNavHistoryIndex: number;
}

// ============ Factory Functions ============

function generateTabId(): string {
	return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function createDefaultTabState(
	id: string,
	homePath: string = '',
	mode: TabMode = 'folder'
): TabState {
	return {
		id,
		mode,
		title: mode === 'folder' ? 'New' : getVirtualDisplayName(homePath),
		currentPath: homePath,
		items: [],
		selectedItems: new SvelteSet(),
		focusedItem: null,
		lastSelectedIndex: -1,
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
		openInNewTabMode: false,
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
		stackActiveIndex: 0,
		thumbnailWidthPercent: 20,
		bannerWidthPercent: 50
	};
}

// ============ Universal Tab Store Class ============

export class UniversalTabStore {
	private store: Writable<TabsState>;
	private storageKey: string | null;
	private pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingSaveState: TabsState | null = null;
	private readonly saveDebounceMs = 180;

	// Derived stores
	public allTabs;
	public activeTabId;
	public activeTab;
	public tabCurrentPath;
	public tabItems;
	public tabSelectedItems;
	public tabLoading;
	public tabError;
	public tabViewStyle;
	public tabSortConfig;
	public tabMultiSelectMode;
	public tabDeleteMode;
	public tabSearchKeyword;
	public tabSearchResults;
	public tabIsSearching;
	public tabShowSearchBar;
	public tabShowMigrationBar;
	public tabDeleteStrategy;
	public tabSearchSettings;
	public tabInlineTreeMode;
	public tabExpandedFolders;
	public tabFolderTreeConfig;
	public tabCanGoBack;
	public tabCanGoForward;
	public tabCanGoUp;
	public tabItemCount;
	public tabStackLayers;
	public tabStackActiveIndex;
	public tabThumbnailWidthPercent;
	public tabBannerWidthPercent;
	public tabCanGoBackTab;
	public tabCanGoForwardTab;
	public tabMode;

	constructor(
		options: {
			storageKey?: string;
			initialPath?: string;
			initialMode?: TabMode;
		} = {}
	) {
		this.storageKey = options.storageKey || null;

		// Load or create initial state
		const savedState = this.storageKey ? this.loadState() : null;
		const firstTabId = generateTabId();
		const initialMode = options.initialMode || 'folder';
		const initialPath = options.initialPath || '';

		const initialState: TabsState = savedState || {
			tabs: [createDefaultTabState(firstTabId, initialPath, initialMode)],
			activeTabId: firstTabId,
			tabNavHistory: [firstTabId],
			tabNavHistoryIndex: 0
		};

		// Ensure tabNavHistory exists
		if (!initialState.tabNavHistory) {
			initialState.tabNavHistory = [initialState.activeTabId];
			initialState.tabNavHistoryIndex = 0;
		}

		// Ensure at least one tab
		if (initialState.tabs.length === 0) {
			const newId = generateTabId();
			initialState.tabs = [createDefaultTabState(newId, initialPath, initialMode)];
			initialState.activeTabId = newId;
		}

		this.store = writable<TabsState>(initialState);

		// Create derived stores
		this.allTabs = derived(this.store, ($store) => $store.tabs);
		this.activeTabId = derived(this.store, ($store) => $store.activeTabId);
		this.activeTab = derived(
			this.store,
			($store) => $store.tabs.find((tab) => tab.id === $store.activeTabId) || $store.tabs[0]
		);

		this.tabCurrentPath = derived(this.activeTab, ($tab) => $tab?.currentPath || '');
		this.tabItems = derived(this.activeTab, ($tab) => $tab?.items || []);
		this.tabSelectedItems = derived(
			this.activeTab,
			($tab) => $tab?.selectedItems || new SvelteSet()
		);
		this.tabLoading = derived(this.activeTab, ($tab) => $tab?.loading || false);
		this.tabError = derived(this.activeTab, ($tab) => $tab?.error || null);
		this.tabViewStyle = derived(this.activeTab, ($tab) => $tab?.viewStyle || 'list');
		this.tabSortConfig = derived(this.activeTab, ($tab) => ({
			field: $tab?.sortField || 'name',
			order: $tab?.sortOrder || 'asc'
		}));
		this.tabMultiSelectMode = derived(this.activeTab, ($tab) => $tab?.multiSelectMode || false);
		this.tabDeleteMode = derived(this.activeTab, ($tab) => $tab?.deleteMode || false);
		this.tabSearchKeyword = derived(this.activeTab, ($tab) => $tab?.searchKeyword || '');
		this.tabSearchResults = derived(this.activeTab, ($tab) => $tab?.searchResults || []);
		this.tabIsSearching = derived(this.activeTab, ($tab) => $tab?.isSearching || false);
		this.tabShowSearchBar = derived(this.activeTab, ($tab) => $tab?.showSearchBar || false);
		this.tabShowMigrationBar = derived(this.activeTab, ($tab) => $tab?.showMigrationBar || false);
		this.tabDeleteStrategy = derived(this.activeTab, ($tab) => $tab?.deleteStrategy || 'trash');
		this.tabSearchSettings = derived(
			this.activeTab,
			($tab) =>
				$tab?.searchSettings || {
					includeSubfolders: true,
					showHistoryOnFocus: true,
					searchInPath: false
				}
		);
		this.tabInlineTreeMode = derived(this.activeTab, ($tab) => $tab?.inlineTreeMode || false);
		this.tabExpandedFolders = derived(
			this.activeTab,
			($tab) => $tab?.expandedFolders || new SvelteSet()
		);
		this.tabFolderTreeConfig = derived(this.activeTab, ($tab) => ({
			visible: $tab?.folderTreeVisible || false,
			layout: $tab?.folderTreeLayout || 'left',
			size: $tab?.folderTreeSize || 200
		}));
		this.tabCanGoBack = derived(this.activeTab, ($tab) => ($tab?.historyIndex || 0) > 0);
		this.tabCanGoForward = derived(this.activeTab, ($tab) => {
			const index = $tab?.historyIndex ?? -1;
			const stackLength = $tab?.historyStack?.length ?? 0;
			return index < stackLength - 1;
		});
		this.tabCanGoUp = derived(this.activeTab, ($tab) => {
			if (!$tab?.currentPath || isVirtualPath($tab.currentPath)) return false;
			const normalized = $tab.currentPath.replace(/\\/g, '/');
			return normalized.split('/').filter(Boolean).length > 1;
		});
		this.tabItemCount = derived(this.activeTab, ($tab) => $tab?.items?.length || 0);
		this.tabStackLayers = derived(this.activeTab, ($tab) => $tab?.stackLayers || []);
		this.tabStackActiveIndex = derived(this.activeTab, ($tab) => $tab?.stackActiveIndex || 0);
		this.tabThumbnailWidthPercent = derived(
			this.activeTab,
			($tab) => $tab?.thumbnailWidthPercent || 20
		);
		this.tabBannerWidthPercent = derived(this.activeTab, ($tab) => $tab?.bannerWidthPercent || 50);
		this.tabCanGoBackTab = derived(this.store, ($store) => $store.tabNavHistoryIndex > 0);
		this.tabCanGoForwardTab = derived(
			this.store,
			($store) => $store.tabNavHistoryIndex < $store.tabNavHistory.length - 1
		);
		this.tabMode = derived(this.activeTab, ($tab) => $tab?.mode || 'folder');
	}

	// ============ Persistence ============

	private loadState(): TabsState | null {
		if (!this.storageKey) return null;
		try {
			const saved = localStorage.getItem(this.storageKey);
			if (saved) {
				const parsed = JSON.parse(saved);
				if (parsed.tabs) {
					parsed.tabs = parsed.tabs.map((tab: TabState) => ({
						...tab,
						selectedItems: new SvelteSet(tab.selectedItems || []),
						expandedFolders: new SvelteSet(tab.expandedFolders || [])
					}));
				}
				return parsed;
			}
		} catch (e) {
			console.error('[UniversalTabStore] Failed to load state:', e);
		}
		return null;
	}

	private saveState(state: TabsState) {
		if (!this.storageKey) return;
		try {
			const toSave = {
				activeTabId: state.activeTabId,
				tabNavHistory: state.tabNavHistory,
				tabNavHistoryIndex: state.tabNavHistoryIndex,
				tabs: state.tabs.map((tab) => ({
					...tab,
					items: [],
					searchResults: [],
					loading: false,
					error: null,
					selectedItems: Array.from(tab.selectedItems),
					expandedFolders: Array.from(tab.expandedFolders)
				}))
			};
			localStorage.setItem(this.storageKey, JSON.stringify(toSave));
		} catch (e) {
			console.error('[UniversalTabStore] Failed to save state:', e);
		}
	}

	private scheduleSave(state: TabsState) {
		this.pendingSaveState = state;
		if (this.pendingSaveTimer) {
			clearTimeout(this.pendingSaveTimer);
		}
		this.pendingSaveTimer = setTimeout(() => {
			if (this.pendingSaveState) {
				this.saveState(this.pendingSaveState);
				this.pendingSaveState = null;
			}
			this.pendingSaveTimer = null;
		}, this.saveDebounceMs);
	}

	// ============ Internal Helpers ============

	private updateActiveTab(updater: (tab: TabState) => TabState) {
		this.store.update(($store) => {
			const tabs = $store.tabs.map((tab) => {
				if (tab.id === $store.activeTabId) {
					return updater(tab);
				}
				return tab;
			});
			const newState = { ...$store, tabs };
			this.scheduleSave(newState);
			return newState;
		});
	}

	// ============ Tab Management ============

	createTab(path: string = '', mode?: TabMode): string {
		const newId = generateTabId();
		const actualMode = mode || getModeFromPath(path);

		this.store.update(($store) => {
			const newTab = createDefaultTabState(newId, path, actualMode);
			const newTabNavHistory = $store.tabNavHistory.slice(0, $store.tabNavHistoryIndex + 1);
			newTabNavHistory.push(newId);
			const newState: TabsState = {
				tabs: [...$store.tabs, newTab],
				activeTabId: newId,
				tabNavHistory: newTabNavHistory,
				tabNavHistoryIndex: newTabNavHistory.length - 1
			};
			this.saveState(newState);
			return newState;
		});
		return newId;
	}

	closeTab(tabId: string) {
		this.store.update(($store) => {
			if ($store.tabs.length <= 1) return $store;

			const tabIndex = $store.tabs.findIndex((t) => t.id === tabId);
			const newTabs = $store.tabs.filter((t) => t.id !== tabId);

			let newActiveId = $store.activeTabId;
			if ($store.activeTabId === tabId) {
				const newIndex = Math.min(tabIndex, newTabs.length - 1);
				newActiveId = newTabs[newIndex].id;
			}

			const newTabNavHistory = $store.tabNavHistory.filter((id) => id !== tabId);
			let newTabNavHistoryIndex = $store.tabNavHistoryIndex;

			if (newTabNavHistory.length === 0) {
				newTabNavHistory.push(newActiveId);
				newTabNavHistoryIndex = 0;
			} else {
				const lastIndex = newTabNavHistory.lastIndexOf(newActiveId);
				newTabNavHistoryIndex = lastIndex >= 0 ? lastIndex : newTabNavHistory.length - 1;
			}

			const newState: TabsState = {
				tabs: newTabs,
				activeTabId: newActiveId,
				tabNavHistory: newTabNavHistory,
				tabNavHistoryIndex: newTabNavHistoryIndex
			};
			this.saveState(newState);
			return newState;
		});
	}

	switchTab(tabId: string, addToHistory = true) {
		this.store.update(($store) => {
			if (!$store.tabs.some((t) => t.id === tabId)) return $store;

			let tabNavHistory = $store.tabNavHistory;
			let tabNavHistoryIndex = $store.tabNavHistoryIndex;

			if (addToHistory && tabId !== $store.activeTabId) {
				tabNavHistory = tabNavHistory.slice(0, tabNavHistoryIndex + 1);
				tabNavHistory.push(tabId);
				tabNavHistoryIndex = tabNavHistory.length - 1;
			}

			const newState: TabsState = {
				...$store,
				activeTabId: tabId,
				tabNavHistory,
				tabNavHistoryIndex
			};
			this.saveState(newState);
			return newState;
		});
	}

	getActiveTab(): TabState | undefined {
		const state = get(this.store);
		return state.tabs.find((t) => t.id === state.activeTabId);
	}

	getAllTabs(): TabState[] {
		return get(this.store).tabs;
	}

	// ============ Navigation ============

	/**
	 * 设置路径 - 支持虚拟路径自动切换模式
	 */
	setPath(path: string, addToHistory = true) {
		// 检测是否为虚拟路径
		if (isVirtualPath(path)) {
			const newMode = getModeFromPath(path);
			this.updateActiveTab((tab) => {
				const newTab = {
					...tab,
					currentPath: path,
					mode: newMode,
					loading: true,
					error: null,
					title: getDisplayName(path)
				};

				if (addToHistory && path) {
					const entry: HistoryEntry = {
						path,
						displayName: getDisplayName(path),
						timestamp: Date.now(),
						scrollTop: 0,
						selectedItemPath: null,
						sortField: tab.sortField,
						sortOrder: tab.sortOrder
					};
					const newStack = tab.historyStack.slice(0, tab.historyIndex + 1);
					newStack.push(entry);
					if (newStack.length > 50) newStack.shift();
					newTab.historyStack = newStack;
					newTab.historyIndex = newStack.length - 1;
				}

				return newTab;
			});
			return;
		}

		// 普通路径
		let normalizedPath = path.replace(/\//g, '\\');
		if (/^[a-zA-Z]:$/.test(normalizedPath)) {
			normalizedPath += '\\';
		}
		if (/^[a-zA-Z]:[^\\]/.test(normalizedPath)) {
			normalizedPath = normalizedPath.slice(0, 2) + '\\' + normalizedPath.slice(2);
		}

		this.updateActiveTab((tab) => {
			const newTab = {
				...tab,
				currentPath: normalizedPath,
				mode: 'folder' as TabMode,
				loading: true,
				error: null,
				title: getDisplayName(normalizedPath)
			};

			if (addToHistory && normalizedPath) {
				const entry: HistoryEntry = {
					path: normalizedPath,
					displayName: getDisplayName(normalizedPath),
					timestamp: Date.now(),
					scrollTop: 0,
					selectedItemPath: null,
					sortField: tab.sortField,
					sortOrder: tab.sortOrder
				};
				const newStack = tab.historyStack.slice(0, tab.historyIndex + 1);
				newStack.push(entry);
				if (newStack.length > 50) newStack.shift();
				newTab.historyStack = newStack;
				newTab.historyIndex = newStack.length - 1;
			}

			return newTab;
		});
	}

	setItems(items: FsItem[]) {
		this.updateActiveTab((tab) => ({
			...tab,
			items,
			loading: false,
			error: null
		}));
	}

	removeItem(path: string) {
		this.updateActiveTab((tab) => ({
			...tab,
			items: tab.items.filter((item) => item.path !== path)
		}));
	}

	setLoading(loading: boolean) {
		this.updateActiveTab((tab) => ({ ...tab, loading }));
	}

	setError(error: string | null) {
		this.updateActiveTab((tab) => ({ ...tab, error, loading: false }));
	}

	goBack(): { path: string } | null {
		const tab = this.getActiveTab();
		if (!tab || tab.historyIndex <= 0) return null;

		const newIndex = tab.historyIndex - 1;
		const entry = tab.historyStack[newIndex];

		this.updateActiveTab((t) => ({
			...t,
			currentPath: entry.path,
			mode: getModeFromPath(entry.path),
			historyIndex: newIndex,
			title: getDisplayName(entry.path)
		}));

		return { path: entry.path };
	}

	goForward(): { path: string } | null {
		const tab = this.getActiveTab();
		if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return null;

		const newIndex = tab.historyIndex + 1;
		const entry = tab.historyStack[newIndex];

		this.updateActiveTab((t) => ({
			...t,
			currentPath: entry.path,
			mode: getModeFromPath(entry.path),
			historyIndex: newIndex,
			title: getDisplayName(entry.path)
		}));

		return { path: entry.path };
	}

	goBackTab(): string | null {
		const state = get(this.store);
		if (state.tabNavHistoryIndex <= 0) return null;

		const newIndex = state.tabNavHistoryIndex - 1;
		const targetTabId = state.tabNavHistory[newIndex];

		if (!state.tabs.some((t) => t.id === targetTabId)) return null;

		this.store.update(($store) => ({
			...$store,
			activeTabId: targetTabId,
			tabNavHistoryIndex: newIndex
		}));

		return targetTabId;
	}

	goForwardTab(): string | null {
		const state = get(this.store);
		if (state.tabNavHistoryIndex >= state.tabNavHistory.length - 1) return null;

		const newIndex = state.tabNavHistoryIndex + 1;
		const targetTabId = state.tabNavHistory[newIndex];

		if (!state.tabs.some((t) => t.id === targetTabId)) return null;

		this.store.update(($store) => ({
			...$store,
			activeTabId: targetTabId,
			tabNavHistoryIndex: newIndex
		}));

		return targetTabId;
	}

	goHome(): string | null {
		const tab = this.getActiveTab();
		if (!tab || !tab.homePath) return null;
		this.setPath(tab.homePath);
		return tab.homePath;
	}

	setHomePath(path: string) {
		this.updateActiveTab((tab) => ({ ...tab, homePath: path }));
	}

	// ============ View & Sort ============

	setViewStyle(style: ViewStyle) {
		this.updateActiveTab((tab) => ({ ...tab, viewStyle: style }));
	}

	setSort(field: SortField, order?: SortOrder) {
		this.updateActiveTab((tab) => {
			const newOrder =
				order ?? (tab.sortField === field && tab.sortOrder === 'asc' ? 'desc' : 'asc');
			return { ...tab, sortField: field, sortOrder: newOrder };
		});
	}

	// ============ Modes ============

	toggleMultiSelectMode() {
		this.updateActiveTab((tab) => ({ ...tab, multiSelectMode: !tab.multiSelectMode }));
	}

	toggleDeleteMode() {
		this.updateActiveTab((tab) => ({ ...tab, deleteMode: !tab.deleteMode }));
	}

	toggleDeleteStrategy() {
		this.updateActiveTab((tab) => ({
			...tab,
			deleteStrategy: tab.deleteStrategy === 'trash' ? 'permanent' : 'trash'
		}));
	}

	// ============ Search ============

	setSearchKeyword(keyword: string) {
		this.updateActiveTab((tab) => ({ ...tab, searchKeyword: keyword }));
	}

	setSearchResults(results: FsItem[]) {
		this.updateActiveTab((tab) => ({ ...tab, searchResults: results }));
	}

	setIsSearching(searching: boolean) {
		this.updateActiveTab((tab) => ({ ...tab, isSearching: searching }));
	}

	toggleShowSearchBar() {
		this.updateActiveTab((tab) => ({ ...tab, showSearchBar: !tab.showSearchBar }));
	}

	toggleShowMigrationBar() {
		this.updateActiveTab((tab) => ({ ...tab, showMigrationBar: !tab.showMigrationBar }));
	}

	// ============ Folder Tree ============

	toggleFolderTree() {
		this.updateActiveTab((tab) => ({ ...tab, folderTreeVisible: !tab.folderTreeVisible }));
	}

	setFolderTreeLayout(layout: 'top' | 'left' | 'right' | 'bottom') {
		this.updateActiveTab((tab) => ({ ...tab, folderTreeLayout: layout }));
	}

	setFolderTreeSize(size: number) {
		this.updateActiveTab((tab) => ({ ...tab, folderTreeSize: size }));
	}

	toggleInlineTreeMode() {
		this.updateActiveTab((tab) => ({ ...tab, inlineTreeMode: !tab.inlineTreeMode }));
	}

	// ============ Selection ============

	selectItem(path: string, toggle = false, index?: number) {
		this.updateActiveTab((tab) => {
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
			const newLastIndex = index !== undefined ? index : tab.lastSelectedIndex;
			return { ...tab, selectedItems: newSelected, lastSelectedIndex: newLastIndex };
		});
	}

	selectRange(endIndex: number, items: FsItem[]) {
		this.updateActiveTab((tab) => {
			const startIndex = tab.lastSelectedIndex >= 0 ? tab.lastSelectedIndex : 0;
			const minIndex = Math.min(startIndex, endIndex);
			const maxIndex = Math.max(startIndex, endIndex);

			const newSelected = new SvelteSet(tab.selectedItems);
			for (let i = minIndex; i <= maxIndex; i++) {
				if (i >= 0 && i < items.length) {
					newSelected.add(items[i].path);
				}
			}

			return { ...tab, selectedItems: newSelected };
		});
	}

	selectAll() {
		this.updateActiveTab((tab) => ({
			...tab,
			selectedItems: new SvelteSet(tab.items.map((item) => item.path))
		}));
	}

	deselectAll() {
		this.updateActiveTab((tab) => ({ ...tab, selectedItems: new SvelteSet() }));
	}

	// ============ Stack Layers ============

	setStackLayers(layers: StackLayer[], activeIndex: number) {
		this.updateActiveTab((tab) => ({
			...tab,
			stackLayers: layers,
			stackActiveIndex: activeIndex
		}));
	}

	setStackActiveIndex(index: number) {
		this.updateActiveTab((tab) => ({
			...tab,
			stackActiveIndex: index
		}));
	}

	// ============ Width Settings ============

	setThumbnailWidthPercent(percent: number) {
		const clampedPercent = Math.max(10, Math.min(90, percent));
		this.updateActiveTab((tab) => ({
			...tab,
			thumbnailWidthPercent: clampedPercent
		}));
	}

	setBannerWidthPercent(percent: number) {
		const clampedPercent = Math.max(20, Math.min(100, percent));
		this.updateActiveTab((tab) => ({
			...tab,
			bannerWidthPercent: clampedPercent
		}));
	}
}

// ============ Global Instance (backward compatibility) ============

export const globalTabStore = new UniversalTabStore({
	storageKey: 'neoview-universal-tabs'
});

// ============ Factory for Independent Instances ============

export function createIndependentTabStore(options?: {
	storageKey?: string;
	initialPath?: string;
	initialMode?: TabMode;
}): UniversalTabStore {
	return new UniversalTabStore(options);
}
