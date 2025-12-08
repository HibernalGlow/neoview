<script lang="ts">
/**
 * SelectionBar - 选择操作栏
 * 显示选中数量，提供批量操作
 */
import { CheckSquare, X, Trash2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import type { historyViewStore } from '$lib/stores/historyViewStore.svelte';
import type { bookmarkViewStore } from '$lib/stores/bookmarkViewStore.svelte';

type Store = typeof historyViewStore | typeof bookmarkViewStore;

interface Props {
    store: Store;
}

let { store }: Props = $props();

async function handleDelete() {
    await store.deleteSelected();
}
</script>

<div class="flex items-center gap-2 px-3 py-2 border-b bg-primary/5">
    <CheckSquare class="h-4 w-4 text-primary" />
    <span class="text-sm">
        已选择 <strong>{store.selectedCount}</strong> 项
    </span>
    
    <div class="flex-1"></div>
    
    <Button variant="ghost" size="sm" class="h-7" onclick={() => store.selectAll()}>
        全选
    </Button>
    
    <Button variant="ghost" size="sm" class="h-7" onclick={() => store.deselectAll()}>
        <X class="mr-1 h-3 w-3" />
        取消
    </Button>
    
    <Button variant="destructive" size="sm" class="h-7" onclick={handleDelete}>
        <Trash2 class="mr-1 h-3 w-3" />
        {store.config.labels.deleteLabel}
    </Button>
</div>
