/**
 * FolderContext - 文件夹面板共享上下文
 * 提供卡片间通信，但 store 直接交给功能 hooks 而非面板
 */
import { getContext, setContext } from 'svelte';
import { writable, get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import type { NavigationCommand, ContextMenuState, ClipboardState, LocalTabState } from '../types';
import {
	tabCurrentPath,
	tabFolderTreeConfig,
	tabSearchKeyword,
	tabShowSearchBar,
	tabShowMigrationBar,
	tabSelectedItems,
	tabDeleteMode,
	tabDeleteStrategy,
	tabMultiSelectMode,
	tabInlineTreeMode,
	tabSearchResults,
	tabIsSearching,
	tabSearchSettings,
	tabItems,
	activeTabId,
	allTabs,
	isVirtualPath
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { virtualPanelSettingsStore } from '$lib/stores/virtualPanelSettings.svelte';

const FOLDER_CONTEXT_KEY = Symbol('folder-context');

export type VirtualMode = 'history' | 'bookmark' | null;

export interface FolderContextValue {
	// ============ 实例信息 ============
	readonly isVirtualInstance: boolean;
	readonly virtualMode: VirtualMode;
	readonly initialPath: string | undefined;
	
	// ============ 导航相关 ============
	readonly navigationCommand: ReturnType<typeof writable<NavigationCommand | null>>;
	homePath: string;
	localTabState: LocalTabState | null;
	
	// ============ 全局 Store 引用 ============
	readonly currentPath: typeof tabCurrentPath;
	readonly folderTreeConfig: typeof tabFolderTreeConfig;
	readonly searchKeyword: typeof tabSearchKeyword;
	readonly showSearchBar: typeof tabShowSearchBar;
	readonly showMigrationBar: typeof tabShowMigrationBar;
	readonly selectedItems: typeof tabSelectedItems;
	readonly deleteMode: typeof tabDeleteMode;
	readonly deleteStrategy: typeof tabDeleteStrategy;
	readonly multiSelectMode: typeof tabMultiSelectMode;
	readonly inlineTreeMode: typeof tabInlineTreeMode;
	readonly searchResults: typeof tabSearchResults;
	readonly isSearching: typeof tabIsSearching;
	readonly searchSettings: typeof tabSearchSettings;
	readonly items: typeof tabItems;
	
	// ============ 页签相关 ============
	readonly activeTabId: typeof activeTabId;
	readonly allTabs: typeof allTabs;
	currentActiveTabId: string;
	currentAllTabs: Array<{ id: string; title: string; currentPath: string; homePath: string }>;
	
	// ============ 有效状态（虚拟实例使用独立设置）============
	readonly getEffectiveShowSearchBar: () => boolean;
	readonly getEffectiveShowMigrationBar: () => boolean;
	readonly getEffectiveMultiSelectMode: () => boolean;
	readonly getEffectiveDeleteMode: () => boolean;
	readonly getEffectiveInlineTreeMode: () => boolean;
	readonly getEffectiveViewStyle: () => string | undefined;
	readonly getEffectiveSortConfig: () => { field: string; order: string } | undefined;
	
	// ============ UI 状态 ============
	contextMenu: ContextMenuState;
	clipboardItem: ClipboardState | null;
	showFavoriteTagPanel: boolean;
	showMigrationManager: boolean;
	showRandomTagBar: boolean;
	
	// ============ 对话框状态 ============
	confirmDialogOpen: boolean;
	confirmDialogTitle: string;
	confirmDialogDescription: string;
	confirmDialogConfirmText: string;
	confirmDialogVariant: 'default' | 'destructive' | 'warning';
	confirmDialogOnConfirm: () => void;
	renameDialogOpen: boolean;
	renameDialogItem: FsItem | null;
	
	// ============ 树调整状态 ============
	isResizingTree: boolean;
	resizeStartPos: number;
	resizeStartSize: number;
	
	// ============ 计算属性 ============
	readonly displayTabs: Array<{ id: string; title: string; currentPath: string; homePath: string }>;
	readonly displayActiveTabId: string;
}

/**
 * 创建文件夹上下文
 */
export function createFolderContext(initialPath?: string): FolderContextValue {
	const isVirtual = !!(initialPath && isVirtualPath(initialPath));
	const virtualMode: VirtualMode = isVirtual
		? (initialPath?.includes('bookmark') ? 'bookmark' : 'history')
		: null;
	
	// 导航命令
	const navigationCommand = writable<NavigationCommand | null>(null);
	
	// 实例状态
	let homePath = $state('');
	let localTabState = $state<LocalTabState | null>(null);
	let currentActiveTabId = $state(get(activeTabId));
	let currentAllTabs = $state(get(allTabs));
	
	// 全局 store 订阅的本地值
	let globalShowSearchBarValue = $state(false);
	let globalShowMigrationBarValue = $state(false);
	let globalMultiSelectModeValue = $state(false);
	let globalDeleteModeValue = $state(false);
	let globalInlineTreeModeValue = $state(false);
	
	// 订阅全局 store
	$effect(() => {
		const unsubs = [
			tabShowSearchBar.subscribe(v => globalShowSearchBarValue = v),
			tabShowMigrationBar.subscribe(v => globalShowMigrationBarValue = v),
			tabMultiSelectMode.subscribe(v => globalMultiSelectModeValue = v),
			tabDeleteMode.subscribe(v => globalDeleteModeValue = v),
			tabInlineTreeMode.subscribe(v => globalInlineTreeModeValue = v)
		];
		return () => unsubs.forEach(u => u());
	});
	
	// 订阅页签状态（非虚拟实例）
	$effect(() => {
		if (isVirtual) return;
		const unsub1 = activeTabId.subscribe(v => currentActiveTabId = v);
		const unsub2 = allTabs.subscribe(v => currentAllTabs = v);
		return () => { unsub1(); unsub2(); };
	});
	
	// 有效状态计算函数
	function getEffectiveShowSearchBar(): boolean {
		if (virtualMode === 'history') return virtualPanelSettingsStore.historyShowSearchBar;
		if (virtualMode === 'bookmark') return virtualPanelSettingsStore.bookmarkShowSearchBar;
		return globalShowSearchBarValue;
	}
	
	function getEffectiveShowMigrationBar(): boolean {
		if (virtualMode === 'history') return virtualPanelSettingsStore.historyShowMigrationBar;
		if (virtualMode === 'bookmark') return virtualPanelSettingsStore.bookmarkShowMigrationBar;
		return globalShowMigrationBarValue;
	}
	
	function getEffectiveMultiSelectMode(): boolean {
		if (virtualMode === 'history') return virtualPanelSettingsStore.historyMultiSelectMode;
		if (virtualMode === 'bookmark') return virtualPanelSettingsStore.bookmarkMultiSelectMode;
		return globalMultiSelectModeValue;
	}
	
	function getEffectiveDeleteMode(): boolean {
		if (virtualMode === 'history') return virtualPanelSettingsStore.historyDeleteMode;
		if (virtualMode === 'bookmark') return virtualPanelSettingsStore.bookmarkDeleteMode;
		return globalDeleteModeValue;
	}
	
	function getEffectiveInlineTreeMode(): boolean {
		if (virtualMode === 'history') return virtualPanelSettingsStore.historyInlineTreeMode;
		if (virtualMode === 'bookmark') return virtualPanelSettingsStore.bookmarkInlineTreeMode;
		return globalInlineTreeModeValue;
	}
	
	function getEffectiveViewStyle(): string | undefined {
		if (virtualMode === 'history') return virtualPanelSettingsStore.historyViewStyle;
		if (virtualMode === 'bookmark') return virtualPanelSettingsStore.bookmarkViewStyle;
		return undefined;
	}
	
	function getEffectiveSortConfig(): { field: string; order: string } | undefined {
		if (virtualMode === 'history') {
			return { field: virtualPanelSettingsStore.historySortField, order: virtualPanelSettingsStore.historySortOrder };
		}
		if (virtualMode === 'bookmark') {
			return { field: virtualPanelSettingsStore.bookmarkSortField, order: virtualPanelSettingsStore.bookmarkSortOrder };
		}
		return undefined;
	}
	
	// UI 状态
	let contextMenu = $state<ContextMenuState>({ x: 0, y: 0, item: null, visible: false });
	let clipboardItem = $state<ClipboardState | null>(null);
	let showFavoriteTagPanel = $state(false);
	let showMigrationManager = $state(false);
	let showRandomTagBar = $state(false);
	
	// 对话框状态
	let confirmDialogOpen = $state(false);
	let confirmDialogTitle = $state('');
	let confirmDialogDescription = $state('');
	let confirmDialogConfirmText = $state('确定');
	let confirmDialogVariant = $state<'default' | 'destructive' | 'warning'>('default');
	let confirmDialogOnConfirm = $state<() => void>(() => {});
	let renameDialogOpen = $state(false);
	let renameDialogItem = $state<FsItem | null>(null);
	
	// 树调整状态
	let isResizingTree = $state(false);
	let resizeStartPos = $state(0);
	let resizeStartSize = $state(0);
	
	// 计算属性
	const displayTabs = $derived(localTabState ? [localTabState] : currentAllTabs);
	const displayActiveTabId = $derived(localTabState?.id || currentActiveTabId);
	
	const context: FolderContextValue = {
		// 实例信息
		isVirtualInstance: isVirtual,
		virtualMode,
		initialPath,
		
		// 导航
		navigationCommand,
		get homePath() { return homePath; },
		set homePath(v) { homePath = v; },
		get localTabState() { return localTabState; },
		set localTabState(v) { localTabState = v; },
		
		// 全局 Store 引用
		currentPath: tabCurrentPath,
		folderTreeConfig: tabFolderTreeConfig,
		searchKeyword: tabSearchKeyword,
		showSearchBar: tabShowSearchBar,
		showMigrationBar: tabShowMigrationBar,
		selectedItems: tabSelectedItems,
		deleteMode: tabDeleteMode,
		deleteStrategy: tabDeleteStrategy,
		multiSelectMode: tabMultiSelectMode,
		inlineTreeMode: tabInlineTreeMode,
		searchResults: tabSearchResults,
		isSearching: tabIsSearching,
		searchSettings: tabSearchSettings,
		items: tabItems,
		
		// 页签
		activeTabId,
		allTabs,
		get currentActiveTabId() { return currentActiveTabId; },
		set currentActiveTabId(v) { currentActiveTabId = v; },
		get currentAllTabs() { return currentAllTabs; },
		set currentAllTabs(v) { currentAllTabs = v; },
		
		// 有效状态
		getEffectiveShowSearchBar,
		getEffectiveShowMigrationBar,
		getEffectiveMultiSelectMode,
		getEffectiveDeleteMode,
		getEffectiveInlineTreeMode,
		getEffectiveViewStyle,
		getEffectiveSortConfig,
		
		// UI 状态
		get contextMenu() { return contextMenu; },
		set contextMenu(v) { contextMenu = v; },
		get clipboardItem() { return clipboardItem; },
		set clipboardItem(v) { clipboardItem = v; },
		get showFavoriteTagPanel() { return showFavoriteTagPanel; },
		set showFavoriteTagPanel(v) { showFavoriteTagPanel = v; },
		get showMigrationManager() { return showMigrationManager; },
		set showMigrationManager(v) { showMigrationManager = v; },
		get showRandomTagBar() { return showRandomTagBar; },
		set showRandomTagBar(v) { showRandomTagBar = v; },
		
		// 对话框
		get confirmDialogOpen() { return confirmDialogOpen; },
		set confirmDialogOpen(v) { confirmDialogOpen = v; },
		get confirmDialogTitle() { return confirmDialogTitle; },
		set confirmDialogTitle(v) { confirmDialogTitle = v; },
		get confirmDialogDescription() { return confirmDialogDescription; },
		set confirmDialogDescription(v) { confirmDialogDescription = v; },
		get confirmDialogConfirmText() { return confirmDialogConfirmText; },
		set confirmDialogConfirmText(v) { confirmDialogConfirmText = v; },
		get confirmDialogVariant() { return confirmDialogVariant; },
		set confirmDialogVariant(v) { confirmDialogVariant = v; },
		get confirmDialogOnConfirm() { return confirmDialogOnConfirm; },
		set confirmDialogOnConfirm(v) { confirmDialogOnConfirm = v; },
		get renameDialogOpen() { return renameDialogOpen; },
		set renameDialogOpen(v) { renameDialogOpen = v; },
		get renameDialogItem() { return renameDialogItem; },
		set renameDialogItem(v) { renameDialogItem = v; },
		
		// 树调整
		get isResizingTree() { return isResizingTree; },
		set isResizingTree(v) { isResizingTree = v; },
		get resizeStartPos() { return resizeStartPos; },
		set resizeStartPos(v) { resizeStartPos = v; },
		get resizeStartSize() { return resizeStartSize; },
		set resizeStartSize(v) { resizeStartSize = v; },
		
		// 计算属性
		get displayTabs() { return displayTabs; },
		get displayActiveTabId() { return displayActiveTabId; }
	};
	
	setContext(FOLDER_CONTEXT_KEY, context);
	return context;
}

/**
 * 获取文件夹上下文
 */
export function getFolderContext(): FolderContextValue {
	const ctx = getContext<FolderContextValue>(FOLDER_CONTEXT_KEY);
	if (!ctx) {
		throw new Error('FolderContext not found. Make sure to call createFolderContext in a parent component.');
	}
	return ctx;
}

/**
 * 尝试获取文件夹上下文（可能不存在）
 */
export function tryGetFolderContext(): FolderContextValue | undefined {
	return getContext<FolderContextValue>(FOLDER_CONTEXT_KEY);
}
