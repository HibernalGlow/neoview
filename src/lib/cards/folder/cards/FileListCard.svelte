<script lang="ts">
	/**
	 * FileListCard - 文件列表卡片
	 * 独立管理文件列表相关的 UI 状态
	 */
	import { get } from 'svelte/store';
	import type { FsItem } from '$lib/types';
	
	import FolderStack from '$lib/components/panels/folderPanel/components/FolderStack.svelte';
	import FolderTree from '$lib/components/panels/folderPanel/components/FolderTree.svelte';
	import InlineTreeList from '$lib/components/panels/folderPanel/components/InlineTreeList.svelte';
	import SearchResultList from '$lib/components/panels/folderPanel/components/SearchResultList.svelte';
	
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
	const { folderTreeConfig, isSearching, searchResults } = ctx;

	// ==================== 树调整 ====================
	function startTreeResize(e: MouseEvent) {
		e.preventDefault();
		ctx.isResizingTree = true;
		const layout = get(ctx.folderTreeConfig).layout;
		ctx.resizeStartPos = layout === 'left' ? e.clientX : e.clientY;
		ctx.resizeStartSize = get(ctx.folderTreeConfig).size;
		document.addEventListener('mousemove', onTreeResize);
		document.addEventListener('mouseup', stopTreeResize);
	}

	function onTreeResize(e: MouseEvent) {
		if (!ctx.isResizingTree) return;
		const layout = get(ctx.folderTreeConfig).layout;
		const delta = layout === 'left' ? e.clientX - ctx.resizeStartPos : e.clientY - ctx.resizeStartPos;
		folderTabActions.setFolderTreeSize(Math.max(100, Math.min(500, ctx.resizeStartSize + delta)));
	}

	function stopTreeResize() {
		ctx.isResizingTree = false;
		document.removeEventListener('mousemove', onTreeResize);
		document.removeEventListener('mouseup', stopTreeResize);
	}

	// ==================== 搜索结果点击 ====================
	function handleSearchResultClick(item: FsItem) {
		onItemOpen(item);
	}
</script>

<div class="relative flex-1 overflow-hidden">
	<!-- 文件夹树 -->
	{#if $folderTreeConfig.visible}
		<div
			class="border-muted bg-muted/10 absolute z-10 overflow-auto"
			class:border-b={$folderTreeConfig.layout === 'top'}
			class:border-r={$folderTreeConfig.layout === 'left'}
			style={$folderTreeConfig.layout === 'top'
				? `top: 0; left: 0; right: 0; height: ${$folderTreeConfig.size}px;`
				: `top: 0; left: 0; bottom: 0; width: ${$folderTreeConfig.size}px;`}
		>
			<FolderTree onNavigate={onNavigate} onContextMenu={onItemContextMenu} />
		</div>
		<!-- 调整手柄 -->
		<div
			class="hover:bg-primary/20 absolute z-20 transition-colors {$folderTreeConfig.layout === 'left'
				? 'top-0 bottom-0 -ml-1 w-2 cursor-ew-resize'
				: 'right-0 left-0 -mt-1 h-2 cursor-ns-resize'}"
			style={$folderTreeConfig.layout === 'left'
				? `left: ${$folderTreeConfig.size}px;`
				: `top: ${$folderTreeConfig.size}px;`}
			onmousedown={startTreeResize}
			role="separator"
			tabindex="0"
		></div>
	{/if}

	<!-- 文件列表区域 -->
	<div
		class="file-list-container bg-muted/10 absolute inset-0 overflow-hidden"
		style={$folderTreeConfig.visible
			? $folderTreeConfig.layout === 'top'
				? `top: ${$folderTreeConfig.size}px;`
				: `left: ${$folderTreeConfig.size}px;`
			: ''}
	>
		{#each ctx.displayTabs as tab (tab.id)}
			<div
				class="absolute inset-0"
				class:hidden={tab.id !== ctx.displayActiveTabId}
				class:pointer-events-none={tab.id !== ctx.displayActiveTabId}
			>
				{#if $isSearching || $searchResults.length > 0}
					<SearchResultList
						onItemClick={handleSearchResultClick}
						onItemDoubleClick={handleSearchResultClick}
						onItemContextMenu={onItemContextMenu}
						externalSearchResults={ctx.searchResults}
						externalIsSearching={ctx.isSearching}
						externalSearchKeyword={ctx.searchKeyword}
					/>
				{:else if ctx.effectiveInlineTreeMode}
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
