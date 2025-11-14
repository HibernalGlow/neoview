<!-- file-browser-list.svelte - 文件列表 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileCard from './file-card.svelte';
  import LoadingSpinner from '$lib/components/ui/loading-spinner.svelte';
  import type { FsItem } from '$lib/types';
  
  interface Props {
    items?: FsItem[];
    thumbnails?: Map<string, string>;
    viewMode?: 'list' | 'thumbnails';
    loading?: boolean;
    selectedItems?: Set<string>;
    isCheckMode?: boolean;
    isDeleteMode?: boolean;
  }
  
  let {
    items = [],
    thumbnails = new Map(),
    viewMode = 'list',
    loading = false,
    selectedItems = new Set(),
    isCheckMode = false,
    isDeleteMode = false
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  function handleOpen(item: FsItem) {
    dispatch('open', { item });
  }
  
  function handleContextMenu(event: MouseEvent, item: FsItem) {
    event.preventDefault();
    dispatch('context', { event, item });
  }
  
  function handleToggleSelect(item: FsItem) {
    dispatch('toggleSelect', { path: item.path });
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      dispatch('selectAll');
    }
  }
</script>

<div 
  class="file-browser-list" 
  class:view-thumbnails={viewMode === 'thumbnails'}
  class:view-list={viewMode === 'list'}
  on:keydown={handleKeyDown}
  tabindex="0"
>
  {#if loading}
    <div class="loading-container">
      <LoadingSpinner />
      <span>加载中...</span>
    </div>
  {:else if !items.length}
    <div class="empty-state">
      <div class="empty-icon">📂</div>
      <h3>当前目录为空</h3>
      <p>此文件夹中没有文件或子文件夹</p>
    </div>
  {:else}
    <div class="file-grid">
      {#each items as item (item.path)}
        <FileCard
          {item}
          thumbnail={thumbnails.get(item.path)}
          viewMode={viewMode}
          selected={selectedItems.has(item.path)}
          isCheckMode={isCheckMode}
          isDeleteMode={isDeleteMode}
          on:open={() => handleOpen(item)}
          on:context={(e) => handleContextMenu(e.detail.event, item)}
          on:toggleSelect={() => handleToggleSelect(item)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .file-browser-list {
    flex: 1;
    padding: 16px;
    overflow: auto;
    outline: none;
  }
  
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 12px;
    color: var(--muted);
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    text-align: center;
    color: var(--muted);
  }
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  .empty-state h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 500;
    color: var(--foreground);
  }
  
  .empty-state p {
    margin: 0;
    font-size: 14px;
  }
  
  .file-grid {
    display: grid;
    gap: 12px;
  }
  
  /* 列表视图 */
  .view-list .file-grid {
    grid-template-columns: 1fr;
  }
  
  /* 缩略图视图 */
  .view-thumbnails .file-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
  
  /* 响应式调整 */
  @media (max-width: 768px) {
    .file-browser-list {
      padding: 8px;
    }
    
    .view-thumbnails .file-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    }
  }
  
  @media (max-width: 480px) {
    .view-thumbnails .file-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }
</style>