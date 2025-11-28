<script lang="ts">
  /**
   * VirtualThumbnailList - 虚拟化缩略图列表
   * 
   * 使用虚拟滚动技术高效渲染大量缩略图
   * 只渲染可见区域的缩略图
   */
  
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { bookStore2 } from '../../stores/bookStore2';
  import type { VirtualPage } from '../../core/types';
  
  // Props
  export let itemWidth: number = 120;
  export let itemHeight: number = 160;
  export let gap: number = 8;
  export let direction: 'horizontal' | 'vertical' = 'vertical';
  
  // 事件
  const dispatch = createEventDispatcher<{
    select: { index: number; page: VirtualPage };
  }>();
  
  // 本地状态
  let containerElement: HTMLDivElement;
  let scrollTop = 0;
  let scrollLeft = 0;
  let containerWidth = 0;
  let containerHeight = 0;
  
  // 缩略图 URL 缓存
  let thumbnailUrls: Map<number, string> = new Map();
  let loadingIndices: Set<number> = new Set();
  
  // 响应式订阅
  $: state = $bookStore2;
  $: virtualPages = bookStore2.getAllVirtualPages();
  $: totalItems = virtualPages.length;
  
  // 计算布局
  $: itemsPerRow = direction === 'horizontal' 
    ? 1 
    : Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
  
  $: itemsPerColumn = direction === 'vertical'
    ? 1
    : Math.max(1, Math.floor((containerHeight + gap) / (itemHeight + gap)));
  
  $: rowCount = direction === 'horizontal'
    ? 1
    : Math.ceil(totalItems / itemsPerRow);
  
  $: columnCount = direction === 'vertical'
    ? 1
    : Math.ceil(totalItems / itemsPerColumn);
  
  $: totalWidth = direction === 'horizontal'
    ? columnCount * (itemWidth + gap) - gap
    : containerWidth;
  
  $: totalHeight = direction === 'vertical'
    ? rowCount * (itemHeight + gap) - gap
    : containerHeight;
  
  // 计算可见范围
  $: visibleStartRow = direction === 'vertical'
    ? Math.floor(scrollTop / (itemHeight + gap))
    : 0;
  
  $: visibleEndRow = direction === 'vertical'
    ? Math.min(rowCount, Math.ceil((scrollTop + containerHeight) / (itemHeight + gap)))
    : 1;
  
  $: visibleStartCol = direction === 'horizontal'
    ? Math.floor(scrollLeft / (itemWidth + gap))
    : 0;
  
  $: visibleEndCol = direction === 'horizontal'
    ? Math.min(columnCount, Math.ceil((scrollLeft + containerWidth) / (itemWidth + gap)))
    : itemsPerRow;
  
  // 计算可见项
  $: visibleItems = calculateVisibleItems(
    visibleStartRow,
    visibleEndRow,
    visibleStartCol,
    visibleEndCol,
    itemsPerRow,
    itemsPerColumn,
    totalItems,
    direction
  );
  
  function calculateVisibleItems(
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    perRow: number,
    perCol: number,
    total: number,
    dir: 'horizontal' | 'vertical'
  ): Array<{ index: number; x: number; y: number }> {
    const items: Array<{ index: number; x: number; y: number }> = [];
    
    // 添加缓冲区
    const buffer = 2;
    const actualStartRow = Math.max(0, startRow - buffer);
    const actualEndRow = Math.min(endRow + buffer, dir === 'vertical' ? Math.ceil(total / perRow) : 1);
    const actualStartCol = Math.max(0, startCol - buffer);
    const actualEndCol = Math.min(endCol + buffer, dir === 'horizontal' ? Math.ceil(total / perCol) : perRow);
    
    if (dir === 'vertical') {
      for (let row = actualStartRow; row < actualEndRow; row++) {
        for (let col = 0; col < perRow; col++) {
          const index = row * perRow + col;
          if (index >= total) break;
          
          items.push({
            index,
            x: col * (itemWidth + gap),
            y: row * (itemHeight + gap),
          });
        }
      }
    } else {
      for (let col = actualStartCol; col < actualEndCol; col++) {
        for (let row = 0; row < perCol; row++) {
          const index = col * perCol + row;
          if (index >= total) break;
          
          items.push({
            index,
            x: col * (itemWidth + gap),
            y: row * (itemHeight + gap),
          });
        }
      }
    }
    
    return items;
  }
  
  // 滚动处理
  function handleScroll(event: Event) {
    const target = event.target as HTMLDivElement;
    scrollTop = target.scrollTop;
    scrollLeft = target.scrollLeft;
    
    // 加载可见项的缩略图
    loadVisibleThumbnails();
  }
  
  // 加载可见缩略图
  async function loadVisibleThumbnails() {
    for (const item of visibleItems) {
      if (thumbnailUrls.has(item.index) || loadingIndices.has(item.index)) {
        continue;
      }
      
      loadingIndices.add(item.index);
      
      try {
        const blob = await bookStore2.requestThumbnail(item.index);
        if (blob) {
          const url = URL.createObjectURL(blob);
          thumbnailUrls.set(item.index, url);
          thumbnailUrls = thumbnailUrls; // 触发响应式更新
        }
      } catch (error) {
        console.error(`Failed to load thumbnail for index ${item.index}:`, error);
      } finally {
        loadingIndices.delete(item.index);
      }
    }
  }
  
  // 点击处理
  function handleItemClick(index: number) {
    const page = virtualPages[index];
    if (page) {
      dispatch('select', { index, page });
      bookStore2.goToPage(index);
    }
  }
  
  // 滚动到当前页
  export function scrollToCurrentPage() {
    if (!containerElement) return;
    
    const currentIndex = state.currentIndex;
    
    if (direction === 'vertical') {
      const row = Math.floor(currentIndex / itemsPerRow);
      const targetScrollTop = row * (itemHeight + gap) - containerHeight / 2 + itemHeight / 2;
      containerElement.scrollTop = Math.max(0, targetScrollTop);
    } else {
      const col = Math.floor(currentIndex / itemsPerColumn);
      const targetScrollLeft = col * (itemWidth + gap) - containerWidth / 2 + itemWidth / 2;
      containerElement.scrollLeft = Math.max(0, targetScrollLeft);
    }
  }
  
  // 容器尺寸监听
  let resizeObserver: ResizeObserver | null = null;
  
  onMount(() => {
    if (containerElement) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
        }
      });
      resizeObserver.observe(containerElement);
      
      // 初始加载
      loadVisibleThumbnails();
    }
  });
  
  onDestroy(() => {
    resizeObserver?.disconnect();
    
    // 清理 URL
    for (const url of thumbnailUrls.values()) {
      URL.revokeObjectURL(url);
    }
    thumbnailUrls.clear();
  });
  
  // 监听页面变化，滚动到当前页
  $: if (state.currentIndex >= 0 && containerElement) {
    // 延迟执行以确保布局已更新
    requestAnimationFrame(() => {
      scrollToCurrentPage();
    });
  }
</script>

<div
  bind:this={containerElement}
  class="virtual-thumbnail-list"
  class:horizontal={direction === 'horizontal'}
  class:vertical={direction === 'vertical'}
  on:scroll={handleScroll}
>
  <div
    class="scroll-content"
    style="width: {totalWidth}px; height: {totalHeight}px;"
  >
    {#each visibleItems as item (item.index)}
      {@const page = virtualPages[item.index]}
      {@const thumbnailUrl = thumbnailUrls.get(item.index)}
      {@const isLoading = loadingIndices.has(item.index)}
      {@const isCurrent = item.index === state.currentIndex}
      
      <button
        class="thumbnail-item"
        class:current={isCurrent}
        class:loading={isLoading}
        style="
          left: {item.x}px;
          top: {item.y}px;
          width: {itemWidth}px;
          height: {itemHeight}px;
        "
        on:click={() => handleItemClick(item.index)}
      >
        {#if thumbnailUrl}
          <img
            src={thumbnailUrl}
            alt="Page {item.index + 1}"
            class="thumbnail-image"
            draggable="false"
          />
        {:else if isLoading}
          <div class="thumbnail-placeholder loading">
            <span class="spinner"></span>
          </div>
        {:else}
          <div class="thumbnail-placeholder">
            <span class="page-number">{item.index + 1}</span>
          </div>
        {/if}
        
        {#if page?.isDivided}
          <div class="divided-indicator">
            {page.part === 0 ? 'L' : 'R'}
          </div>
        {/if}
        
        <div class="thumbnail-label">
          {item.index + 1}
        </div>
      </button>
    {/each}
  </div>
</div>

<style>
  .virtual-thumbnail-list {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: #1a1a1a;
  }
  
  .virtual-thumbnail-list.vertical {
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  .virtual-thumbnail-list.horizontal {
    overflow-x: auto;
    overflow-y: hidden;
  }
  
  .scroll-content {
    position: relative;
  }
  
  .thumbnail-item {
    position: absolute;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 4px;
    background-color: #2a2a2a;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }
  
  .thumbnail-item:hover {
    border-color: #666;
    transform: scale(1.02);
  }
  
  .thumbnail-item.current {
    border-color: #4a9eff;
  }
  
  .thumbnail-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background-color: #1a1a1a;
  }
  
  .thumbnail-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background-color: #2a2a2a;
    color: #666;
    font-size: 14px;
  }
  
  .thumbnail-placeholder.loading {
    background-color: #252525;
  }
  
  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #444;
    border-top-color: #888;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  
  .page-number {
    font-size: 16px;
    font-weight: bold;
    color: #555;
  }
  
  .divided-indicator {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 2px 6px;
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 10px;
    font-weight: bold;
    border-radius: 2px;
  }
  
  .thumbnail-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    color: white;
    font-size: 11px;
    text-align: center;
  }
</style>
