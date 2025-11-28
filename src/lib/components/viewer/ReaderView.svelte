<script lang="ts">
  /**
   * ReaderView - 完整的阅读器视图
   * 
   * 整合 PageFrameViewer 和 VirtualThumbnailList
   * 提供完整的阅读体验
   */
  
  import { onMount, onDestroy } from 'svelte';
  import { bookStore2, currentPageInfo, canNavigate } from '../../stores/bookStore2';
  import { openBookWithTauri } from '../../core/tauriIntegration';
  import PageFrameViewer from './PageFrameViewer.svelte';
  import VirtualThumbnailList from './VirtualThumbnailList.svelte';
  
  // Props
  export let showThumbnails: boolean = true;
  export let thumbnailPosition: 'left' | 'right' | 'bottom' = 'left';
  export let thumbnailSize: number = 120;
  
  // 本地状态
  let thumbnailListRef: VirtualThumbnailList;
  let showSettings = false;
  
  // 响应式订阅
  $: state = $bookStore2;
  $: pageInfo = $currentPageInfo;
  $: navigation = $canNavigate;
  
  // 设置面板
  function toggleSettings() {
    showSettings = !showSettings;
  }
  
  // 页面模式切换
  function togglePageMode() {
    const newMode = state.pageMode === 'single' ? 'wide' : 'single';
    bookStore2.setPageMode(newMode);
  }
  
  // 阅读方向切换
  function toggleReadOrder() {
    const newOrder = state.readOrder === 'rtl' ? 'ltr' : 'rtl';
    bookStore2.setReadOrder(newOrder);
  }
  
  // 分割横向页面切换
  function toggleDivideLandscape() {
    bookStore2.setDivideLandscape(!state.divideLandscape);
  }
  
  // 视图模式切换
  function setViewMode(mode: 'normal' | 'panorama' | 'loupe') {
    bookStore2.setViewMode(mode);
  }
  
  // 缩略图选择处理
  function handleThumbnailSelect(event: CustomEvent<{ index: number }>) {
    bookStore2.goToPage(event.detail.index);
  }
  
  // 打开文件
  async function openFile(path: string) {
    try {
      await openBookWithTauri(bookStore2, path, {
        enableUpscale: false,
      });
    } catch (error) {
      console.error('Failed to open book:', error);
    }
  }
  
  // 键盘快捷键
  function handleKeydown(event: KeyboardEvent) {
    // 设置面板快捷键
    if (event.key === 's' && event.ctrlKey) {
      event.preventDefault();
      toggleSettings();
    }
    
    // 缩略图面板快捷键
    if (event.key === 't' && event.ctrlKey) {
      event.preventDefault();
      showThumbnails = !showThumbnails;
    }
  }
  
  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });
  
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="reader-view" class:thumbnails-left={thumbnailPosition === 'left'} class:thumbnails-right={thumbnailPosition === 'right'} class:thumbnails-bottom={thumbnailPosition === 'bottom'}>
  <!-- 缩略图面板 -->
  {#if showThumbnails && state.isOpen}
    <div
      class="thumbnail-panel"
      class:horizontal={thumbnailPosition === 'bottom'}
      style="
        {thumbnailPosition === 'bottom' ? `height: ${thumbnailSize + 40}px;` : `width: ${thumbnailSize + 24}px;`}
      "
    >
      <VirtualThumbnailList
        bind:this={thumbnailListRef}
        itemWidth={thumbnailSize}
        itemHeight={Math.round(thumbnailSize * 1.4)}
        gap={8}
        direction={thumbnailPosition === 'bottom' ? 'horizontal' : 'vertical'}
        on:select={handleThumbnailSelect}
      />
    </div>
  {/if}
  
  <!-- 主视图区域 -->
  <div class="main-view">
    <PageFrameViewer containerClass="viewer-container" />
    
    <!-- 顶部工具栏 -->
    <div class="toolbar top">
      <div class="toolbar-left">
        {#if state.isOpen}
          <span class="book-name" title={state.bookPath}>{state.bookName}</span>
        {/if}
      </div>
      
      <div class="toolbar-center">
        {#if pageInfo}
          <span class="page-info">{pageInfo.displayText}</span>
          {#if state.physicalPageCount !== state.virtualPageCount}
            <span class="page-info-detail">
              (物理: {state.physicalPageCount})
            </span>
          {/if}
        {/if}
      </div>
      
      <div class="toolbar-right">
        <button class="toolbar-button" on:click={toggleSettings} title="设置">
          ⚙️
        </button>
      </div>
    </div>
    
    <!-- 底部工具栏 -->
    <div class="toolbar bottom">
      <div class="toolbar-left">
        <button
          class="toolbar-button"
          on:click={() => setViewMode('normal')}
          class:active={state.viewState.mode === 'normal'}
          title="普通模式"
        >
          📄
        </button>
        <button
          class="toolbar-button"
          on:click={() => setViewMode('panorama')}
          class:active={state.viewState.mode === 'panorama'}
          title="全景模式"
        >
          📜
        </button>
        <button
          class="toolbar-button"
          on:click={() => setViewMode('loupe')}
          class:active={state.viewState.mode === 'loupe'}
          title="放大镜模式"
        >
          🔍
        </button>
      </div>
      
      <div class="toolbar-center">
        <button
          class="toolbar-button"
          disabled={!navigation.canPrev}
          on:click={() => bookStore2.goToFirst()}
          title="首页"
        >
          ⏮️
        </button>
        <button
          class="toolbar-button"
          disabled={!navigation.canPrev}
          on:click={() => bookStore2.prevPage()}
          title="上一页"
        >
          ◀️
        </button>
        
        <!-- 页面滑块 -->
        {#if state.isOpen}
          <input
            type="range"
            class="page-slider"
            min="0"
            max={state.virtualPageCount - 1}
            value={state.currentIndex}
            on:input={(e) => bookStore2.goToPage(parseInt(e.currentTarget.value))}
          />
        {/if}
        
        <button
          class="toolbar-button"
          disabled={!navigation.canNext}
          on:click={() => bookStore2.nextPage()}
          title="下一页"
        >
          ▶️
        </button>
        <button
          class="toolbar-button"
          disabled={!navigation.canNext}
          on:click={() => bookStore2.goToLast()}
          title="末页"
        >
          ⏭️
        </button>
      </div>
      
      <div class="toolbar-right">
        <button
          class="toolbar-button"
          on:click={() => bookStore2.zoom(-1)}
          title="缩小"
        >
          ➖
        </button>
        <span class="zoom-level">{Math.round(state.viewState.scale * 100)}%</span>
        <button
          class="toolbar-button"
          on:click={() => bookStore2.zoom(1)}
          title="放大"
        >
          ➕
        </button>
        <button
          class="toolbar-button"
          on:click={() => bookStore2.resetZoom()}
          title="重置缩放"
        >
          🔄
        </button>
      </div>
    </div>
  </div>
  
  <!-- 设置面板 -->
  {#if showSettings}
    <div class="settings-panel">
      <div class="settings-header">
        <h3>设置</h3>
        <button class="close-button" on:click={toggleSettings}>×</button>
      </div>
      
      <div class="settings-content">
        <div class="setting-group">
          <h4>页面显示</h4>
          
          <label class="setting-item">
            <span>页面模式</span>
            <button class="setting-button" on:click={togglePageMode}>
              {state.pageMode === 'single' ? '单页' : '双页'}
            </button>
          </label>
          
          <label class="setting-item">
            <span>阅读方向</span>
            <button class="setting-button" on:click={toggleReadOrder}>
              {state.readOrder === 'rtl' ? '从右到左' : '从左到右'}
            </button>
          </label>
          
          <label class="setting-item">
            <span>分割横向页面</span>
            <input
              type="checkbox"
              checked={state.divideLandscape}
              on:change={toggleDivideLandscape}
            />
          </label>
        </div>
        
        <div class="setting-group">
          <h4>缩略图</h4>
          
          <label class="setting-item">
            <span>显示缩略图</span>
            <input
              type="checkbox"
              bind:checked={showThumbnails}
            />
          </label>
          
          <label class="setting-item">
            <span>缩略图位置</span>
            <select bind:value={thumbnailPosition}>
              <option value="left">左侧</option>
              <option value="right">右侧</option>
              <option value="bottom">底部</option>
            </select>
          </label>
          
          <label class="setting-item">
            <span>缩略图大小</span>
            <input
              type="range"
              min="80"
              max="200"
              bind:value={thumbnailSize}
            />
            <span>{thumbnailSize}px</span>
          </label>
        </div>
        
        <div class="setting-group">
          <h4>排序</h4>
          
          <label class="setting-item">
            <span>排序方式</span>
            <select
              value={state.sortMode}
              on:change={(e) => bookStore2.setSortMode(e.currentTarget.value)}
            >
              <option value="entry">原始顺序</option>
              <option value="entryDesc">原始顺序 (倒序)</option>
              <option value="fileName">文件名</option>
              <option value="fileNameDesc">文件名 (倒序)</option>
              <option value="timestamp">时间</option>
              <option value="timestampDesc">时间 (倒序)</option>
              <option value="size">大小</option>
              <option value="sizeDesc">大小 (倒序)</option>
              <option value="random">随机</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .reader-view {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    background-color: #1a1a1a;
  }
  
  .reader-view.thumbnails-left {
    flex-direction: row;
  }
  
  .reader-view.thumbnails-right {
    flex-direction: row-reverse;
  }
  
  .reader-view.thumbnails-bottom {
    flex-direction: column;
  }
  
  .thumbnail-panel {
    flex-shrink: 0;
    background-color: #222;
    border-right: 1px solid #333;
  }
  
  .thumbnails-right .thumbnail-panel {
    border-right: none;
    border-left: 1px solid #333;
  }
  
  .thumbnails-bottom .thumbnail-panel {
    border-right: none;
    border-top: 1px solid #333;
  }
  
  .thumbnail-panel.horizontal {
    width: 100%;
  }
  
  .main-view {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  :global(.viewer-container) {
    flex: 1;
  }
  
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background-color: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    z-index: 10;
  }
  
  .toolbar.top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  
  .toolbar.bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  
  .main-view:hover .toolbar {
    opacity: 1;
  }
  
  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .toolbar-center {
    flex: 1;
    justify-content: center;
  }
  
  .toolbar-button {
    padding: 6px 10px;
    background-color: transparent;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 16px;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }
  
  .toolbar-button:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .toolbar-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .toolbar-button.active {
    background-color: rgba(74, 158, 255, 0.3);
  }
  
  .book-name {
    color: white;
    font-size: 14px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .page-info {
    color: white;
    font-size: 14px;
  }
  
  .page-info-detail {
    color: #888;
    font-size: 12px;
    margin-left: 4px;
  }
  
  .page-slider {
    width: 200px;
    margin: 0 8px;
  }
  
  .zoom-level {
    color: white;
    font-size: 12px;
    min-width: 50px;
    text-align: center;
  }
  
  .settings-panel {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    max-height: 80%;
    background-color: #2a2a2a;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    z-index: 100;
    overflow: hidden;
  }
  
  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background-color: #333;
    border-bottom: 1px solid #444;
  }
  
  .settings-header h3 {
    margin: 0;
    color: white;
    font-size: 16px;
  }
  
  .close-button {
    padding: 4px 8px;
    background-color: transparent;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
  }
  
  .close-button:hover {
    color: white;
  }
  
  .settings-content {
    padding: 16px;
    max-height: 400px;
    overflow-y: auto;
  }
  
  .setting-group {
    margin-bottom: 24px;
  }
  
  .setting-group:last-child {
    margin-bottom: 0;
  }
  
  .setting-group h4 {
    margin: 0 0 12px 0;
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  
  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    color: white;
    font-size: 14px;
  }
  
  .setting-button {
    padding: 6px 12px;
    background-color: #444;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    cursor: pointer;
  }
  
  .setting-button:hover {
    background-color: #555;
  }
  
  .setting-item select {
    padding: 6px 12px;
    background-color: #444;
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
  }
  
  .setting-item input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }
  
  .setting-item input[type="range"] {
    width: 100px;
    margin: 0 8px;
  }
</style>
