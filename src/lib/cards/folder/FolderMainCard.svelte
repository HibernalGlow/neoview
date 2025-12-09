<script lang="ts">
	/**
	 * FolderMainCard - 文件面板主组件（重构版）
	 * 组合 3 张卡片：BreadcrumbTabCard、ToolbarCard、FileListCard
	 * 每张卡片独立管理自己的 UI 状态，store 直接交给功能 hooks
	 */
	import { onMount } from 'svelte';
	import type { FsItem } from '$lib/types';
	import { homeDir } from '@tauri-apps/api/path';
	import { get } from 'svelte/store';

	// 卡片组件
	import BreadcrumbTabCard from './cards/BreadcrumbTabCard.svelte';
	import ToolbarCard from './cards/ToolbarCard.svelte';
	import FileListCard from './cards/FileListCard.svelte';

	// 对话框组件
	import FolderContextMenu from '$lib/components/panels/folderPanel/components/FolderContextMenu.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import RenameDialog from '$lib/components/ui/rename/RenameDialog.svelte';

	// Context 和 Store
	import { createFolderContext } from './context/FolderContext.svelte';
	import {
		folderTabActions,
		isVirtualPath
	} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
	import { externalNavigationRequest } from '$lib/components/panels/folderPanel/stores/folderPanelStore.svelte';
	import { favoriteTagStore } from '$lib/stores/emm/favoriteTagStore.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { bookmarkStore } from '$lib/stores/bookmark.svelte';
	import { historyStore } from '$lib/stores/history.svelte';
	import { historySettingsStore } from '$lib/stores/historySettings.svelte';
	import { FileSystemAPI } from '$lib/api';
	import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
	import { createKeyboardHandler } from '$lib/components/panels/folderPanel/utils/keyboardHandler';
	import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';

	// ==================== Props ====================
	interface Props {
		initialPath?: string;
	}
	let { initialPath: propInitialPath }: Props = $props();

	// ==================== Context 初始化 ====================
	const ctx = createFolderContext(propInitialPath);

	// ==================== 辅助函数 ====================
	function isVideoPath(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		return ['mp4', 'mkv', 'avi', 'mov', 'nov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext);
	}

	function isImagePath(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
	}

	function openConfirmDialog(config: {
		title: string;
		description: string;
		confirmText?: string;
		variant?: 'default' | 'destructive' | 'warning';
		onConfirm: () => void;
	}) {
		ctx.confirmDialogTitle = config.title;
		ctx.confirmDialogDescription = config.description;
		ctx.confirmDialogConfirmText = config.confirmText || '确定';
		ctx.confirmDialogVariant = config.variant || 'default';
		ctx.confirmDialogOnConfirm = config.onConfirm;
		ctx.confirmDialogOpen = true;
	}

	// ==================== 导航操作 ====================
	function handleRefresh() {
		const path = ctx.isVirtualInstance ? propInitialPath : get(ctx.currentPath);
		if (path) {
			if (!isVirtualPath(path)) directoryTreeCache.invalidate(path);
			ctx.navigationCommand.set({ type: 'init', path });
		}
	}

	function handleNavigate(path: string) {
		ctx.navigationCommand.set({ type: 'push', path });
	}

	function handleGoBack() {
		if (ctx.isVirtualInstance) return;
		// 先尝试在当前标签页内后退
		const result = folderTabActions.goBack();
		if (result) {
			ctx.navigationCommand.set({ type: 'history', path: result.path });
			return;
		}
		// 当前标签页历史已到头，尝试切换到上一个标签页
		const prevTab = folderTabActions.goBackTab();
		if (prevTab) {
			// 切换标签页后，加载该标签页的当前路径
			const tab = folderTabActions.getActiveTab();
			if (tab) {
				ctx.navigationCommand.set({ type: 'init', path: tab.currentPath });
			}
		}
	}

	function handleGoForward() {
		if (ctx.isVirtualInstance) return;
		// 先尝试在当前标签页内前进
		const result = folderTabActions.goForward();
		if (result) {
			ctx.navigationCommand.set({ type: 'history', path: result.path });
			return;
		}
		// 当前标签页历史已到头，尝试切换到下一个标签页
		const nextTab = folderTabActions.goForwardTab();
		if (nextTab) {
			// 切换标签页后，加载该标签页的当前路径
			const tab = folderTabActions.getActiveTab();
			if (tab) {
				ctx.navigationCommand.set({ type: 'init', path: tab.currentPath });
			}
		}
	}

	function handleGoUp() {
		const path = get(ctx.currentPath);
		if (!path || isVirtualPath(path)) return;
		const normalized = path.replace(/\//g, '\\');
		const parts = normalized.split('\\').filter(Boolean);
		if (parts.length <= 1) return;
		parts.pop();
		let parentPath = parts.join('\\');
		if (/^[a-zA-Z]:$/.test(parentPath)) parentPath += '\\';
		ctx.navigationCommand.set({ type: 'init', path: parentPath });
	}

	function handleGoHome() {
		if (ctx.isVirtualInstance) {
			ctx.navigationCommand.set({ type: 'init', path: propInitialPath! });
			return;
		}
		const home = folderTabActions.goHome();
		if (home) ctx.navigationCommand.set({ type: 'init', path: home });
	}

	function handleSetHome() {
		if (ctx.isVirtualInstance) return;
		const path = get(ctx.currentPath);
		if (path && !isVirtualPath(path)) {
			localStorage.setItem('neoview-homepage-path', path);
			ctx.homePath = path;
			folderTabActions.setHomePath(path);
			showSuccessToast('主页已设置', path);
		}
	}

	// ==================== 文件操作 ====================
	async function handleItemOpen(item: FsItem) {
		if (item.isDir) return;

		// 虚拟实例同步文件夹
		if (ctx.isVirtualInstance && propInitialPath) {
			const isHistoryMode = propInitialPath.includes('history');
			const isBookmarkMode = propInitialPath.includes('bookmark');
			const shouldSync =
				(isHistoryMode && historySettingsStore.syncFileTreeOnHistorySelect) ||
				(isBookmarkMode && historySettingsStore.syncFileTreeOnBookmarkSelect);

			if (shouldSync) {
				const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
				const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
				externalNavigationRequest.set({ path: parentPath, timestamp: Date.now() });
			}
		}

		try {
			const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
			if (isArchive) {
				// 从历史记录获取上次阅读的页码
				const historyEntry = historyStore.findByPath(item.path);
				const initialPage = historyEntry?.currentPage ?? 0;
				await bookStore.openBook(item.path, { initialPage });
			} else if (isVideoPath(item.path) || item.isImage || isImagePath(item.path)) {
				const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
				const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
				await bookStore.openDirectoryAsBook(parentPath);
				await bookStore.navigateToImage(item.path);
			} else {
				// 其他类型文件也尝试从历史记录获取页码
				const historyEntry = historyStore.findByPath(item.path);
				const initialPage = historyEntry?.currentPage ?? 0;
				await bookStore.openBook(item.path, { initialPage });
			}
		} catch (err) {
			showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
		}
	}

	async function handleOpenFolderAsBook(item: FsItem) {
		if (item.isDir) await bookStore.openDirectoryAsBook(item.path);
	}

	function handleOpenInNewTab(item: FsItem) {
		if (item.isDir) {
			folderTabActions.createTab(item.path);
			handleNavigate(item.path);
		}
	}

	// ==================== 删除操作 ====================
	async function executeBatchDelete(paths: string[]) {
		if (ctx.isVirtualInstance && propInitialPath) {
			const { removeVirtualPathItem } = await import(
				'$lib/components/panels/folderPanel/utils/virtualPathLoader'
			);
			let count = 0;
			for (const p of paths) if (removeVirtualPathItem(propInitialPath, p)) count++;
			folderTabActions.deselectAll();
			showSuccessToast('移除成功', `已移除 ${count} 项`);
			return;
		}
		const strategy = get(ctx.deleteStrategy);
		let successCount = 0;
		let failCount = 0;
		const successPaths: string[] = [];

		for (const p of paths) {
			try {
				strategy === 'trash'
					? await FileSystemAPI.moveToTrash(p)
					: await FileSystemAPI.deletePath(p);
				successCount++;
				successPaths.push(p);
			} catch {
				failCount++;
			}
		}

		if (successPaths.length > 0) {
			directoryTreeCache.removeItemsFromCache(successPaths);
		}

		folderTabActions.deselectAll();

		if (failCount > 0) {
			showErrorToast('部分删除失败', `成功 ${successCount} 个，失败 ${failCount} 个`);
		} else {
			showSuccessToast('删除成功', `已删除 ${successCount} 个文件`);
		}
	}

	async function executeSingleDelete(item: FsItem) {
		if (ctx.isVirtualInstance && propInitialPath) {
			const { removeVirtualPathItem } = await import(
				'$lib/components/panels/folderPanel/utils/virtualPathLoader'
			);
			removeVirtualPathItem(propInitialPath, item.path);
			showSuccessToast('移除成功', `已从列表移除`);
			return;
		}
		const strategy = get(ctx.deleteStrategy);
		folderTabActions.removeItem(item.path);
		try {
			strategy === 'trash'
				? await FileSystemAPI.moveToTrash(item.path)
				: await FileSystemAPI.deletePath(item.path);
			directoryTreeCache.removeItemFromCache(item.path);
			showSuccessToast('删除成功', item.name);
		} catch (err) {
			showErrorToast('删除失败', err instanceof Error ? err.message : String(err));
			handleRefresh();
		}
	}

	function handleDelete(item: FsItem) {
		const isVirtual = ctx.isVirtualInstance && propInitialPath;
		const actionText = isVirtual ? '移除' : get(ctx.deleteStrategy) === 'trash' ? '删除' : '永久删除';
		const selected = get(ctx.selectedItems);

		if (get(ctx.multiSelectMode) && selected.size > 0) {
			if (!selected.has(item.path)) selected.add(item.path);
			const paths = Array.from(selected);
			openConfirmDialog({
				title: `${actionText}确认`,
				description: `确定要${actionText}选中的 ${paths.length} 项吗？`,
				confirmText: actionText,
				variant: isVirtual ? 'warning' : 'destructive',
				onConfirm: () => executeBatchDelete(paths)
			});
			return;
		}

		if (get(ctx.deleteMode)) {
			executeSingleDelete(item);
		} else {
			openConfirmDialog({
				title: `${actionText}确认`,
				description: `确定要${actionText} "${item.name}" 吗？`,
				confirmText: actionText,
				variant: isVirtual ? 'warning' : 'destructive',
				onConfirm: () => executeSingleDelete(item)
			});
		}
	}

	function handleBatchDelete() {
		const selected = get(ctx.selectedItems);
		if (selected.size === 0) {
			showErrorToast('没有选中', '请先选择');
			return;
		}
		const paths = Array.from(selected);
		const isVirtual = ctx.isVirtualInstance && propInitialPath;
		const actionText = isVirtual ? '移除' : '删除';
		openConfirmDialog({
			title: `${actionText}确认`,
			description: `确定要${actionText}选中的 ${paths.length} 项吗？`,
			confirmText: actionText,
			variant: isVirtual ? 'warning' : 'destructive',
			onConfirm: () => executeBatchDelete(paths)
		});
	}

	// ==================== 右键菜单 ====================
	function handleContextMenu(event: MouseEvent, item: FsItem) {
		event.preventDefault();
		ctx.contextMenu = { x: event.clientX, y: event.clientY, item, visible: true };
	}

	function closeContextMenu() {
		ctx.contextMenu = { ...ctx.contextMenu, visible: false, item: null };
	}

	// ==================== 剪贴板操作 ====================
	function handleCopy(item: FsItem) {
		ctx.clipboardItem = { paths: [item.path], operation: 'copy' };
	}

	function handleCut(item: FsItem) {
		ctx.clipboardItem = { paths: [item.path], operation: 'cut' };
	}

	function handleCopyPath(item: FsItem) {
		navigator.clipboard.writeText(item.path);
		showSuccessToast('已复制', '路径');
	}

	function handleCopyName(item: FsItem) {
		navigator.clipboard.writeText(item.name);
		showSuccessToast('已复制', '文件名');
	}

	async function handlePaste() {
		if (!ctx.clipboardItem) return;
		const target = get(ctx.currentPath);
		if (!target || isVirtualPath(target)) return;
		try {
			for (const src of ctx.clipboardItem.paths) {
				if (ctx.clipboardItem.operation === 'copy') await FileSystemAPI.copyPath(src, target);
				else await FileSystemAPI.movePath(src, target);
			}
			if (ctx.clipboardItem.operation === 'cut') ctx.clipboardItem = null;
			handleRefresh();
			showSuccessToast('操作成功', `已${ctx.clipboardItem?.operation === 'copy' ? '复制' : '移动'}`);
		} catch (err) {
			showErrorToast('操作失败', err instanceof Error ? err.message : String(err));
		}
	}

	// ==================== 重命名 ====================
	function handleRename(item: FsItem) {
		ctx.renameDialogItem = item;
		ctx.renameDialogOpen = true;
	}

	async function executeRename(newName: string) {
		if (!ctx.renameDialogItem) return;
		const item = ctx.renameDialogItem;
		try {
			const parentPath = item.path.substring(0, item.path.lastIndexOf(item.name));
			const newPath = parentPath + newName;
			await FileSystemAPI.renamePath(item.path, newPath);
			handleRefresh();
			showSuccessToast('重命名成功', `${item.name} → ${newName}`);
		} catch (err) {
			showErrorToast('重命名失败', err instanceof Error ? err.message : String(err));
		}
		ctx.renameDialogItem = null;
	}

	// ==================== 系统操作 ====================
	async function handleOpenInExplorer(item: FsItem) {
		await FileSystemAPI.showInFileManager(item.path);
	}

	async function handleOpenWithSystem(item: FsItem) {
		await FileSystemAPI.openWithSystem(item.path);
	}

	function handleAddBookmark(item: FsItem) {
		bookmarkStore.add(item);
		showSuccessToast('已添加书签', item.name);
	}

	// ==================== 键盘处理 ====================
	const handleKeydown = createKeyboardHandler(() => ({
		selectedItems: get(ctx.selectedItems),
		sortedItems: get(ctx.items),
		multiSelectMode: ctx.effectiveMultiSelectMode,
		deleteMode: ctx.effectiveDeleteMode,
		onNavigate: handleNavigate,
		onOpenItem: handleItemOpen,
		onGoBack: handleGoBack,
		onRefresh: handleRefresh,
		onBatchDelete: handleBatchDelete,
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
					folderTabActions.setHomePath(ctx.homePath);
					ctx.navigationCommand.set({ type: 'init', path: get(ctx.currentPath) || ctx.homePath });
				}
				if (!favoriteTagStore.isEMMLoaded()) await favoriteTagStore.loadFromEMM();
			} catch (err) {
				console.error('[FolderMainCard] Init error:', err);
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

<div class="bg-muted/10 flex h-full flex-col overflow-hidden">
	<!-- 面包屑 + 页签卡片 -->
	<BreadcrumbTabCard onNavigate={handleNavigate} />

	<!-- 工具栏卡片 -->
	<ToolbarCard
		onRefresh={handleRefresh}
		onGoBack={handleGoBack}
		onGoForward={handleGoForward}
		onGoUp={handleGoUp}
		onGoHome={handleGoHome}
		onSetHome={handleSetHome}
		onBatchDelete={handleBatchDelete}
	/>

	<!-- 文件列表卡片 -->
	<FileListCard
		onItemOpen={handleItemOpen}
		onItemDelete={handleDelete}
		onItemContextMenu={handleContextMenu}
		onOpenFolderAsBook={handleOpenFolderAsBook}
		onOpenInNewTab={handleOpenInNewTab}
		onNavigate={handleNavigate}
	/>
</div>

<!-- 右键菜单 -->
<FolderContextMenu
	item={ctx.contextMenu.item}
	x={ctx.contextMenu.x}
	y={ctx.contextMenu.y}
	visible={ctx.contextMenu.visible}
	onClose={closeContextMenu}
	onOpenAsBook={handleItemOpen}
	onBrowse={(item) => ctx.navigationCommand.set({ type: 'push', path: item.path })}
	onOpenInNewTab={handleOpenInNewTab}
	onCopy={handleCopy}
	onCut={handleCut}
	onPaste={handlePaste}
	onDelete={handleDelete}
	onRename={handleRename}
	onAddBookmark={handleAddBookmark}
	onCopyPath={handleCopyPath}
	onCopyName={handleCopyName}
	onOpenInExplorer={handleOpenInExplorer}
	onOpenWithSystem={handleOpenWithSystem}
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
		onConfirm={executeRename}
		onCancel={() => { ctx.renameDialogItem = null; }}
	/>
{/if}
