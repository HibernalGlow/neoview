<!-- file-card.svelte - 单个文件卡片 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import File from 'lucide-svelte/icons/file';
  import Folder from 'lucide-svelte/icons/folder';
  import Archive from 'lucide-svelte/icons/archive';
  import Check from 'lucide-svelte/icons/check';
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import type { FsItem } from '$lib/types';
  
  interface Props {
    item: FsItem;
    thumbnail?: string;
    viewMode?: 'list' | 'thumbnails';
    selected?: boolean;
    isCheckMode?: boolean;
    isDeleteMode?: boolean;
  }
  
  let {
    item,
    thumbnail,
    viewMode = 'list',
    selected = false,
    isCheckMode = false,
    isDeleteMode = false
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  function handleClick(event: MouseEvent) {
    if (isCheckMode || isDeleteMode) {
      event.stopPropagation();
      dispatch('toggleSelect');
    } else {
      dispatch('open');
    }
  }
  
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    dispatch('context', { event });
  }
  
  function getFileIcon() {
    if (item.is_dir) return Folder;
    if (item.name.match(/\.(zip|cbz|cbr|cb7|rar|7z)$/i)) return Archive;
    return File;
  }
  
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString();
  }
  
  $: fileIcon = getFileIcon();
  $: hasThumbnail = thumbnail && item.is_image;
</script>

<div 
  class="file-card"
  class:selected={selected}
  class:view-{viewMode}
  class:check-mode={isCheckMode}
  class:delete-mode={isDeleteMode}
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  role="button"
  tabindex="0"
>
  {#if viewMode === 'thumbnails'}
    <!-- 缩略图视图 -->
    <div class="thumbnail-container">
      {#if hasThumbnail}
        <img 
          src={thumbnail} 
          alt={item.name}
          class="thumbnail-image"
          loading="lazy"
        />
      {:else}
        <div class="thumbnail-placeholder">
          <svelte:component this={fileIcon} />
        </div>
      {/if}
      
      <!-- 选择/删除模式下的覆盖层 -->
      {#if isCheckMode || isDeleteMode}
        <div class="overlay">
          {#if isCheckMode}
            <div class="check-indicator" class:checked={selected}>
              {#if selected}
                <Check />
              {:else}
                <div class="check-empty"></div>
              {/if}
            </div>
          {:else if isDeleteMode}
            <div class="delete-indicator" class:selected={selected}>
              {#if selected}
                <Trash2 />
              {:else}
                <X />
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
    
    <div class="file-info">
      <div class="file-name" title={item.name}>{item.name}</div>
      <div class="file-meta">
        {#if !item.is_dir}
          <span class="file-size">{formatFileSize(item.size)}</span>
        {/if}
        <span class="file-date">{formatDate(item.modified)}</span>
      </div>
    </div>
  {:else}
    <!-- 列表视图 -->
    <div class="list-icon">
      {#if hasThumbnail}
        <img 
          src={thumbnail} 
          alt={item.name}
          class="list-thumbnail"
          loading="lazy"
        />
      {:else}
        <svelte:component this={fileIcon} />
      {/if}
    </div>
    
    <div class="list-info">
      <div class="list-name" title={item.name}>{item.name}</div>
      <div class="list-meta">
        {#if !item.is_dir}
          <span class="list-size">{formatFileSize(item.size)}</span>
        {/if}
        <span class="list-date">{formatDate(item.modified)}</span>
      </div>
    </div>
    
    <!-- 选择/删除指示器 -->
    {#if isCheckMode || isDeleteMode}
      <div class="list-selector">
        {#if isCheckMode}
          <div class="check-indicator" class:checked={selected}>
            {#if selected}
              <Check />
            {:else}
              <div class="check-empty"></div>
            {/if}
          </div>
        {:else if isDeleteMode}
          <div class="delete-indicator" class:selected={selected}>
            {#if selected}
              <Trash2 />
            {:else}
              <X />
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .file-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
    transition: all 0.2s;
    overflow: hidden;
  }
  
  .file-card:hover {
    border-color: var(--primary);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  
  .file-card.selected {
    border-color: var(--primary);
    background: var(--primary-selected);
  }
  
  /* 缩略图视图样式 */
  .view-thumbnails {
    display: flex;
    flex-direction: column;
    aspect-ratio: 1;
  }
  
  .thumbnail-container {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background);
    overflow: hidden;
  }
  
  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  
  .thumbnail-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--muted);
  }
  
  .thumbnail-placeholder :global(svg) {
    width: 48px;
    height: 48px;
  }
  
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .check-mode .overlay,
  .delete-mode .overlay {
    opacity: 1;
  }
  
  .check-indicator,
  .delete-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: white;
    transition: all 0.2s;
  }
  
  .check-indicator:not(.checked) {
    border: 2px solid var(--border);
  }
  
  .check-indicator.checked {
    background: var(--primary);
    color: white;
  }
  
  .check-empty {
    width: 16px;
    height: 16px;
  }
  
  .delete-indicator:not(.selected) {
    background: var(--surface);
    color: var(--muted);
  }
  
  .delete-indicator.selected {
    background: var(--destructive);
    color: white;
  }
  
  .file-info {
    padding: 12px;
  }
  
  .file-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  
  .file-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: var(--muted);
  }
  
  /* 列表视图样式 */
  .view-list {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    min-height: 48px;
  }
  
  .list-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin-right: 12px;
    color: var(--muted);
  }
  
  .list-icon :global(svg) {
    width: 20px;
    height: 20px;
  }
  
  .list-thumbnail {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
  }
  
  .list-info {
    flex: 1;
    min-width: 0;
  }
  
  .list-name {
    font-size: 14px;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }
  
  .list-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--muted);
  }
  
  .list-selector {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
  }
  
  .list-selector .check-indicator,
  .list-selector .delete-indicator {
    width: 24px;
    height: 24px;
  }
  
  .list-selector .check-indicator:not(.checked) {
    border-width: 1px;
  }
  
  .list-selector .check-empty {
    width: 12px;
    height: 12px;
  }
</style>