<script lang="ts">
	/**
	 * FileListPanel - 共享文件列表面板
	 * folder、bookmark、history 三个面板的共享基础组件
	 * 组合 3 张卡片：BreadcrumbTabCard、ToolbarCard、FileListCard
	 */
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { homeDir } from '@tauri-apps/api/path';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	// 卡片组件
	import ToolbarCard from '../folder/cards/ToolbarCard.svelte';
	import FileListCard from '../folder/cards/FileListCard.svelte';

	// 对话框组件
	import FolderContextMenu from '$lib/components/panels/folderPanel/components/FolderContextMenu.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import RenameDialog from '$lib/components/ui/rename/RenameDialog.svelte';
	import ManualTagEditor from '$lib/components/ui/tag/ManualTagEditor.svelte';

	// Context 和 Store
	import { createFolderContext, type PanelMode } from '../folder/context/FolderContext.svelte';
	import {
		folderTabActions,
		isVirtualPath,
		getPanelLayoutStores,
		type PanelMode as StorePanelMode
	} from '$lib/components/panels/folderPanel/stores/folderTabStore';
	import BreadcrumbBar from '$lib/components/panels/folderPanel/components/BreadcrumbBar.svelte';
	import FolderTabBar from '$lib/components/panels/folderPanel/components/FolderTabBar.svelte';
	import { externalNavigationRequest } from '$lib/components/panels/folderPanel/stores/folderPanelStore';
	import { loadVirtualPathData } from '$lib/components/panels/folderPanel/utils/virtualPathLoader';
	import { favoriteTagStore } from '$lib/stores/emm/favoriteTagStore.svelte';
	import {
		bookmarkStore,
		BOOKMARK_LIST_IDS,
		type BookmarkList,
		type BookmarkListFilter
	} from '$lib/stores/bookmark.svelte';
	import { createKeyboardHandler } from '$lib/components/panels/folderPanel/utils/keyboardHandler';
	import { showErrorToast, showSuccessToast } from '$lib/utils/toast';
	import type { FsItem } from '$lib/types';

	// 共享操作
	import { createAllFileActions } from './useFileActions';

	// ==================== Props ====================
	interface Props {
		/** 初始路径（虚拟路径如 'virtual://bookmark' 或普通路径） */
		initialPath?: string;
		/** 面板模式（可选，会自动从 initialPath 推断） */
		mode?: PanelMode;
	}
	let { initialPath: propInitialPath, mode }: Props = $props();
	// 捕获初始值，不创建响应式依赖（props 解构后值已同步可用）
	const initialPathSnapshot = untrack(() => propInitialPath);

	// ==================== Context 初始化 ====================
	const ctx = createFolderContext(initialPathSnapshot);

	// ==================== 按面板类型获取布局 stores ====================
	const panelMode: StorePanelMode = ctx.panelMode as StorePanelMode;
	const layoutStores = getPanelLayoutStores(panelMode);
	const tabBarLayout = layoutStores.tabBarLayout;
	const tabBarWidth = layoutStores.tabBarWidth;
	const breadcrumbPosition = layoutStores.breadcrumbPosition;
	const toolbarPosition = layoutStores.toolbarPosition;

	// ==================== 共享操作初始化 ====================
	const actions = createAllFileActions(ctx, initialPathSnapshot);

	// ==================== 书签列表（仅书签面板） ====================
	let bookmarkLists = $state<BookmarkList[]>([]);
	let activeBookmarkListId = $state<BookmarkListFilter>(BOOKMARK_LIST_IDS.all);

	// 添加书签弹窗状态
	let addBookmarkDialogOpen = $state(false);
	let addBookmarkTargets = $state<FsItem[]>([]);
	let addBookmarkSelectedListIds = $state<string[]>([BOOKMARK_LIST_IDS.default]);
	let newBookmarkListName = $state('');
	let newBookmarkListIsFavorite = $state(false);

	function getBookmarkListsForTags(): BookmarkList[] {
		return bookmarkLists;
	}

	function refreshVirtualBookmarkView() {
		if (ctx.panelMode !== 'bookmark') return;
		if (!initialPathSnapshot || !isVirtualPath(initialPathSnapshot)) return;
		ctx.navigationCommand.set({ type: 'init', path: initialPathSnapshot });
	}

	function switchBookmarkList(listId: BookmarkListFilter) {
		bookmarkStore.setActiveListId(listId);
		refreshVirtualBookmarkView();
	}

	function createBookmarkListFromTopBar() {
		const name = window.prompt('请输入新书签列表名称');
		if (!name || !name.trim()) return;

		const list = bookmarkStore.createList(name.trim());
		bookmarkStore.setActiveListId(list.id);
		showSuccessToast('书签列表已创建', list.name);
		refreshVirtualBookmarkView();
	}

	function resolveBookmarkTargets(item: FsItem): FsItem[] {
		const selectedPaths = Array.from(get(ctx.selectedItems));
		if (selectedPaths.length <= 1 || !selectedPaths.includes(item.path)) {
			return [item];
		}

		const sourceItems = ctx.isVirtualInstance && initialPathSnapshot
			? loadVirtualPathData(initialPathSnapshot)
			: (get(ctx.items) as FsItem[]);

		const byPath = new Map(sourceItems.map((entry) => [entry.path, entry] as const));
		const targets = selectedPaths
			.map((path) => byPath.get(path))
			.filter((entry): entry is FsItem => Boolean(entry));

		if (!targets.some((entry) => entry.path === item.path)) {
			targets.unshift(item);
		}

		return targets.length > 0 ? targets : [item];
	}

	function openAddBookmarkDialog(item: FsItem) {
		addBookmarkTargets = resolveBookmarkTargets(item);

		const activeList = bookmarkStore.getActiveListId();
		addBookmarkSelectedListIds = [
			activeList === BOOKMARK_LIST_IDS.all ? BOOKMARK_LIST_IDS.default : activeList
		];

		newBookmarkListName = '';
		newBookmarkListIsFavorite = false;
		addBookmarkDialogOpen = true;
	}

	function toggleBookmarkDialogList(listId: string) {
		if (addBookmarkSelectedListIds.includes(listId)) {
			addBookmarkSelectedListIds = addBookmarkSelectedListIds.filter((id) => id !== listId);
			return;
		}

		addBookmarkSelectedListIds = [...addBookmarkSelectedListIds, listId];
	}

	function createBookmarkListInDialog() {
		const name = newBookmarkListName.trim();
		if (!name) return;

		const list = bookmarkStore.createList(name, { isFavorite: newBookmarkListIsFavorite });
		addBookmarkSelectedListIds = Array.from(new Set([...addBookmarkSelectedListIds, list.id]));
		newBookmarkListName = '';
		newBookmarkListIsFavorite = false;
		showSuccessToast('书签列表已创建', list.name);
	}

	function confirmAddBookmarkToLists() {
		if (addBookmarkTargets.length === 0) {
			addBookmarkDialogOpen = false;
			return;
		}

		if (addBookmarkSelectedListIds.length === 0) {
			showErrorToast('请选择列表', '至少选择一个书签列表');
			return;
		}

		bookmarkStore.addManyToLists(addBookmarkTargets, addBookmarkSelectedListIds);
		showSuccessToast(
			'书签已添加',
			`${addBookmarkTargets.length} 项已添加到 ${addBookmarkSelectedListIds.length} 个列表`
		);
		addBookmarkDialogOpen = false;
	}

	// 计算当前活动路径（用于面包屑同步）
	const effectiveCurrentPath = $derived.by(() => {
		const activeTab = ctx.displayTabs.find((t) => t.id === ctx.displayActiveTabId);
		return activeTab?.currentPath || '';
	});

	// ==================== 标签编辑状态 ====================
	let tagEditorOpen = $state(false);
	let tagEditorPath = $state('');
	let tagEditorPaths = $state<string[]>([]); // 批量模式
	let tagEditorEmmTags = $state<Array<{ namespace: string; tag: string; translated?: string }>>([]);

	function handleEditTags(item: import('$lib/types').FsItem) {
		// 获取选中项
		const selectedPaths = Array.from(get(ctx.selectedItems));
		
		if (selectedPaths.length > 1) {
			// 批量模式：多个文件选中
			tagEditorPath = selectedPaths[0]; // 第一个用于显示
			tagEditorPaths = selectedPaths;
		} else {
			// 单个文件模式
			tagEditorPath = item.path;
			tagEditorPaths = [item.path];
		}
		tagEditorEmmTags = []; // TODO: 从 emmMetadataStore 加载 EMM 标签
		tagEditorOpen = true;
	}

	// ==================== 键盘处理 ====================
	const handleKeydown = createKeyboardHandler(() => ({
		selectedItems: get(ctx.selectedItems),
		sortedItems: get(ctx.items),
		multiSelectMode: ctx.effectiveMultiSelectMode,
		deleteMode: ctx.effectiveDeleteMode,
		onNavigate: actions.handleNavigate,
		onOpenItem: actions.handleItemOpen,
		onGoBack: actions.handleGoBack,
		onRefresh: actions.handleRefresh,
		onBatchDelete: actions.handleBatchDelete,
		onSelectAll: () => folderTabActions.selectAll(),
		onDeselectAll: () => folderTabActions.deselectAll(),
		onToggleSearchBar: () => folderTabActions.toggleShowSearchBar()
	}));

	// ==================== 外部导航监听 ====================
	$effect(() => {
		if (ctx.isVirtualInstance) return;
		const unsub = externalNavigationRequest.subscribe((req) => {
			if (req) {
				ctx.navigationCommand.set({ type: 'push', path: req.path });
				externalNavigationRequest.set(null);
			}
		});
		return unsub;
	});

	$effect(() => {
		bookmarkLists = bookmarkStore.getLists();
		activeBookmarkListId = bookmarkStore.getActiveListId();

		const unsubLists = bookmarkStore.subscribeLists((lists) => {
			bookmarkLists = lists;
		});

		const unsubActiveList = bookmarkStore.subscribeActiveList((listId) => {
			activeBookmarkListId = listId;
		});

		return () => {
			unsubLists();
			unsubActiveList();
		};
	});

	// ==================== 生命周期 ====================
	onMount(() => {
		(async () => {
			try {
				if (initialPathSnapshot && isVirtualPath(initialPathSnapshot)) {
					// 虚拟实例初始化
					const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
					ctx.localTabState = {
						id: localId,
						title: initialPathSnapshot.includes('bookmark') ? '书签' : '历史',
						currentPath: initialPathSnapshot,
						homePath: initialPathSnapshot
					};
					ctx.homePath = initialPathSnapshot;
					ctx.navigationCommand.set({ type: 'init', path: initialPathSnapshot });
				} else {
					// 普通实例初始化
					const savedHome = localStorage.getItem('neoview-homepage-path');
					const defaultHome = initialPathSnapshot || (await homeDir());
					ctx.homePath = savedHome || defaultHome;
					
					// 检查当前活动标签页是否有路径
					const currentPath = get(ctx.currentPath);
					const activeTab = folderTabActions.getActiveTab();
					console.log('[FileListPanel] onMount - currentPath:', currentPath, 'activeTab.currentPath:', activeTab?.currentPath, 'activeTab.homePath:', activeTab?.homePath, 'ctx.homePath:', ctx.homePath);
					
					// 如果当前标签页没有路径，设置为 homePath
					// 这处理首次打开应用的情况
					if (activeTab && !activeTab.currentPath && !activeTab.homePath) {
						console.log('[FileListPanel] 首次打开，设置标签页路径为:', ctx.homePath);
						folderTabActions.setPath(ctx.homePath, false);
					}
					
					folderTabActions.setHomePath(ctx.homePath);
				}
				if (!favoriteTagStore.isEMMLoaded()) await favoriteTagStore.loadFromEMM();
			} catch (err) {
				console.error('[FileListPanel] Init error:', err);
			}
		})();

		if (!initialPathSnapshot || !isVirtualPath(initialPathSnapshot)) {
			document.addEventListener('keydown', handleKeydown);
		}
		return () => {
			if (!initialPathSnapshot || !isVirtualPath(initialPathSnapshot)) {
				document.removeEventListener('keydown', handleKeydown);
			}
		};
	});
</script>

<!-- 主布局容器 -->
<div class="bg-muted/10 flex h-full overflow-hidden {$breadcrumbPosition === 'left' || $breadcrumbPosition === 'right' ? 'flex-row' : 'flex-col'}">
	<!-- 面包屑在左侧（垂直布局） -->
	{#if $breadcrumbPosition === 'left'}
		<div class="border-r border-border/50 shrink-0">
			<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} vertical={true} externalPath={effectiveCurrentPath} />
		</div>
	{/if}

	<!-- 面包屑在顶部 -->
	{#if $breadcrumbPosition === 'top'}
		<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} externalPath={effectiveCurrentPath} />
	{/if}

	<!-- 书签列表顶栏 Tag（仅书签面板） -->
	{#if ctx.panelMode === 'bookmark'}
		<div class="border-b border-border/50 bg-muted/20">
			<div class="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
				<button
					type="button"
					class="h-7 shrink-0 rounded-full border px-3 text-xs transition-colors {activeBookmarkListId === BOOKMARK_LIST_IDS.all
						? 'border-primary/60 bg-primary/15 text-primary'
						: 'border-border bg-background/80 hover:bg-accent'}"
					onclick={() => switchBookmarkList(BOOKMARK_LIST_IDS.all)}
				>
					全部
				</button>
				{#each getBookmarkListsForTags() as list (list.id)}
					<button
						type="button"
						class="h-7 shrink-0 rounded-full border px-3 text-xs transition-colors {activeBookmarkListId === list.id
							? 'border-primary/60 bg-primary/15 text-primary'
							: 'border-border bg-background/80 hover:bg-accent'}"
						onclick={() => switchBookmarkList(list.id)}
					>
						{list.name}
					</button>
				{/each}
				<Button
					variant="outline"
					size="sm"
					class="h-7 shrink-0 rounded-full px-3 text-xs"
					onclick={createBookmarkListFromTopBar}
				>
					+ 新建列表
				</Button>
			</div>
		</div>
	{/if}

	<!-- 中间主区域（标签栏+工具栏+文件列表） -->
	<div class="flex flex-1 min-w-0 min-h-0 {$tabBarLayout === 'left' || $tabBarLayout === 'right' ? 'flex-row' : 'flex-col'}">
		<!-- 标签栏在左侧 -->
		{#if $tabBarLayout === 'left'}
			<div
				class="flex flex-col border-r border-border/50 shrink-0 relative"
				style="width: {$tabBarWidth}px"
			>
				<FolderTabBar homePath={ctx.homePath} />
				<!-- 拖拽调整宽度的手柄 -->
				<button
					type="button"
					class="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
					aria-label="调整标签栏宽度"
					onmousedown={(e) => {
						e.preventDefault();
						const startX = e.clientX;
						const startWidth = $tabBarWidth;
						const onMouseMove = (ev: MouseEvent) => {
							const newWidth = Math.max(100, Math.min(400, startWidth + ev.clientX - startX));
							folderTabActions.setTabBarWidth(newWidth);
						};
						const onMouseUp = () => {
							document.removeEventListener('mousemove', onMouseMove);
							document.removeEventListener('mouseup', onMouseUp);
						};
						document.addEventListener('mousemove', onMouseMove);
						document.addEventListener('mouseup', onMouseUp);
					}}
				></button>
			</div>
		{/if}

		<!-- 标签栏在顶部 -->
		{#if $tabBarLayout === 'top'}
			<FolderTabBar homePath={ctx.homePath} />
		{/if}

		<!-- 主内容区（工具栏+文件列表） -->
		<div class="flex flex-1 min-w-0 min-h-0 {$toolbarPosition === 'left' || $toolbarPosition === 'right' ? 'flex-row' : 'flex-col'}">
			<!-- 工具栏在左侧 -->
			{#if $toolbarPosition === 'left'}
				<div class="border-r border-border/50 shrink-0">
					<ToolbarCard
						onRefresh={actions.handleRefresh}
						onGoBack={actions.handleGoBack}
						onGoForward={actions.handleGoForward}
						onGoUp={actions.handleGoUp}
						onGoHome={actions.handleGoHome}
						onSetHome={actions.handleSetHome}
						onBatchDelete={actions.handleBatchDelete}
						vertical={true}
					/>
				</div>
			{/if}

			<!-- 工具栏在顶部 -->
			{#if $toolbarPosition === 'top'}
				<ToolbarCard
					onRefresh={actions.handleRefresh}
					onGoBack={actions.handleGoBack}
					onGoForward={actions.handleGoForward}
					onGoUp={actions.handleGoUp}
					onGoHome={actions.handleGoHome}
					onSetHome={actions.handleSetHome}
					onBatchDelete={actions.handleBatchDelete}
				/>
			{/if}

			<!-- 文件列表 -->
			<FileListCard
				onItemOpen={actions.handleItemOpen}
				onItemDelete={actions.handleDelete}
				onItemContextMenu={actions.handleContextMenu}
				onOpenFolderAsBook={actions.handleOpenFolderAsBook}
				onOpenInNewTab={actions.handleOpenInNewTab}
				onNavigate={actions.handleNavigate}
			/>

			<!-- 工具栏在底部 -->
			{#if $toolbarPosition === 'bottom'}
				<div class="border-t border-border/50">
					<ToolbarCard
						onRefresh={actions.handleRefresh}
						onGoBack={actions.handleGoBack}
						onGoForward={actions.handleGoForward}
						onGoUp={actions.handleGoUp}
						onGoHome={actions.handleGoHome}
						onSetHome={actions.handleSetHome}
						onBatchDelete={actions.handleBatchDelete}
					/>
				</div>
			{/if}

			<!-- 工具栏在右侧 -->
			{#if $toolbarPosition === 'right'}
				<div class="border-l border-border/50 shrink-0">
					<ToolbarCard
						onRefresh={actions.handleRefresh}
						onGoBack={actions.handleGoBack}
						onGoForward={actions.handleGoForward}
						onGoUp={actions.handleGoUp}
						onGoHome={actions.handleGoHome}
						onSetHome={actions.handleSetHome}
						onBatchDelete={actions.handleBatchDelete}
						vertical={true}
					/>
				</div>
			{/if}
		</div>

		<!-- 标签栏在底部 -->
		{#if $tabBarLayout === 'bottom'}
			<div class="border-t border-border/50">
				<FolderTabBar homePath={ctx.homePath} />
			</div>
		{/if}

		<!-- 标签栏在右侧 -->
		{#if $tabBarLayout === 'right'}
			<div
				class="flex flex-col border-l border-border/50 shrink-0 relative"
				style="width: {$tabBarWidth}px"
			>
				<!-- 拖拽调整宽度的手柄 -->
				<button
					type="button"
					class="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
					aria-label="调整标签栏宽度"
					onmousedown={(e) => {
						e.preventDefault();
						const startX = e.clientX;
						const startWidth = $tabBarWidth;
						const onMouseMove = (ev: MouseEvent) => {
							const newWidth = Math.max(100, Math.min(400, startWidth - (ev.clientX - startX)));
							folderTabActions.setTabBarWidth(newWidth);
						};
						const onMouseUp = () => {
							document.removeEventListener('mousemove', onMouseMove);
							document.removeEventListener('mouseup', onMouseUp);
						};
						document.addEventListener('mousemove', onMouseMove);
						document.addEventListener('mouseup', onMouseUp);
					}}
				></button>
				<FolderTabBar homePath={ctx.homePath} />
			</div>
		{/if}
	</div>

	<!-- 面包屑在底部 -->
	{#if $breadcrumbPosition === 'bottom'}
		<div class="border-t border-border/50">
			<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} externalPath={effectiveCurrentPath} />
		</div>
	{/if}

	<!-- 面包屑在右侧（垂直布局） -->
	{#if $breadcrumbPosition === 'right'}
		<div class="border-l border-border/50 shrink-0">
			<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} vertical={true} externalPath={effectiveCurrentPath} />
		</div>
	{/if}
</div>

<!-- 右键菜单 -->
<FolderContextMenu
	item={ctx.contextMenu.item}
	x={ctx.contextMenu.x}
	y={ctx.contextMenu.y}
	visible={ctx.contextMenu.visible}
	onClose={actions.closeContextMenu}
	onOpenAsBook={actions.handleItemOpen}
	onBrowse={(item) => ctx.navigationCommand.set({ type: 'push', path: item.path })}
	onOpenInNewTab={actions.handleOpenInNewTab}
	onCopy={actions.handleCopy}
	onCut={actions.handleCut}
	onPaste={actions.handlePaste}
	onDelete={actions.handleDelete}
	onRename={actions.handleRename}
	onAddBookmark={openAddBookmarkDialog}
	onToggleFolderTreePin={actions.handleToggleFolderTreePin}
	onCopyPath={actions.handleCopyPath}
	onCopyName={actions.handleCopyName}
	onOpenInExplorer={actions.handleOpenInExplorer}
	onOpenWithSystem={actions.handleOpenWithSystem}
	onReloadThumbnail={actions.handleReloadThumbnail}
	onEditTags={handleEditTags}
	onUndoDelete={actions.handleUndoDelete}
/>

<!-- 添加书签到列表弹窗 -->
<Dialog.Root bind:open={addBookmarkDialogOpen}>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>添加到书签列表</Dialog.Title>
			<Dialog.Description>
				为选中的 {addBookmarkTargets.length} 项选择要加入的书签列表（支持多选）。
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3 py-2">
			<div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
				<div class="mb-1 text-xs text-muted-foreground">待添加项目</div>
				<div class="max-h-24 space-y-1 overflow-y-auto text-xs">
					{#if addBookmarkTargets.length === 0}
						<div class="text-muted-foreground">无可添加项目</div>
					{:else}
						{#each addBookmarkTargets as target (target.path)}
							<div class="truncate">{target.name}</div>
						{/each}
					{/if}
				</div>
			</div>

			<div>
				<div class="mb-1 text-xs text-muted-foreground">选择列表</div>
				<div class="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2">
					{#each bookmarkLists as list (list.id)}
						<label class="hover:bg-accent/60 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm">
							<input
								type="checkbox"
								checked={addBookmarkSelectedListIds.includes(list.id)}
								onchange={() => toggleBookmarkDialogList(list.id)}
							/>
							<span class="truncate">{list.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="rounded-md border border-border/60 bg-muted/20 p-2">
				<div class="mb-2 text-xs text-muted-foreground">新建列表</div>
				<div class="flex flex-wrap items-center gap-2">
					<Input
						placeholder="输入新列表名称"
						value={newBookmarkListName}
						oninput={(e) => (newBookmarkListName = (e.target as HTMLInputElement).value)}
						class="h-8 min-w-40 flex-1"
					/>
					<label class="flex items-center gap-1 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={newBookmarkListIsFavorite}
							onchange={(e) => (newBookmarkListIsFavorite = (e.target as HTMLInputElement).checked)}
						/>
						收藏夹列表
					</label>
					<Button
						variant="outline"
						size="sm"
						class="h-8"
						onclick={createBookmarkListInDialog}
						disabled={!newBookmarkListName.trim()}
					>
						新建并选中
					</Button>
				</div>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (addBookmarkDialogOpen = false)}>取消</Button>
			<Button onclick={confirmAddBookmarkToLists}>添加书签</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- 确认对话框 -->
<ConfirmDialog
	bind:open={ctx.confirmDialogOpen}
	title={ctx.confirmDialogTitle}
	description={ctx.confirmDialogDescription}
	confirmText={ctx.confirmDialogConfirmText}
	variant={ctx.confirmDialogVariant}
	onConfirm={ctx.confirmDialogOnConfirm}
/>

<!-- 重命名对话框 -->
{#if ctx.renameDialogItem}
	<RenameDialog
		bind:open={ctx.renameDialogOpen}
		title="重命名"
		initialValue={ctx.renameDialogItem.name}
		onConfirm={actions.executeRename}
		onCancel={() => { ctx.renameDialogItem = null; }}
	/>
{/if}

<!-- 标签编辑器 -->
<ManualTagEditor
	bind:open={tagEditorOpen}
	path={tagEditorPath}
	paths={tagEditorPaths}
	emmTags={tagEditorEmmTags}
/>
