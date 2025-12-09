/**
 * useFileActions - 共享文件操作 hooks
 * 提供文件删除、剪贴板、重命名等通用操作
 */
import { get } from 'svelte/store';
import type { FsItem } from '$lib/types';
import { FileSystemAPI } from '$lib/api';
import { ClipboardAPI } from '$lib/api/clipboard';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { historyStore } from '$lib/stores/history.svelte';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { folderTabActions, isVirtualPath } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { externalNavigationRequest } from '$lib/components/panels/folderPanel/stores/folderPanelStore.svelte';
import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';
import type { FolderContextValue } from '../folder/context/FolderContext.svelte';
// ClipboardState is used in ctx.clipboardItem assignments

// ==================== 辅助函数 ====================

export function isVideoPath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['mp4', 'mkv', 'avi', 'mov', 'nov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext);
}

export function isImagePath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
}

// ==================== 确认对话框 ====================

export interface ConfirmDialogOpener {
	(config: {
		title: string;
		description: string;
		confirmText?: string;
		variant?: 'default' | 'destructive' | 'warning';
		onConfirm: () => void;
	}): void;
}

export function createConfirmDialogOpener(ctx: FolderContextValue): ConfirmDialogOpener {
	return (config) => {
		ctx.confirmDialogTitle = config.title;
		ctx.confirmDialogDescription = config.description;
		ctx.confirmDialogConfirmText = config.confirmText || '确定';
		ctx.confirmDialogVariant = config.variant || 'default';
		ctx.confirmDialogOnConfirm = config.onConfirm;
		ctx.confirmDialogOpen = true;
	};
}

// ==================== 导航操作 ====================

export interface NavigationActions {
	handleRefresh: () => void;
	handleNavigate: (path: string) => void;
	handleGoBack: () => void;
	handleGoForward: () => void;
	handleGoUp: () => void;
	handleGoHome: () => void;
	handleSetHome: () => void;
}

export function createNavigationActions(
	ctx: FolderContextValue,
	initialPath?: string
): NavigationActions {
	const handleRefresh = () => {
		const path = ctx.isVirtualInstance ? initialPath : get(ctx.currentPath) as string;
		if (path) {
			if (!isVirtualPath(path)) directoryTreeCache.invalidate(path);
			ctx.navigationCommand.set({ type: 'init', path });
		}
	};

	const handleNavigate = (path: string) => {
		ctx.navigationCommand.set({ type: 'push', path });
	};

	const handleGoBack = () => {
		if (ctx.isVirtualInstance) return;
		const result = folderTabActions.goBack();
		if (result) {
			ctx.navigationCommand.set({ type: 'history', path: result.path });
			return;
		}
		const prevTab = folderTabActions.goBackTab();
		if (prevTab) {
			const tab = folderTabActions.getActiveTab();
			if (tab) {
				ctx.navigationCommand.set({ type: 'init', path: tab.currentPath });
			}
		}
	};

	const handleGoForward = () => {
		if (ctx.isVirtualInstance) return;
		const result = folderTabActions.goForward();
		if (result) {
			ctx.navigationCommand.set({ type: 'history', path: result.path });
			return;
		}
		const nextTab = folderTabActions.goForwardTab();
		if (nextTab) {
			const tab = folderTabActions.getActiveTab();
			if (tab) {
				ctx.navigationCommand.set({ type: 'init', path: tab.currentPath });
			}
		}
	};

	const handleGoUp = () => {
		const path = get(ctx.currentPath) as string;
		if (!path || isVirtualPath(path)) return;
		const normalized = path.replace(/\//g, '\\');
		const parts = normalized.split('\\').filter(Boolean);
		if (parts.length <= 1) return;
		parts.pop();
		let parentPath = parts.join('\\');
		if (/^[a-zA-Z]:$/.test(parentPath)) parentPath += '\\';
		ctx.navigationCommand.set({ type: 'init', path: parentPath });
	};

	const handleGoHome = () => {
		if (ctx.isVirtualInstance) {
			ctx.navigationCommand.set({ type: 'init', path: initialPath! });
			return;
		}
		const home = folderTabActions.goHome();
		if (home) ctx.navigationCommand.set({ type: 'init', path: home });
	};

	const handleSetHome = () => {
		if (ctx.isVirtualInstance) return;
		const path = get(ctx.currentPath) as string;
		if (path && !isVirtualPath(path)) {
			localStorage.setItem('neoview-homepage-path', path);
			ctx.homePath = path;
			folderTabActions.setHomePath(path);
			showSuccessToast('主页已设置', path);
		}
	};

	return {
		handleRefresh,
		handleNavigate,
		handleGoBack,
		handleGoForward,
		handleGoUp,
		handleGoHome,
		handleSetHome
	};
}

// ==================== 文件打开操作 ====================

export interface ItemOpenActions {
	handleItemOpen: (item: FsItem) => Promise<void>;
	handleOpenFolderAsBook: (item: FsItem) => Promise<void>;
	handleOpenInNewTab: (item: FsItem) => void;
}

export function createItemOpenActions(
	ctx: FolderContextValue,
	handleNavigate: (path: string) => void,
	initialPath?: string
): ItemOpenActions {
	const handleItemOpen = async (item: FsItem) => {
		if (item.isDir) return;

		// 虚拟实例同步文件夹
		if (ctx.isVirtualInstance && initialPath) {
			const isHistoryMode = initialPath.includes('history');
			const isBookmarkMode = initialPath.includes('bookmark');
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
				const historyEntry = historyStore.findByPath(item.path);
				const initialPage = historyEntry?.currentPage ?? 0;
				await bookStore.openBook(item.path, { initialPage });
			} else if (isVideoPath(item.path) || item.isImage || isImagePath(item.path)) {
				const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
				const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
				await bookStore.openDirectoryAsBook(parentPath);
				await bookStore.navigateToImage(item.path);
			} else {
				const historyEntry = historyStore.findByPath(item.path);
				const initialPage = historyEntry?.currentPage ?? 0;
				await bookStore.openBook(item.path, { initialPage });
			}
		} catch (err) {
			showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
		}
	};

	const handleOpenFolderAsBook = async (item: FsItem) => {
		if (item.isDir) await bookStore.openDirectoryAsBook(item.path);
	};

	const handleOpenInNewTab = (item: FsItem) => {
		if (item.isDir) {
			folderTabActions.createTab(item.path);
			handleNavigate(item.path);
		}
	};

	return {
		handleItemOpen,
		handleOpenFolderAsBook,
		handleOpenInNewTab
	};
}

// ==================== 删除操作 ====================

export interface DeleteActions {
	handleDelete: (item: FsItem) => void;
	handleBatchDelete: () => void;
}

export function createDeleteActions(
	ctx: FolderContextValue,
	openConfirmDialog: ConfirmDialogOpener,
	handleRefresh: () => void,
	initialPath?: string
): DeleteActions {
	const executeBatchDelete = async (paths: string[]) => {
		if (ctx.isVirtualInstance && initialPath) {
			const { removeVirtualPathItem } = await import(
				'$lib/components/panels/folderPanel/utils/virtualPathLoader'
			);
			let count = 0;
			for (const p of paths) if (removeVirtualPathItem(initialPath, p)) count++;
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
				if (strategy === 'trash') {
						await FileSystemAPI.moveToTrash(p);
					} else {
						await FileSystemAPI.deletePath(p);
					}
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
	};

	const executeSingleDelete = async (item: FsItem) => {
		if (ctx.isVirtualInstance && initialPath) {
			const { removeVirtualPathItem } = await import(
				'$lib/components/panels/folderPanel/utils/virtualPathLoader'
			);
			removeVirtualPathItem(initialPath, item.path);
			showSuccessToast('移除成功', `已从列表移除`);
			return;
		}
		const strategy = get(ctx.deleteStrategy);
		folderTabActions.removeItem(item.path);
		try {
			if (strategy === 'trash') {
				await FileSystemAPI.moveToTrash(item.path);
			} else {
				await FileSystemAPI.deletePath(item.path);
			}
			directoryTreeCache.removeItemFromCache(item.path);
			showSuccessToast('删除成功', item.name);
		} catch (err) {
			showErrorToast('删除失败', err instanceof Error ? err.message : String(err));
			handleRefresh();
		}
	};

	const handleDelete = (item: FsItem) => {
		const isVirtual = ctx.isVirtualInstance && initialPath;
		const strategy = get(ctx.deleteStrategy) as string;
		const actionText = isVirtual ? '移除' : strategy === 'trash' ? '删除' : '永久删除';
		const selected = get(ctx.selectedItems) as Set<string>;

		if ((get(ctx.multiSelectMode) as boolean) && selected.size > 0) {
			if (!selected.has(item.path)) selected.add(item.path);
			const paths = Array.from(selected) as string[];
			openConfirmDialog({
				title: `${actionText}确认`,
				description: `确定要${actionText}选中的 ${paths.length} 项吗？`,
				confirmText: actionText,
				variant: isVirtual ? 'warning' : 'destructive',
				onConfirm: () => executeBatchDelete(paths)
			});
			return;
		}

		if (get(ctx.deleteMode) as boolean) {
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
	};

	const handleBatchDelete = () => {
		const selected = get(ctx.selectedItems) as Set<string>;
		if (selected.size === 0) {
			showErrorToast('没有选中', '请先选择');
			return;
		}
		const paths = Array.from(selected) as string[];
		const isVirtual = ctx.isVirtualInstance && initialPath;
		const actionText = isVirtual ? '移除' : '删除';
		openConfirmDialog({
			title: `${actionText}确认`,
			description: `确定要${actionText}选中的 ${paths.length} 项吗？`,
			confirmText: actionText,
			variant: isVirtual ? 'warning' : 'destructive',
			onConfirm: () => executeBatchDelete(paths)
		});
	};

	return {
		handleDelete,
		handleBatchDelete
	};
}

// ==================== 剪贴板操作 ====================

export interface ClipboardActions {
	handleCopy: (item: FsItem) => Promise<void>;
	handleCut: (item: FsItem) => Promise<void>;
	handleCopyPath: (item: FsItem) => void;
	handleCopyName: (item: FsItem) => void;
	handlePaste: () => Promise<void>;
}

export function createClipboardActions(
	ctx: FolderContextValue,
	handleRefresh: () => void
): ClipboardActions {
	const handleCopy = async (item: FsItem) => {
		try {
			await ClipboardAPI.copyFiles([item.path]);
			ctx.clipboardItem = { paths: [item.path], operation: 'copy' };
			showSuccessToast('已复制', item.name);
		} catch (err) {
			console.error('[Clipboard] Copy failed:', err);
			ctx.clipboardItem = { paths: [item.path], operation: 'copy' };
			showSuccessToast('已复制', '(仅应用内)');
		}
	};

	const handleCut = async (item: FsItem) => {
		try {
			await ClipboardAPI.cutFiles([item.path]);
			ctx.clipboardItem = { paths: [item.path], operation: 'cut' };
			showSuccessToast('已剪切', item.name);
		} catch (err) {
			console.error('[Clipboard] Cut failed:', err);
			ctx.clipboardItem = { paths: [item.path], operation: 'cut' };
			showSuccessToast('已剪切', '(仅应用内)');
		}
	};

	const handleCopyPath = (item: FsItem) => {
		navigator.clipboard.writeText(item.path);
		showSuccessToast('已复制', '路径');
	};

	const handleCopyName = (item: FsItem) => {
		navigator.clipboard.writeText(item.name);
		showSuccessToast('已复制', '文件名');
	};

	const handlePaste = async () => {
		const target = get(ctx.currentPath) as string;
		if (!target || isVirtualPath(target)) return;

		try {
			const clipboardState = await ClipboardAPI.readFiles();
			
			if (clipboardState && clipboardState.files.length > 0) {
				const { files, isCut } = clipboardState;
				let successCount = 0;
				
				for (const src of files) {
					try {
						if (isCut) {
							await FileSystemAPI.movePath(src, target);
						} else {
							await FileSystemAPI.copyPath(src, target);
						}
						successCount++;
					} catch (err) {
						console.error('[Clipboard] Paste failed for:', src, err);
					}
				}
				
				if (isCut) {
					ClipboardAPI.clearCutState();
					ctx.clipboardItem = null;
				}
				
				handleRefresh();
				const actionText = isCut ? '移动' : '复制';
				if (successCount === files.length) {
					showSuccessToast(`${actionText}成功`, `${successCount} 个文件`);
				} else {
					showErrorToast(`部分${actionText}失败`, `成功 ${successCount}/${files.length}`);
				}
				return;
			}
			
			if (ctx.clipboardItem) {
				const { paths, operation } = ctx.clipboardItem;
				let successCount = 0;
				
				for (const src of paths) {
					try {
						if (operation === 'cut') {
							await FileSystemAPI.movePath(src, target);
						} else {
							await FileSystemAPI.copyPath(src, target);
						}
						successCount++;
					} catch (err) {
						console.error('[Clipboard] Paste failed for:', src, err);
					}
				}
				
				if (operation === 'cut') {
					ctx.clipboardItem = null;
				}
				
				handleRefresh();
				const actionText = operation === 'cut' ? '移动' : '复制';
				if (successCount === paths.length) {
					showSuccessToast(`${actionText}成功`, `${successCount} 个文件`);
				} else {
					showErrorToast(`部分${actionText}失败`, `成功 ${successCount}/${paths.length}`);
				}
				return;
			}
			
			showErrorToast('剪贴板为空', '没有可粘贴的文件');
		} catch (err) {
			console.error('[Clipboard] Paste error:', err);
			showErrorToast('粘贴失败', err instanceof Error ? err.message : String(err));
		}
	};

	return {
		handleCopy,
		handleCut,
		handleCopyPath,
		handleCopyName,
		handlePaste
	};
}

// ==================== 重命名操作 ====================

export interface RenameActions {
	handleRename: (item: FsItem) => void;
	executeRename: (newName: string) => Promise<void>;
}

export function createRenameActions(
	ctx: FolderContextValue,
	handleRefresh: () => void
): RenameActions {
	const handleRename = (item: FsItem) => {
		ctx.renameDialogItem = item;
		ctx.renameDialogOpen = true;
	};

	const executeRename = async (newName: string) => {
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
	};

	return {
		handleRename,
		executeRename
	};
}

// ==================== 系统操作 ====================

export interface SystemActions {
	handleOpenInExplorer: (item: FsItem) => Promise<void>;
	handleOpenWithSystem: (item: FsItem) => Promise<void>;
	handleAddBookmark: (item: FsItem) => void;
	handleReloadThumbnail: (item: FsItem) => Promise<void>;
}

export function createSystemActions(): SystemActions {
	const handleOpenInExplorer = async (item: FsItem) => {
		await FileSystemAPI.showInFileManager(item.path);
	};

	const handleOpenWithSystem = async (item: FsItem) => {
		await FileSystemAPI.openWithSystem(item.path);
	};

	const handleAddBookmark = (item: FsItem) => {
		bookmarkStore.add(item);
		showSuccessToast('已添加书签', item.name);
	};

	const handleReloadThumbnail = async (item: FsItem) => {
		try {
			const { reloadThumbnail } = await import('$lib/stores/thumbnailStoreV3.svelte');
			// 获取父目录作为 currentDir
			const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
			const parentDir = lastSep > 0 ? item.path.substring(0, lastSep) : '';
			await reloadThumbnail(item.path, parentDir);
			showSuccessToast('缩略图已重载', item.name);
		} catch (err) {
			showErrorToast('重载失败', err instanceof Error ? err.message : String(err));
		}
	};

	return {
		handleOpenInExplorer,
		handleOpenWithSystem,
		handleAddBookmark,
		handleReloadThumbnail
	};
}

// ==================== 右键菜单操作 ====================

export interface ContextMenuActions {
	handleContextMenu: (event: MouseEvent, item: FsItem) => void;
	closeContextMenu: () => void;
}

export function createContextMenuActions(ctx: FolderContextValue): ContextMenuActions {
	const handleContextMenu = (event: MouseEvent, item: FsItem) => {
		event.preventDefault();
		ctx.contextMenu = { x: event.clientX, y: event.clientY, item, visible: true };
	};

	const closeContextMenu = () => {
		ctx.contextMenu = { ...ctx.contextMenu, visible: false, item: null };
	};

	return {
		handleContextMenu,
		closeContextMenu
	};
}

// ==================== 组合所有操作 ====================

export interface AllFileActions extends 
	NavigationActions, 
	ItemOpenActions, 
	DeleteActions, 
	ClipboardActions, 
	RenameActions, 
	SystemActions, 
	ContextMenuActions {
	openConfirmDialog: ConfirmDialogOpener;
}

export function createAllFileActions(
	ctx: FolderContextValue,
	initialPath?: string
): AllFileActions {
	const openConfirmDialog = createConfirmDialogOpener(ctx);
	const navigationActions = createNavigationActions(ctx, initialPath);
	const itemOpenActions = createItemOpenActions(ctx, navigationActions.handleNavigate, initialPath);
	const deleteActions = createDeleteActions(ctx, openConfirmDialog, navigationActions.handleRefresh, initialPath);
	const clipboardActions = createClipboardActions(ctx, navigationActions.handleRefresh);
	const renameActions = createRenameActions(ctx, navigationActions.handleRefresh);
	const systemActions = createSystemActions();
	const contextMenuActions = createContextMenuActions(ctx);

	return {
		...navigationActions,
		...itemOpenActions,
		...deleteActions,
		...clipboardActions,
		...renameActions,
		...systemActions,
		...contextMenuActions,
		openConfirmDialog
	};
}
