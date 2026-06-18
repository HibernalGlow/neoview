/**
 * 文件系统导航工具
 * 用于打开文件、文件夹、压缩包等
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { bookStore } from '$lib/stores/book.svelte';
import { FileSystemAPI } from '$lib/api';
import { setActivePanelTab } from '$lib/stores';
import { isVideoFile } from '$lib/utils/videoUtils';
import { folderPanelActions } from '$lib/components/panels/folderPanel/stores/folderPanelStore';

/**
 * 支持的图片扩展名
 */
const IMAGE_EXTENSIONS = [
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'avif',
	'jxl',
	'bmp',
	'tiff',
	'tif',
	'ico',
	'svg'
];

/**
 * 判断是否为图片文件
 */
function isImageFile(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Opens a file system item (file or folder) with support for "Silent Sync" (updating file browser without switching tabs).
 *
 * @param path Absolute path to the item
 * @param isDir Whether the item is a directory
 * @param options Configuration options
 */
export async function openFileSystemItem(
	path: string,
	isDir: boolean,
	options: {
		syncFileTree?: boolean;
		page?: number; // For books: target page
		totalPages?: number; // For books: total pages (for validation if needed)
		forceBookOpen?: boolean;
		folderSyncMode?: 'enter' | 'select';
		forceInApp?: boolean; // 强制在应用内打开（命令行启动时使用）
	} = {}
) {
	const { syncFileTree = false, page = 0, folderSyncMode = 'enter', forceInApp = false } = options;

	console.log(`📂 Open Item: ${path}, isDir: ${isDir}, sync: ${syncFileTree}`);

	// 1. Sync File Tree (Silent Jump)
	if (syncFileTree) {
		try {
			let targetPath = path;

			// If it is a folder and mode is 'enter', we append a separator so that getParentDirectory returns the folder itself.
			// This causes the file browser to ENTER the folder.
			// If mode is 'select', we leave it as is, so it navigates to parent and selects the folder.
			if (isDir && folderSyncMode === 'enter') {
				const hasBackslash = targetPath.includes('\\');
				const separator = hasBackslash ? '\\' : '/';
				if (!targetPath.endsWith(separator)) {
					targetPath += separator;
				}
			}

			console.log('🌳 Syncing file tree to:', targetPath);

			// 导航到新文件浏览面板
			await folderPanelActions.navigateToPath(targetPath);
		} catch (err) {
			console.debug('Sync file tree failed:', err);
		}
	}

	// 2. Open Content
	if (options.forceBookOpen) {
		await bookStore.openBook(path, { initialPage: page });
		return;
	}

	if (isDir) {
		// 如果是强制在应用内打开（CLI 启动），在 viewer 中打开文件夹作为书籍
		if (forceInApp) {
			console.log('📂 forceInApp: opening directory as book in viewer', path);
			// 查找历史记录，恢复上次阅读位置
			const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
			const historyEntry = unifiedHistoryStore.findByPath(path);
			const initialPage = historyEntry?.currentIndex ?? 0;
			const initialFilePath = historyEntry?.currentFilePath;
			await bookStore.openDirectoryAsBook(path, { initialPage, initialFilePath });
			return;
		}
		// If NOT syncing silently, we assume the user wants to switch to the file browser and see the folder.
		if (!syncFileTree) {
			// We use the same logic as above to ensure we enter the folder
			let targetPath = path;
			const hasBackslash = targetPath.includes('\\');
			const separator = hasBackslash ? '\\' : '/';
			if (!targetPath.endsWith(separator)) {
				targetPath += separator;
			}

			// 导航到新文件浏览面板
			await folderPanelActions.navigateToPath(targetPath);
			setActivePanelTab('folder');
		}
	} else {
		// File
		try {
			// Check if it is a supported archive/book or a standalone video/image file
			const isArchive = await FileSystemAPI.isSupportedArchive(path);
			const isVideo = !isArchive && isVideoFile(path);
			const isImage = !isArchive && !isVideo && isImageFile(path);

			if (isArchive) {
				// 压缩包：作为书籍直接打开
				await bookStore.openBook(path, { initialPage: page });
			} else if (isVideo || isImage) {
				// 视频或图片：打开父文件夹作为书籍，然后跳转到该文件
				const fileType = isVideo ? '🎬 video' : '🖼️ image';
				console.log(`${fileType} openFileSystemItem: opening via parent folder book`, path);
				let parentDir = path;
				const lastBackslash = path.lastIndexOf('\\');
				const lastSlash = path.lastIndexOf('/');
				const lastSeparator = Math.max(lastBackslash, lastSlash);
				if (lastSeparator > 0) {
					parentDir = path.substring(0, lastSeparator);
				}
				console.log('📁 Parent directory:', parentDir);
				// 【优化】跳过文件夹的历史记录，只记录视频/图片文件
				await bookStore.openDirectoryAsBook(parentDir, { skipHistory: true });
				await bookStore.navigateToImage(path, { skipHistoryUpdate: true });
				try {
					const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
					const name = path.split(/[\\/]/).pop() || path;
					// 获取当前页面索引和总页数
					const currentPage = bookStore.currentPageIndex;
					const totalPages = bookStore.currentBook?.totalPages || 1;
					const pathStack = bookStore.buildPathStack();
					console.log('📝 [History Debug] Adding video/image history:', {
						pathStack,
						name,
						currentPage,
						totalPages
					});
					unifiedHistoryStore.add(pathStack, currentPage, totalPages, { displayName: name });
					console.log('✅ [History Debug] History added successfully');
				} catch (historyError) {
					console.error('Failed to add history entry from openFileSystemItem:', historyError);
				}
			} else {
				// 如果强制在应用内打开，尝试作为普通文件夹书籍的一部分打开
				// Requirements: 1.1 - 不使用系统默认程序
				if (forceInApp) {
					console.log('📁 forceInApp: attempting to open via parent folder book', path);
					let parentDir = path;
					const lastBackslash = path.lastIndexOf('\\');
					const lastSlash = path.lastIndexOf('/');
					const lastSeparator = Math.max(lastBackslash, lastSlash);
					if (lastSeparator > 0) {
						parentDir = path.substring(0, lastSeparator);
					}
					try {
						await bookStore.openDirectoryAsBook(parentDir);
						await bookStore.navigateToImage(path);
					} catch (bookError) {
						console.error('❌ forceInApp: 打开父文件夹失败:', bookError);
						// 即使失败也不调用系统默认程序，保持 forceInApp 语义
						throw new Error(`无法在应用内打开文件: ${path}`);
					}
				} else {
					// Open with system default application (for unsupported file types)
					// 注意：CLI 启动时不会走到这里，因为 forceInApp=true
					await FileSystemAPI.openWithSystem(path);
				}
			}
		} catch (err) {
			console.error('Failed to open file:', err);
			// 重新抛出错误，让调用者处理
			throw err;
		}
	}
}
