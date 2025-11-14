<script lang="ts">
  import { Search, ChevronDown, MoreVertical } from '@lucide/svelte';
  import FileBrowserSearchHistory from './FileBrowserSearchHistory.svelte';
  import FileBrowserSearchSettings from './FileBrowserSearchSettings.svelte';

  interface Props {
    searchQuery?: string;
    searchHistory?: { query: string; timestamp: number }[];
    searchSettings?: {
      includeSubfolders: boolean;
      showHistoryOnFocus: boolean;
    };
    showSearchHistory?: boolean;
    showSearchSettings?: boolean;
    isArchiveView?: boolean;
    currentPath?: string;
    onSearchInput?: (value: string) => void;
    onSearchFocus?: () => void;
    onSearchHistoryToggle?: () => void;
    onSearchSettingsToggle?: (event: MouseEvent) => void;
    onClearSearch?: () => void;
    onSelectSearchHistory?: (item: { query: string; timestamp: number }) => void;
    onRemoveSearchHistoryItem?: (item: { query: string; timestamp: number }) => void;
    onClearSearchHistory?: () => void;
    onSearchSettingChange?: (key: 'includeSubfolders' | 'showHistoryOnFocus', value: boolean) => void;
  }

  let {
    searchQuery = '',
    searchHistory = [],
    searchSettings = {
      includeSubfolders: true,
      showHistoryOnFocus: true,
    },
    showSearchHistory = false,
    showSearchSettings = false,
    isArchiveView = false,
    currentPath = '',
    onSearchInput = () => {},
    onSearchFocus = () => {},
    onSearchHistoryToggle = () => {},
    onSearchSettingsToggle = () => {},
    onClearSearch = () => {},
    onSelectSearchHistory = () => {},
    onRemoveSearchHistoryItem = () => {},
    onClearSearchHistory = () => {},
    onSearchSettingChange = () => {}
  }: Props = $props();
</script>

<div class="flex items-center gap-2 border-b px-2 py-2 bg-background/30">
  <div class="relative flex-1">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        class="w-full rounded border border-input bg-background px-10 pr-24 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
        placeholder="搜索当前目录下的文件..."
        value={searchQuery}
        oninput={(event) => onSearchInput((event.target as HTMLInputElement).value)}
        onfocus={onSearchFocus}
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
      <FileBrowserSearchHistory
        {searchHistory}
        onSelect={onSelectSearchHistory}
        onRemoveItem={onRemoveSearchHistoryItem}
        onClearAll={onClearSearchHistory}
      />
    {/if}

    {#if showSearchSettings}
      <FileBrowserSearchSettings
        searchSettings={searchSettings}
        onChange={onSearchSettingChange}
      />
    {/if}
  </div>
</div>
