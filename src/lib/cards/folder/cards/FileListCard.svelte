<script lang="ts">
	/**
	 * FileListCard - 文件列表卡片
	 * 独立管理文件列表相关的 UI 状态
	 * 文件树支持上下左右四个位置
	 */
	import { get } from 'svelte/store';
	import type { FsItem } from '$lib/types';
	
	import FolderStack from '$lib/components/panels/folderPanel/components/FolderStack.svelte';
	import FolderTree from '$lib/components/panels/folderPanel/components/FolderTree.svelte';
	import FileTreeView from '$lib/components/panels/file/components/FileTreeView.svelte';
	import InlineTreeList from '$lib/components/panels/folderPanel/components/InlineTreeList.svelte';
	
	import { getFolderContext } from '../context/FolderContext.svelte';
	import { folderTabActions, tabSearchResults, tabCurrentPath, isVirtualPath, getVirtualPathType } from '$lib/components/panels/folderPanel/stores/folderTabStore';
	import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
	import { loadVirtualPathData, subscribeVirtualPathData } from '$lib/components/panels/folderPanel/utils/virtualPathLoader';
	import { virtualPanelSettingsStore } from '$lib/stores/virtualPanelSettings.svelte';

	// ==================== Props ====================
	interface Props {
		onItemOpen: (item: FsItem) => Promise<void>;
		onItemDelete: (item: FsItem) => void;
		onItemContextMenu: (event: MouseEvent, item: FsItem) => void;
		onOpenFolderAsBook: (item: FsItem) => void;
		onOpenInNewTab: (item: FsItem) => void;
		onNavigate: (path: string) => void;
	}
	let { onItemOpen, onItemDelete, onItemContextMenu, onOpenFolderAsBook, onOpenInNewTab, onNavigate }: Props = $props();

	// ==================== Context ====================
	const ctx = getFolderContext();
	
	// Store 引用
	const { folderTreeConfig } = ctx;
	
	// 全局 store 订阅的本地状态
	let globalFolderTreeConfigValue = $state<{ visible: boolean; layout: string; size: number }>({ visible: false, layout: 'left', size: 200 });
	
	// 虚拟路径文件列表（用于树状视图）
	let virtualItems = $state<FsItem[]>([]);
	// 搜索结果（用于树状视图）
	let searchResultItems = $state<FsItem[]>([]);
	// 当前标签页路径
	let currentPath = $state<string>('');
	
	// 订阅全局 store
	$effect(() => {
		const unsub = folderTreeConfig.subscribe(v => globalFolderTreeConfigValue = v);
		return () => unsub();
	});
	
	// 订阅搜索结果
	$effect(() => {
		const unsub = tabSearchResults.subscribe(results => {
			searchResultItems = results;
		});
		return unsub;
	});
	
	// 订阅当前标签页路径
	$effect(() => {
		const unsub = tabCurrentPath.subscribe(path => {
			currentPath = path;
		});
		return unsub;
	});
	
	// 订阅虚拟路径数据（如果是虚拟实例）
	$effect(() => {
		if (!ctx.isVirtualInstance || !ctx.initialPath) return;
		// 初始加载
		virtualItems = loadVirtualPathData(ctx.initialPath);
		// 订阅变化
		const unsub = subscribeVirtualPathData(ctx.initialPath, (items) => {
			virtualItems = items;
		});
		return unsub;
	});
	
	// 判断当前标签页是否是搜索结果标签页
	let isSearchTab = $derived(getVirtualPathType(currentPath) === 'search');
	
	// 判断是否应该使用局部树（虚拟路径实例 或 当前标签页是搜索结果标签页且有搜索结果）
	let shouldUseLocalTree = $derived(ctx.isVirtualInstance || (isSearchTab && searchResultItems.length > 0));
	// 局部树的数据源
	let localTreeItems = $derived(ctx.isVirtualInstance ? virtualItems : searchResultItems);
	
	// 有效的文件树配置（虚拟模式使用 effectiveFolderTreeConfig，否则使用全局 store）
	let effectiveTreeConfig = $derived(
		ctx.effectiveFolderTreeConfig ?? globalFolderTreeConfigValue
	);

	// ==================== 树调整 ====================
	function startTreeResize(e: MouseEvent) {
		e.preventDefault();
		ctx.isResizingTree = true;
		const layout = effectiveTreeConfig.layout;
		// 水平布局（左/右）使用 X 坐标，垂直布局（上/下）使用 Y 坐标
		ctx.resizeStartPos = (layout === 'left' || layout === 'right') ? e.clientX : e.clientY;
		ctx.resizeStartSize = effectiveTreeConfig.size;
		document.addEventListener('mousemove', onTreeResize);
		document.addEventListener('mouseup', stopTreeResize);
	}

	function onTreeResize(e: MouseEvent) {
		if (!ctx.isResizingTree) return;
		const layout = effectiveTreeConfig.layout;
		let delta: number;
		
		switch (layout) {
			case 'left':
				delta = e.clientX - ctx.resizeStartPos;
				break;
			case 'right':
				delta = ctx.resizeStartPos - e.clientX;
				break;
			case 'top':
				delta = e.clientY - ctx.resizeStartPos;
				break;
			case 'bottom':
				delta = ctx.resizeStartPos - e.clientY;
				break;
			default:
				delta = 0;
		}
		
		const newSize = Math.max(100, Math.min(500, ctx.resizeStartSize + delta));
		
		// 根据面板模式调用相应的设置方法
		if (ctx.panelMode === 'history') {
			virtualPanelSettingsStore.setHistoryFolderTreeSize(newSize);
		} else if (ctx.panelMode === 'bookmark') {
			virtualPanelSettingsStore.setBookmarkFolderTreeSize(newSize);
		} else {
			// folder 面板使用全局 store
			folderTabActions.setFolderTreeSize(newSize);
		}
	}

	function stopTreeResize() {
		ctx.isResizingTree = false;
		document.removeEventListener('mousemove', onTreeResize);
		document.removeEventListener('mouseup', stopTreeResize);
	}

	// 根据布局计算树容器样式
	function getTreeContainerStyle(layout: string, size: number): string {
		switch (layout) {
			case 'left':
				return `top: 0; left: 0; bottom: 0; width: ${size}px;`;
			case 'right':
				return `top: 0; right: 0; bottom: 0; width: ${size}px;`;
			case 'top':
				return `top: 0; left: 0; right: 0; height: ${size}px;`;
			case 'bottom':
				return `bottom: 0; left: 0; right: 0; height: ${size}px;`;
			default:
				return '';
		}
	}

	// 根据布局计算调整手柄样式
	function getResizeHandleStyle(layout: string, size: number): string {
		switch (layout) {
			case 'left':
				return `left: ${size}px;`;
			case 'right':
				return `right: ${size}px;`;
			case 'top':
				return `top: ${size}px;`;
			case 'bottom':
				return `bottom: ${size}px;`;
			default:
				return '';
		}
	}

	// 根据布局计算文件列表容器样式
	function getFileListStyle(visible: boolean, layout: string, size: number): string {
		if (!visible) return '';
		switch (layout) {
			case 'left':
				return `left: ${size}px;`;
			case 'right':
				return `right: ${size}px;`;
			case 'top':
				return `top: ${size}px;`;
			case 'bottom':
				return `bottom: ${size}px;`;
			default:
				return '';
		}
	}

	// 判断是否为水平布局（左/右）
	function isHorizontalLayout(layout: string): boolean {
		return layout === 'left' || layout === 'right';
	}
</script>

<div class="relative flex-1 overflow-hidden">
	<!-- 文件夹树 -->
	{#if effectiveTreeConfig.visible}
		<div
			class="border-muted bg-muted/10 absolute z-10 overflow-auto"
			class:border-b={effectiveTreeConfig.layout === 'top'}
			class:border-t={effectiveTreeConfig.layout === 'bottom'}
			class:border-r={effectiveTreeConfig.layout === 'left'}
			class:border-l={effectiveTreeConfig.layout === 'right'}
			style={getTreeContainerStyle(effectiveTreeConfig.layout, effectiveTreeConfig.size)}
		>
			{#if shouldUseLocalTree}
				<!-- 虚拟路径/搜索结果模式：显示基于当前文件列表的局部树 -->
				<FileTreeView
					items={localTreeItems}
					thumbnails={fileBrowserStore.getState().thumbnails}
					on:itemClick={(e) => onItemOpen(e.detail.item)}
					on:itemDoubleClick={(e) => onItemOpen(e.detail.item)}
					on:itemContextMenu={(e) => onItemContextMenu(e.detail.event, e.detail.item)}
				/>
			{:else}
				<!-- 普通模式：显示完整的文件系统树 -->
				<FolderTree onNavigate={onNavigate} onContextMenu={onItemContextMenu} />
			{/if}
		</div>
		<!-- 调整手柄 -->
		<div
			class="hover:bg-primary/20 absolute z-20 transition-colors {isHorizontalLayout(effectiveTreeConfig.layout)
				? 'top-0 bottom-0 w-2 cursor-ew-resize'
				: 'right-0 left-0 h-2 cursor-ns-resize'}"
			style={getResizeHandleStyle(effectiveTreeConfig.layout, effectiveTreeConfig.size)}
			onmousedown={startTreeResize}
			role="separator"
			aria-orientation={isHorizontalLayout(effectiveTreeConfig.layout) ? 'vertical' : 'horizontal'}
			tabindex="-1"
		></div>
	{/if}

	<!-- 文件列表区域 -->
	<div
		class="file-list-container bg-muted/10 absolute inset-0 overflow-hidden"
		style={getFileListStyle(effectiveTreeConfig.visible, effectiveTreeConfig.layout, effectiveTreeConfig.size)}
	>
		{#each ctx.displayTabs as tab (tab.id)}
			<div
				class="absolute inset-0"
				class:hidden={tab.id !== ctx.displayActiveTabId}
				class:pointer-events-none={tab.id !== ctx.displayActiveTabId}
			>
				{#if ctx.effectiveInlineTreeMode}
					<InlineTreeList
						onItemClick={onItemOpen}
						onItemDoubleClick={onItemOpen}
						onItemContextMenu={onItemContextMenu}
					/>
				{:else}
					<FolderStack
						tabId={tab.id}
						initialPath={tab.currentPath || tab.homePath}
						navigationCommand={ctx.navigationCommand}
						onItemOpen={onItemOpen}
						onItemDelete={onItemDelete}
						onItemContextMenu={onItemContextMenu}
						onOpenFolderAsBook={onOpenFolderAsBook}
						onOpenInNewTab={onOpenInNewTab}
						forceActive={ctx.isVirtualInstance}
						skipGlobalStore={ctx.isVirtualInstance}
						overrideMultiSelectMode={ctx.effectiveMultiSelectMode}
						overrideDeleteMode={ctx.effectiveDeleteMode}
						overrideViewStyle={ctx.isVirtualInstance ? ctx.effectiveViewStyle as 'list' | 'content' | 'banner' | 'thumbnail' | undefined : undefined}
						overrideSortConfig={ctx.isVirtualInstance ? ctx.effectiveSortConfig : undefined}
					/>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.file-list-container {
		contain: strict;
		content-visibility: auto;
	}
</style>
