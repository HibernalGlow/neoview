<script lang="ts">
	/**
	 * FolderStack - 层叠式文件夹导航（模块化版本）
	 * 参考 iOS UINavigationController 的设计
	 */
	import { tick, onMount, onDestroy } from 'svelte';
	import type { FsItem } from '$lib/types';
	import type { Writable } from 'svelte/store';
	import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { get } from 'svelte/store';
	import {
		folderTabActions,
		tabViewStyle,
		tabSelectedItems,
		tabMultiSelectMode,
		tabDeleteMode,
		tabSortConfig,
		tabPenetrateMode,
		tabOpenInNewTabMode,
		activeTabId,
		tabThumbnailWidthPercent,
		tabBannerWidthPercent,
		tabPendingFocusPath,
		isVirtualPath,
		getVirtualPathType
	} from '../stores/folderTabStore';
	import { removeVirtualPathItem } from '../utils/virtualPathLoader';
	import { Loader2, FolderOpen, AlertCircle } from '@lucide/svelte';
	import { setChainAnchor } from '../stores/chainSelectStore.svelte';
	import { collectTagCountStore } from '$lib/stores/emm/collectTagCountStore';
	import { sortItems } from './FolderStack/sortingUtils';

	// 模块化导入
	import { FolderStackState, type FolderLayer } from './FolderStack/FolderStackState.svelte';
	import { FolderDataLoader, createLayerFactory } from './FolderStack/FolderDataLoader';
	import { handleItemSelection, type SelectionCallbacks, type ItemOpenCallbacks } from './FolderStack/FolderSelectionHandler';
	import { normalizePathForCompare, isChildPath, getParentPath, getParentPaths, PRELOAD_PARENT_COUNT } from './FolderStack/folderStackUtils';
	import { analyzeHistoryNavigation, getPathsToPreload } from './FolderStack/folderStackNavigation';
	import { shouldHandleEmptyClick, type EmptyClickAction } from './FolderStack/folderStackEventHandlers';

	// 别名映射
	const viewStyle = tabViewStyle;
	const selectedItems = tabSelectedItems;
	const multiSelectMode = tabMultiSelectMode;
	const deleteMode = tabDeleteMode;
	const sortConfig = tabSortConfig;
	const penetrateMode = tabPenetrateMode;
	const openInNewTabMode = tabOpenInNewTabMode;
	const thumbnailWidthPercent = tabThumbnailWidthPercent;
	const bannerWidthPercent = tabBannerWidthPercent;

	export interface NavigationCommand {
		type: 'init' | 'push' | 'pop' | 'goto' | 'history';
		path?: string;
		index?: number;
	}

	interface Props {
		tabId: string;
		initialPath: string;
		navigationCommand: Writable<NavigationCommand | null>;
		onItemOpen?: (item: FsItem) => void;
		onItemDelete?: (item: FsItem) => void;
		onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
		onOpenFolderAsBook?: (item: FsItem) => void;
		onOpenInNewTab?: (item: FsItem) => void;
		forceActive?: boolean;
		skipGlobalStore?: boolean;
		overrideMultiSelectMode?: boolean;
		overrideDeleteMode?: boolean;
		overrideViewStyle?: 'list' | 'content' | 'banner' | 'thumbnail';
		overrideSortConfig?: { field: string; order: 'asc' | 'desc' };
	}

	let {
		tabId,
		initialPath,
		navigationCommand,
		onItemOpen,
		onItemDelete,
		onItemContextMenu,
		onOpenFolderAsBook,
		onOpenInNewTab,
		forceActive = false,
		skipGlobalStore = false,
		overrideMultiSelectMode,
		overrideDeleteMode,
		overrideViewStyle,
		overrideSortConfig
	}: Props = $props();

	// 计算实际使用的状态值
	let effectiveMultiSelectMode = $derived(overrideMultiSelectMode ?? $multiSelectMode);
	let effectiveDeleteMode = $derived(overrideDeleteMode ?? $deleteMode);
	let effectiveViewStyle = $derived(overrideViewStyle ?? $viewStyle);
	let effectiveSortConfig = $derived(overrideSortConfig ?? $sortConfig);
	let viewMode = $derived(effectiveViewStyle as 'list' | 'content' | 'banner' | 'thumbnail');

	// 条件执行全局 store 操作
	const globalStore = {
		setPath: (path: string, addToHistory = true) => { if (!skipGlobalStore) folderTabActions.setPath(path, addToHistory); },
		setItems: (items: FsItem[]) => { if (!skipGlobalStore) folderTabActions.setItems(items); },
		selectItem: (...args: Parameters<typeof folderTabActions.selectItem>) => { if (!skipGlobalStore) folderTabActions.selectItem(...args); },
		setSelectedItems: (items: Set<string>) => { if (!skipGlobalStore) folderTabActions.setSelectedItems(items); },
		selectRange: (...args: Parameters<typeof folderTabActions.selectRange>) => { if (!skipGlobalStore) folderTabActions.selectRange(...args); },
		deselectAll: () => { if (!skipGlobalStore) folderTabActions.deselectAll(); }
	};

	// 创建数据加载器和状态管理器
	const dataLoader = new FolderDataLoader();
	const createLayer = createLayerFactory(dataLoader, (layerId, items) => {
		stackState.updateLayerItems(layerId, items);
	});
	
	const stackState = new FolderStackState(createLayer, tick, {
		onPathChange: globalStore.setPath,
		onItemsChange: globalStore.setItems
	});

	// 缩略图和返回按钮状态
	let thumbnails = $state<Map<string, string>>(new Map());
	let showBackButtonValue = $state(false);

	$effect(() => {
		const unsubscribe = fileBrowserStore.subscribe((state) => {
			thumbnails = state.thumbnails;
			showBackButtonValue = state.showEmptyAreaBackButton;
		});
		return unsubscribe;
	});

	// 排序版本（用于触发重新排序）
	let collectTagVersion = $state(0);
	let collectTagDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	
	$effect(() => {
		const unsubscribe = collectTagCountStore.subscribe((cache) => {
			if (cache.lastUpdated > 0 && effectiveSortConfig.field === 'collectTagCount') {
				if (collectTagDebounceTimer) clearTimeout(collectTagDebounceTimer);
				collectTagDebounceTimer = setTimeout(() => {
					collectTagVersion = cache.lastUpdated;
					collectTagDebounceTimer = null;
				}, 300);
			}
		});
		return () => {
			unsubscribe();
			if (collectTagDebounceTimer) clearTimeout(collectTagDebounceTimer);
		};
	});

	// 获取显示项（应用排序）
	function getDisplayItems(layer: FolderLayer): FsItem[] {
		const _ = collectTagVersion; // 依赖触发
		const skipFolderFirst = isVirtualPath(layer.path);
		return sortItems(layer.items, effectiveSortConfig.field, effectiveSortConfig.order, skipFolderFirst, layer.path);
	}

	// ============ 导航处理 ============
	const normalizePath = normalizePathForCompare;

	async function handleHistoryNavigation(targetPath: string): Promise<void> {
		stackState.updateLastNavigatedPath(targetPath);
		const action = analyzeHistoryNavigation(stackState.layers, targetPath);
		
		switch (action.type) {
			case 'switchToLayer':
				stackState.switchToLayer(action.layerIndex);
				break;
			case 'appendToParent':
				await stackState.truncateAndAppend(action.parentIndex, action.targetPath);
				break;
			case 'insertBeforeChild':
				await stackState.insertBeforeChild(action.childIndex, [action.targetPath, ...action.parentPaths]);
				break;
			case 'reinitialize':
				await stackState.initRoot(action.targetPath, false);
				break;
		}
	}

	async function pushLayer(path: string): Promise<void> {
		const currentPath = stackState.activeLayer?.path || '';
		const isChild = currentPath && isChildPath(path, currentPath);
		await stackState.pushLayer(path, isChild);
	}

	async function popLayer(): Promise<boolean> {
		if (stackState.popLayer()) {
			preloadParentLayers();
			return true;
		}

		// 没有上一层，尝试导航到父目录
		const currentLayer = stackState.activeLayer;
		if (currentLayer) {
			const parentPath = getParentPath(currentLayer.path);
			if (parentPath) {
				const parentPaths = getParentPaths(currentLayer.path, PRELOAD_PARENT_COUNT);
				await stackState.insertParentLayers(parentPaths);
				return true;
			}
		}
		return false;
	}

	async function preloadParentLayers(): Promise<void> {
		const topLayer = stackState.layers[0];
		if (!topLayer) return;
		
		const pathsToLoad = getPathsToPreload(stackState.layers, topLayer.path);
		if (pathsToLoad.length === 0) return;
		
		try {
			const newLayers = await Promise.all(pathsToLoad.map(p => createLayer(p)));
			stackState.layers = [...newLayers.reverse(), ...stackState.layers];
			stackState.activeIndex += newLayers.length;
		} catch {}
	}

	// ============ 导航命令监听 ============
	$effect(() => {
		const cmd = $navigationCommand;
		if (!cmd) return;

		if (!forceActive) {
			const currentActiveTabId = get(activeTabId);
			if (tabId !== currentActiveTabId) return;
		}

		stackState.isProcessingNavCommand = true;

		(async () => {
			switch (cmd.type) {
				case 'init': if (cmd.path) await stackState.initRoot(cmd.path); break;
				case 'push': if (cmd.path) await pushLayer(cmd.path); break;
				case 'pop': await popLayer(); break;
				case 'goto': if (cmd.index !== undefined) stackState.switchToLayer(cmd.index); break;
				case 'history': if (cmd.path) await handleHistoryNavigation(cmd.path); break;
			}
			stackState.isProcessingNavCommand = false;
		})();

		navigationCommand.set(null);
	});

	// 初始化监听
	$effect(() => {
		const targetPath = initialPath;
		if (!targetPath || stackState.isProcessingNavCommand) return;
		if (normalizePath(stackState.lastNavigatedPath) === normalizePath(targetPath)) return;
		
		if (stackState.layers.length === 0) {
			stackState.lastNavigatedPath = targetPath;
			stackState.initRoot(targetPath, false);
			return;
		}
		
		const currentActivePath = stackState.activeLayer?.path;
		if (currentActivePath && normalizePath(currentActivePath) === normalizePath(targetPath)) {
			stackState.lastNavigatedPath = targetPath;
			return;
		}
		
		const targetLayerIndex = stackState.findLayerByPath(targetPath, normalizePath);
		if (targetLayerIndex !== -1) {
			stackState.lastNavigatedPath = targetPath;
			stackState.switchToLayer(targetLayerIndex);
			return;
		}
		
		const pathToHandle = targetPath;
		setTimeout(() => {
			if (normalizePath(stackState.lastNavigatedPath) === normalizePath(pathToHandle)) return;
			const currentPath = stackState.activeLayer?.path;
			if (currentPath && normalizePath(currentPath) === normalizePath(pathToHandle)) {
				stackState.lastNavigatedPath = pathToHandle;
				return;
			}
			stackState.lastNavigatedPath = pathToHandle;
			handleHistoryNavigation(pathToHandle);
		}, 50);
	});

	// ============ 选择和交互处理 ============
	let scrollToSelectedToken = $state(0);

	$effect(() => {
		const focusPath = $tabPendingFocusPath;
		if (!focusPath) return;
		if (tabId !== get(activeTabId)) return;
		
		const currentLayer = stackState.activeLayer;
		if (!currentLayer || currentLayer.loading) return;
		
		const displayItems = getDisplayItems(currentLayer);
		const targetIndex = displayItems.findIndex(item => item.path === focusPath);
		
		if (targetIndex !== -1) {
			stackState.updateSelectedIndex(stackState.activeIndex, targetIndex);
			globalStore.selectItem(focusPath, false, targetIndex);
			setTimeout(() => scrollToSelectedToken++, 250);
		}
		
		folderTabActions.clearPendingFocusPath();
	});

	async function handleItemSelect(layerIndex: number, payload: { item: FsItem; index: number; multiSelect: boolean; shiftKey?: boolean }) {
		if (layerIndex !== stackState.activeIndex) return;
		
		stackState.updateSelectedIndex(layerIndex, payload.index);
		const displayItems = getDisplayItems(stackState.layers[layerIndex]);

		await handleItemSelection(
			payload,
			{
				tabId,
				multiSelectMode: $multiSelectMode || payload.multiSelect,
				penetrateMode: $penetrateMode,
				openInNewTabMode: $openInNewTabMode,
				skipGlobalStore,
				displayItems,
				selectedItems: get(tabSelectedItems)
			},
			{
				selectItem: globalStore.selectItem,
				setSelectedItems: globalStore.setSelectedItems,
				selectRange: globalStore.selectRange,
				deselectAll: globalStore.deselectAll,
				onItemOpen,
				onOpenInNewTab,
				onNavigate: pushLayer
			},
			setChainAnchor
		);
	}

	function handleItemDoubleClick(layerIndex: number, payload: { item: FsItem; index: number }) {
		if (layerIndex !== stackState.activeIndex) return;
		if (!payload.item.isDir) onItemOpen?.(payload.item);
	}

	function handleSelectedIndexChange(layerIndex: number, payload: { index: number }) {
		if (layerIndex !== stackState.activeIndex) return;
		stackState.updateSelectedIndex(layerIndex, payload.index);
	}

	function handleItemContextMenu(layerIndex: number, payload: { event: MouseEvent; item: FsItem }) {
		if (layerIndex !== stackState.activeIndex) return;
		onItemContextMenu?.(payload.event, payload.item);
	}

	function handleOpenFolderAsBook(layerIndex: number, item: FsItem) {
		if (layerIndex !== stackState.activeIndex || !item.isDir) return;
		onOpenFolderAsBook?.(item);
	}

	function handleDeleteItem(layerIndex: number, item: FsItem) {
		const currentLayer = stackState.layers[layerIndex];
		if (currentLayer && isVirtualPath(currentLayer.path)) {
			removeVirtualPathItem(currentLayer.path, item.path);
			return;
		}
		stackState.removeItemFromLayer(layerIndex, item.path);
		globalStore.setItems(currentLayer?.items || []);
		onItemDelete?.(item);
	}

	async function handleEmptyAreaAction(layerIndex: number, actionType: 'single' | 'double') {
		if (layerIndex !== stackState.activeIndex) return;
		const currentLayer = stackState.layers[layerIndex];
		if (!currentLayer || isVirtualPath(currentLayer.path)) return;
		
		const state = get(fileBrowserStore);
		const action = actionType === 'double' ? state.doubleClickEmptyAction : state.singleClickEmptyAction;
		if (shouldHandleEmptyClick(action as EmptyClickAction, false)) {
			await popLayer();
		}
	}

	async function handleBackButtonClick(layerIndex: number) {
		if (layerIndex !== stackState.activeIndex) return;
		const currentLayer = stackState.layers[layerIndex];
		if (currentLayer && isVirtualPath(currentLayer.path)) return;
		await popLayer();
	}
	
	function shouldShowBackButton(layerPath: string): boolean {
		if (isVirtualPath(layerPath)) return false;
		return showBackButtonValue;
	}

	onDestroy(() => {
		dataLoader.cleanup();
	});
</script>

<div class="folder-stack relative h-full w-full overflow-hidden">
	{#each stackState.layers as layer, index (layer.id)}
		<div
			class="folder-layer bg-muted/10 absolute inset-0 transition-transform duration-300 ease-out"
			class:pointer-events-none={index !== stackState.activeIndex}
			style="transform: translateX({(index - stackState.activeIndex) * 100}%); z-index: {index};"
		>
			{#if layer.loading}
				<div class="flex h-full items-center justify-center">
					<Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
				</div>
			{:else if layer.error}
				<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
					<AlertCircle class="text-destructive h-8 w-8" />
					<p class="text-destructive text-sm">{layer.error}</p>
				</div>
			{:else}
				{@const displayItems = getDisplayItems(layer)}
				{#if displayItems.length === 0}
					<div class="flex h-full flex-col items-center justify-center gap-2 p-4">
						<FolderOpen class="text-muted-foreground h-12 w-12" />
						<p class="text-muted-foreground text-sm">文件夹为空</p>
					</div>
				{:else}
					<VirtualizedFileList
						items={displayItems}
						currentPath={layer.path}
						{thumbnails}
						selectedIndex={layer.selectedIndex}
						{scrollToSelectedToken}
						isCheckMode={effectiveMultiSelectMode}
						isDeleteMode={effectiveDeleteMode}
						selectedItems={$selectedItems}
						{viewMode}
						thumbnailWidthPercent={$thumbnailWidthPercent}
						bannerWidthPercent={$bannerWidthPercent}
						showFullPath={getVirtualPathType(layer.path) === 'search'}
						showBackButton={shouldShowBackButton(layer.path)}
						onItemSelect={(payload) => handleItemSelect(index, payload)}
						onItemDoubleClick={(payload) => handleItemDoubleClick(index, payload)}
						onEmptyDoubleClick={() => handleEmptyAreaAction(index, 'double')}
						onEmptySingleClick={() => handleEmptyAreaAction(index, 'single')}
						onBackButtonClick={() => handleBackButtonClick(index)}
						onSelectedIndexChange={(payload) => handleSelectedIndexChange(index, payload)}
						onSelectionChange={(payload) => globalStore.setSelectedItems(payload.selectedItems)}
						on:itemContextMenu={(e) => handleItemContextMenu(index, e.detail)}
						on:openFolderAsBook={(e) => handleOpenFolderAsBook(index, e.detail.item)}
						on:openInNewTab={(e) => {
							if (index === stackState.activeIndex && e.detail.item.isDir) {
								onOpenInNewTab?.(e.detail.item);
							}
						}}
						on:deleteItem={(e) => handleDeleteItem(index, e.detail.item)}
					/>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<style>
	.folder-stack {
		perspective: 1000px;
		contain: layout style;
	}
	.folder-layer {
		will-change: transform;
		backface-visibility: hidden;
		contain: layout style paint;
	}
</style>
