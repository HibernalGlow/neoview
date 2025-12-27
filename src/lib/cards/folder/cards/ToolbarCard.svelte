<script lang="ts">
	/**
	 * ToolbarCard - 工具栏卡片
	 * 独立管理工具栏相关的 UI 状态
	 */
	import { get } from 'svelte/store';
	import { Star, RefreshCw } from '@lucide/svelte';
	import TagChip from '$lib/components/ui/TagChip.svelte';
	import FolderToolbar from '$lib/components/panels/folderPanel/components/FolderToolbar';
	import MigrationBar from '$lib/components/panels/folderPanel/components/MigrationBar.svelte';
	import PenetrateSettingsBar from '$lib/components/panels/folderPanel/components/PenetrateSettingsBar.svelte';
	import SelectionBar from '$lib/components/panels/folderPanel/components/SelectionBar.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import VirtualSearchBar from '$lib/components/ui/VirtualSearchBar.svelte';
	import FavoriteTagPanel from '$lib/components/panels/folderPanel/components/FavoriteTagPanel.svelte';
	
	import { getFolderContext } from '../context/FolderContext.svelte';
	import { folderTabActions, isVirtualPath, tabShowPenetrateSettingsBar } from '$lib/components/panels/folderPanel/stores/folderTabStore';
	import { virtualPanelSettingsStore } from '$lib/stores/virtualPanelSettings.svelte';
	import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';
	import { loadVirtualPathData } from '$lib/components/panels/folderPanel/utils/virtualPathLoader';
	import { showSuccessToast } from '$lib/utils/toast';
	import { createSearchActions } from '../hooks/useSearchActions';
	import { createTagActions, type RandomTag } from '../hooks/useTagActions.svelte';
	import { mixedGenderStore, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';
	import type { FsItem } from '$lib/types';

	// ==================== Props ====================
	interface Props {
		onRefresh: () => void;
		onGoBack: () => void;
		onGoForward: () => void;
		onGoUp: () => void;
		onGoHome: () => void;
		onSetHome: () => void;
		onBatchDelete: () => void;
		/** 是否垂直布局（左右位置时使用） */
		vertical?: boolean;
	}
	let { onRefresh, onGoBack, onGoForward, onGoUp, onGoHome, onSetHome, onBatchDelete, vertical = false }: Props = $props();

	// ==================== Context ====================
	const ctx = getFolderContext();
	const { 
		isVirtualInstance, 
		panelMode,
		searchKeyword,
		searchSettings,
		deleteStrategy,
		localSearchStore,
		initialPath
	} = ctx;
	
	// 转换为 FolderToolbar 需要的 virtualMode 格式
	const virtualMode = $derived(panelMode === 'folder' ? null : panelMode);

	// ==================== Hooks ====================
	const searchActions = createSearchActions();
	
	// 虚拟路径使用本地 store 设置关键词
	function setSearchKeyword(kw: string) {
		if (isVirtualInstance) {
			localSearchStore.keyword.set(kw);
		} else {
			folderTabActions.setSearchKeyword(kw);
		}
	}
	
	const tagActions = createTagActions(
		() => get(searchKeyword),
		setSearchKeyword
	);
	let randomTags = $derived(tagActions.randomTags);

	// ==================== 工具栏操作 ====================
	function handleToggleFolderTree() {
		if (virtualMode === 'history') {
			virtualPanelSettingsStore.toggleHistoryFolderTreeVisible();
		} else if (virtualMode === 'bookmark') {
			virtualPanelSettingsStore.toggleBookmarkFolderTreeVisible();
		} else {
			folderTabActions.toggleFolderTree();
		}
	}

	function handleToggleDeleteStrategy() {
		folderTabActions.toggleDeleteStrategy();
		showSuccessToast('删除策略', get(deleteStrategy) === 'trash' ? '回收站' : '永久');
	}

	function handleToggleInlineTree() {
		if (virtualMode === 'history') {
			virtualPanelSettingsStore.toggleHistoryInlineTreeMode();
		} else if (virtualMode === 'bookmark') {
			virtualPanelSettingsStore.toggleBookmarkInlineTreeMode();
		} else {
			folderTabActions.toggleInlineTreeMode();
		}
	}

	function handleToggleMigrationManager() {
		ctx.showMigrationManager = !ctx.showMigrationManager;
	}

	function handleToggleFavoriteTagPanel() {
		ctx.showFavoriteTagPanel = !ctx.showFavoriteTagPanel;
	}

	function handleCloseFavoriteTagPanel() {
		ctx.showFavoriteTagPanel = false;
	}

	function handleToggleRandomTagBar() {
		ctx.showRandomTagBar = !ctx.showRandomTagBar;
		if (ctx.showRandomTagBar && randomTags.length === 0) {
			tagActions.refreshRandomTags();
		}
	}

	function handleAppendTag(tag: FavoriteTag, modifier: string = '') {
		tagActions.appendTagToSearch(tag, modifier);
	}

	function handleRandomTagClick(tag: FavoriteTag) {
		tagActions.handleRandomTagClick(tag, handleSearch);
	}

	function refreshRandomTags() {
		tagActions.refreshRandomTags();
	}

	// ==================== 搜索 ====================
	
	// 获取虚拟路径数据源
	function getVirtualItems(): FsItem[] {
		if (!initialPath) return [];
		try {
			return loadVirtualPathData(initialPath);
		} catch (err) {
			console.error('[ToolbarCard] 加载虚拟路径数据失败:', err);
			return [];
		}
	}
	
	// 虚拟路径搜索处理（用于 VirtualSearchBar）
	function handleVirtualSearch(results: FsItem[], keyword: string) {
		console.log('[ToolbarCard.handleVirtualSearch]', { keyword, resultCount: results.length });
		localSearchStore.keyword.set(keyword);
		localSearchStore.results.set(results);
		localSearchStore.isSearching.set(false);
	}
	
	// 虚拟路径搜索值变化
	function handleVirtualSearchValueChange(val: string) {
		localSearchStore.keyword.set(val);
	}
	
	// 普通路径搜索处理（用于 SearchBar）
	function handleSearch(keyword: string) {
		console.log('[ToolbarCard.handleSearch] 普通路径搜索', { keyword });
		searchActions.handleSearch(keyword);
	}

	function handleSearchSettingsChange(settings: any) {
		searchActions.handleSearchSettingsChange(settings);
	}
</script>

<!-- 工具栏 -->
<FolderToolbar
	onRefresh={onRefresh}
	onToggleFolderTree={handleToggleFolderTree}
	onGoBack={onGoBack}
	onGoForward={onGoForward}
	onGoUp={onGoUp}
	onGoHome={onGoHome}
	onSetHome={onSetHome}
	onToggleDeleteStrategy={handleToggleDeleteStrategy}
	onToggleInlineTree={handleToggleInlineTree}
	showRandomTagBar={ctx.showRandomTagBar}
	onToggleRandomTagBar={handleToggleRandomTagBar}
	virtualMode={virtualMode}
	{vertical}
/>

<!-- 搜索栏 -->
{#if ctx.effectiveShowSearchBar}
	{#if isVirtualInstance}
		<!-- 虚拟路径（历史/书签）：使用简单的前端搜索组件 -->
		<VirtualSearchBar
			placeholder={panelMode === 'history' ? '搜索历史记录...' : '搜索书签...'}
			value={$searchKeyword}
			items={getVirtualItems()}
			onSearch={handleVirtualSearch}
			onValueChange={handleVirtualSearchValueChange}
		/>
	{:else}
		<!-- 普通文件夹：使用完整的后端搜索组件 -->
		<div class="relative">
			<div class="flex items-center gap-1">
				<div class="flex-1">
					<SearchBar
						placeholder="搜索文件..."
						value={$searchKeyword}
						onSearch={handleSearch}
						onSearchChange={setSearchKeyword}
						storageKey="neoview-folder-search-history"
						searchSettings={{
							includeSubfolders: $searchSettings.includeSubfolders,
							showHistoryOnFocus: $searchSettings.showHistoryOnFocus,
							searchInPath: $searchSettings.searchInPath
						}}
						onSettingsChange={handleSearchSettingsChange}
					/>
				</div>
				<button
					class="hover:bg-accent shrink-0 rounded border p-1.5 {ctx.showFavoriteTagPanel
						? 'bg-primary/10 border-primary text-primary'
						: 'border-border'}"
					onclick={handleToggleFavoriteTagPanel}
					title="收藏标签"
				>
					<Star class="h-4 w-4 {ctx.showFavoriteTagPanel ? 'fill-primary' : ''}" />
				</button>
			</div>
			<FavoriteTagPanel
				visible={ctx.showFavoriteTagPanel}
				enableMixed={mixedGenderStore.enabled}
				onClose={handleCloseFavoriteTagPanel}
				onAppendTag={handleAppendTag}
				onUpdateEnableMixed={(v) => { mixedGenderStore.enabled = v; }}
			/>
		</div>
	{/if}
{/if}

<!-- 迁移栏 -->
{#if ctx.effectiveShowMigrationBar}
	<MigrationBar
		showManager={ctx.showMigrationManager}
		onToggleManager={handleToggleMigrationManager}
	/>
{/if}

<!-- 穿透设置栏 -->
{#if $tabShowPenetrateSettingsBar && !isVirtualInstance}
	<PenetrateSettingsBar />
{/if}

<!-- 随机标签栏 -->
{#if ctx.showRandomTagBar}
	<div class="bg-muted/30 border-border flex items-center gap-1.5 border-b px-2 py-1.5">
		<span class="text-muted-foreground shrink-0 text-xs">推荐:</span>
		<div class="flex flex-1 flex-wrap items-center gap-1">
			{#each randomTags as tag (tag.id)}
				<TagChip
					tag={tag.id}
					category={tag.cat}
					display={tag.display}
					color={tag.isCollect ? tag.color : undefined}
					isCollect={tag.isCollect}
					onClick={() => handleRandomTagClick(tag)}
				/>
			{/each}
		</div>
		<button
			class="hover:bg-accent text-muted-foreground rounded p-1"
			onclick={refreshRandomTags}
			title="刷新"
		>
			<RefreshCw class="h-3.5 w-3.5" />
		</button>
	</div>
{/if}

<!-- 选择栏 -->
{#if ctx.effectiveMultiSelectMode}
	<SelectionBar onDelete={onBatchDelete} />
{/if}
