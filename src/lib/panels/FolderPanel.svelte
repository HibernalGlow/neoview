<script lang="ts">
/**
 * 文件夹面板 - 使用新的模块化架构
 * 支持完整的文件夹浏览功能
 */
import { onMount } from 'svelte';
import { get } from 'svelte/store';
import { homeDir } from '@tauri-apps/api/path';
import { createPanelStore, panelEventBus, DEFAULT_CONFIGS } from './core';
import PanelToolbar from './components/PanelToolbar.svelte';
import BreadcrumbBar from '$lib/components/panels/folderPanel/components/BreadcrumbBar.svelte';
import FolderStack from '$lib/components/panels/folderPanel/components/FolderStack.svelte';
import SearchBar from '$lib/components/ui/SearchBar.svelte';
import MigrationBar from '$lib/components/panels/folderPanel/components/MigrationBar.svelte';
import SelectionBar from '$lib/components/panels/folderPanel/components/SelectionBar.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { historyStore } from '$lib/stores/history.svelte';
import { FileSystemAPI } from '$lib/api';
import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
import { writable } from 'svelte/store';
import type { FsItem } from '$lib/types';

// Props
interface Props {
    initialPath?: string;
}
let { initialPath }: Props = $props();

// 创建文件夹面板专用的 store
let store = $state(createPanelStore('folder', ''));
const config = DEFAULT_CONFIGS.folder;

// 内部状态
let homePath = $state('');
let searchKeyword = $state('');
let showMigrationManager = $state(false);

// 导航命令 (用于 FolderStack)
const navigationCommand = writable<{
    type: 'init' | 'push' | 'pop' | 'goto' | 'history';
    path?: string;
    index?: number;
} | null>(null);

// ==================== 导航操作 ====================
function handleNavigate(path: string) {
    store.navigate(path);
    navigationCommand.set({ type: 'push', path });
}

function handleGoBack() {
    const path = store.goBack();
    if (path) {
        navigationCommand.set({ type: 'history', path });
    }
}

function handleGoForward() {
    const path = store.goForward();
    if (path) {
        navigationCommand.set({ type: 'history', path });
    }
}

function handleGoUp() {
    const path = store.currentPath;
    if (!path) return;
    const normalized = path.replace(/\//g, '\\');
    const parts = normalized.split('\\').filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    let parentPath = parts.join('\\');
    if (/^[a-zA-Z]:$/.test(parentPath)) parentPath += '\\';
    handleNavigate(parentPath);
}

function handleGoHome() {
    if (homePath) {
        navigationCommand.set({ type: 'init', path: homePath });
    }
}

function handleRefresh() {
    const path = store.currentPath;
    if (path) {
        navigationCommand.set({ type: 'init', path });
    }
}

// ==================== 文件操作 ====================
async function handleItemOpen(item: FsItem) {
    if (item.isDir) return;
    
    try {
        const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
        if (isArchive) {
            await bookStore.openBook(item.path);
        } else if (item.isImage || isImagePath(item.path)) {
            const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
            const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
            await bookStore.openDirectoryAsBook(parentPath);
            await bookStore.navigateToImage(item.path);
        } else {
            await bookStore.openBook(item.path);
        }
        
        // 添加到历史
        historyStore.add(item.path, item.name);
        
        // 通知其他面板
        panelEventBus.emitItemOpened('folder', item.path);
        panelEventBus.emitHistoryUpdated(item.path);
    } catch (err) {
        showErrorToast('打开失败', err instanceof Error ? err.message : String(err));
    }
}

function isImagePath(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'jxl', 'bmp', 'tiff'].includes(ext);
}

// ==================== 删除操作 ====================
async function handleDelete(paths: string[]) {
    let successCount = 0;
    let failCount = 0;
    
    for (const p of paths) {
        try {
            await FileSystemAPI.moveToTrash(p);
            successCount++;
        } catch {
            failCount++;
        }
    }
    
    store.deselectAll();
    
    if (successCount > 0) {
        showSuccessToast('删除成功', `已删除 ${successCount} 项`);
        handleRefresh();
        // 通知其他面板
        panelEventBus.emitItemDeleted('folder', paths);
    }
    if (failCount > 0) {
        showErrorToast('部分失败', `${failCount} 项删除失败`);
    }
}

// ==================== 书签操作 ====================
function handleAddBookmark(item: FsItem) {
    bookmarkStore.add(item);
    showSuccessToast('书签已添加', item.name);
    panelEventBus.emitBookmarkAdded(item.path);
}

// ==================== 搜索 ====================
function handleSearch(keyword: string) {
    searchKeyword = keyword;
}

// ==================== 事件监听 ====================
// 监听其他面板的路径变更请求（如书签同步）
$effect(() => {
    const unsub = panelEventBus.on('path-changed', (event) => {
        if (event.source !== 'folder') {
            const data = event.data as { path?: string; syncToFolder?: boolean };
            if (data?.syncToFolder && data.path) {
                handleNavigate(data.path);
            }
        }
    });
    return unsub;
});

// ==================== 生命周期 ====================
onMount(async () => {
    try {
        const savedHome = localStorage.getItem('neoview-homepage-path');
        const defaultHome = initialPath || (await homeDir());
        homePath = savedHome || defaultHome;
        
        // 重新创建 store（因为需要初始路径）
        store = createPanelStore('folder', homePath);
        navigationCommand.set({ type: 'init', path: homePath });
    } catch (err) {
        console.error('[FolderPanel] Init error:', err);
    }
});
</script>

<div class="bg-muted/10 flex h-full flex-col overflow-hidden">
    <!-- 面包屑导航 -->
    <BreadcrumbBar
        onNavigate={handleNavigate}
        {homePath}
    />
    
    <!-- 工具栏 -->
    <PanelToolbar 
        {store} 
        {config}
        onRefresh={handleRefresh}
        onGoHome={handleGoHome}
    />
    
    <!-- 搜索栏 -->
    {#if store.showSearchBar}
        <div class="px-2 py-1">
            <SearchBar
                placeholder="搜索文件..."
                value={searchKeyword}
                onSearch={handleSearch}
                onSearchChange={(q) => searchKeyword = q}
                storageKey="neoview-folder-search-history"
            />
        </div>
    {/if}
    
    <!-- 迁移栏 -->
    {#if store.showMigrationBar}
        <MigrationBar
            showManager={showMigrationManager}
            onToggleManager={() => showMigrationManager = !showMigrationManager}
        />
    {/if}
    
    <!-- 多选操作栏 -->
    {#if store.selectedItems.size > 0}
        <SelectionBar onDelete={() => handleDelete([...store.selectedItems])} />
    {/if}
    
    <!-- 文件列表 -->
    <div class="flex-1 overflow-hidden">
        <FolderStack
            tabId="main"
            initialPath={homePath}
            {navigationCommand}
            onItemOpen={handleItemOpen}
            onItemDelete={(item) => handleDelete([item.path])}
            skipGlobalStore={true}
            overrideMultiSelectMode={store.multiSelectMode}
            overrideDeleteMode={store.deleteMode}
            overrideViewStyle={store.viewStyle}
            overrideSortConfig={store.sortConfig}
        />
    </div>
</div>
