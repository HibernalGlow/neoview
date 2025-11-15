<script lang="ts">
  import PathBar from '$lib/components/ui/PathBar.svelte';
  import FileBrowserToolbar from './FileBrowserToolbar.svelte';
  import FileBrowserSearch from './FileBrowserSearch.svelte';
  import FileBrowserList from './FileBrowserList.svelte';
  import FileBrowserEmptyState from './FileBrowserEmptyState.svelte';
  import { fileTreeStore } from '$lib/stores/fileTree.svelte';
  import type { FsItem } from '$lib/types';
  import type { SortConfig } from '../services/sortService';
  import type { SearchHistoryEntry, SearchSettings } from '../services/searchService';

  interface DataProps {
    currentPath: string;
    items: FsItem[];
    searchResults: FsItem[];
    loading: boolean;
    isSearching: boolean;
    error: string;
    searchQuery: string;
    searchHistory: SearchHistoryEntry[];
    searchSettings: SearchSettings;
    showSearchHistory: boolean;
    showSearchSettings: boolean;
    isArchiveView: boolean;
    hasHomepage: boolean;
    canNavigateBack: boolean;
    canGoBackInHistory: boolean;
    canGoForwardInHistory: boolean;
    isCheckMode: boolean;
    isDeleteMode: boolean;
    viewMode: 'list' | 'thumbnails';
    sortConfig: SortConfig;
    thumbnails: Map<string, string>;
    selectedItems: Set<string>;
    selectedIndex: number;
    fileListContainer?: HTMLDivElement;
  }

  interface HandlerSet {
    handlePathNavigate: (path: string) => Promise<void>;
    goHome: () => void;
    goBackInHistory: () => void;
    goForwardInHistory: () => void;
    goBack: () => Promise<void>;
    selectFolder: () => Promise<void>;
    refresh: () => Promise<void>;
    toggleCheckMode: () => void;
    toggleDeleteMode: () => void;
    toggleViewMode: () => void;
    clearThumbnailCache: () => Promise<void>;
    handleSortConfig: (config: SortConfig) => void;
    handleSearchInput: (value: string) => void;
    handleSearchFocus: () => void;
    toggleSearchHistoryDropdown: () => void;
    toggleSearchSettingsDropdown: (event: MouseEvent) => void;
    clearSearchField: () => void;
    selectSearchHistory: (item: SearchHistoryEntry) => void;
    removeSearchHistoryItem: (item: SearchHistoryEntry) => void;
    clearSearchHistory: () => void;
    updateSearchSetting: (key: 'includeSubfolders' | 'showHistoryOnFocus', value: boolean) => void;
    handleKeydown: (e: KeyboardEvent) => void;
    openSearchResult: (item: FsItem) => Promise<void>;
    deleteItem: (path: string) => Promise<void>;
    toggleItemSelection: (path: string) => void;
    openFile: (item: FsItem, index?: number) => Promise<void>;
  }

  interface Props {
    data: DataProps;
    handlers: HandlerSet;
    setHomepage: (path: string) => void;
  }

  let { data, handlers, setHomepage }: Props = $props();

  // 订阅 fileTreeStore 以获取当前路径
  let treeState = fileTreeStore.getState();
  const unsubscribe = fileTreeStore.subscribe(state => {
    treeState = state;
  });

  const shouldShowEmptyState = $derived(data.loading || 
    data.isSearching || 
    (data.searchQuery && data.searchResults.length === 0) || 
    data.items.length === 0);

  const shouldShowSearchResults = $derived(data.searchQuery && data.searchResults.length > 0);

  // 使用树状态作为当前路径
  const currentPath = $derived(treeState.selectedPath || data.currentPath);

  // 清理订阅会在组件销毁时自动处理
</script>

<div class="flex h-full flex-col">
  <!-- 路径面包屑导航 -->
  <PathBar 
    currentPath={currentPath} 
    isArchive={data.isArchiveView}
    onNavigate={(path) => {
      fileTreeStore.selectPath(path);
      handlers.handlePathNavigate(path);
    }}
    onSetHomepage={setHomepage}
    navigationState={{
      canGoBack: data.canNavigateBack,
      canGoForward: data.canGoForwardInHistory,
      canGoHome: data.hasHomepage,
      hasHomepage: data.hasHomepage
    }}
  />

  <!-- 工具栏 -->
  <FileBrowserToolbar
    isArchiveView={data.isArchiveView}
    hasHomepage={data.hasHomepage}
    canGoBackInHistory={data.canGoBackInHistory}
    canGoForwardInHistory={data.canGoForwardInHistory}
    canNavigateBack={data.canNavigateBack}
    isCheckMode={data.isCheckMode}
    isDeleteMode={data.isDeleteMode}
    viewMode={data.viewMode}
    sortConfig={data.sortConfig}
    onGoHome={handlers.goHome}
    onGoBackInHistory={handlers.goBackInHistory}
    onGoForwardInHistory={handlers.goForwardInHistory}
    onGoBack={handlers.goBack}
    onSelectFolder={handlers.selectFolder}
    onRefresh={handlers.refresh}
    onToggleCheckMode={handlers.toggleCheckMode}
    onToggleDeleteMode={handlers.toggleDeleteMode}
    onToggleViewMode={handlers.toggleViewMode}
    onClearThumbnailCache={handlers.clearThumbnailCache}
    onSort={handlers.handleSortConfig}
  />

  <!-- 搜索栏 -->
  <FileBrowserSearch
    searchQuery={data.searchQuery}
    searchHistory={data.searchHistory}
    searchSettings={data.searchSettings}
    showSearchHistory={data.showSearchHistory}
    showSearchSettings={data.showSearchSettings}
    isArchiveView={data.isArchiveView}
    currentPath={data.currentPath}
    onSearchInput={handlers.handleSearchInput}
    onSearchFocus={handlers.handleSearchFocus}
    onSearchHistoryToggle={handlers.toggleSearchHistoryDropdown}
    onSearchSettingsToggle={handlers.toggleSearchSettingsDropdown}
    onClearSearch={handlers.clearSearchField}
    onSelectSearchHistory={handlers.selectSearchHistory}
    onRemoveSearchHistoryItem={handlers.removeSearchHistoryItem}
    onClearSearchHistory={handlers.clearSearchHistory}
    onSearchSettingChange={handlers.updateSearchSetting}
  />

  <!-- 错误提示 -->
  {#if data.error}
    <div class="m-2 rounded bg-red-50 p-3 text-sm text-red-600">
      {data.error}
    </div>
  {:else if shouldShowEmptyState}
    <FileBrowserEmptyState
      loading={data.loading}
      isSearching={data.isSearching}
      searchQuery={data.searchQuery}
      hasSearchResults={data.searchResults.length > 0}
      itemsCount={data.items.length}
      currentPath={data.currentPath}
      onSelectFolder={handlers.selectFolder}
    />
  {:else if shouldShowSearchResults}
    <FileBrowserList
      listLabel="搜索结果列表"
      items={data.searchResults}
      isSearchResults={true}
      isCheckMode={data.isCheckMode}
      isDeleteMode={data.isDeleteMode}
      isArchiveView={data.isArchiveView}
      selectedIndex={data.selectedIndex}
      selectedItems={data.selectedItems}
      thumbnails={data.thumbnails}
      containerRef={data.fileListContainer}
      onKeydown={handlers.handleKeydown}
      onRowClick={(item) => handlers.openSearchResult(item)}
      onRowKeyboardActivate={(item) => handlers.openSearchResult(item)}
      onToggleSelection={handlers.toggleItemSelection}
      onInlineDelete={(item) => handlers.deleteItem(item.path)}
    >
      <div slot="header" class="mb-3 text-sm text-gray-600 px-2">
        找到 {data.searchResults.length} 个结果 (搜索: "{data.searchQuery}")
      </div>
    </FileBrowserList>
  {:else}
    <FileBrowserList
      listLabel="文件列表"
      items={data.items}
      isSearchResults={false}
      isCheckMode={data.isCheckMode}
      isDeleteMode={data.isDeleteMode}
      isArchiveView={data.isArchiveView}
      selectedIndex={data.selectedIndex}
      selectedItems={data.selectedItems}
      thumbnails={data.thumbnails}
      containerRef={data.fileListContainer}
      onKeydown={handlers.handleKeydown}
      onRowClick={(item, index) => {
        if (!data.isCheckMode && !data.isDeleteMode) {
          handlers.openFile(item, index);
        }
      }}
      onRowKeyboardActivate={(item, index) => {
        if (!data.isCheckMode && !data.isDeleteMode) {
          handlers.openFile(item, index);
        }
      }}
      onToggleSelection={handlers.toggleItemSelection}
      onInlineDelete={(item) => handlers.deleteItem(item.path)}
    />
  {/if}
</div>