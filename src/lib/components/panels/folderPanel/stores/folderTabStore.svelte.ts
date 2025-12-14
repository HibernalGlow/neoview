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

// ============ Recently Closed Tabs ============
// 最近关闭的标签页列表
export interface RecentlyClosedTab {
	path: string;
	title: string;
	closedAt: number;
}

const MAX_RECENTLY_CLOSED = 10;
const RECENTLY_CLOSED_STORAGE_KEY = 'neoview-recently-closed-tabs';

// 加载最近关闭的标签页
function loadRecentlyClosedTabs(): RecentlyClosedTab[] {
	try {
		const saved = localStorage.getItem(RECENTLY_CLOSED_STORAGE_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error('[FolderTabStore] Failed to load recently closed tabs:', e);
	}
	return [];
}

// 保存最近关闭的标签页
function saveRecentlyClosedTabs(tabs: RecentlyClosedTab[]) {
	try {
		localStorage.setItem(RECENTLY_CLOSED_STORAGE_KEY, JSON.stringify(tabs));
	} catch (e) {
		console.error('[FolderTabStore] Failed to save recently closed tabs:', e);
	}
}

// 最近关闭的标签页 store
const recentlyClosedTabsStore = writable<RecentlyClosedTab[]>(loadRecentlyClosedTabs());

export interface FolderTabState {
	id: string;
	// 显示名称
	title: string;
	// 是否固定
	pinned: boolean;
	// 当前路径
	currentPath: string;
	// 文件列表
	items: FsItem[];
	// 选中项
	selectedItems: SvelteSet<string>;
	// 当前焦点项
	focusedItem: FsItem | null;
	// 最后选中的索引（用于 shift 范围选择）
	lastSelectedIndex: number;
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
	// 点击文件夹在新标签页打开模式
	openInNewTabMode: boolean;
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
	folderTreeLayout: 'top' | 'left' | 'right' | 'bottom';
	folderTreeSize: number;
	// 导航历史
	historyStack: FolderHistoryEntry[];
	historyIndex: number;
	// Home 路径
	homePath: string;
	// 层叠栈状态
	stackLayers: FolderStackLayer[];
	stackActiveIndex: number;
	// 缩略图宽度百分比 (10-50%)
	thumbnailWidthPercent: number;
	// 横幅视图宽度百分比 (20-100%)
	bannerWidthPercent: number;
	// 待聚焦的文件路径（CLI 打开文件时用于定位并高亮）
	pendingFocusPath: string | null;
}

// ============ Initial State ============

const TAB_STORAGE_KEY = 'neoview-folder-tabs';
const SHARED_TREE_SETTINGS_KEY = 'neoview-folder-tree-shared';
const SHARED_SORT_SETTINGS_KEY = 'neoview-folder-sort-shared';
const SHARED_TAB_BAR_SETTINGS_KEY = 'neoview-tab-bar-shared';

// ============ Shared Tab Bar Settings ============
// 标签栏位置和宽度设置
export type TabBarLayout = 'top' | 'left' | 'right' | 'bottom';
// 面包屑位置：跟随标签栏 / 独立显示在工具栏上方
export type BreadcrumbPosition = 'follow' | 'toolbar';

interface SharedTabBarSettings {
	tabBarLayout: TabBarLayout;
	tabBarWidth: number; // 左右布局时的宽度
	breadcrumbPosition: BreadcrumbPosition; // 面包屑位置
}

function loadSharedTabBarSettings(): SharedTabBarSettings {
	try {
		const saved = localStorage.getItem(SHARED_TAB_BAR_SETTINGS_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				tabBarLayout: parsed.tabBarLayout ?? 'top',
				tabBarWidth: parsed.tabBarWidth ?? 160,
				breadcrumbPosition: parsed.breadcrumbPosition ?? 'follow'
			};
		}
	} catch (e) {
		console.error('[FolderTabStore] Failed to load shared tab bar settings:', e);
	}
	return {
		tabBarLayout: 'top',
		tabBarWidth: 160,
		breadcrumbPosition: 'follow'
	};
}

function saveSharedTabBarSettings(settings: SharedTabBarSettings) {
	try {
		localStorage.setItem(SHARED_TAB_BAR_SETTINGS_KEY, JSON.stringify(settings));
	} catch (e) {
		console.error('[FolderTabStore] Failed to save shared tab bar settings:', e);
	}
}

// 加载共享标签栏设置
const sharedTabBarSettings = loadSharedTabBarSettings();

// ============ Shared Folder Tree Settings ============
// 这些设置在所有文件夹面板页签之间共享
interface SharedFolderTreeSettings {
	folderTreeVisible: boolean;
	folderTreeLayout: 'top' | 'left' | 'right' | 'bottom';
	folderTreeSize: number;
}

// ============ Shared Sort Settings ============
// 排序设置：锁定、策略、当前排序字段和顺序
export type SortInheritStrategy = 'default' | 'inherit';

export interface SharedSortSettings {
	/** 是否锁定排序（锁定后新标签页使用锁定的排序设置） */
	locked: boolean;
	/** 未锁定时的策略：default=使用默认排序，inherit=继承上一个标签页的排序 */
	strategy: SortInheritStrategy;
	/** 锁定的排序字段 */
	lockedSortField: FolderSortField;
	/** 锁定的排序顺序 */
	lockedSortOrder: FolderSortOrder;
}

function loadSharedTreeSettings(): SharedFolderTreeSettings {
	try {
		const saved = localStorage.getItem(SHARED_TREE_SETTINGS_KEY);
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error('[FolderTabStore] Failed to load shared tree settings:', e);
	}
	return {
		folderTreeVisible: false,
		folderTreeLayout: 'left',
		folderTreeSize: 200
	};
}

function saveSharedTreeSettings(settings: SharedFolderTreeSettings) {
	try {
		localStorage.setItem(SHARED_TREE_SETTINGS_KEY, JSON.stringify(settings));
	} catch (e) {
		console.error('[FolderTabStore] Failed to save shared tree settings:', e);
	}
}

function loadSharedSortSettings(): SharedSortSettings {
	try {
		const saved = localStorage.getItem(SHARED_SORT_SETTINGS_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			return {
				locked: parsed.locked ?? false,
				strategy: parsed.strategy ?? 'default',
				lockedSortField: parsed.lockedSortField ?? 'name',
				lockedSortOrder: parsed.lockedSortOrder ?? 'asc'
			};
		}
	} catch (e) {
		console.error('[FolderTabStore] Failed to load shared sort settings:', e);
	}
	return {
		locked: false,
		strategy: 'default',
		lockedSortField: 'name',
		lockedSortOrder: 'asc'
	};
}

function saveSharedSortSettings(settings: SharedSortSettings) {
	try {
		localStorage.setItem(SHARED_SORT_SETTINGS_KEY, JSON.stringify(settings));
	} catch (e) {
		console.error('[FolderTabStore] Failed to save shared sort settings:', e);
	}
}

// 加载共享设置
const sharedTreeSettings = loadSharedTreeSettings();
const sharedSortSettings = loadSharedSortSettings();

function generateTabId(): string {
	return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ============ Virtual Path Support ============

export const VIRTUAL_PATHS = {
	BOOKMARK: 'virtual://bookmark',
	HISTORY: 'virtual://history',
	SEARCH: 'virtual://search'
} as const;

export type VirtualPathType = 'bookmark' | 'history' | 'search' | null;

/**
 * 判断是否为虚拟路径
 */
export function isVirtualPath(path: string): boolean {
	return path.startsWith('virtual://');
}

/**
 * 获取虚拟路径类型
 */
export function getVirtualPathType(path: string): VirtualPathType {
	if (path === VIRTUAL_PATHS.BOOKMARK) return 'bookmark';
	if (path === VIRTUAL_PATHS.HISTORY) return 'history';
	if (path.startsWith(VIRTUAL_PATHS.SEARCH)) return 'search';
	return null;
}

/**
 * 获取虚拟路径的显示名称
 */
function getVirtualDisplayName(path: string): string {
	const type = getVirtualPathType(path);
	switch (type) {
		case 'bookmark': return '书签';
		case 'history': return '历史';
		case 'search': return '搜索结果';
		default: return path;
	}
}

function getDisplayName(path: string): string {
	if (!path) return '新标签页';
	if (isVirtualPath(path)) return getVirtualDisplayName(path);
	const normalized = path.replace(/\\/g, '/');
	const parts = normalized.split('/').filter(Boolean);
	return parts[parts.length - 1] || path;
}

/**
 * 获取新标签页应该使用的排序设置
 * @param sourceTab 可选的源标签页，用于继承策略
 */
function getSortSettingsForNewTab(sourceTab?: FolderTabState): { sortField: FolderSortField; sortOrder: FolderSortOrder } {
	const sortSettings = sharedSortSettings;
	
	// 如果锁定，使用锁定的排序设置
	if (sortSettings.locked) {
		return {
			sortField: sortSettings.lockedSortField,
			sortOrder: sortSettings.lockedSortOrder
		};
	}
	
	// 未锁定时根据策略决定
	if (sortSettings.strategy === 'inherit' && sourceTab) {
		// 继承源标签页的排序
		return {
			sortField: sourceTab.sortField,
			sortOrder: sourceTab.sortOrder
		};
	}
	
	// 默认策略或没有源标签页
	return {
		sortField: 'name',
		sortOrder: 'asc'
	};
}

function createDefaultTabState(id: string, homePath: string = '', sourceTab?: FolderTabState): FolderTabState {
	// 从共享设置中获取文件树配置
	const treeSettings = sharedTreeSettings;
	// 获取排序设置
	const sortSettings = getSortSettingsForNewTab(sourceTab);
	// 从路径中提取标题
	const title = homePath ? getDisplayName(homePath) : '新标签页';
	
	return {
		id,
		title,
		pinned: false,
		currentPath: homePath,
		items: [],
		selectedItems: new SvelteSet(),
		focusedItem: null,
		lastSelectedIndex: -1,
		loading: false,
		error: null,
		viewStyle: 'list',
		sortField: sortSettings.sortField,
		sortOrder: sortSettings.sortOrder,
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
		// 使用共享的文件树设置
		folderTreeVisible: treeSettings.folderTreeVisible,
		folderTreeLayout: treeSettings.folderTreeLayout,
		folderTreeSize: treeSettings.folderTreeSize,
		historyStack: [],
		historyIndex: -1,
		homePath,
		stackLayers: [],
		stackActiveIndex: 0,
		thumbnailWidthPercent: 20,
		bannerWidthPercent: 50,
		pendingFocusPath: null
	};
}

// ============ Store ============

interface FolderTabsState {
	tabs: FolderTabState[];
	activeTabId: string;
	// 标签页导航历史（用于跨标签页后退/前进）
	tabNavHistory: string[];
	tabNavHistoryIndex: number;
}

function loadTabsState(): FolderTabsState | null {
	try {
		const saved = localStorage.getItem(TAB_STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved);
			// 重建 Set 类型并确保 pinned 字段存在
			if (parsed.tabs) {
				parsed.tabs = parsed.tabs.map((tab: FolderTabState) => ({
					...tab,
					pinned: tab.pinned ?? false,
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
		// 过滤掉虚拟路径页签，只保存真实文件系统路径的页签
		const realTabs = state.tabs.filter(tab => !isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath));
		
		// 如果所有页签都被过滤掉了，保留一个空状态
		if (realTabs.length === 0) {
			localStorage.removeItem(TAB_STORAGE_KEY);
			return;
		}
		
		// 确保 activeTabId 指向真实页签
		let activeId = state.activeTabId;
		const activeTab = realTabs.find(t => t.id === activeId);
		if (!activeTab) {
			activeId = realTabs[0].id;
		}
		
		// 序列化前转换 Set 为数组
		const toSave = {
			activeTabId: activeId,
			tabs: realTabs.map((tab) => ({
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
	activeTabId: firstTabId,
	tabNavHistory: [firstTabId],
	tabNavHistoryIndex: 0
};

// 确保 tabNavHistory 存在（兼容旧数据）
if (!initialState.tabNavHistory) {
	initialState.tabNavHistory = [initialState.activeTabId];
	initialState.tabNavHistoryIndex = 0;
}

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

// 全局搜索结果 store（独立于标签页，用于虚拟路径 virtual://search）
export const globalSearchResults = writable<FsItem[]>([]);
export const tabSearchResults = globalSearchResults; // 使用全局 store

export const tabIsSearching = derived(activeTab, ($tab) => $tab?.isSearching || false);
export const tabShowSearchBar = derived(activeTab, ($tab) => $tab?.showSearchBar || false);
export const tabShowMigrationBar = derived(activeTab, ($tab) => $tab?.showMigrationBar || false);
export const tabPenetrateMode = derived(activeTab, ($tab) => $tab?.penetrateMode || false);
export const tabOpenInNewTabMode = derived(activeTab, ($tab) => $tab?.openInNewTabMode || false);
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

// 缩略图宽度百分比
export const tabThumbnailWidthPercent = derived(activeTab, ($tab) => $tab?.thumbnailWidthPercent || 20);

// 横幅视图宽度百分比
export const tabBannerWidthPercent = derived(activeTab, ($tab) => $tab?.bannerWidthPercent || 50);

// 待聚焦的文件路径（CLI 打开文件时用于定位并高亮）
export const tabPendingFocusPath = derived(activeTab, ($tab) => $tab?.pendingFocusPath || null);

// 标签页导航历史状态
export const tabCanGoBackTab = derived(store, ($store) => $store.tabNavHistoryIndex > 0);
export const tabCanGoForwardTab = derived(store, ($store) => $store.tabNavHistoryIndex < $store.tabNavHistory.length - 1);

// 最近关闭的标签页
export const recentlyClosedTabs = derived(recentlyClosedTabsStore, ($tabs) => $tabs);

// 标签栏位置和宽度
export const tabBarLayout = writable<TabBarLayout>(sharedTabBarSettings.tabBarLayout);
export const tabBarWidth = writable<number>(sharedTabBarSettings.tabBarWidth);
// 面包屑位置
export const breadcrumbPosition = writable<BreadcrumbPosition>(sharedTabBarSettings.breadcrumbPosition);

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
		console.log('[FolderTabStore] createTab 被调用, homePath:', homePath, 'newId:', newId);
		store.update(($store) => {
			// 获取当前活动标签页作为继承排序的源
			const sourceTab = $store.tabs.find(t => t.id === $store.activeTabId);
			const newTab = createDefaultTabState(newId, homePath, sourceTab);
			console.log('[FolderTabStore] 新标签页状态:', {
				id: newTab.id,
				title: newTab.title,
				currentPath: newTab.currentPath,
				homePath: newTab.homePath
			});
			// 截断当前位置之后的标签页历史，然后添加新标签页
			const newTabNavHistory = $store.tabNavHistory.slice(0, $store.tabNavHistoryIndex + 1);
			newTabNavHistory.push(newId);
			const newState: FolderTabsState = {
				tabs: [...$store.tabs, newTab],
				activeTabId: newId,
				tabNavHistory: newTabNavHistory,
				tabNavHistoryIndex: newTabNavHistory.length - 1
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
			// 计算非固定标签页数量
			const unpinnedCount = $store.tabs.filter(t => !t.pinned).length;
			const tabToClose = $store.tabs.find(t => t.id === tabId);
			
			// 如果要关闭的是非固定标签页，且只剩一个非固定标签页，则不允许关闭
			if (tabToClose && !tabToClose.pinned && unpinnedCount <= 1) {
				return $store;
			}

			const tabIndex = $store.tabs.findIndex((t) => t.id === tabId);
			
			// 添加到最近关闭列表（非虚拟路径）
			if (tabToClose && !isVirtualPath(tabToClose.currentPath)) {
				recentlyClosedTabsStore.update(($closed) => {
					const newClosed = [
						{ path: tabToClose.currentPath, title: tabToClose.title, closedAt: Date.now() },
						...$closed
					].slice(0, MAX_RECENTLY_CLOSED);
					saveRecentlyClosedTabs(newClosed);
					return newClosed;
				});
			}
			
			const newTabs = $store.tabs.filter((t) => t.id !== tabId);
			
			let newActiveId = $store.activeTabId;
			if ($store.activeTabId === tabId) {
				// 如果关闭的是活动页签，切换到相邻页签
				const newIndex = Math.min(tabIndex, newTabs.length - 1);
				newActiveId = newTabs[newIndex].id;
			}

			// 从标签页历史中移除已关闭的标签页
			const newTabNavHistory = $store.tabNavHistory.filter(id => id !== tabId);
			let newTabNavHistoryIndex = $store.tabNavHistoryIndex;
			// 调整索引
			if (newTabNavHistory.length === 0) {
				newTabNavHistory.push(newActiveId);
				newTabNavHistoryIndex = 0;
			} else {
				// 找到新活动标签页在历史中的最后一个位置
				const lastIndex = newTabNavHistory.lastIndexOf(newActiveId);
				newTabNavHistoryIndex = lastIndex >= 0 ? lastIndex : newTabNavHistory.length - 1;
			}

			const newState: FolderTabsState = {
				tabs: newTabs,
				activeTabId: newActiveId,
				tabNavHistory: newTabNavHistory,
				tabNavHistoryIndex: newTabNavHistoryIndex
			};
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 关闭其他页签（保留目标页签和固定页签）
	 */
	closeOthers(tabId: string) {
		store.update(($store) => {
			const tabsToClose = $store.tabs.filter(t => t.id !== tabId && !t.pinned);
			
			// 添加到最近关闭列表
			recentlyClosedTabsStore.update(($closed) => {
				const newEntries = tabsToClose
					.filter(t => !isVirtualPath(t.currentPath))
					.map(t => ({ path: t.currentPath, title: t.title, closedAt: Date.now() }));
				const newClosed = [...newEntries, ...$closed].slice(0, MAX_RECENTLY_CLOSED);
				saveRecentlyClosedTabs(newClosed);
				return newClosed;
			});
			
			const newTabs = $store.tabs.filter(t => t.id === tabId || t.pinned);
			
			// 确保活动标签页存在
			let newActiveId = $store.activeTabId;
			if (!newTabs.some(t => t.id === newActiveId)) {
				newActiveId = tabId;
			}

			const newState: FolderTabsState = {
				tabs: newTabs,
				activeTabId: newActiveId,
				tabNavHistory: [newActiveId],
				tabNavHistoryIndex: 0
			};
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 关闭左侧页签（保留固定页签）
	 */
	closeLeft(tabId: string) {
		store.update(($store) => {
			const tabIndex = $store.tabs.findIndex(t => t.id === tabId);
			if (tabIndex <= 0) return $store;
			
			const tabsToClose = $store.tabs.slice(0, tabIndex).filter(t => !t.pinned);
			
			// 添加到最近关闭列表
			recentlyClosedTabsStore.update(($closed) => {
				const newEntries = tabsToClose
					.filter(t => !isVirtualPath(t.currentPath))
					.map(t => ({ path: t.currentPath, title: t.title, closedAt: Date.now() }));
				const newClosed = [...newEntries, ...$closed].slice(0, MAX_RECENTLY_CLOSED);
				saveRecentlyClosedTabs(newClosed);
				return newClosed;
			});
			
			const newTabs = $store.tabs.filter((t, i) => i >= tabIndex || t.pinned);
			
			// 确保活动标签页存在
			let newActiveId = $store.activeTabId;
			if (!newTabs.some(t => t.id === newActiveId)) {
				newActiveId = tabId;
			}

			const newState: FolderTabsState = {
				tabs: newTabs,
				activeTabId: newActiveId,
				tabNavHistory: [newActiveId],
				tabNavHistoryIndex: 0
			};
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 关闭右侧页签（保留固定页签）
	 */
	closeRight(tabId: string) {
		store.update(($store) => {
			const tabIndex = $store.tabs.findIndex(t => t.id === tabId);
			if (tabIndex < 0 || tabIndex >= $store.tabs.length - 1) return $store;
			
			const tabsToClose = $store.tabs.slice(tabIndex + 1).filter(t => !t.pinned);
			
			// 添加到最近关闭列表
			recentlyClosedTabsStore.update(($closed) => {
				const newEntries = tabsToClose
					.filter(t => !isVirtualPath(t.currentPath))
					.map(t => ({ path: t.currentPath, title: t.title, closedAt: Date.now() }));
				const newClosed = [...newEntries, ...$closed].slice(0, MAX_RECENTLY_CLOSED);
				saveRecentlyClosedTabs(newClosed);
				return newClosed;
			});
			
			const newTabs = $store.tabs.filter((t, i) => i <= tabIndex || t.pinned);
			
			// 确保活动标签页存在
			let newActiveId = $store.activeTabId;
			if (!newTabs.some(t => t.id === newActiveId)) {
				newActiveId = tabId;
			}

			const newState: FolderTabsState = {
				tabs: newTabs,
				activeTabId: newActiveId,
				tabNavHistory: [newActiveId],
				tabNavHistoryIndex: 0
			};
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 切换页签固定状态
	 */
	togglePinned(tabId: string) {
		store.update(($store) => {
			const tabs = $store.tabs.map(tab => {
				if (tab.id === tabId) {
					return { ...tab, pinned: !tab.pinned };
				}
				return tab;
			});
			const newState = { ...$store, tabs };
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 设置页签固定状态
	 */
	setPinned(tabId: string, pinned: boolean) {
		store.update(($store) => {
			const tabs = $store.tabs.map(tab => {
				if (tab.id === tabId) {
					return { ...tab, pinned };
				}
				return tab;
			});
			const newState = { ...$store, tabs };
			saveTabsState(newState);
			return newState;
		});
	},

	/**
	 * 重新打开最近关闭的页签
	 */
	reopenClosedTab(): string | null {
		const closedTabs = get(recentlyClosedTabsStore);
		if (closedTabs.length === 0) return null;
		
		const [mostRecent, ...rest] = closedTabs;
		recentlyClosedTabsStore.set(rest);
		saveRecentlyClosedTabs(rest);
		
		// 创建新标签页
		return this.createTab(mostRecent.path);
	},

	/**
	 * 获取最近关闭的页签列表
	 */
	getRecentlyClosedTabs(): RecentlyClosedTab[] {
		return get(recentlyClosedTabsStore);
	},

	/**
	 * 设置标签栏位置
	 */
	setTabBarLayout(layout: TabBarLayout) {
		sharedTabBarSettings.tabBarLayout = layout;
		saveSharedTabBarSettings(sharedTabBarSettings);
		tabBarLayout.set(layout);
	},

	/**
	 * 获取标签栏位置
	 */
	getTabBarLayout(): TabBarLayout {
		return sharedTabBarSettings.tabBarLayout;
	},

	/**
	 * 设置标签栏宽度（左右布局时）
	 */
	setTabBarWidth(width: number) {
		sharedTabBarSettings.tabBarWidth = width;
		saveSharedTabBarSettings(sharedTabBarSettings);
		tabBarWidth.set(width);
	},

	/**
	 * 获取标签栏宽度
	 */
	getTabBarWidth(): number {
		return sharedTabBarSettings.tabBarWidth;
	},

	/**
	 * 设置面包屑位置
	 */
	setBreadcrumbPosition(position: BreadcrumbPosition) {
		sharedTabBarSettings.breadcrumbPosition = position;
		saveSharedTabBarSettings(sharedTabBarSettings);
		breadcrumbPosition.set(position);
	},

	/**
	 * 获取面包屑位置
	 */
	getBreadcrumbPosition(): BreadcrumbPosition {
		return sharedTabBarSettings.breadcrumbPosition;
	},

	/**
	 * 切换页签（记录到历史）
	 */
	switchTab(tabId: string, addToHistory = true) {
		store.update(($store) => {
			if (!$store.tabs.some((t) => t.id === tabId)) {
				return $store;
			}
			
			let tabNavHistory = $store.tabNavHistory;
			let tabNavHistoryIndex = $store.tabNavHistoryIndex;
			
			if (addToHistory && tabId !== $store.activeTabId) {
				// 截断当前位置之后的历史，添加新标签页
				tabNavHistory = tabNavHistory.slice(0, tabNavHistoryIndex + 1);
				tabNavHistory.push(tabId);
				tabNavHistoryIndex = tabNavHistory.length - 1;
			}
			
			const newState: FolderTabsState = {
				...$store,
				activeTabId: tabId,
				tabNavHistory,
				tabNavHistoryIndex
			};
			saveTabsState(newState);
			return newState;
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

			// 添加到标签页历史
			const newTabNavHistory = $store.tabNavHistory.slice(0, $store.tabNavHistoryIndex + 1);
			newTabNavHistory.push(newId);

			const newState: FolderTabsState = {
				tabs: newTabs,
				activeTabId: newId,
				tabNavHistory: newTabNavHistory,
				tabNavHistoryIndex: newTabNavHistory.length - 1
			};
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
	 * 设置当前路径（支持虚拟路径）
	 */
	setPath(path: string, addToHistory = true) {
		let normalizedPath = path;
		
		// 虚拟路径不做规范化
		if (!isVirtualPath(path)) {
			// 规范化路径：Windows 使用反斜杠
			normalizedPath = path.replace(/\//g, '\\');
			// 确保 Windows 盘符后有反斜杠 (E: -> E:\)
			if (/^[a-zA-Z]:$/.test(normalizedPath)) {
				normalizedPath += '\\';
			}
			// 确保 Windows 盘符格式正确 (E:abc -> E:\abc)
			if (/^[a-zA-Z]:[^\\]/.test(normalizedPath)) {
				normalizedPath = normalizedPath.slice(0, 2) + '\\' + normalizedPath.slice(2);
			}
		}
		
		updateActiveTab((tab) => {
			const newTab = { ...tab, currentPath: normalizedPath, loading: true, error: null };
			newTab.title = getDisplayName(normalizedPath);

			if (addToHistory && normalizedPath) {
				const entry: FolderHistoryEntry = {
					path: normalizedPath,
					displayName: getDisplayName(normalizedPath),
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
	 * 查看后退一步的历史（不修改状态）
	 */
	peekBack(): { path: string } | null {
		const tab = this.getActiveTab();
		if (!tab || tab.historyIndex <= 0) return null;
		const entry = tab.historyStack[tab.historyIndex - 1];
		return entry ? { path: entry.path } : null;
	},

	/**
	 * 在历史记录中查找指定路径（只在当前位置之前的历史中查找）
	 * 返回找到的索引，如果没找到返回 -1
	 * 优先精确匹配，不行再规范化匹配
	 */
	findPathInHistory(targetPath: string): number {
		const tab = this.getActiveTab();
		if (!tab || tab.historyIndex <= 0) return -1;
		
		// 第一轮：精确匹配（区分大小写和路径分隔符）
		for (let i = tab.historyIndex - 1; i >= 0; i--) {
			const entry = tab.historyStack[i];
			if (entry && entry.path === targetPath) {
				return i;
			}
		}
		
		// 第二轮：规范化匹配（忽略大小写和路径分隔符差异）
		const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
		const normalizedTarget = normalizePath(targetPath);
		
		for (let i = tab.historyIndex - 1; i >= 0; i--) {
			const entry = tab.historyStack[i];
			if (entry && normalizePath(entry.path) === normalizedTarget) {
				return i;
			}
		}
		
		return -1;
	},

	/**
	 * 导航到历史中的指定索引
	 */
	goToHistoryIndex(index: number): { path: string } | null {
		const tab = this.getActiveTab();
		if (!tab || index < 0 || index >= tab.historyStack.length) return null;
		
		const entry = tab.historyStack[index];
		if (!entry) return null;

		updateActiveTab((t) => ({
			...t,
			currentPath: entry.path,
			historyIndex: index,
			title: getDisplayName(entry.path)
		}));

		return { path: entry.path };
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

	// ============ Tab Navigation History ============

	/**
	 * 检查是否可以后退到上一个标签页
	 */
	canGoBackTab(): boolean {
		const state = get(store);
		return state.tabNavHistoryIndex > 0;
	},

	/**
	 * 检查是否可以前进到下一个标签页
	 */
	canGoForwardTab(): boolean {
		const state = get(store);
		return state.tabNavHistoryIndex < state.tabNavHistory.length - 1;
	},

	/**
	 * 后退到上一个标签页
	 */
	goBackTab(): string | null {
		const state = get(store);
		if (state.tabNavHistoryIndex <= 0) return null;

		const newIndex = state.tabNavHistoryIndex - 1;
		const targetTabId = state.tabNavHistory[newIndex];

		// 检查目标标签页是否存在
		if (!state.tabs.some(t => t.id === targetTabId)) {
			return null;
		}

		store.update(($store) => ({
			...$store,
			activeTabId: targetTabId,
			tabNavHistoryIndex: newIndex
		}));

		return targetTabId;
	},

	/**
	 * 前进到下一个标签页
	 */
	goForwardTab(): string | null {
		const state = get(store);
		if (state.tabNavHistoryIndex >= state.tabNavHistory.length - 1) return null;

		const newIndex = state.tabNavHistoryIndex + 1;
		const targetTabId = state.tabNavHistory[newIndex];

		// 检查目标标签页是否存在
		if (!state.tabs.some(t => t.id === targetTabId)) {
			return null;
		}

		store.update(($store) => ({
			...$store,
			activeTabId: targetTabId,
			tabNavHistoryIndex: newIndex
		}));

		return targetTabId;
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
			
			// 如果排序已锁定，同步更新锁定的排序设置
			if (sharedSortSettings.locked) {
				sharedSortSettings.lockedSortField = field;
				sharedSortSettings.lockedSortOrder = newOrder;
				saveSharedSortSettings(sharedSortSettings);
			}
			
			return { ...tab, sortField: field, sortOrder: newOrder };
		});
	},

	// ============ Sort Lock ============

	/**
	 * 获取共享排序设置
	 */
	getSortSettings(): SharedSortSettings {
		return { ...sharedSortSettings };
	},

	/**
	 * 切换排序锁定
	 * 锁定时会使用当前活动标签页的排序设置作为锁定值
	 */
	toggleSortLock() {
		const tab = this.getActiveTab();
		if (!tab) return;
		
		sharedSortSettings.locked = !sharedSortSettings.locked;
		
		// 锁定时，使用当前标签页的排序设置作为锁定值
		if (sharedSortSettings.locked) {
			sharedSortSettings.lockedSortField = tab.sortField;
			sharedSortSettings.lockedSortOrder = tab.sortOrder;
		}
		
		saveSharedSortSettings(sharedSortSettings);
	},

	/**
	 * 设置排序锁定状态
	 */
	setSortLocked(locked: boolean) {
		const tab = this.getActiveTab();
		if (!tab) return;
		
		sharedSortSettings.locked = locked;
		
		// 锁定时，使用当前标签页的排序设置作为锁定值
		if (locked) {
			sharedSortSettings.lockedSortField = tab.sortField;
			sharedSortSettings.lockedSortOrder = tab.sortOrder;
		}
		
		saveSharedSortSettings(sharedSortSettings);
	},

	/**
	 * 设置排序继承策略
	 */
	setSortStrategy(strategy: SortInheritStrategy) {
		sharedSortSettings.strategy = strategy;
		saveSharedSortSettings(sharedSortSettings);
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
	 * 切换点击文件夹在新标签页打开模式
	 */
	toggleOpenInNewTabMode() {
		updateActiveTab((tab) => ({ ...tab, openInNewTabMode: !tab.openInNewTabMode }));
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
	 * 设置搜索结果（更新全局 store）
	 */
	setSearchResults(results: FsItem[]) {
		globalSearchResults.set(results);
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
	 * 切换文件夹树可见性（同步到所有页签）
	 */
	toggleFolderTree() {
		const currentTab = this.getActiveTab();
		const newVisible = !currentTab?.folderTreeVisible;
		
		// 更新共享设置
		sharedTreeSettings.folderTreeVisible = newVisible;
		saveSharedTreeSettings(sharedTreeSettings);
		
		// 同步到所有页签
		store.update(($store) => {
			const tabs = $store.tabs.map((tab) => {
				// 只更新非虚拟路径的页签
				if (!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)) {
					return { ...tab, folderTreeVisible: newVisible };
				}
				return tab;
			});
			const newState = { ...$store, tabs };
			requestAnimationFrame(() => saveTabsState(newState));
			return newState;
		});
	},

	/**
	 * 设置文件夹树布局（同步到所有页签）
	 */
	setFolderTreeLayout(layout: 'top' | 'left' | 'right' | 'bottom') {
		// 更新共享设置
		sharedTreeSettings.folderTreeLayout = layout;
		saveSharedTreeSettings(sharedTreeSettings);
		
		// 同步到所有页签
		store.update(($store) => {
			const tabs = $store.tabs.map((tab) => {
				if (!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)) {
					return { ...tab, folderTreeLayout: layout };
				}
				return tab;
			});
			const newState = { ...$store, tabs };
			requestAnimationFrame(() => saveTabsState(newState));
			return newState;
		});
	},

	/**
	 * 设置文件夹树大小（同步到所有页签）
	 */
	setFolderTreeSize(size: number) {
		// 更新共享设置
		sharedTreeSettings.folderTreeSize = size;
		saveSharedTreeSettings(sharedTreeSettings);
		
		// 同步到所有页签
		store.update(($store) => {
			const tabs = $store.tabs.map((tab) => {
				if (!isVirtualPath(tab.currentPath) && !isVirtualPath(tab.homePath)) {
					return { ...tab, folderTreeSize: size };
				}
				return tab;
			});
			const newState = { ...$store, tabs };
			requestAnimationFrame(() => saveTabsState(newState));
			return newState;
		});
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
	 * @param path 要选择的项目路径
	 * @param toggle 是否切换选中状态（勾选模式）
	 * @param index 项目在列表中的索引（用于记录 lastSelectedIndex）
	 */
	selectItem(path: string, toggle = false, index?: number) {
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
			// 更新 lastSelectedIndex
			const newLastIndex = index !== undefined ? index : tab.lastSelectedIndex;
			return { ...tab, selectedItems: newSelected, lastSelectedIndex: newLastIndex };
		});
	},

	/**
	 * 范围选择（shift + 点击）
	 * 从 lastSelectedIndex 到当前 index 之间的所有项目都会被选中
	 * @param endIndex 范围结束索引
	 * @param items 当前显示的项目列表（用于获取路径）
	 */
	selectRange(endIndex: number, items: FsItem[]) {
		updateActiveTab((tab) => {
			const startIndex = tab.lastSelectedIndex >= 0 ? tab.lastSelectedIndex : 0;
			const minIndex = Math.min(startIndex, endIndex);
			const maxIndex = Math.max(startIndex, endIndex);
			
			// 保留已选中的项目，添加范围内的项目
			const newSelected = new SvelteSet(tab.selectedItems);
			for (let i = minIndex; i <= maxIndex; i++) {
				if (i >= 0 && i < items.length) {
					newSelected.add(items[i].path);
				}
			}
			
			return { ...tab, selectedItems: newSelected };
		});
	},

	/**
	 * 获取最后选中的索引
	 */
	getLastSelectedIndex(): number {
		const tab = this.getActiveTab();
		return tab?.lastSelectedIndex ?? -1;
	},

	/**
	 * 设置最后选中的索引
	 */
	setLastSelectedIndex(index: number) {
		updateActiveTab((tab) => ({ ...tab, lastSelectedIndex: index }));
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
	 * 直接设置选中项
	 */
	setSelectedItems(items: Set<string>) {
		updateActiveTab((tab) => ({ ...tab, selectedItems: new SvelteSet(items) }));
	},

	/**
	 * 反选
	 */
	invertSelection() {
		updateActiveTab((tab) => {
			const newSelected = new SvelteSet<string>();
			for (const item of tab.items) {
				if (!tab.selectedItems.has(item.path)) {
					newSelected.add(item.path);
				}
			}
			return { ...tab, selectedItems: newSelected };
		});
	},

	/**
	 * 设置焦点项
	 */
	setFocusedItem(item: FsItem | null) {
		updateActiveTab((tab) => ({ ...tab, focusedItem: item }));
	},

	/**
	 * 设置待聚焦的文件路径（CLI 打开文件时用于定位并高亮）
	 * FolderStack 会监听此状态，找到对应项目后设置 selectedIndex 并滚动到该位置
	 */
	focusOnPath(path: string) {
		updateActiveTab((tab) => ({ ...tab, pendingFocusPath: path }));
	},

	/**
	 * 清除待聚焦的文件路径（FolderStack 处理完成后调用）
	 */
	clearPendingFocusPath() {
		updateActiveTab((tab) => ({ ...tab, pendingFocusPath: null }));
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
	},

	/**
	 * 设置缩略图宽度百分比
	 */
	setThumbnailWidthPercent(percent: number) {
		// 限制在 10-50% 范围内
		const clampedPercent = Math.max(10, Math.min(50, percent));
		updateActiveTab((tab) => ({
			...tab,
			thumbnailWidthPercent: clampedPercent
		}));
	},

	/**
	 * 设置横幅视图宽度百分比
	 */
	setBannerWidthPercent(percent: number) {
		// 限制在 20-100% 范围内
		const clampedPercent = Math.max(20, Math.min(100, percent));
		updateActiveTab((tab) => ({
			...tab,
			bannerWidthPercent: clampedPercent
		}));
	}
};

// 导出 store 订阅
export const folderTabsStore = {
	subscribe: store.subscribe
};
