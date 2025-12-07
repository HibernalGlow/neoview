<script lang="ts">
/**
 * FolderMainCard - 文件面板主组件（重构版）
 * 使用 hooks 模块化管理状态和操作
 */
import { onMount } from 'svelte';
import type { FsItem } from '$lib/types';
import { homeDir } from '@tauri-apps/api/path';
import { writable, get } from 'svelte/store';
import { Star, RefreshCw } from '@lucide/svelte';
import TagChip from '$lib/components/ui/TagChip.svelte';

// 组件导入
import FolderToolbar from '$lib/components/panels/folderPanel/components/FolderToolbar.svelte';
import BreadcrumbBar from '$lib/components/panels/folderPanel/components/BreadcrumbBar.svelte';
import FolderStack from '$lib/components/panels/folderPanel/components/FolderStack.svelte';
import FolderTree from '$lib/components/panels/folderPanel/components/FolderTree.svelte';
import FolderContextMenu from '$lib/components/panels/folderPanel/components/FolderContextMenu.svelte';
import MigrationBar from '$lib/components/panels/folderPanel/components/MigrationBar.svelte';
import SelectionBar from '$lib/components/panels/folderPanel/components/SelectionBar.svelte';
import InlineTreeList from '$lib/components/panels/folderPanel/components/InlineTreeList.svelte';
import SearchResultList from '$lib/components/panels/folderPanel/components/SearchResultList.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import FolderTabBar from '$lib/components/panels/folderPanel/components/FolderTabBar.svelte';
import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
import RenameDialog from '$lib/components/ui/rename/RenameDialog.svelte';
import FavoriteTagPanel from '$lib/components/panels/folderPanel/components/FavoriteTagPanel.svelte';

// Store 导入
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
	activeTabId,
	allTabs,
	activeTab,
	isVirtualPath
} from '$lib/components/panels/folderPanel/stores/folderTabStore.svelte';
import { externalNavigationRequest } from '$lib/components/panels/folderPanel/stores/folderPanelStore.svelte';
import { favoriteTagStore, mixedGenderStore, type FavoriteTag } from '$lib/stores/emm/favoriteTagStore.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { createKeyboardHandler } from '$lib/components/panels/folderPanel/utils/keyboardHandler';
import { directoryTreeCache } from '$lib/components/panels/folderPanel/utils/directoryTreeCache';

// Hooks 导入
import { createSearchActions } from './hooks/useSearchActions';
import { createTagActions, type RandomTag } from './hooks/useTagActions.svelte';

// ==================== Props ====================
interface Props {
	initialPath?: string;
}
let { initialPath: propInitialPath }: Props = $props();

// ==================== Store 别名 ====================
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

// ==================== 实例状态 ====================
let isVirtualInstance = $state(false);
let ownTabId = $state<string | null>(null);
let homePath = $state('');
let localTabState = $state<{ id: string; title: string; currentPath: string; homePath: string } | null>(null);
let currentActiveTabId = $state(get(activeTabId));
let currentAllTabs = $state(get(allTabs));

// 导航命令
const navigationCommand = writable<{ type: 'init' | 'push' | 'pop' | 'goto' | 'history'; path?: string; index?: number } | null>(null);

// ==================== 计算属性 ====================
let displayTabs = $derived(localTabState ? [localTabState] : currentAllTabs);
let displayActiveTabId = $derived(localTabState?.id || currentActiveTabId);

// ==================== UI 状态 ====================
let contextMenu = $state<{ x: number; y: number; item: FsItem | null; visible: boolean }>({ x: 0, y: 0, item: null, visible: false });
let clipboardItem = $state<{ paths: string[]; operation: 'copy' | 'cut' } | null>(null);
let confirmDialogOpen = $state(false);
let confirmDialogTitle = $state('');
let confirmDialogDescription = $state('');
let confirmDialogConfirmText = $state('确定');
let confirmDialogVariant = $state<'default' | 'destructive' | 'warning'>('default');
let confirmDialogOnConfirm = $state<() => void>(() => {});
let renameDialogOpen = $state(false);
let renameDialogItem = $state<FsItem | null>(null);
let showFavoriteTagPanel = $state(false);
let showMigrationManager = $state(false);
let showRandomTagBar = $state(false);
let isResizingTree = $state(false);
let resizeStartPos = $state(0);
let resizeStartSize = $state(0);

// ==================== Hooks ====================
const searchActions = createSearchActions();
const tagActions = createTagActions(
	() => get(searchKeyword),
	(kw) => folderTabActions.setSearchKeyword(kw)
);
let randomTags = $derived(tagActions.randomTags);

// ==================== 辅助函数 ====================
function isVideoPath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['mp4', 'mkv', 'avi', 'mov', 'nov', 'flv', 'webm', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext);
}

function isImagePath(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
}

function openConfirmDialog(config: { title: string; description: string; confirmText?: string; variant?: 'default' | 'destructive' | 'warning'; onConfirm: () => void }) {
	confirmDialogTitle = config.title;
	confirmDialogDescription = config.description;
	confirmDialogConfirmText = config.confirmText || '确定';
	confirmDialogVariant = config.variant || 'default';
	confirmDialogOnConfirm = config.onConfirm;
	confirmDialogOpen = true;
}

// ==================== 导航操作 ====================
function handleRefresh() {
	const path = get(currentPath);
	if (path) {
		if (!isVirtualPath(path)) directoryTreeCache.invalidate(path);
		navigationCommand.set({ type: 'init', path });
	}
}

function handleNavigate(path: string) {
	navigationCommand.set({ type: 'push', path });
}

function handleGoBack() {
	const result = folderTabActions.goBack();
	if (result) navigationCommand.set({ type: 'history', path: result.path });
}

function handleGoForward() {
	const result = folderTabActions.goForward();
	if (result) navigationCommand.set({ type: 'history', path: result.path });
}

function handleGoUp() {
	const path = get(currentPath);
	if (!path || isVirtualPath(path)) return;
	const normalized = path.replace(/\//g, '\\');
	const parts = normalized.split('\\').filter(Boolean);
	if (parts.length <= 1) return;
	parts.pop();
	let parentPath = parts.join('\\');
	if (/^[a-zA-Z]:$/.test(parentPath)) parentPath += '\\';
	navigationCommand.set({ type: 'init', path: parentPath });
}

function handleGoHome() {
	const home = folderTabActions.goHome();
	if (home) navigationCommand.set({ type: 'init', path: home });
}

function handleSetHome() {
	const path = get(currentPath);
	if (path && !isVirtualPath(path)) {
		localStorage.setItem('neoview-homepage-path', path);
		homePath = path;
		folderTabActions.setHomePath(path);
		showSuccessToast('主页已设置', path);
	}
}

// ==================== 文件操作 ====================
async function handleItemOpen(item: FsItem) {
	if (item.isDir) return;
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
	if (isVirtualInstance && propInitialPath) {
		const { removeVirtualPathItem } = await import('$lib/components/panels/folderPanel/utils/virtualPathLoader');
		let count = 0;
		for (const p of paths) if (removeVirtualPathItem(propInitialPath, p)) count++;
		folderTabActions.deselectAll();
		showSuccessToast('移除成功', `已移除 ${count} 项`);
		return;
	}
	const strategy = get(deleteStrategy);
	let count = 0;
	for (const p of paths) {
		try {
			strategy === 'trash' ? await FileSystemAPI.moveToTrash(p) : await FileSystemAPI.deletePath(p);
			count++;
		} catch {}
	}
	folderTabActions.deselectAll();
	handleRefresh();
	showSuccessToast('删除成功', `已删除 ${count} 个文件`);
}

async function executeSingleDelete(item: FsItem) {
	if (isVirtualInstance && propInitialPath) {
		const { removeVirtualPathItem } = await import('$lib/components/panels/folderPanel/utils/virtualPathLoader');
		removeVirtualPathItem(propInitialPath, item.path);
		showSuccessToast('移除成功', `已从列表移除`);
		return;
	}
	const strategy = get(deleteStrategy);
	folderTabActions.removeItem(item.path);
	try {
		strategy === 'trash' ? await FileSystemAPI.moveToTrash(item.path) : await FileSystemAPI.deletePath(item.path);
		showSuccessToast('删除成功', item.name);
	} catch (err) {
		showErrorToast('删除失败', err instanceof Error ? err.message : String(err));
		handleRefresh();
	}
}

function handleDelete(item: FsItem) {
	const isVirtual = isVirtualInstance && propInitialPath;
	const actionText = isVirtual ? '移除' : (get(deleteStrategy) === 'trash' ? '删除' : '永久删除');
	const selected = get(selectedItems);
	
	if (get(multiSelectMode) && selected.size > 0) {
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
	
	if (get(deleteMode)) {
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
	const selected = get(selectedItems);
	if (selected.size === 0) { showErrorToast('没有选中', '请先选择'); return; }
	const paths = Array.from(selected);
	const isVirtual = isVirtualInstance && propInitialPath;
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
	contextMenu = { x: event.clientX, y: event.clientY, item, visible: true };
}

function closeContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
}

// ==================== 剪贴板操作 ====================
function handleCopy(item: FsItem) { clipboardItem = { paths: [item.path], operation: 'copy' }; }
function handleCut(item: FsItem) { clipboardItem = { paths: [item.path], operation: 'cut' }; }
function handleCopyPath(item: FsItem) { navigator.clipboard.writeText(item.path); showSuccessToast('已复制', '路径'); }
function handleCopyName(item: FsItem) { navigator.clipboard.writeText(item.name); showSuccessToast('已复制', '文件名'); }
async function handlePaste() {
	if (!clipboardItem) return;
	const target = get(currentPath);
	if (!target || isVirtualPath(target)) return;
	try {
		for (const src of clipboardItem.paths) {
			if (clipboardItem.operation === 'copy') await FileSystemAPI.copyPath(src, target);
			else await FileSystemAPI.movePath(src, target);
		}
		if (clipboardItem.operation === 'cut') clipboardItem = null;
		handleRefresh();
		showSuccessToast('操作成功', `已${clipboardItem?.operation === 'copy' ? '复制' : '移动'}`);
	} catch (err) {
		showErrorToast('操作失败', err instanceof Error ? err.message : String(err));
	}
}

// ==================== 重命名 ====================
function handleRename(item: FsItem) { renameDialogItem = item; renameDialogOpen = true; }
async function executeRename(newName: string) {
	if (!renameDialogItem) return;
	const item = renameDialogItem;
	try {
		const parentPath = item.path.substring(0, item.path.lastIndexOf(item.name));
		const newPath = parentPath + newName;
		await FileSystemAPI.renamePath(item.path, newPath);
		handleRefresh();
		showSuccessToast('重命名成功', `${item.name} → ${newName}`);
	} catch (err) {
		showErrorToast('重命名失败', err instanceof Error ? err.message : String(err));
	}
	renameDialogItem = null;
}

// ==================== 系统操作 ====================
async function handleOpenInExplorer(item: FsItem) { await FileSystemAPI.showInFileManager(item.path); }
async function handleOpenWithSystem(item: FsItem) { await FileSystemAPI.openWithSystem(item.path); }
function handleAddBookmark(item: FsItem) { bookmarkStore.add(item); showSuccessToast('已添加书签', item.name); }

// ==================== 工具栏操作 ====================
function handleToggleFolderTree() { folderTabActions.toggleFolderTree(); }
function handleToggleDeleteStrategy() { folderTabActions.toggleDeleteStrategy(); showSuccessToast('删除策略', get(deleteStrategy) === 'trash' ? '回收站' : '永久'); }
function handleToggleInlineTree() { folderTabActions.toggleInlineTreeMode(); }
function handleToggleMigrationManager() { showMigrationManager = !showMigrationManager; }
function handleToggleFavoriteTagPanel() { showFavoriteTagPanel = !showFavoriteTagPanel; }
function handleCloseFavoriteTagPanel() { showFavoriteTagPanel = false; }
function handleToggleRandomTagBar() { showRandomTagBar = !showRandomTagBar; if (showRandomTagBar && randomTags.length === 0) tagActions.refreshRandomTags(); }
function handleAppendTag(tag: FavoriteTag, modifier: string = '') { tagActions.appendTagToSearch(tag, modifier); }
function handleRandomTagClick(tag: FavoriteTag) { tagActions.handleRandomTagClick(tag, searchActions.handleSearch); }
function refreshRandomTags() { tagActions.refreshRandomTags(); }

// ==================== 搜索 ====================
function handleSearch(keyword: string) { searchActions.handleSearch(keyword); }
function handleSearchSettingsChange(settings: any) { searchActions.handleSearchSettingsChange(settings); }
function handleSearchResultClick(item: FsItem) { handleItemOpen(item); }

// ==================== 树拖拽 ====================
function startTreeResize(e: MouseEvent) {
	e.preventDefault();
	isResizingTree = true;
	const layout = get(folderTreeConfig).layout;
	resizeStartPos = layout === 'left' ? e.clientX : e.clientY;
	resizeStartSize = get(folderTreeConfig).size;
	document.addEventListener('mousemove', onTreeResize);
	document.addEventListener('mouseup', stopTreeResize);
}
function onTreeResize(e: MouseEvent) {
	if (!isResizingTree) return;
	const layout = get(folderTreeConfig).layout;
	const delta = layout === 'left' ? e.clientX - resizeStartPos : e.clientY - resizeStartPos;
	folderTabActions.setFolderTreeSize(Math.max(100, Math.min(500, resizeStartSize + delta)));
}
function stopTreeResize() {
	isResizingTree = false;
	document.removeEventListener('mousemove', onTreeResize);
	document.removeEventListener('mouseup', stopTreeResize);
}

// ==================== 键盘处理 ====================
const handleKeydown = createKeyboardHandler({
	onOpenItem: handleItemOpen,
	onGoBack: handleGoBack,
	onRefresh: handleRefresh,
	onBatchDelete: handleBatchDelete,
	onSelectAll: () => folderTabActions.selectAll(),
	onDeselectAll: () => folderTabActions.deselectAll(),
	onToggleSearchBar: () => folderTabActions.toggleShowSearchBar()
});

// ==================== 生命周期 ====================
$effect(() => {
	if (propInitialPath && isVirtualPath(propInitialPath)) return;
	const unsub1 = activeTabId.subscribe(v => { currentActiveTabId = v; });
	const unsub2 = allTabs.subscribe(v => { currentAllTabs = v; });
	return () => { unsub1(); unsub2(); };
});

$effect(() => {
	const req = get(externalNavigationRequest);
	if (req) {
		navigationCommand.set({ type: 'push', path: req.path });
		externalNavigationRequest.set(null);
	}
});

onMount(() => {
	(async () => {
		try {
			if (propInitialPath && isVirtualPath(propInitialPath)) {
				isVirtualInstance = true;
				const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
				ownTabId = localId;
				localTabState = { id: localId, title: propInitialPath.includes('bookmark') ? '书签' : '历史', currentPath: propInitialPath, homePath: propInitialPath };
				homePath = propInitialPath;
				navigationCommand.set({ type: 'init', path: propInitialPath });
			} else {
				const savedHome = localStorage.getItem('neoview-homepage-path');
				const defaultHome = propInitialPath || await homeDir();
				homePath = savedHome || defaultHome;
				folderTabActions.setHomePath(homePath);
				navigationCommand.set({ type: 'init', path: get(currentPath) || homePath });
			}
			if (!favoriteTagStore.isEMMLoaded()) await favoriteTagStore.loadFromEMM();
		} catch (err) { console.error('[FolderPanel] Init error:', err); }
	})();
	
	if (!propInitialPath || !isVirtualPath(propInitialPath)) document.addEventListener('keydown', handleKeydown);
	return () => { if (!propInitialPath || !isVirtualPath(propInitialPath)) document.removeEventListener('keydown', handleKeydown); };
});
</script>

<div class="bg-muted/10 flex h-full flex-col overflow-hidden">
	<BreadcrumbBar onNavigate={handleNavigate} {homePath} />
	
	{#if displayTabs.length > 1 && !isVirtualInstance}
		<FolderTabBar {homePath} />
	{/if}

	<FolderToolbar onRefresh={handleRefresh} onToggleFolderTree={handleToggleFolderTree} onGoBack={handleGoBack} onGoForward={handleGoForward} onGoUp={handleGoUp} onGoHome={handleGoHome} onSetHome={handleSetHome} onToggleDeleteStrategy={handleToggleDeleteStrategy} onToggleInlineTree={handleToggleInlineTree} {showRandomTagBar} onToggleRandomTagBar={handleToggleRandomTagBar} />

	{#if $showSearchBar}
		<div class="relative">
			<div class="flex items-center gap-1">
				<div class="flex-1">
					<SearchBar placeholder="搜索文件..." value={$searchKeyword} onSearch={handleSearch} onSearchChange={(q) => folderTabActions.setSearchKeyword(q)} storageKey="neoview-folder-search-history" searchSettings={{ includeSubfolders: $searchSettings.includeSubfolders, showHistoryOnFocus: $searchSettings.showHistoryOnFocus, searchInPath: $searchSettings.searchInPath }} onSettingsChange={handleSearchSettingsChange} />
				</div>
				<button class="hover:bg-accent shrink-0 rounded border p-1.5 {showFavoriteTagPanel ? 'bg-primary/10 border-primary text-primary' : 'border-border'}" onclick={handleToggleFavoriteTagPanel} title="收藏标签"><Star class="h-4 w-4 {showFavoriteTagPanel ? 'fill-primary' : ''}" /></button>
			</div>
			<FavoriteTagPanel visible={showFavoriteTagPanel} enableMixed={mixedGenderStore.enabled} onClose={handleCloseFavoriteTagPanel} onAppendTag={handleAppendTag} onUpdateEnableMixed={(v) => { mixedGenderStore.enabled = v; }} />
		</div>
	{/if}

	{#if $showMigrationBar}<MigrationBar showManager={showMigrationManager} onToggleManager={handleToggleMigrationManager} />{/if}

	{#if showRandomTagBar}
		<div class="bg-muted/30 border-border flex items-center gap-1.5 border-b px-2 py-1.5">
			<span class="text-muted-foreground shrink-0 text-xs">推荐:</span>
			<div class="flex flex-1 flex-wrap items-center gap-1">
				{#each randomTags as tag (tag.id)}<TagChip tag={tag.id} category={tag.cat} display={tag.display} color={tag.isCollect ? tag.color : undefined} isCollect={tag.isCollect} onClick={() => handleRandomTagClick(tag)} />{/each}
			</div>
			<button class="hover:bg-accent text-muted-foreground rounded p-1" onclick={refreshRandomTags} title="刷新"><RefreshCw class="h-3.5 w-3.5" /></button>
		</div>
	{/if}

	{#if $multiSelectMode}<SelectionBar onDelete={handleBatchDelete} />{/if}

	<div class="relative flex-1 overflow-hidden">
		{#if $folderTreeConfig.visible}
			<div class="border-muted bg-muted/10 absolute z-10 overflow-auto" class:border-b={$folderTreeConfig.layout === 'top'} class:border-r={$folderTreeConfig.layout === 'left'} style={$folderTreeConfig.layout === 'top' ? `top: 0; left: 0; right: 0; height: ${$folderTreeConfig.size}px;` : `top: 0; left: 0; bottom: 0; width: ${$folderTreeConfig.size}px;`}>
				<FolderTree onNavigate={handleNavigate} onContextMenu={handleContextMenu} />
			</div>
			<div class="hover:bg-primary/20 absolute z-20 transition-colors {$folderTreeConfig.layout === 'left' ? 'top-0 bottom-0 -ml-1 w-2 cursor-ew-resize' : 'right-0 left-0 -mt-1 h-2 cursor-ns-resize'}" style={$folderTreeConfig.layout === 'left' ? `left: ${$folderTreeConfig.size}px;` : `top: ${$folderTreeConfig.size}px;`} onmousedown={startTreeResize} role="separator" tabindex="0"></div>
		{/if}

		<div class="file-list-container bg-muted/10 absolute inset-0 overflow-hidden" style={$folderTreeConfig.visible ? ($folderTreeConfig.layout === 'top' ? `top: ${$folderTreeConfig.size}px;` : `left: ${$folderTreeConfig.size}px;`) : ''}>
			{#each displayTabs as tab (tab.id)}
				<div class="absolute inset-0" class:hidden={tab.id !== displayActiveTabId} class:pointer-events-none={tab.id !== displayActiveTabId}>
					{#if $isSearching || $searchResults.length > 0}
						<SearchResultList onItemClick={handleSearchResultClick} onItemDoubleClick={handleSearchResultClick} onItemContextMenu={handleContextMenu} />
					{:else if $inlineTreeMode}
						<InlineTreeList onItemClick={handleItemOpen} onItemDoubleClick={handleItemOpen} onItemContextMenu={handleContextMenu} />
					{:else}
						<FolderStack tabId={tab.id} initialPath={tab.currentPath || tab.homePath} {navigationCommand} onItemOpen={handleItemOpen} onItemDelete={handleDelete} onItemContextMenu={handleContextMenu} onOpenFolderAsBook={handleOpenFolderAsBook} onOpenInNewTab={handleOpenInNewTab} forceActive={isVirtualInstance} />
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<FolderContextMenu item={contextMenu.item} x={contextMenu.x} y={contextMenu.y} visible={contextMenu.visible} onClose={closeContextMenu} onOpenAsBook={handleItemOpen} onBrowse={(item) => navigationCommand.set({ type: 'push', path: item.path })} onOpenInNewTab={handleOpenInNewTab} onCopy={handleCopy} onCut={handleCut} onPaste={handlePaste} onDelete={handleDelete} onRename={handleRename} onAddBookmark={handleAddBookmark} onCopyPath={handleCopyPath} onCopyName={handleCopyName} onOpenInExplorer={handleOpenInExplorer} onOpenWithSystem={handleOpenWithSystem} />

<ConfirmDialog bind:open={confirmDialogOpen} title={confirmDialogTitle} description={confirmDialogDescription} confirmText={confirmDialogConfirmText} variant={confirmDialogVariant} onConfirm={confirmDialogOnConfirm} />

{#if renameDialogItem}<RenameDialog bind:open={renameDialogOpen} title="重命名" initialValue={renameDialogItem.name} onConfirm={executeRename} onCancel={() => { renameDialogItem = null; }} />{/if}

<style>
.file-list-container { contain: strict; content-visibility: auto; }
</style>
