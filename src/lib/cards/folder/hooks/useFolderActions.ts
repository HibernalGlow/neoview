/**
 * useFolderActions - 文件夹面板操作函数
 * 集中管理所有操作，支持虚拟路径的特殊处理
 */

import type { FsItem } from '$lib/types';
import type { FolderState } from './useFolderState.svelte';
import type { ConfirmDialogConfig } from '../types';
import { get } from 'svelte/store';
import { folderTabActions, isVirtualPath } from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';

/**
 * 创建文件夹操作函数
 */
export function createFolderActions(state: FolderState, initialPath?: string) {
	const isVirtual = state.isVirtual;

	// ============ 导航操作 ============

	function handleRefresh() {
		const path = get(state.currentPath);
		if (path) {
			// 清除缓存并重新加载
			if (!isVirtualPath(path)) {
				directoryTreeCache.invalidate(path);
			}
			state.navigationCommand.set({ type: 'init', path });
		}
	}

	function handleNavigate(path: string) {
		state.navigationCommand.set({ type: 'push', path });
	}

	function handleGoBack() {
		const result = folderTabActions.goBack();
		if (result) {
			state.navigationCommand.set({ type: 'history', path: result.path });
		}
	}

	function handleGoForward() {
		const result = folderTabActions.goForward();
		if (result) {
			state.navigationCommand.set({ type: 'history', path: result.path });
		}
	}

	function handleGoUp() {
		const path = get(state.currentPath);
		if (!path || isVirtualPath(path)) return;

		const normalized = path.replace(/\//g, '\\');
		const parts = normalized.split('\\').filter(Boolean);
		if (parts.length <= 1) return;

		parts.pop();
		let parentPath = parts.join('\\');
		if (/^[a-zA-Z]:$/.test(parentPath)) {
			parentPath += '\\';
		}
		state.navigationCommand.set({ type: 'init', path: parentPath });
	}

	function handleGoHome() {
		const home = folderTabActions.goHome();
		if (home) {
			state.navigationCommand.set({ type: 'init', path: home });
		}
	}

	// ============ 文件操作 ============

	function isVideoPath(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		return ['mp4', 'mkv', 'avi', 'mov', 'nov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext);
	}

	function isImagePath(path: string): boolean {
		const ext = path.split('.').pop()?.toLowerCase() || '';
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
	}

	async function handleItemOpen(item: FsItem) {
		if (item.isDir) {
			// 进入目录
			handleNavigate(item.path);
			return;
		}

		try {
			const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
			if (isArchive) {
				await bookStore.openBook(item.path);
			} else if (isVideoPath(item.path) || item.isImage || isImagePath(item.path)) {
				const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
				const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
				await bookStore.openDirectoryAsBook(parentPath);
				await bookStore.navigateToImage(item.path);
			} else {
				await bookStore.openBook(item.path);
			}
		} catch (err) {
			console.error('[FolderActions] Failed to open file:', err);
			showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
		}
	}

	// ============ 删除操作 ============

	function openConfirmDialog(config: ConfirmDialogConfig) {
		state.confirmDialogTitle = config.title;
		state.confirmDialogDescription = config.description;
		state.confirmDialogConfirmText = config.confirmText || '确定';
		state.confirmDialogVariant = config.variant || 'default';
		state.confirmDialogOnConfirm = config.onConfirm;
		state.confirmDialogOpen = true;
	}

	async function executeBatchDelete(paths: string[]) {
		// 虚拟路径模式：从书签/历史中移除
		if (state.isVirtualInstance && initialPath) {
			const { removeVirtualPathItem } = await import('$lib/components/panels/folderPanel/utils/virtualPathLoader');
			let successCount = 0;
			for (const path of paths) {
				if (removeVirtualPathItem(initialPath, path)) {
					successCount++;
				}
			}
			folderTabActions.deselectAll();
			const typeText = initialPath.includes('bookmark') ? '书签' : '历史';
			showSuccessToast('移除成功', `已从${typeText}中移除 ${successCount} 项`);
			return;
		}

		const strategy = get(state.deleteStrategy);
		const actionText = strategy === 'trash' ? '删除' : '永久删除';

		let successCount = 0;
		for (const path of paths) {
			try {
				if (strategy === 'trash') {
					await FileSystemAPI.moveToTrash(path);
				} else {
					await FileSystemAPI.deletePath(path);
				}
				successCount++;
			} catch (err) {
				console.error('删除失败:', path, err);
			}
		}

		folderTabActions.deselectAll();
		handleRefresh();

		if (successCount === paths.length) {
			showSuccessToast(`${actionText}成功`, `已${actionText} ${successCount} 个文件`);
		} else {
			showErrorToast(`部分${actionText}失败`, `成功 ${successCount}/${paths.length}`);
		}
	}

	async function executeSingleDelete(item: FsItem) {
		// 虚拟路径模式：从书签/历史中移除
		if (state.isVirtualInstance && initialPath) {
			const { removeVirtualPathItem } = await import('$lib/components/panels/folderPanel/utils/virtualPathLoader');
			removeVirtualPathItem(initialPath, item.path);
			const typeText = initialPath.includes('bookmark') ? '书签' : '历史';
			showSuccessToast('移除成功', `已从${typeText}中移除`);
			return;
		}

		const strategy = get(state.deleteStrategy);
		const actionText = strategy === 'trash' ? '删除' : '永久删除';

		folderTabActions.removeItem(item.path);

		try {
			if (strategy === 'trash') {
				await FileSystemAPI.moveToTrash(item.path);
			} else {
				await FileSystemAPI.deletePath(item.path);
			}
			showSuccessToast(`${actionText}成功`, item.name);
		} catch (err) {
			showErrorToast(`${actionText}失败`, err instanceof Error ? err.message : String(err));
			handleRefresh();
		}
	}

	function handleDelete(item: FsItem) {
		const selected = get(state.selectedItems);
		const isVirtualMode = state.isVirtualInstance && initialPath;
		const typeText = isVirtualMode ? (initialPath!.includes('bookmark') ? '书签' : '历史') : '';
		const strategy = get(state.deleteStrategy);
		const actionText = isVirtualMode ? `从${typeText}移除` : (strategy === 'trash' ? '删除' : '永久删除');

		// 勾选模式下批量删除
		if (get(state.multiSelectMode) && selected.size > 0) {
			if (!selected.has(item.path)) {
				selected.add(item.path);
			}
			const paths = Array.from(selected);
			openConfirmDialog({
				title: `${actionText}确认`,
				description: isVirtualMode
					? `确定要从${typeText}中移除选中的 ${paths.length} 项吗？`
					: `确定要${actionText}选中的 ${paths.length} 个项目吗？`,
				confirmText: isVirtualMode ? '移除' : actionText,
				variant: isVirtualMode ? 'warning' : 'destructive',
				onConfirm: () => executeBatchDelete(paths)
			});
			return;
		}

		// 单个删除
		if (get(state.deleteMode)) {
			executeSingleDelete(item);
		} else {
			openConfirmDialog({
				title: `${actionText}确认`,
				description: isVirtualMode
					? `确定要从${typeText}中移除 "${item.name}" 吗？`
					: `确定要${actionText} "${item.name}" 吗？`,
				confirmText: isVirtualMode ? '移除' : actionText,
				variant: isVirtualMode ? 'warning' : 'destructive',
				onConfirm: () => executeSingleDelete(item)
			});
		}
	}

	function handleBatchDelete() {
		const selected = get(state.selectedItems);
		if (selected.size === 0) {
			showErrorToast('没有选中的文件', '请先选择要删除的文件');
			return;
		}

		const isVirtualMode = state.isVirtualInstance && initialPath;
		const typeText = isVirtualMode ? (initialPath!.includes('bookmark') ? '书签' : '历史') : '';
		const strategy = get(state.deleteStrategy);
		const actionText = isVirtualMode ? `从${typeText}移除` : (strategy === 'trash' ? '删除' : '永久删除');
		const paths = Array.from(selected);

		openConfirmDialog({
			title: `${actionText}确认`,
			description: isVirtualMode
				? `确定要从${typeText}中移除选中的 ${paths.length} 项吗？`
				: `确定要${actionText}选中的 ${paths.length} 个项目吗？`,
			confirmText: isVirtualMode ? '移除' : actionText,
			variant: isVirtualMode ? 'warning' : 'destructive',
			onConfirm: () => executeBatchDelete(paths)
		});
	}

	// ============ 右键菜单 ============

	function handleContextMenu(event: MouseEvent, item: FsItem) {
		event.preventDefault();
		state.contextMenu = { x: event.clientX, y: event.clientY, item, visible: true };
	}

	function closeContextMenu() {
		state.contextMenu = { ...state.contextMenu, visible: false, item: null };
	}

	// ============ 书签操作 ============

	function handleAddBookmark(item: FsItem) {
		bookmarkStore.add(item);
		showSuccessToast('添加成功', `已添加到书签`);
	}

	// ============ 剪贴板操作 ============

	function handleCopy(item: FsItem) {
		state.clipboardItem = { paths: [item.path], operation: 'copy' };
		try {
			navigator.clipboard.writeText(item.path);
		} catch {}
	}

	function handleCut(item: FsItem) {
		state.clipboardItem = { paths: [item.path], operation: 'cut' };
		try {
			navigator.clipboard.writeText(item.path);
		} catch {}
	}

	function handleCopyPath(item: FsItem) {
		navigator.clipboard.writeText(item.path);
		showSuccessToast('已复制', '路径已复制到剪贴板');
	}

	function handleCopyName(item: FsItem) {
		navigator.clipboard.writeText(item.name);
		showSuccessToast('已复制', '文件名已复制到剪贴板');
	}

	// ============ 系统操作 ============

	async function handleOpenInExplorer(item: FsItem) {
		try {
			await FileSystemAPI.showInFileManager(item.path);
		} catch (err) {
			showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
		}
	}

	async function handleOpenWithSystem(item: FsItem) {
		try {
			await FileSystemAPI.openWithSystem(item.path);
		} catch (err) {
			showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
		}
	}

	async function handleOpenFolderAsBook(item: FsItem) {
		if (!item.isDir) return;
		try {
			await bookStore.openDirectoryAsBook(item.path);
		} catch (err) {
			console.error('[FolderActions] Failed to open folder as book:', err);
		}
	}

	function handleOpenInNewTab(item: FsItem) {
		if (item.isDir) {
			folderTabActions.createTab(item.path);
			handleNavigate(item.path);
		}
	}

	// ============ 工具栏操作 ============

	function handleToggleFolderTree() {
		folderTabActions.toggleFolderTree();
	}

	function handleToggleDeleteStrategy() {
		folderTabActions.toggleDeleteStrategy();
		const strategy = get(state.deleteStrategy);
		const text = strategy === 'trash' ? '移动到回收站' : '永久删除';
		showSuccessToast('删除策略已切换', text);
	}

	return {
		// 导航
		handleRefresh,
		handleNavigate,
		handleGoBack,
		handleGoForward,
		handleGoUp,
		handleGoHome,

		// 文件操作
		handleItemOpen,
		handleDelete,
		handleBatchDelete,

		// 右键菜单
		handleContextMenu,
		closeContextMenu,

		// 书签
		handleAddBookmark,

		// 剪贴板
		handleCopy,
		handleCut,
		handleCopyPath,
		handleCopyName,

		// 系统
		handleOpenInExplorer,
		handleOpenWithSystem,
		handleOpenFolderAsBook,
		handleOpenInNewTab,

		// 工具栏
		handleToggleFolderTree,
		handleToggleDeleteStrategy,

		// 对话框
		openConfirmDialog
	};
}

export type FolderActions = ReturnType<typeof createFolderActions>;
