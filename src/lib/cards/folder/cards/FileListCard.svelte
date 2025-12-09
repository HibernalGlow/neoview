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
	import InlineTreeList from '$lib/components/panels/folderPanel/components/InlineTreeList.svelte';
	
	import { getFolderContext } from '../context/FolderContext.svelte';
	import { folderTabActions } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';

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
	
	// Store 引用（需要用 $ 前缀）
	const { folderTreeConfig } = ctx;

	// ==================== 树调整 ====================
	function startTreeResize(e: MouseEvent) {
		e.preventDefault();
		ctx.isResizingTree = true;
		const layout = get(ctx.folderTreeConfig).layout;
		// 水平布局（左/右）使用 X 坐标，垂直布局（上/下）使用 Y 坐标
		ctx.resizeStartPos = (layout === 'left' || layout === 'right') ? e.clientX : e.clientY;
		ctx.resizeStartSize = get(ctx.folderTreeConfig).size;
		document.addEventListener('mousemove', onTreeResize);
		document.addEventListener('mouseup', stopTreeResize);
	}

	function onTreeResize(e: MouseEvent) {
		if (!ctx.isResizingTree) return;
		const layout = get(ctx.folderTreeConfig).layout;
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
		
		folderTabActions.setFolderTreeSize(Math.max(100, Math.min(500, ctx.resizeStartSize + delta)));
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
	{#if $folderTreeConfig.visible}
		<div
			class="border-muted bg-muted/10 absolute z-10 overflow-auto"
			class:border-b={$folderTreeConfig.layout === 'top'}
			class:border-t={$folderTreeConfig.layout === 'bottom'}
			class:border-r={$folderTreeConfig.layout === 'left'}
			class:border-l={$folderTreeConfig.layout === 'right'}
			style={getTreeContainerStyle($folderTreeConfig.layout, $folderTreeConfig.size)}
		>
			<FolderTree onNavigate={onNavigate} onContextMenu={onItemContextMenu} />
		</div>
		<!-- 调整手柄 -->
		<div
			class="hover:bg-primary/20 absolute z-20 transition-colors {isHorizontalLayout($folderTreeConfig.layout)
				? 'top-0 bottom-0 w-2 cursor-ew-resize'
				: 'right-0 left-0 h-2 cursor-ns-resize'}"
			style={getResizeHandleStyle($folderTreeConfig.layout, $folderTreeConfig.size)}
			onmousedown={startTreeResize}
			role="separator"
			aria-orientation={isHorizontalLayout($folderTreeConfig.layout) ? 'vertical' : 'horizontal'}
			tabindex="-1"
		></div>
	{/if}

	<!-- 文件列表区域 -->
	<div
		class="file-list-container bg-muted/10 absolute inset-0 overflow-hidden"
		style={getFileListStyle($folderTreeConfig.visible, $folderTreeConfig.layout, $folderTreeConfig.size)}
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
						overrideViewStyle={ctx.isVirtualInstance ? ctx.effectiveViewStyle : undefined}
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
