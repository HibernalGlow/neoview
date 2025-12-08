<script lang="ts">
/**
 * FileList - 文件列表组件
 * 包装 VirtualizedFileList，接收 store
 */
import VirtualizedFileList from '$lib/components/panels/file/components/VirtualizedFileListV2.svelte';
import type { historyViewStore } from '$lib/stores/historyViewStore.svelte';
import type { bookmarkViewStore } from '$lib/stores/bookmarkViewStore.svelte';

type Store = typeof historyViewStore | typeof bookmarkViewStore;

interface Props {
    store: Store;
}

let { store }: Props = $props();

// 映射 viewStyle 到 VirtualizedFileList 的 viewMode
function mapViewMode(style: string) {
    switch (style) {
        case 'list': return 'list';
        case 'content': return 'content';
        case 'banner': return 'banner';
        case 'thumbnail': return 'thumbnail';
        default: return 'list';
    }
}
</script>

<div class="flex-1 overflow-hidden">
    {#if store.isLoading}
        <div class="flex h-full items-center justify-center text-muted-foreground">
            <p>加载中...</p>
        </div>
    {:else if store.filteredItems.length === 0}
        <div class="flex h-full items-center justify-center text-muted-foreground">
            <p>{store.config.labels.emptyMessage}</p>
        </div>
    {:else}
        <VirtualizedFileList
            items={store.filteredItems}
            currentPath={`virtual://${store.config.mode}`}
            isCheckMode={store.multiSelectMode}
            isDeleteMode={store.deleteMode}
            selectedItems={store.selectedItems}
            viewMode={mapViewMode(store.viewStyle)}
            thumbnailWidthPercent={store.thumbnailWidth}
            onItemSelect={({ item }) => {
                if (store.multiSelectMode || store.deleteMode) {
                    store.toggleSelect(item.path);
                }
            }}
            onItemDoubleClick={({ item }) => store.openItem(item)}
            onSelectionChange={({ selectedItems: newItems }) => {
                // 同步选择状态
                store.deselectAll();
                newItems.forEach(path => store.select(path));
            }}
        />
    {/if}
</div>
