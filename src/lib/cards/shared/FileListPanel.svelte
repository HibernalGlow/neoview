<script lang="ts">
	/**
	 * FileListPanel - 共享文件列表面板
	 * folder、bookmark、history 三个面板的共享基础组件
	 * 组合 3 张卡片：BreadcrumbTabCard、ToolbarCard、FileListCard
	 */
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { homeDir } from '@tauri-apps/api/path';

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
	import { favoriteTagStore } from '$lib/stores/emm/favoriteTagStore.svelte';
	import { createKeyboardHandler } from '$lib/components/panels/folderPanel/utils/keyboardHandler';

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

	// ==================== Context 初始化 ====================
	const ctx = createFolderContext(propInitialPath);

	// ==================== 按面板类型获取布局 stores ====================
	const panelMode: StorePanelMode = ctx.panelMode as StorePanelMode;
	const layoutStores = getPanelLayoutStores(panelMode);
	const tabBarLayout = layoutStores.tabBarLayout;
	const tabBarWidth = layoutStores.tabBarWidth;
	const breadcrumbPosition = layoutStores.breadcrumbPosition;
	const toolbarPosition = layoutStores.toolbarPosition;

	// ==================== 共享操作初始化 ====================
	const actions = createAllFileActions(ctx, propInitialPath);

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

	// ==================== 生命周期 ====================
	onMount(() => {
		(async () => {
			try {
				if (propInitialPath && isVirtualPath(propInitialPath)) {
					// 虚拟实例初始化
					const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
					ctx.localTabState = {
						id: localId,
						title: propInitialPath.includes('bookmark') ? '书签' : '历史',
						currentPath: propInitialPath,
						homePath: propInitialPath
					};
					ctx.homePath = propInitialPath;
					ctx.navigationCommand.set({ type: 'init', path: propInitialPath });
				} else {
					// 普通实例初始化
					const savedHome = localStorage.getItem('neoview-homepage-path');
					const defaultHome = propInitialPath || (await homeDir());
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

		if (!propInitialPath || !isVirtualPath(propInitialPath)) {
			document.addEventListener('keydown', handleKeydown);
		}
		return () => {
			if (!propInitialPath || !isVirtualPath(propInitialPath)) {
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
			<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} vertical={true} />
		</div>
	{/if}

	<!-- 面包屑在顶部 -->
	{#if $breadcrumbPosition === 'top'}
		<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} />
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
				<div
					class="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
					role="separator"
					tabindex="0"
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
				></div>
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
				<div
					class="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
					role="separator"
					tabindex="0"
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
				></div>
				<FolderTabBar homePath={ctx.homePath} />
			</div>
		{/if}
	</div>

	<!-- 面包屑在底部 -->
	{#if $breadcrumbPosition === 'bottom'}
		<div class="border-t border-border/50">
			<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} />
		</div>
	{/if}

	<!-- 面包屑在右侧（垂直布局） -->
	{#if $breadcrumbPosition === 'right'}
		<div class="border-l border-border/50 shrink-0">
			<BreadcrumbBar onNavigate={actions.handleNavigate} homePath={ctx.homePath} vertical={true} />
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
	onAddBookmark={actions.handleAddBookmark}
	onToggleBookmarkPin={actions.handleToggleBookmarkPin}
	onCopyPath={actions.handleCopyPath}
	onCopyName={actions.handleCopyName}
	onOpenInExplorer={actions.handleOpenInExplorer}
	onOpenWithSystem={actions.handleOpenWithSystem}
	onReloadThumbnail={actions.handleReloadThumbnail}
	onEditTags={handleEditTags}
	onUndoDelete={actions.handleUndoDelete}
/>

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
