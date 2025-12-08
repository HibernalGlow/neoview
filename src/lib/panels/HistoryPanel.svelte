<script lang="ts">
/**
 * 历史面板 - 使用新的模块化架构
 * 展示如何用搭积木的方式组合面板
 */
import { onMount } from 'svelte';
import { createPanelStore, panelEventBus, DEFAULT_CONFIGS } from './core';
import PanelToolbar from './components/PanelToolbar.svelte';
import PanelBreadcrumb from './components/PanelBreadcrumb.svelte';
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import { historyStore } from '$lib/stores/history.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import type { FsItem } from '$lib/types';
import { SvelteSet } from 'svelte/reactivity';

// 创建历史面板专用的 store
const store = createPanelStore('history', 'virtual://history');
const config = DEFAULT_CONFIGS.history;

// 转换历史记录为 FsItem 格式
function historyToFsItem(entry: { path: string; name: string; timestamp: number }): FsItem {
    return {
        path: entry.path,
        name: entry.name,
        isDir: false,
        isImage: true,
        size: 0,
        modified: entry.timestamp
    };
}

// 加载历史数据
async function loadHistory() {
    const records = historyStore.getAll();
    const items = records.map(r => historyToFsItem(r));
    store.setItems(items);
}

// 打开项目
async function handleItemOpen(item: FsItem) {
    try {
        await bookStore.openBook(item.path);
        // 通知其他面板
        panelEventBus.emitItemOpened('history', item.path);
    } catch (err) {
        console.error('[HistoryPanel] Failed to open:', err);
    }
}

// 删除项目（从历史记录中移除，不删文件）
async function handleDelete(paths: string[]) {
    for (const path of paths) {
        historyStore.remove(path);
    }
    store.deselectAll();
    await loadHistory();
    // 通知其他面板
    panelEventBus.emitItemDeleted('history', paths);
}

// 刷新
function handleRefresh() {
    loadHistory();
}

// 监听书签打开事件，更新历史
$effect(() => {
    const unsub = panelEventBus.on('item-opened', (event) => {
        if (event.source !== 'history') {
            // 其他面板打开的项目，可能需要更新历史显示
            loadHistory();
        }
    });
    return unsub;
});

onMount(() => {
    loadHistory();
});
</script>

<div class="flex h-full flex-col overflow-hidden">
    <!-- 面包屑导航 -->
    <PanelBreadcrumb mode="history" />
    
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
                <p>暂无历史记录</p>
            </div>
        {:else}
            <VirtualizedFileList
                items={store.items}
                currentPath="virtual://history"
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
