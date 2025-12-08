<script lang="ts">
/**
 * 书签面板 - 使用新的模块化架构
 */
import { onMount } from 'svelte';
import { createPanelStore, panelEventBus, DEFAULT_CONFIGS } from './core';
import PanelToolbar from './components/PanelToolbar.svelte';
import PanelBreadcrumb from './components/PanelBreadcrumb.svelte';
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { historyStore } from '$lib/stores/history.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { historySettingsStore } from '$lib/stores/historySettings.svelte';
import type { FsItem } from '$lib/types';
import { SvelteSet } from 'svelte/reactivity';

// 创建书签面板专用的 store
const store = createPanelStore('bookmark', 'virtual://bookmark');
const config = DEFAULT_CONFIGS.bookmark;

// 转换书签为 FsItem 格式
function bookmarkToFsItem(bookmark: { path: string; name: string; createdAt: Date }): FsItem {
    return {
        path: bookmark.path,
        name: bookmark.name,
        isDir: false,
        isImage: true,
        size: 0,
        modified: bookmark.createdAt.getTime()
    };
}

// 加载书签数据
async function loadBookmarks() {
    const bookmarks = bookmarkStore.getAll();
    const items = bookmarks.map(b => bookmarkToFsItem(b));
    store.setItems(items);
}

// 打开项目
async function handleItemOpen(item: FsItem) {
    try {
        await bookStore.openBook(item.path);
        
        // 添加到历史记录
        historyStore.add(item.path, item.name);
        
        // 如果开启了同步文件夹功能，触发导航
        if (historySettingsStore.syncFileTreeOnBookmarkSelect) {
            const lastSep = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'));
            const parentPath = lastSep > 0 ? item.path.substring(0, lastSep) : item.path;
            panelEventBus.emit({
                type: 'path-changed',
                source: 'bookmark',
                data: { path: parentPath, syncToFolder: true }
            });
        }
        
        // 通知其他面板
        panelEventBus.emitItemOpened('bookmark', item.path);
        panelEventBus.emitHistoryUpdated(item.path);
    } catch (err) {
        console.error('[BookmarkPanel] Failed to open:', err);
    }
}

// 删除项目（从书签中移除，不删文件）
async function handleDelete(paths: string[]) {
    for (const path of paths) {
        bookmarkStore.removeByPath(path);
    }
    store.deselectAll();
    await loadBookmarks();
    // 通知其他面板
    panelEventBus.emitItemDeleted('bookmark', paths);
}

// 刷新
function handleRefresh() {
    loadBookmarks();
}

// 监听书签添加事件
$effect(() => {
    const unsub = panelEventBus.on('bookmark-added', () => {
        loadBookmarks();
    });
    return unsub;
});

// 监听项目删除事件（其他面板删除文件时同步更新书签）
$effect(() => {
    const unsub = panelEventBus.on('item-deleted', (event) => {
        if (event.source === 'folder') {
            // 文件夹面板删除了真实文件，检查是否需要从书签移除
            const paths = (event.data as { paths: string[] })?.paths || [];
            let needRefresh = false;
            for (const path of paths) {
                if (bookmarkStore.has(path)) {
                    bookmarkStore.remove(path);
                    needRefresh = true;
                }
            }
            if (needRefresh) {
                loadBookmarks();
            }
        }
    });
    return unsub;
});

onMount(() => {
    loadBookmarks();
});
</script>

<div class="flex h-full flex-col overflow-hidden">
    <!-- 面包屑导航 -->
    <PanelBreadcrumb mode="bookmark" />
    
    <!-- 工具栏 -->
    <PanelToolbar
        {store}
        {config}
        onRefresh={handleRefresh}
    />
    
    <!-- 文件列表区域 -->
    <div class="flex-1 overflow-hidden">
        {#if store.items.length === 0}
            <div class="flex h-full items-center justify-center text-muted-foreground">
                <p>暂无书签</p>
            </div>
        {:else}
            <VirtualizedFileList
                items={store.items}
                currentPath="virtual://bookmark"
                isCheckMode={store.multiSelectMode}
                isDeleteMode={store.deleteMode}
                selectedItems={store.selectedItems}
                viewMode={store.viewStyle}
                thumbnailWidthPercent={store.thumbnailWidthPercent}
                onItemSelect={({ item }) => {
                    if (store.multiSelectMode) {
                        store.toggleSelect(item.path);
                    }
                }}
                onItemDoubleClick={({ item }) => handleItemOpen(item)}
                onSelectionChange={({ selectedItems: newItems }) => {
                    store.state.selectedItems = new SvelteSet(newItems);
                }}
            />
        {/if}
    </div>
    
    <!-- 底部操作栏 (当有选中项时显示) -->
    {#if store.selectedItems.size > 0}
        <div class="flex items-center gap-2 border-t p-2">
            <span class="text-sm text-muted-foreground">
                已选择 {store.selectedItems.size} 项
            </span>
            <div class="flex-1"></div>
            <button
                class="rounded bg-destructive px-3 py-1 text-sm text-destructive-foreground"
                onclick={() => handleDelete([...store.selectedItems])}
            >
                {config.deleteLabel}
            </button>
        </div>
    {/if}
</div>
