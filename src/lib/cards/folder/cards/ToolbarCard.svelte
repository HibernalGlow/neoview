<script lang="ts">
	/**
	 * ToolbarCard - 工具栏卡片
	 * 独立管理工具栏相关的 UI 状态
	 */
	import { get } from 'svelte/store';
	import { Star, RefreshCw } from '@lucide/svelte';
	import TagChip from '$lib/components/ui/TagChip.svelte';
	import FolderToolbar from '$lib/components/panels/folderPanel/components/FolderToolbar.svelte';
	import MigrationBar from '$lib/components/panels/folderPanel/components/MigrationBar.svelte';
	import SelectionBar from '$lib/components/panels/folderPanel/components/SelectionBar.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import FavoriteTagPanel from '$lib/components/panels/folderPanel/components/FavoriteTagPanel.svelte';
	
	import { getFolderContext } from '../context/FolderContext.svelte';
	import { folderTabActions, isVirtualPath } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
	import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';
	import { showSuccessToast } from '$lib/utils/toast';
	import { createSearchActions } from '../hooks/useSearchActions';
	import { createTagActions, type RandomTag } from '../hooks/useTagActions.svelte';
	import { mixedGenderStore, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';

	// ==================== Props ====================
	interface Props {
		onRefresh: () => void;
		onGoBack: () => void;
		onGoForward: () => void;
		onGoUp: () => void;
		onGoHome: () => void;
		onSetHome: () => void;
		onBatchDelete: () => void;
	}
	let { onRefresh, onGoBack, onGoForward, onGoUp, onGoHome, onSetHome, onBatchDelete }: Props = $props();

	// ==================== Context ====================
	const ctx = getFolderContext();
	const { 
		isVirtualInstance, 
		panelMode,
		searchKeyword,
		searchSettings,
		deleteStrategy
	} = ctx;
	
	// 转换为 FolderToolbar 需要的 virtualMode 格式
	const virtualMode = $derived(panelMode === 'folder' ? null : panelMode);

	// ==================== Hooks ====================
	const searchActions = createSearchActions();
	const tagActions = createTagActions(
		() => get(searchKeyword),
		(kw) => folderTabActions.setSearchKeyword(kw)
	);
	let randomTags = $derived(tagActions.randomTags);

	// ==================== 工具栏操作 ====================
	function handleToggleFolderTree() {
		folderTabActions.toggleFolderTree();
	}

	function handleToggleDeleteStrategy() {
		folderTabActions.toggleDeleteStrategy();
		showSuccessToast('删除策略', get(deleteStrategy) === 'trash' ? '回收站' : '永久');
	}

	function handleToggleInlineTree() {
		folderTabActions.toggleInlineTreeMode();
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
		tagActions.handleRandomTagClick(tag, searchActions.handleSearch);
	}

	function refreshRandomTags() {
		tagActions.refreshRandomTags();
	}

	// ==================== 搜索 ====================
	function handleSearch(keyword: string) {
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
/>

<!-- 搜索栏 -->
{#if ctx.effectiveShowSearchBar}
	<div class="relative">
		<div class="flex items-center gap-1">
			<div class="flex-1">
				<SearchBar
					placeholder="搜索文件..."
					value={$searchKeyword}
					onSearch={handleSearch}
					onSearchChange={(q) => folderTabActions.setSearchKeyword(q)}
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

<!-- 迁移栏 -->
{#if ctx.effectiveShowMigrationBar}
	<MigrationBar
		showManager={ctx.showMigrationManager}
		onToggleManager={handleToggleMigrationManager}
	/>
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
