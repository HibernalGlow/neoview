<!-- file-browser-sidebar.svelte - 侧边栏 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Bookmark from 'lucide-svelte/icons/bookmark';
  import Clock from 'lucide-svelte/icons/clock';
  import Star from 'lucide-svelte/icons/star';
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  
  interface Props {
    bookmarks?: Array<{ path: string; name: string }>;
    history?: Array<{ path: string; timestamp: number }>;
    currentPath?: string;
  }
  
  let {
    bookmarks = [],
    history = [],
    currentPath = ''
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今天 ' + date.toLocaleTimeString();
    } else if (diffDays === 1) {
      return '昨天 ' + date.toLocaleTimeString();
    } else if (diffDays < 7) {
      return `${diffDays} 天前`;
    } else {
      return date.toLocaleDateString();
    }
  }
  
  function handleBookmarkClick(bookmark: { path: string; name: string }) {
    dispatch('bookmarkClick', bookmark);
  }
  
  function handleHistoryClick(item: { path: string; timestamp: number }) {
    dispatch('historyClick', item);
  }
</script>

<div class="file-browser-sidebar">
  <!-- 书签部分 -->
  <section class="sidebar-section">
    <div class="section-header">
      <Bookmark class="section-icon" />
      <h3>书签</h3>
    </div>
    
    <div class="section-content">
      {#if bookmarks.length === 0}
        <div class="empty-state">
          <p>暂无书签</p>
        </div>
      {:else}
        <div class="bookmark-list">
          {#each bookmarks as bookmark (bookmark.path)}
            <button 
              class="bookmark-item"
              class:active={bookmark.path === currentPath}
              on:click={() => handleBookmarkClick(bookmark)}
              title={bookmark.path}
            >
              <FolderOpen class="item-icon" />
              <span class="item-name">{bookmark.name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </section>
  
  <!-- 历史记录部分 -->
  <section class="sidebar-section">
    <div class="section-header">
      <Clock class="section-icon" />
      <h3>历史记录</h3>
    </div>
    
    <div class="section-content">
      {#if history.length === 0}
        <div class="empty-state">
          <p>暂无历史记录</p>
        </div>
      {:else}
        <div class="history-list">
          {#each history.slice(0, 20) as item (item.path)}
            <button 
              class="history-item"
              class:active={item.path === currentPath}
              on:click={() => handleHistoryClick(item)}
              title={item.path}
            >
              <FolderOpen class="item-icon" />
              <div class="item-info">
                <span class="item-name">{item.path.split('/').pop() || '根目录'}</span>
                <span class="item-time">{formatDate(item.timestamp)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </section>
  
  <!-- 快速访问部分 -->
  <section class="sidebar-section">
    <div class="section-header">
      <Star class="section-icon" />
      <h3>快速访问</h3>
    </div>
    
    <div class="section-content">
      <div class="quick-access-list">
        <button 
          class="quick-access-item"
          on:click={() => dispatch('quickAccess', { type: 'desktop' })}
        >
          <FolderOpen class="item-icon" />
          <span class="item-name">桌面</span>
        </button>
        
        <button 
          class="quick-access-item"
          on:click={() => dispatch('quickAccess', { type: 'documents' })}
        >
          <FolderOpen class="item-icon" />
          <span class="item-name">文档</span>
        </button>
        
        <button 
          class="quick-access-item"
          on:click={() => dispatch('quickAccess', { type: 'downloads' })}
        >
          <FolderOpen class="item-icon" />
          <span class="item-name">下载</span>
        </button>
        
        <button 
          class="quick-access-item"
          on:click={() => dispatch('quickAccess', { type: 'pictures' })}
        >
          <FolderOpen class="item-icon" />
          <span class="item-name">图片</span>
        </button>
      </div>
    </div>
  </section>
</div>

<style>
  .file-browser-sidebar {
    width: 240px;
    height: 100%;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  
  .sidebar-section {
    margin-bottom: 24px;
  }
  
  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  
  .section-icon {
    width: 18px;
    height: 18px;
    color: var(--muted);
  }
  
  .section-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--foreground);
  }
  
  .section-content {
    padding: 8px;
  }
  
  .empty-state {
    padding: 16px;
    text-align: center;
    color: var(--muted);
  }
  
  .empty-state p {
    margin: 0;
    font-size: 13px;
  }
  
  .bookmark-list,
  .history-list,
  .quick-access-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .bookmark-item,
  .history-item,
  .quick-access-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
    text-align: left;
  }
  
  .bookmark-item:hover,
  .history-item:hover,
  .quick-access-item:hover {
    background: var(--surface-hover);
  }
  
  .bookmark-item.active,
  .history-item.active {
    background: var(--primary-selected);
    color: var(--primary);
  }
  
  .item-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: var(--muted);
  }
  
  .item-name {
    flex: 1;
    font-size: 13px;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  
  .item-time {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  
  /* 响应式调整 */
  @media (max-width: 768px) {
    .file-browser-sidebar {
      width: 200px;
    }
    
    .section-header {
      padding: 8px 12px;
    }
    
    .section-content {
      padding: 4px;
    }
    
    .bookmark-item,
    .history-item,
    .quick-access-item {
      padding: 6px 8px;
    }
    
    .item-name {
      font-size: 12px;
    }
  }
</style>