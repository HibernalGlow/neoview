<script lang="ts">
/**
 * FolderPanel - 文件面板主组件
 * 采用层叠式导航，每个目录是独立的层
 * 进入子目录推入新层，返回弹出当前层，上一层保持原状
 */
import { onMount } from 'svelte';
import type { FsItem } from '$lib/types';
import { homeDir } from '@tauri-apps/api/path';
import { writable } from 'svelte/store';

import FolderToolbar from './components/FolderToolbar.svelte';
import BreadcrumbBar from './components/BreadcrumbBar.svelte';
import FolderStack from './components/FolderStack.svelte';
import FolderTree from './components/FolderTree.svelte';
import FolderContextMenu from './components/FolderContextMenu.svelte';
import MigrationBar from './components/MigrationBar.svelte';
import SelectionBar from './components/SelectionBar.svelte';
import InlineTreeList from './components/InlineTreeList.svelte';
import SearchResultList from './components/SearchResultList.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import FolderTabBar from './components/FolderTabBar.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import FavoriteTagPanel from './components/FavoriteTagPanel.svelte';
import { favoriteTagStore, createTagValue, mixedGenderStore, parseSearchTags, hasTagSearch, removeTagsFromSearch, letter2cat, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';
import { invoke } from '@tauri-apps/api/core';
import { directoryTreeCache } from './utils/directoryTreeCache';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { createKeyboardHandler } from './utils/keyboardHandler';

import {
	currentPath as legacyCurrentPath,
	folderPanelActions,
	externalNavigationRequest
} from './stores/folderPanelStore.svelte';

import {
	folderTabActions,
	tabCurrentPath,
	tabFolderTreeConfig,
	tabSearchKeyword,
	tabShowSearchBar,
	tabShowMigrationBar,
	tabSelectedItems,
	tabDeleteMode,
	tabDeleteStrategy,
	tabMultiSelectMode,
	tabInlineTreeMode,
	tabSearchResults,
	tabIsSearching,
	tabSearchSettings,
	tabItems,
	activeTabId,
	allTabs,
	type FolderTabState
} from './stores/folderTabStore.svelte';

// 使用页签 store 作为主要状态源
const currentPath = tabCurrentPath;
const folderTreeConfig = tabFolderTreeConfig;
const searchKeyword = tabSearchKeyword;
const showSearchBar = tabShowSearchBar;
const showMigrationBar = tabShowMigrationBar;
const selectedItems = tabSelectedItems;
const deleteMode = tabDeleteMode;
const deleteStrategy = tabDeleteStrategy;
const multiSelectMode = tabMultiSelectMode;
const inlineTreeMode = tabInlineTreeMode;
const searchResults = tabSearchResults;
const isSearching = tabIsSearching;
const searchSettings = tabSearchSettings;

// 当前活动页签 ID 和所有页签列表（用于渲染）
import { get } from 'svelte/store';
let currentActiveTabId = $state(get(activeTabId));
let currentAllTabs = $state(get(allTabs));

$effect(() => {
	const unsubActiveTab = activeTabId.subscribe((v) => {
		currentActiveTabId = v;
	});
	const unsubAllTabs = allTabs.subscribe((v) => {
		currentAllTabs = v;
	});
	return () => {
		unsubActiveTab();
		unsubAllTabs();
	};
});

// sortedItems 需要从 tabItems 派生
import { derived } from 'svelte/store';
import type { FolderSortField, FolderSortOrder } from './stores/folderPanelStore.svelte';
import { folderRatingStore } from '$lib/stores/emm/folderRating';
import { getDefaultRating } from '$lib/stores/emm/storage';
import { activeTab } from './stores/folderTabStore.svelte';

function sortItems(items: FsItem[], field: FolderSortField, order: FolderSortOrder): FsItem[] {
	if (field === 'random') {
		const shuffled = [...items];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	if (field === 'rating') {
		const defaultRating = getDefaultRating();
		const sorted = [...items].sort((a, b) => {
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			const ratingA = folderRatingStore.getEffectiveRating(a.path) ?? defaultRating;
			const ratingB = folderRatingStore.getEffectiveRating(b.path) ?? defaultRating;
			if (ratingA === ratingB) {
				return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
			}
			const comparison = ratingA - ratingB;
			return order === 'asc' ? comparison : -comparison;
		});
		return sorted;
	}

	const sorted = [...items].sort((a, b) => {
		if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
		let comparison = 0;
		switch (field) {
			case 'name':
				comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
				break;
			case 'date':
				comparison = (a.modified || 0) - (b.modified || 0);
				break;
			case 'size':
				comparison = (a.size || 0) - (b.size || 0);
				break;
			case 'type': {
				const extA = a.name.split('.').pop()?.toLowerCase() || '';
				const extB = b.name.split('.').pop()?.toLowerCase() || '';
				comparison = extA.localeCompare(extB);
				break;
			}
		}
		return order === 'asc' ? comparison : -comparison;
	});
	return sorted;
}

const sortedItems = derived(activeTab, ($tab) => {
	if (!$tab) return [];
	return sortItems($tab.items, $tab.sortField, $tab.sortOrder);
});

// 导航命令 store（用于父子组件通信）
const navigationCommand = writable<{ type: 'init' | 'push' | 'pop' | 'goto' | 'history'; path?: string; index?: number } | null>(null);

// 右键菜单状态
let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({
	x: 0,
	y: 0,
	item: null,
	visible: false
});

// 判断是否为视频文件
function isVideoPath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['mp4', 'mkv', 'avi', 'mov', 'nov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext);
}

// 判断是否为图片文件
function isImagePath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
}

// 处理项打开（文件的单击）- 完全参考老面板的 openFile 实现
// 注意：文件夹的导航和穿透模式在 FolderStack 中处理
async function handleItemOpen(item: FsItem) {
	console.log('[FolderPanel] handleItemOpen:', item.path, 'isDir:', item.isDir);
	
	// 文件夹不应该到达这里（由 FolderStack 处理）
	if (item.isDir) {
		console.warn('[FolderPanel] Unexpected folder in handleItemOpen, should be handled by FolderStack');
		return;
	}
	
	try {
		// 文件处理
		const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
		
		if (isArchive) {
			// 压缩包：作为书籍打开
			console.log('[FolderPanel] Opening archive as book:', item.path);
			await bookStore.openBook(item.path);
		} else if (isVideoPath(item.path)) {
			// 视频：打开所在目录作为书籍，并跳转到该视频（与图片相同的逻辑）
			console.log('[FolderPanel] Opening video:', item.path);
			// 获取父目录路径
			const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
			const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
			await bookStore.openDirectoryAsBook(parentPath);
			// 跳转到指定视频
			await bookStore.navigateToImage(item.path);
			// 添加到历史记录
			try {
				const { historyStore } = await import('$lib/stores/history.svelte');
				historyStore.add(item.path, item.name, 0, 1);
			} catch (historyError) {
				console.debug('Failed to add video history entry:', historyError);
			}
		} else if (item.isImage || isImagePath(item.path)) {
			// 图片：打开所在目录作为书籍，并跳转到该图片
			console.log('[FolderPanel] Opening image:', item.path);
			// 获取父目录路径
			const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
			const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
			await bookStore.openDirectoryAsBook(parentPath);
			// 跳转到指定图片
			await bookStore.navigateToImage(item.path);
		} else {
			// 其他文件：尝试作为书籍打开
			console.log('[FolderPanel] Opening file as book:', item.path);
			await bookStore.openBook(item.path);
		}
	} catch (err) {
		console.error('[FolderPanel] Failed to open file:', err);
		showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
	}
}

// 处理搜索结果点击 - 直接打开（不跳转）
async function handleSearchResultClick(item: FsItem) {
	console.log('[FolderPanel] handleSearchResultClick:', item.path, 'isDir:', item.isDir);
	// 直接打开文件或文件夹
	await handleItemOpen(item);
}

// 在新标签页打开 - 用于右键菜单
async function handleOpenInNewTab(item: FsItem) {
	console.log('[FolderPanel] handleOpenInNewTab:', item.path, 'isDir:', item.isDir);
	
	if (item.isDir) {
		// 文件夹：创建新标签页并导航到该路径
		folderTabActions.createTab(item.path);
		// 触发加载
		navigationCommand.set({ type: 'push', path: item.path });
	} else {
		// 文件：在新标签页打开父目录
		const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
		const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
		folderTabActions.createTab(parentPath);
		// 触发加载
		navigationCommand.set({ type: 'push', path: parentPath });
		// 打开文件
		await handleItemOpen(item);
	}
}

// 处理右键菜单
function handleContextMenu(event: MouseEvent, item: FsItem) {
	event.preventDefault();
	contextMenu = {
		x: event.clientX,
		y: event.clientY,
		item,
		visible: true
	};
}

// 关闭右键菜单
function closeContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
}

// 作为书籍打开文件夹
async function handleOpenFolderAsBook(item: FsItem) {
	if (!item.isDir) return;
	try {
		await bookStore.openDirectoryAsBook(item.path);
	} catch (err) {
		console.error('[FolderPanel] Failed to open folder as book:', err);
	}
}

// 添加书签
function handleAddBookmark(item: FsItem) {
	bookmarkStore.add({
		path: item.path,
		name: item.name,
		isDirectory: item.isDir
	});
}

// 复制路径
function handleCopyPath(item: FsItem) {
	navigator.clipboard.writeText(item.path);
}

// 复制文件名
function handleCopyName(item: FsItem) {
	navigator.clipboard.writeText(item.name);
}

// 处理刷新
function handleRefresh() {
	const path = $currentPath;
	if (path) {
		// 清除当前目录的缓存，强制重新加载
		directoryTreeCache.invalidate(path);
		navigationCommand.set({ type: 'init', path });
	}
}

// 处理导航（面包屑、文件夹树点击）
function handleNavigate(path: string) {
	navigationCommand.set({ type: 'push', path });
}

// 处理后退（使用历史导航，不添加新历史记录）
function handleGoBack() {
	const result = folderTabActions.goBack();
	if (result) {
		// 使用 history 类型，这样 FolderStack 不会再次添加历史
		navigationCommand.set({ type: 'history', path: result.path });
	}
}

// 处理前进（使用历史导航，不添加新历史记录）
function handleGoForward() {
	const result = folderTabActions.goForward();
	if (result) {
		// 使用 history 类型，这样 FolderStack 不会再次添加历史
		navigationCommand.set({ type: 'history', path: result.path });
	}
}

// 处理回到 Home
function handleGoHome() {
	const home = folderTabActions.goHome();
	if (home) {
		navigationCommand.set({ type: 'init', path: home });
	}
}

// 设置当前路径为主页
function handleSetHome() {
	const path = $currentPath;
	if (path) {
		folderTabActions.setHomePath(path);
		// 持久化到 localStorage
		localStorage.setItem('neoview-homepage-path', path);
		showSuccessToast('设置成功', `已将 ${path} 设置为主页`);
	}
}

// 处理搜索（使用后端搜索）- 在新标签页展示搜索结果
async function handleSearch(keyword: string) {
	console.log('[FolderPanel] handleSearch called with keyword:', keyword);
	
	if (!keyword.trim()) {
		console.log('[FolderPanel] Empty keyword, clearing search');
		folderTabActions.clearSearch();
		return;
	}
	
	const searchPath = $currentPath;
	console.log('[FolderPanel] Searching in path:', searchPath);
	if (!searchPath) {
		console.warn('[FolderPanel] No current path, cannot search');
		return;
	}
	
	// 创建新标签页用于显示搜索结果
	const searchTabId = folderTabActions.createTab(searchPath);
	folderTabActions.switchTab(searchTabId);
	
	// 在新标签页中设置搜索状态
	folderTabActions.setSearchKeyword(keyword);
	folderTabActions.setIsSearching(true);
	
	try {
		const tab = folderTabActions.getActiveTab();
		const settings = tab?.searchSettings || { includeSubfolders: true, searchInPath: false };
		console.log('[FolderPanel] Search settings:', settings);
		
		// 解析标签搜索
		const searchTags = parseSearchTags(keyword);
		const hasTagFilter = searchTags.length > 0;
		const plainKeyword = hasTagFilter ? removeTagsFromSearch(keyword) : keyword;
		
		console.log('[FolderPanel] 标签搜索:', { hasTagFilter, tagCount: searchTags.length, plainKeyword });
		
		let results: FsItem[] = [];
		
		// 如果有标签搜索，使用后端命令
		if (hasTagFilter) {
			const enableMixed = mixedGenderStore.enabled;
			// 转换搜索标签格式: { cat, tag, prefix } -> [namespace, tag, prefix]
			const backendTags: [string, string, string][] = searchTags.map(t => [t.cat, t.tag, t.prefix]);
			
			console.log('[FolderPanel] 调用后端标签搜索:', { backendTags, enableMixed, searchPath });
			
			// 调用后端搜索
			const matchedPaths = await invoke<string[]>('search_by_tags', {
				searchTags: backendTags,
				enableMixedGender: enableMixed,
				basePath: searchPath
			});
			
			console.log(`[FolderPanel] 后端标签搜索返回 ${matchedPaths.length} 个结果`);
			
			// 获取文件信息
			for (const path of matchedPaths) {
				try {
					const item = await FileSystemAPI.getFileMetadata(path);
					results.push(item);
				} catch (e) {
					console.debug('[FolderPanel] 获取文件信息失败:', path, e);
				}
			}
			
			// 如果还有普通搜索词，进一步过滤
			if (plainKeyword) {
				const lowerKeyword = plainKeyword.toLowerCase();
				results = results.filter(item => 
					item.name.toLowerCase().includes(lowerKeyword) ||
					item.path.toLowerCase().includes(lowerKeyword)
				);
			}
		} else {
			// 普通文件搜索
			results = await FileSystemAPI.searchFiles(searchPath, keyword, {
				includeSubfolders: settings.includeSubfolders,
				maxResults: 1000
			});
		}
		
		// 为搜索结果附加 rating 数据
		const defaultRating = getDefaultRating();
		const resultsWithRating = results.map(item => ({
			...item,
			rating: folderRatingStore.getEffectiveRating(item.path) ?? defaultRating
		}));
		
		console.log(`[FolderPanel] 搜索完成，找到 ${resultsWithRating.length} 个结果`, resultsWithRating.slice(0, 5));
		folderTabActions.setSearchResults(resultsWithRating);
	} catch (err) {
		console.error('[FolderPanel] 搜索失败:', err);
		showErrorToast('搜索失败', String(err));
		folderTabActions.setSearchResults([]);
	} finally {
		folderTabActions.setIsSearching(false);
	}
}

// 处理文件夹树切换
function handleToggleFolderTree() {
	folderTabActions.toggleFolderTree();
}

// 处理搜索设置变更
function handleSearchSettingsChange(settings: { includeSubfolders?: boolean; showHistoryOnFocus?: boolean; searchInPath?: boolean }) {
	folderTabActions.setSearchSettings(settings);
}

// 收藏标签面板状态
let showFavoriteTagPanel = $state(false);

// 切换收藏标签面板
function handleToggleFavoriteTagPanel() {
	showFavoriteTagPanel = !showFavoriteTagPanel;
}

// 关闭收藏标签面板
function handleCloseFavoriteTagPanel() {
	showFavoriteTagPanel = false;
}

// 处理标签点击 - 添加到搜索框
function handleAppendTag(tag: FavoriteTag, modifier: string = '') {
	const tagValue = modifier + tag.value;
	// 获取当前搜索关键词，添加标签
	const currentKeyword = $searchKeyword || '';
	const newKeyword = currentKeyword ? `${currentKeyword} ${tagValue}` : tagValue;
	
	// 更新搜索关键词
	folderTabActions.setSearchKeyword(newKeyword);
	
	// 触发搜索
	handleSearch(newKeyword);
}

// 迁移栏管理器显示状态
let showMigrationManager = $state(false);

function handleToggleMigrationManager() {
	showMigrationManager = !showMigrationManager;
}

// 剪贴板状态
let clipboardItem = $state<{ paths: string[]; operation: 'copy' | 'cut' } | null>(null);

// 确认对话框状态
let confirmDialogOpen = $state(false);
let confirmDialogTitle = $state('');
let confirmDialogDescription = $state('');
let confirmDialogConfirmText = $state('确定');
let confirmDialogVariant = $state<'default' | 'destructive' | 'warning'>('default');
let confirmDialogOnConfirm = $state<() => void>(() => {});

// 显示确认对话框
function openConfirmDialog(config: {
	title: string;
	description: string;
	confirmText?: string;
	variant?: 'default' | 'destructive' | 'warning';
	onConfirm: () => void;
}) {
	confirmDialogTitle = config.title;
	confirmDialogDescription = config.description;
	confirmDialogConfirmText = config.confirmText || '确定';
	confirmDialogVariant = config.variant || 'default';
	confirmDialogOnConfirm = config.onConfirm;
	confirmDialogOpen = true;
}

// 执行批量删除
async function executeBatchDelete(paths: string[]) {
	const strategy = $deleteStrategy;
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
	// 删除后刷新列表以同步 FolderStack 状态
	handleRefresh();
	
	if (successCount === paths.length) {
		showSuccessToast(`${actionText}成功`, `已${actionText} ${successCount} 个文件`);
	} else {
		showErrorToast(`部分${actionText}失败`, `成功 ${successCount}/${paths.length}`);
	}
}

// 执行单个删除
async function executeSingleDelete(item: FsItem) {
	const strategy = $deleteStrategy;
	const actionText = strategy === 'trash' ? '删除' : '永久删除';
	
	// 立即从列表中移除（乐观更新）
	folderTabActions.removeItem(item.path);

	try {
		if (strategy === 'trash') {
			await FileSystemAPI.moveToTrash(item.path);
		} else {
			await FileSystemAPI.deletePath(item.path);
		}
		showSuccessToast(`${actionText}成功`, item.name);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast(`${actionText}失败`, message);
		handleRefresh();
	}
}

// 处理删除（勾选模式下批量删除，删除模式下不需要确认）
function handleDelete(item: FsItem) {
	const strategy = $deleteStrategy;
	const actionText = strategy === 'trash' ? '删除' : '永久删除';
	const selected = $selectedItems;
	
	// 勾选模式下且有选中项时，批量删除选中项
	if ($multiSelectMode && selected.size > 0) {
		// 确保当前项也在选中列表中
		if (!selected.has(item.path)) {
			selected.add(item.path);
		}
		
		const paths = Array.from(selected);
		openConfirmDialog({
			title: `${actionText}确认`,
			description: `确定要${actionText}选中的 ${paths.length} 个项目吗？`,
			confirmText: actionText,
			variant: 'destructive',
			onConfirm: () => executeBatchDelete(paths)
		});
		return;
	}
	
	// 单个删除
	// 删除模式下不弹确认框，其他情况需要确认
	if ($deleteMode) {
		executeSingleDelete(item);
	} else {
		openConfirmDialog({
			title: `${actionText}确认`,
			description: `确定要${actionText} "${item.name}" 吗？`,
			confirmText: actionText,
			variant: 'destructive',
			onConfirm: () => executeSingleDelete(item)
		});
	}
}

// 处理批量删除（从操作栏调用）
function handleBatchDelete() {
	const selected = $selectedItems;
	if (selected.size === 0) {
		showErrorToast('没有选中的文件', '请先选择要删除的文件');
		return;
	}

	const strategy = $deleteStrategy;
	const actionText = strategy === 'trash' ? '删除' : '永久删除';
	const paths = Array.from(selected);
	
	openConfirmDialog({
		title: `${actionText}确认`,
		description: `确定要${actionText}选中的 ${paths.length} 个项目吗？`,
		confirmText: actionText,
		variant: 'destructive',
		onConfirm: () => executeBatchDelete(paths)
	});
}

// 处理剪切
function handleCut(item: FsItem) {
	clipboardItem = { paths: [item.path], operation: 'cut' };
	try {
		navigator.clipboard.writeText(item.path);
	} catch {}
	showSuccessToast('已剪切', item.name);
}

// 处理复制
function handleCopy(item: FsItem) {
	clipboardItem = { paths: [item.path], operation: 'copy' };
	try {
		navigator.clipboard.writeText(item.path);
	} catch {}
	showSuccessToast('已复制', item.name);
}

// 处理粘贴
async function handlePaste() {
	if (!clipboardItem || clipboardItem.paths.length === 0) {
		showErrorToast('粘贴失败', '剪贴板为空');
		return;
	}

	const targetDir = $currentPath;
	if (!targetDir) {
		showErrorToast('粘贴失败', '请先打开一个目录');
		return;
	}

	try {
		for (const sourcePath of clipboardItem.paths) {
			const fileName = sourcePath.split(/[\\/]/).pop();
			if (!fileName) continue;
			const destPath = `${targetDir}/${fileName}`;

			if (clipboardItem.operation === 'cut') {
				await FileSystemAPI.movePath(sourcePath, destPath);
			} else {
				await FileSystemAPI.copyPath(sourcePath, destPath);
			}
		}

		showSuccessToast(
			clipboardItem.operation === 'cut' ? '移动成功' : '复制成功',
			`已${clipboardItem.operation === 'cut' ? '移动' : '复制'} ${clipboardItem.paths.length} 个文件`
		);

		// 如果是剪切，清空剪贴板
		if (clipboardItem.operation === 'cut') {
			clipboardItem = null;
		}

		handleRefresh();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('粘贴失败', message);
	}
}

// 处理重命名
async function handleRename(item: FsItem) {
	const newName = prompt('请输入新名称:', item.name);
	if (!newName || newName === item.name) return;

	try {
		// 构建新路径
		const parentPath = item.path.substring(0, item.path.lastIndexOf(item.name));
		const newPath = parentPath + newName;
		await FileSystemAPI.renamePath(item.path, newPath);
		showSuccessToast('重命名成功', `${item.name} → ${newName}`);
		handleRefresh();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('重命名失败', message);
	}
}

// 在资源管理器中打开
async function handleOpenInExplorer(item: FsItem) {
	try {
		await FileSystemAPI.showInFileManager(item.path);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('打开失败', message);
	}
}

// 用默认软件打开
async function handleOpenWithSystem(item: FsItem) {
	try {
		await FileSystemAPI.openWithSystem(item.path);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		showErrorToast('打开失败', message);
	}
}

// 切换删除策略
function handleToggleDeleteStrategy() {
	folderTabActions.toggleDeleteStrategy();
	const strategy = $deleteStrategy;
	const text = strategy === 'trash' ? '移动到回收站' : '永久删除';
	showSuccessToast('删除策略已切换', text);
}

// 切换主视图树模式
function handleToggleInlineTree() {
	folderTabActions.toggleInlineTreeMode();
	const mode = $inlineTreeMode;
	showSuccessToast('主视图树', mode ? '已开启' : '已关闭');
}

// 键盘快捷键处理（使用独立模块）
const handleKeydown = createKeyboardHandler(() => ({
	selectedItems: $selectedItems,
	sortedItems: $sortedItems,
	multiSelectMode: $multiSelectMode,
	deleteMode: $deleteMode,
	onNavigate: (path: string) => navigationCommand.set({ type: 'push', path }),
	onOpenItem: handleItemOpen,
	onGoBack: handleGoBack,
	onRefresh: handleRefresh,
	onBatchDelete: handleBatchDelete,
	onSelectAll: () => folderTabActions.selectAll(),
	onDeselectAll: () => folderTabActions.deselectAll(),
	onToggleSearchBar: () => folderTabActions.toggleShowSearchBar()
}));

// 监听外部导航请求（来自历史面板、书签面板等）
$effect(() => {
	const request = $externalNavigationRequest;
	if (request) {
		console.log('[FolderPanel] External navigation request:', request.path);
		navigationCommand.set({ type: 'push', path: request.path });
		// 清除请求
		externalNavigationRequest.set(null);
	}
});

// Home 路径（用于新建页签）
let homePath = $state('');

// 初始化
onMount(() => {
	// 异步初始化
	(async () => {
		try {
			// 从 localStorage 读取保存的主页路径，如果没有则使用用户目录
			const savedHomePath = localStorage.getItem('neoview-homepage-path');
			const defaultHome = await homeDir();
			const home = savedHomePath || defaultHome;
			homePath = home;
			folderTabActions.setHomePath(home);

			// 初始化层叠导航
			const initialPath = $currentPath || home;
			navigationCommand.set({ type: 'init', path: initialPath });

			// 自动加载 EMM 收藏标签（如果尚未加载）
			if (!favoriteTagStore.isEMMLoaded()) {
				await favoriteTagStore.loadFromEMM();
			}
		} catch (err) {
			console.error('[FolderPanel] Failed to initialize:', err);
		}
	})();

	// 添加键盘事件监听
	document.addEventListener('keydown', handleKeydown);

	return () => {
		// 清理键盘事件监听
		document.removeEventListener('keydown', handleKeydown);
	};
});
</script>

<div class="flex h-full flex-col overflow-hidden">
	<!-- 面包屑导航 -->
	<div class="border-b">
		<BreadcrumbBar onNavigate={handleNavigate} />
	</div>

	<!-- 页签栏 -->
	<FolderTabBar {homePath} />

	<!-- 工具栏 -->
	<FolderToolbar 
		onRefresh={handleRefresh} 
		onToggleFolderTree={handleToggleFolderTree}
		onGoBack={handleGoBack}
		onGoForward={handleGoForward}
		onGoHome={handleGoHome}
		onSetHome={handleSetHome}
		onToggleDeleteStrategy={handleToggleDeleteStrategy}
		onToggleInlineTree={handleToggleInlineTree}
	/>

	<!-- 搜索栏（可切换显示） -->
	{#if $showSearchBar}
		<div class="relative">
			<div class="flex items-center gap-1">
				<div class="flex-1">
					<SearchBar
						placeholder="搜索文件... (支持标签搜索 f:&quot;tag&quot;$)"
						onSearch={handleSearch}
						storageKey="neoview-folder-search-history"
						searchSettings={{
							includeSubfolders: $searchSettings.includeSubfolders,
							showHistoryOnFocus: $searchSettings.showHistoryOnFocus,
							searchInPath: $searchSettings.searchInPath
						}}
						onSettingsChange={handleSearchSettingsChange}
					/>
				</div>
				<!-- 收藏标签快选按钮 -->
				<button
					class="shrink-0 px-2 py-1.5 text-xs rounded border hover:bg-accent {showFavoriteTagPanel ? 'bg-primary/10 border-primary text-primary' : 'border-border'}"
					onclick={handleToggleFavoriteTagPanel}
					title="收藏标签快选"
				>
					★ 标签
				</button>
			</div>
			<!-- 收藏标签面板 -->
			<FavoriteTagPanel
				visible={showFavoriteTagPanel}
				enableMixed={mixedGenderStore.enabled}
				onClose={handleCloseFavoriteTagPanel}
				onAppendTag={handleAppendTag}
				onUpdateEnableMixed={(v: boolean) => { mixedGenderStore.enabled = v; }}
			/>
		</div>
	{/if}

	<!-- 迁移栏（可切换显示） -->
	{#if $showMigrationBar}
		<MigrationBar
			showManager={showMigrationManager}
			onToggleManager={handleToggleMigrationManager}
		/>
	{/if}

	<!-- 勾选操作栏（勾选模式下显示） -->
	{#if $multiSelectMode}
		<SelectionBar onDelete={handleBatchDelete} />
	{/if}

	<!-- 主内容区 - 使用层叠式布局 -->
	<div class="relative flex-1 overflow-hidden">
		<!-- 文件夹树层（绝对定位，在文件列表上方） -->
		{#if $folderTreeConfig.visible}
			<div
				class="border-muted absolute z-10 overflow-auto bg-background"
				class:border-b={$folderTreeConfig.layout === 'top'}
				class:border-r={$folderTreeConfig.layout === 'left'}
				style={$folderTreeConfig.layout === 'top'
					? `top: 0; left: 0; right: 0; height: ${$folderTreeConfig.size}px;`
					: `top: 0; left: 0; bottom: 0; width: ${$folderTreeConfig.size}px;`}
			>
				<FolderTree onNavigate={handleNavigate} />
			</div>
		{/if}

		<!-- 分隔条（始终显示，可拖拽展开/调整文件树） -->
		<div
			class="bg-border hover:bg-primary absolute z-10 transition-colors"
			class:cursor-ns-resize={$folderTreeConfig.layout === 'top'}
			class:cursor-ew-resize={$folderTreeConfig.layout === 'left'}
			style={$folderTreeConfig.layout === 'top'
				? `top: ${$folderTreeConfig.visible ? $folderTreeConfig.size : 0}px; left: 0; right: 0; height: 6px;`
				: `top: 0; left: ${$folderTreeConfig.visible ? $folderTreeConfig.size : 0}px; bottom: 0; width: 6px;`}
		></div>

		<!-- 文件列表（层叠式）- 每个页签独立实例，切换时显示/隐藏 -->
		<div
			class="file-list-container absolute inset-0 overflow-hidden"
			style={$folderTreeConfig.visible
				? $folderTreeConfig.layout === 'top'
					? `top: ${$folderTreeConfig.size + 6}px;`
					: `left: ${$folderTreeConfig.size + 6}px;`
				: $folderTreeConfig.layout === 'top'
					? 'top: 6px;'
					: 'left: 6px;'}
		>
			<!-- 每个页签独立的 FolderStack 实例 -->
			{#each currentAllTabs as tab (tab.id)}
				<div 
					class="absolute inset-0"
					class:hidden={tab.id !== currentActiveTabId}
					class:pointer-events-none={tab.id !== currentActiveTabId}
				>
					{#if $searchKeyword || $isSearching || $searchResults.length > 0}
						<!-- 搜索结果模式 - 点击在新标签页打开 -->
						<SearchResultList
							onItemClick={handleSearchResultClick}
							onItemDoubleClick={handleSearchResultClick}
							onItemContextMenu={handleContextMenu}
						/>
					{:else if $inlineTreeMode}
						<!-- 主视图树模式 -->
						<InlineTreeList
							onItemClick={handleItemOpen}
							onItemDoubleClick={handleItemOpen}
							onItemContextMenu={handleContextMenu}
						/>
					{:else}
						<!-- 层叠式文件列表 -->
						<FolderStack
							tabId={tab.id}
							initialPath={tab.currentPath || tab.homePath}
							{navigationCommand}
							onItemOpen={handleItemOpen}
							onItemDelete={handleDelete}
							onItemContextMenu={handleContextMenu}
							onOpenFolderAsBook={handleOpenFolderAsBook}
						/>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- 右键菜单 -->
<FolderContextMenu
	item={contextMenu.item}
	x={contextMenu.x}
	y={contextMenu.y}
	visible={contextMenu.visible}
	onClose={closeContextMenu}
	onOpenAsBook={handleItemOpen}
	onBrowse={(item) => navigationCommand.set({ type: 'push', path: item.path })}
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
	bind:open={confirmDialogOpen}
	title={confirmDialogTitle}
	description={confirmDialogDescription}
	confirmText={confirmDialogConfirmText}
	variant={confirmDialogVariant}
	onConfirm={confirmDialogOnConfirm}
/>

<style>
	/* CSS Containment 优化 - 隔离重绘范围 */
	.file-list-container {
		contain: strict;
		content-visibility: auto;
	}
</style>
