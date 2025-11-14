// FileBrowserPanel.svelte - 容器组件
<script lang="ts">
  import { setContext } from 'svelte';
  import { onMount } from 'svelte';
  import Toolbar from './file-browser-toolbar.svelte';
  import List from './file-browser-list.svelte';
  import Sidebar from './file-browser-sidebar.svelte';
  import ContextMenu from './file-browser-context-menu.svelte';
  import { useFileBrowser } from './hooks/useFileBrowser';
  import { useThumbnailQueue } from './hooks/useThumbnailQueue';
  import type { FsItem } from '$lib/types';

  // 初始化业务 hooks
  const fileBrowser = useFileBrowser();
  const thumbnailQueue = useThumbnailQueue({ store: fileBrowser.store });

  // 响应式状态
  const state = $derived(fileBrowser.store.getState());

  // 监听文件列表变化，自动入队缩略图
  $effect(() => {
    if (state.items.length > 0) {
      thumbnailQueue.enqueueBatch(state.items, { 
        priority: 'high', 
        source: state.currentPath 
      });
    }
  });

  // 暴露给子组件的上下文
  setContext('fileBrowser', fileBrowser);
  setContext('thumbnailQueue', thumbnailQueue);

  // 处理文件夹打开（提升优先级）
  function handleOpenFolder(item: FsItem) {
    if (item.is_dir) {
      thumbnailQueue.boostPriority(item.path);
      fileBrowser.openFolder(item);
    }
  }

  // 处理文件打开
  function handleOpenFile(item: FsItem) {
    if (!item.is_dir) {
      fileBrowser.openFile(item);
    }
  }
</script>

<div class="file-browser-panel">
  <!-- 顶部工具栏 -->
  <Toolbar
    currentPath={fileBrowser.currentPath}
    viewMode={fileBrowser.viewMode}
    searchState={fileBrowser.searchState}
    loading={fileBrowser.loading}
    onSelectFolder={fileBrowser.selectFolder}
    onNavigateHome={fileBrowser.goHome}
    onGoBack={fileBrowser.goBack}
    onGoForward={fileBrowser.goForward}
    onSearch={fileBrowser.performSearch}
    onToggleView={fileBrowser.toggleViewMode}
    onRefresh={fileBrowser.refresh}
  />

  <div class="file-browser-content">
    <!-- 左侧边栏 -->
    <Sidebar
      bookmarks={fileBrowser.bookmarks}
      history={fileBrowser.history}
      currentPath={fileBrowser.currentPath}
      onBookmarkClick={fileBrowser.openBookmark}
      onHistoryClick={fileBrowser.openHistoryItem}
    />

    <!-- 主内容区 -->
    <div class="main-content">
      <List
        items={fileBrowser.visibleItems}
        thumbnails={fileBrowser.thumbnails}
        viewMode={fileBrowser.viewMode}
        loading={fileBrowser.loading}
        selectedItems={fileBrowser.selectedItems}
        isCheckMode={fileBrowser.isCheckMode}
        isDeleteMode={fileBrowser.isDeleteMode}
        onOpenFolder={handleOpenFolder}
        onOpenFile={handleOpenFile}
        onContext={fileBrowser.showContextMenu}
        onToggleSelect={fileBrowser.toggleItemSelection}
        onSelectAll={fileBrowser.selectAll}
        onDeselectAll={fileBrowser.deselectAll}
      />
    </div>
  </div>

  <!-- 右键菜单 -->
  <ContextMenu 
    {...fileBrowser.contextMenuState} 
    onAction={fileBrowser.handleContextAction} 
  />
</div>

<style>
  .file-browser-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
  }

  .file-browser-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    overflow: auto;
  }
</style>