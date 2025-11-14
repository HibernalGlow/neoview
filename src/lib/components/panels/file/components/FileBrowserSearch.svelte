<script lang="ts">
  import { Search, ChevronDown, MoreVertical } from '@lucide/svelte';

  export let searchQuery = '';
  export let searchHistory: { query: string; timestamp: number }[] = [];
  export let searchSettings = {
    includeSubfolders: true,
    showHistoryOnFocus: true,
  };
  export let showSearchHistory = false;
  export let showSearchSettings = false;
  export let isArchiveView = false;
  export let currentPath = '';

  export let onSearchInput: (value: string) => void = () => {};
  export let onSearchFocus: () => void = () => {};
  export let onSearchHistoryToggle: () => void = () => {};
  export let onSearchSettingsToggle: (event: MouseEvent) => void = () => {};
  export let onClearSearch: () => void = () => {};
  export let onSelectSearchHistory: (item: { query: string; timestamp: number }) => void = () => {};
  export let onClearSearchHistory: () => void = () => {};
  export let onSearchSettingChange: (key: 'includeSubfolders' | 'showHistoryOnFocus', value: boolean) => void = () => {};

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

<div class="flex items-center gap-2 border-b px-2 py-2 bg-background/30">
  <div class="relative flex-1">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        class="w-full rounded border border-input bg-background px-10 pr-24 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
        placeholder="搜索当前目录下的文件..."
        value={searchQuery}
        on:input={(event) => onSearchInput((event.target as HTMLInputElement).value)}
        on:focus={onSearchFocus}
        disabled={!currentPath || isArchiveView}
      />

      {#if searchQuery}
        <button
          class="absolute right-16 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
          onclick={onClearSearch}
          title="清空搜索"
        >
          <svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}

      <button
        class="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
        onclick={onSearchHistoryToggle}
        disabled={searchHistory.length === 0}
        title="搜索历史"
      >
        <ChevronDown class="h-4 w-4 text-gray-500" />
      </button>

      <button
        class="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
        onclick={onSearchSettingsToggle}
        title="搜索设置"
      >
        <MoreVertical class="h-4 w-4 text-gray-500" />
      </button>
    </div>

    {#if showSearchHistory}
      <div class="search-history absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
        {#if searchHistory.length > 0}
          {#each searchHistory as item (item.query)}
            <div
              class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between group cursor-pointer"
              role="button"
              tabindex="0"
              onclick={() => onSelectSearchHistory(item)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSearchHistory(item);
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
                    onClearSearchHistory();
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
              onclick={onClearSearchHistory}
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
    {/if}

    {#if showSearchSettings}
      <div class="search-settings absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] p-2">
        <div class="space-y-3">
          <div class="pb-2">
            <h4 class="text-xs font-semibold text-gray-700 mb-2">搜索选项</h4>

            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={searchSettings.includeSubfolders}
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                onchange={(event) => onSearchSettingChange('includeSubfolders', (event.target as HTMLInputElement).checked)}
              />
              <span>搜索子文件夹</span>
            </label>

            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={searchSettings.showHistoryOnFocus}
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                onchange={(event) => onSearchSettingChange('showHistoryOnFocus', (event.target as HTMLInputElement).checked)}
              />
              <span>聚焦时显示历史</span>
            </label>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
