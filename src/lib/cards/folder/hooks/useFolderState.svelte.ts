/**
 * useFolderState - 文件夹面板状态管理
 * 集中管理所有状态，支持虚拟路径实例的独立状态
 */

import { writable, get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import type { LocalTabState, NavigationCommand, ContextMenuState, ClipboardState } from '../types';
import {
	folderTabActions,
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

/**
 * 创建文件夹面板状态
 */
export function createFolderState(initialPath?: string) {
	// 判断是否为虚拟路径实例
	const isVirtual = !!(initialPath && isVirtualPath(initialPath));

	// 全局 store 引用
	const currentPath = tabCurrentPath;
	const folderTreeConfig = tabFolderTreeConfig;
	const searchKeyword = tabSearchKeyword;
	const showSearchBar = tabShowSearchBar;
	const showMigrationBar = tabShowMigrationBar;
	const selectedItems = tabSelectedItems;
	const deleteMode = tabDeleteMode;
	const deleteStrategy = tabDeleteStrategy;
	const multiSelectMode = tabMultiSelectMode;
	const inlineTreeMode = tabInlineTreeMode;
	const searchResults = tabSearchResults;
	const isSearching = tabIsSearching;
	const searchSettings = tabSearchSettings;
	const items = tabItems;

	// 本地状态（虚拟实例独立）
	let localTabState = $state<LocalTabState | null>(null);
	let currentActiveTabId = $state(get(activeTabId));
	let currentAllTabs = $state(get(allTabs));

	// 实例状态
	let isVirtualInstance = $state(isVirtual);
	let ownTabId = $state<string | null>(null);
	let homePath = $state('');

	// 导航命令
	const navigationCommand = writable<NavigationCommand | null>(null);

	// 右键菜单
	let contextMenu = $state<ContextMenuState>({
		x: 0,
		y: 0,
		item: null,
		visible: false
	});

	// 剪贴板
	let clipboardItem = $state<ClipboardState | null>(null);

	// 确认对话框
	let confirmDialogOpen = $state(false);
	let confirmDialogTitle = $state('');
	let confirmDialogDescription = $state('');
	let confirmDialogConfirmText = $state('确定');
	let confirmDialogVariant = $state<'default' | 'destructive' | 'warning'>('default');
	let confirmDialogOnConfirm = $state<() => void>(() => {});

	// 重命名对话框
	let renameDialogOpen = $state(false);
	let renameDialogItem = $state<FsItem | null>(null);

	// UI 状态
	let showFavoriteTagPanel = $state(false);
	let showMigrationManager = $state(false);
	let showRandomTagBar = $state(false);

	// 计算属性
	const displayTabs = $derived(
		localTabState ? [localTabState] : currentAllTabs
	);

	const displayActiveTabId = $derived(
		localTabState?.id || currentActiveTabId
	);

	// 订阅全局状态（非虚拟实例）
	function subscribeGlobalState() {
		if (isVirtual) return () => {};

		const unsubActiveTab = activeTabId.subscribe((v) => {
			currentActiveTabId = v;
		});
		const unsubAllTabs = allTabs.subscribe((v) => {
			currentAllTabs = v;
		});

		return () => {
			unsubActiveTab();
			unsubAllTabs();
		};
	}

	// 初始化虚拟实例
	function initVirtualInstance(path: string) {
		isVirtualInstance = true;
		const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		ownTabId = localId;
		localTabState = {
			id: localId,
			title: path.includes('bookmark') ? '书签' : '历史',
			currentPath: path,
			homePath: path
		};
		homePath = path;
		navigationCommand.set({ type: 'init', path });
	}

	// 初始化普通实例
	async function initNormalInstance(path: string) {
		homePath = path;
		folderTabActions.setHomePath(path);
		navigationCommand.set({ type: 'init', path });
	}

	return {
		// Store 引用
		currentPath,
		folderTreeConfig,
		searchKeyword,
		showSearchBar,
		showMigrationBar,
		selectedItems,
		deleteMode,
		deleteStrategy,
		multiSelectMode,
		inlineTreeMode,
		searchResults,
		isSearching,
		searchSettings,
		items,
		navigationCommand,

		// 计算属性 getter
		get displayTabs() { return displayTabs; },
		get displayActiveTabId() { return displayActiveTabId; },
		get isVirtualInstance() { return isVirtualInstance; },
		get ownTabId() { return ownTabId; },
		get homePath() { return homePath; },
		get localTabState() { return localTabState; },

		// 右键菜单
		get contextMenu() { return contextMenu; },
		set contextMenu(v) { contextMenu = v; },

		// 剪贴板
		get clipboardItem() { return clipboardItem; },
		set clipboardItem(v) { clipboardItem = v; },

		// 确认对话框
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

		// 重命名对话框
		get renameDialogOpen() { return renameDialogOpen; },
		set renameDialogOpen(v) { renameDialogOpen = v; },
		get renameDialogItem() { return renameDialogItem; },
		set renameDialogItem(v) { renameDialogItem = v; },

		// UI 状态
		get showFavoriteTagPanel() { return showFavoriteTagPanel; },
		set showFavoriteTagPanel(v) { showFavoriteTagPanel = v; },
		get showMigrationManager() { return showMigrationManager; },
		set showMigrationManager(v) { showMigrationManager = v; },
		get showRandomTagBar() { return showRandomTagBar; },
		set showRandomTagBar(v) { showRandomTagBar = v; },

		// Setter
		set homePath(v) { homePath = v; },

		// 方法
		subscribeGlobalState,
		initVirtualInstance,
		initNormalInstance,
		isVirtual
	};
}

export type FolderState = ReturnType<typeof createFolderState>;
