<!-- file-browser-toolbar.svelte - 顶部工具栏 -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Home, ArrowLeft, ArrowRight, RefreshCw, Grid3x3, List, Search, FolderOpen } from '@lucide/svelte';
  
  interface Props {
    currentPath?: string;
    viewMode?: 'list' | 'thumbnails';
    searchState?: { query: string; active: boolean };
    loading?: boolean;
    canGoBack?: boolean;
    canGoForward?: boolean;
  }
  
  let {
    currentPath = '',
    viewMode = 'list',
    searchState = { query: '', active: false },
    loading = false,
    canGoBack = false,
    canGoForward = false
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    dispatch('search', { query: target.value });
  }
  
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSearch(event);
    }
  }
</script>

<div class="file-browser-toolbar">
  <!-- 导航按钮组 -->
  <div class="nav-buttons">
    <button 
      class="nav-button" 
      class:disabled={!canGoBack}
      on:click={() => dispatch('goBack')}
      title="后退"
    >
      <ArrowLeft />
    </button>
    
    <button 
      class="nav-button" 
      class:disabled={!canGoForward}
      on:click={() => dispatch('goForward')}
      title="前进"
    >
      <ArrowRight />
    </button>
    
    <button 
      class="nav-button" 
      on:click={() => dispatch('navigateHome')}
      title="主页"
    >
      <Home />
    </button>
    
    <button 
      class="nav-button" 
      class:loading={loading}
      on:click={() => dispatch('refresh')}
      title="刷新"
    >
      <RefreshCw />
    </button>
  </div>
  
  <!-- 路径栏 -->
  <div class="path-bar">
    {#each currentPath.split('/') as segment, i}
      {#if i > 0}
        <span class="path-separator">/</span>
      {/if}
      <button 
        class="path-segment"
        on:click={() => dispatch('navigateTo', { 
          path: currentPath.split('/').slice(0, i + 1).join('/') 
        })}
      >
        {segment || '根目录'}
      </button>
    {/each}
  </div>
  
  <!-- 搜索框 -->
  <div class="search-container">
    <div class="search-input-wrapper">
      <Search class="search-icon" />
      <input
        type="text"
        class="search-input"
        placeholder="搜索文件..."
        bind:value={searchState.query}
        on:input={handleSearch}
        on:keydown={handleKeydown}
      />
    </div>
  </div>
  
  <!-- 操作按钮组 -->
  <div class="action-buttons">
    <!-- 视图切换 -->
    <div class="view-toggle">
      <button 
        class="view-button"
        class:active={viewMode === 'thumbnails'}
        on:click={() => dispatch('toggleView', { mode: 'thumbnails' })}
        title="缩略图视图"
      >
        <Grid3x3 />
      </button>
      
      <button 
        class="view-button"
        class:active={viewMode === 'list'}
        on:click={() => dispatch('toggleView', { mode: 'list' })}
        title="列表视图"
      >
        <List />
      </button>
    </div>
    
    <!-- 选择文件夹 -->
    <button 
      class="action-button"
      on:click={() => dispatch('selectFolder')}
      title="选择文件夹"
    >
      <FolderOpen />
      <span>选择文件夹</span>
    </button>
  </div>
</div>

<style>
  .file-browser-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    min-height: 48px;
  }
  
  .nav-buttons {
    display: flex;
    gap: 4px;
  }
  
  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .nav-button:hover:not(.disabled) {
    background: var(--surface-hover);
  }
  
  .nav-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .nav-button.loading :global(svg) {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  .path-bar {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding: 6px 12px;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 6px;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  
  .path-bar::-webkit-scrollbar {
    display: none;
  }
  
  .path-segment {
    padding: 2px 6px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
    transition: background-color 0.2s;
  }
  
  .path-segment:hover {
    background: var(--surface-hover);
  }
  
  .path-separator {
    color: var(--muted);
    user-select: none;
  }
  
  .search-container {
    position: relative;
    width: 240px;
  }
  
  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .search-icon {
    position: absolute;
    left: 10px;
    width: 16px;
    height: 16px;
    color: var(--muted);
    pointer-events: none;
  }
  
  .search-input {
    width: 100%;
    height: 32px;
    padding: 0 10px 0 36px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    font-size: 14px;
    transition: border-color 0.2s;
  }
  
  .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }
  
  .action-buttons {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .view-toggle {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  
  .view-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: var(--background);
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .view-button:hover {
    background: var(--surface-hover);
  }
  
  .view-button.active {
    background: var(--primary);
    color: white;
  }
  
  .action-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .action-button:hover {
    background: var(--surface-hover);
    border-color: var(--primary);
  }
</style>