<script lang="ts">
  import { Search } from '@lucide/svelte';

  type SearchHistoryItem = { query: string; timestamp: number };

  interface Props {
    searchHistory?: SearchHistoryItem[];
    className?: string;
    onSelect: (item: SearchHistoryItem) => void;
    onRemoveItem: (item: SearchHistoryItem) => void;
    onClearAll: () => void;
  }

  let {
    searchHistory = [],
    className = '',
    onSelect = () => {},
    onRemoveItem = () => {},
    onClearAll = () => {}
  }: Props = $props();

  const formatSearchHistoryTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${month}月${day}日 ${hours}:${minutes}:${seconds}`;
  };
</script>

<div class={`search-history absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto ${className}`}>
  {#if searchHistory.length > 0}
    {#each searchHistory as item (item.query)}
      <div
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between group cursor-pointer"
        role="button"
        tabindex="0"
        onclick={() => onSelect(item)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item);
          }
        }}
      >
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <Search class="h-4 w-4 text-gray-400 shrink-0" />
          <span class="truncate">{item.query}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">{formatSearchHistoryTime(item.timestamp)}</span>
          <button
            class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded shrink-0"
            onclick={(e) => {
              e.stopPropagation();
              onRemoveItem(item);
            }}
            title="删除"
          >
            <svg class="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    {/each}
    <div class="border-t border-gray-200 p-2">
      <button
        class="w-full px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
        onclick={onClearAll}
      >
        清除搜索历史
      </button>
    </div>
  {:else}
    <div class="p-3 text-center text-sm text-gray-500">
      暂无搜索历史
    </div>
  {/if}
</div>
