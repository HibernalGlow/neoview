<script lang="ts">
/**
 * SearchBar - 搜索栏组件
 * 接收 store，直接读写搜索关键字
 */
import { Search, X } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import type { historyViewStore } from '$lib/stores/historyViewStore.svelte';
import type { bookmarkViewStore } from '$lib/stores/bookmarkViewStore.svelte';

type Store = typeof historyViewStore | typeof bookmarkViewStore;

interface Props {
    store: Store;
}

let { store }: Props = $props();

function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    store.setSearchKeyword(target.value);
}

function handleClear() {
    store.setSearchKeyword('');
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        store.toggleSearch();
    }
}
</script>

<div class="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
    <Search class="h-4 w-4 text-muted-foreground" />
    <input
        type="text"
        placeholder="搜索..."
        value={store.searchKeyword}
        oninput={handleInput}
        onkeydown={handleKeydown}
        class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
    />
    {#if store.searchKeyword}
        <Button variant="ghost" size="icon" class="h-6 w-6" onclick={handleClear}>
            <X class="h-3 w-3" />
        </Button>
    {/if}
    <span class="text-xs text-muted-foreground">
        {store.filteredItems.length} / {store.itemCount}
    </span>
</div>
