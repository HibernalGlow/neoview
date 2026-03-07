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
import { folderTreePinStore } from '$lib/stores/folderTreePin.svelte';
import { unifiedHistoryStore } from '$lib/stores/unifiedHistory.svelte';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import { folderTabActions, isVirtualPath } from '$lib/components/panels/folderPanel/stores/folderTabStore';
import { externalNavigationRequest } from '$lib/components/panels/folderPanel/stores/folderPanelStore';
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
		// 只在当前标签页内后退，不支持跨标签页
		const result = folderTabActions.goBack();
		if (result) {
			ctx.navigationCommand.set({ type: 'history', path: result.path });
		}
	};

	const handleGoForward = () => {
		if (ctx.isVirtualInstance) return;
		// 只在当前标签页内前进，不支持跨标签页
		const result = folderTabActions.goForward();
		if (result) {
			ctx.navigationCommand.set({ type: 'history', path: result.path });
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
		// 使用 'pop' 类型，让 FolderStack 智能处理向上导航
		// 如果父目录在 layers 中，直接切换；否则在栈开头插入
		ctx.navigationCommand.set({ type: 'pop' });
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
		// 文件夹：在虚拟实例中需要导航到 folder 面板
		if (item.isDir) {
			if (ctx.isVirtualInstance && initialPath) {
				// 虚拟实例（历史/书签面板）：发送导航请求到 folder 面板
				externalNavigationRequest.set({ path: item.path, timestamp: Date.now() });
			}
			return;
		}

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
			// 如果是快捷方式，使用目标路径
			const effectivePath = item.targetPath || item.path;
			// 对于 .lnk 文件，文件名可能需要特殊处理，但这里我们主要关心打开行为
			
			const isArchive = await FileSystemAPI.isSupportedArchive(effectivePath);
			
			if (isArchive) {
				const historyEntry = unifiedHistoryStore.findByPath(effectivePath);
				const initialPage = historyEntry?.currentIndex ?? 0;
				await bookStore.openBook(effectivePath, { initialPage });
			} else if (isVideoPath(effectivePath) || item.isImage || isImagePath(effectivePath)) {
				const lastSep = Math.max(effectivePath.lastIndexOf('/'), effectivePath.lastIndexOf('\\'));
				const parentPath = lastSep > 0 ? effectivePath.substring(0, lastSep) : effectivePath;
				
				await bookStore.openDirectoryAsBook(parentPath, { skipHistory: true });
				await bookStore.navigateToImage(effectivePath, { skipHistoryUpdate: true });
				bookStore.setSingleFileMode(true, effectivePath);
				
				const name = item.name || effectivePath.split(/[\\/]/).pop() || effectivePath;
				const currentPage = bookStore.currentPageIndex;
				const totalPages = bookStore.currentBook?.totalPages || 1;
				// 使用 pathStack 精确记录历史
				const pathStack = bookStore.buildPathStack();
				console.log('📝 [History] Adding video/image history with pathStack:', { pathStack, name, currentPage, totalPages });
				unifiedHistoryStore.add(pathStack, currentPage, totalPages, { displayName: name });
			} else {
				// Fallback for other files
				const historyEntry = unifiedHistoryStore.findByPath(effectivePath);
				const initialPage = historyEntry?.currentIndex ?? 0;
				await bookStore.openBook(effectivePath, { initialPage });
			}
		} catch (err) {
			showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
		}
	};

	const handleOpenFolderAsBook = async (item: FsItem) => {
		if (item.isDir) {
			// 查找历史记录，恢复上次阅读位置
			const historyEntry = unifiedHistoryStore.findByPath(item.path);
			const initialPage = historyEntry?.currentIndex ?? 0;
			const initialFilePath = historyEntry?.currentFilePath;
			await bookStore.openDirectoryAsBook(item.path, { initialPage, initialFilePath });
		}
	};

	const handleOpenInNewTab = (item: FsItem) => {
		if (item.isDir) {
			// 创建新标签页并导航
			folderTabActions.createTab(item.path);
			if (ctx.isVirtualInstance && initialPath) {
				// 虚拟实例（历史/书签面板）：发送导航请求到 folder 面板
				externalNavigationRequest.set({ path: item.path, timestamp: Date.now() });
			} else {
				handleNavigate(item.path);
			}
		} else {
			// 文件：打开其所在文件夹并定位
			const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
			const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
			folderTabActions.createTab(parentPath);
			// 设置待聚焦的文件路径，让 FolderStack 在加载完成后定位到该文件
			folderTabActions.focusOnPath(item.path);
			if (ctx.isVirtualInstance && initialPath) {
				externalNavigationRequest.set({ path: parentPath, timestamp: Date.now() });
			} else {
				handleNavigate(parentPath);
			}
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
	handleUndoDelete: () => Promise<void>;
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
		let firstError: string | null = null;

		// 删除前释放相关资源（解决文件占用问题）
		await FileSystemAPI.releaseResourcesForPaths(paths);

		for (const p of paths) {
			try {
				if (strategy === 'trash') {
					await FileSystemAPI.moveToTrashAsync(p);
				} else {
					await FileSystemAPI.deletePath(p);
				}
				successCount++;
				successPaths.push(p);
			} catch (err) {
				failCount++;
				if (!firstError) {
					firstError = err instanceof Error ? err.message : String(err);
				}
			}
		}

		if (successPaths.length > 0) {
			directoryTreeCache.removeItemsFromCache(successPaths);
			if (strategy === 'trash') {
				FileSystemAPI.recordTrashDeletion(successPaths);
			}
		}

		handleRefresh();
		folderTabActions.deselectAll();

		if (failCount > 0) {
			showErrorToast(
				'部分删除失败',
				firstError ? `成功 ${successCount} 个，失败 ${failCount} 个：${firstError}` : `成功 ${successCount} 个，失败 ${failCount} 个`
			);
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

		// 删除前释放相关资源（解决文件占用问题）
		await FileSystemAPI.releaseResourcesForPath(item.path);

		folderTabActions.removeItem(item.path);
		try {
			if (strategy === 'trash') {
				await FileSystemAPI.moveToTrashAsync(item.path);
			} else {
				await FileSystemAPI.deletePath(item.path);
			}
			if (strategy === 'trash') {
				FileSystemAPI.recordTrashDeletion([item.path]);
			}
			directoryTreeCache.removeItemFromCache(item.path);
			showSuccessToast('删除成功', item.name);
		} catch (err) {
			handleRefresh();
			showErrorToast('删除失败', err instanceof Error ? err.message : String(err));
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

	// 撤回上一次删除
	const handleUndoDelete = async () => {
		try {
			const restoredPaths = await FileSystemAPI.undoRecordedTrashDelete();
			if (restoredPaths && restoredPaths.length > 0) {
				// 刷新目录以显示恢复的文件
				handleRefresh();
				const tip =
					restoredPaths.length === 1
						? (restoredPaths[0].split(/[\\/]/).pop() || restoredPaths[0])
						: `已恢复 ${restoredPaths.length} 项`;
				showSuccessToast('撤回成功', tip);
			} else {
				showErrorToast('撤回失败', '没有可撤回的删除操作');
			}
		} catch (err) {
			showErrorToast('撤回失败', err instanceof Error ? err.message : String(err));
		}
	};

	return {
		handleDelete,
		handleBatchDelete,
		handleUndoDelete
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
			// 重命名前释放相关资源，避免当前打开内容或缓存持有句柄
			await FileSystemAPI.releaseResourcesForPath(item.path);
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
	handleToggleFolderTreePin: (item: FsItem) => void;
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

	const handleToggleFolderTreePin = (item: FsItem) => {
		const pinned = folderTreePinStore.toggle(item.path);
		showSuccessToast(pinned ? '已置顶到文件树' : '已取消文件树置顶', item.name);
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
		handleToggleFolderTreePin,
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
