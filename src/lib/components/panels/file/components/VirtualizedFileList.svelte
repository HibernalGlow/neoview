<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { FsItem } from '$lib/types';
  import { thumbnailManager } from '$lib/utils/thumbnailManager';
  import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
  
  function toRelativeKey(path: string): string {
    return path.replace(/\\/g, '/');
  }
  
  function enqueueVisible(path: string, items: any[], options?: any): void {
    const priority = options?.priority || 'normal';
    items.forEach((item) => {
      const isArchive = item.name.endsWith('.zip') || 
                       item.name.endsWith('.cbz') || 
                       item.name.endsWith('.rar') || 
                       item.name.endsWith('.cbr');
      
      if (item.isDir) {
        // 文件夹：立即加载（跟随虚拟列表），使用 immediate 优先级
        // 不再延迟，确保在虚拟滚动时立即加载
        thumbnailManager.getThumbnail(item.path, undefined, false, 'immediate').then((dataUrl) => {
          if (dataUrl) {
            const key = toRelativeKey(item.path);
            fileBrowserStore.addThumbnail(key, dataUrl);
          } else {
            // 如果 getThumbnail 返回 null，尝试使用 getFolderThumbnail
            thumbnailManager.getFolderThumbnail(item.path).then((folderDataUrl) => {
              if (folderDataUrl) {
                const key = toRelativeKey(item.path);
                fileBrowserStore.addThumbnail(key, folderDataUrl);
              }
            });
          }
        });
      } else if (item.isImage || isArchive) {
        thumbnailManager.getThumbnail(item.path, undefined, isArchive, priority);
      }
    });
  }
  
  function bumpPriority(path: string): void {
    thumbnailManager.setCurrentDirectory(path);
  }

  import { Folder, File, Image, FileArchive } from '@lucide/svelte';
  import { writable, type Writable } from 'svelte/store';
  import { throttle, debounce, scheduleIdleTask, getAdaptivePerformanceConfig } from '$lib/utils/performance';

  const {
    items = [],
    currentPath = '',
    thumbnails = new Map(),
    selectedIndex = -1,
    isCheckMode = false,
    isDeleteMode = false,
    selectedItems = new Set(),
    viewMode = 'list',
    onSelectionChange = (_: { selectedItems: Set<string> }) => {},
    onSelectedIndexChange = (_: { index: number }) => {},
    onItemSelect = (_: { item: FsItem, index: number, multiSelect: boolean }) => {},
    onItemDoubleClick = (_: { item: FsItem, index: number }) => {}
  }: {
    items?: FsItem[];
    currentPath?: string;
    thumbnails?: Map<string, string>;
    selectedIndex?: number;
    isCheckMode?: boolean;
    isDeleteMode?: boolean;
    selectedItems?: Set<string>;
    viewMode?: 'list' | 'thumbnails';
    onSelectionChange?: (payload: { selectedItems: Set<string> }) => void;
    onSelectedIndexChange?: (payload: { index: number }) => void;
    onItemSelect?: (payload: { item: FsItem, index: number, multiSelect: boolean }) => void;
    onItemDoubleClick?: (payload: { item: FsItem, index: number }) => void;
  } = $props();

  const dispatch = createEventDispatcher();
  
  // 虚拟滚动状态
  let container = $state<HTMLDivElement | undefined>(undefined);
  let viewportHeight = $state(600);
  let scrollTop = $state(0);
  let itemHeight = $state(60);
  let overscan = $state(5); // 预渲染的项目数量
  
  // 计算可见范围
  let startIndex = $state(0);
  let endIndex = $state(0);
  let totalHeight = $state(0);
  let offsetY = $state(0);
  
  // 滚动节流
  let scrollTimer: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  
  // 性能配置
  const perfConfig = getAdaptivePerformanceConfig();
  overscan = perfConfig.virtualScroll.overscan;
  let scrollThrottleDelay = perfConfig.virtualScroll.throttleDelay;
  
  // 性能监控
  let lastScrollTime = 0;

  // 计算可见项目范围
  function calculateVisibleRange() {
    if (!container) return;
    
    const visibleCount = Math.ceil(viewportHeight / itemHeight);
    startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    endIndex = Math.min(items.length - 1, startIndex + visibleCount + overscan * 2);
    
    // 确保startIndex不会导致endIndex超出范围
    if (endIndex >= items.length) {
      startIndex = Math.max(0, items.length - visibleCount - overscan * 2);
      endIndex = items.length - 1;
    }
    
    offsetY = startIndex * itemHeight;
    totalHeight = items.length * itemHeight;
    
    // 触发可见范围变化事件
    handleVisibleRangeChange();
  }

  // 处理可见范围变化（防抖）
  const handleVisibleRangeChange = debounce(() => {
    if (!currentPath || items.length === 0) return;
    
    const now = performance.now();
    if (now - lastScrollTime < scrollThrottleDelay) return;
    lastScrollTime = now;
    
    const visibleItems = items.slice(startIndex, endIndex + 1);
    
    // 过滤需要缩略图的项目
    const thumbnailItems = visibleItems.filter(item => 
      item.isDir || item.isImage || 
      item.name.endsWith('.zip') || 
      item.name.endsWith('.cbz') || 
      item.name.endsWith('.rar') || 
      item.name.endsWith('.cbr')
    );
    
    // 过滤已有缩略图的项目
    const needThumbnails = thumbnailItems.filter(item => {
      const key = getThumbnailKey(item);
      return !thumbnails.has(key);
    });
    
    if (needThumbnails.length > 0) {
      console.log(`👁️ 虚拟滚动范围更新: ${startIndex}-${endIndex}, 需要缩略图: ${needThumbnails.length}`);
      
      // 按虚拟列表顺序处理：视野上方的先加载，下方的后加载
      // 计算每个项目在视野中的位置（距离顶部的距离）
      const itemsWithPriority = needThumbnails.map((item, index) => {
        const itemIndex = items.findIndex(i => i.path === item.path);
        const distanceFromTop = itemIndex - startIndex; // 距离视野顶部的距离
        return { item, distanceFromTop, itemIndex };
      });
      
      // 按距离顶部距离排序（距离越近，优先级越高）
      itemsWithPriority.sort((a, b) => a.distanceFromTop - b.distanceFromTop);
      
      // 使用 scheduleIdleCallback 确保不阻塞UI，按顺序处理
      scheduleIdleTask(() => {
        // 按顺序入队，确保视野上方的先处理
        itemsWithPriority.forEach(({ item }, index) => {
          // 稍微延迟后面的项目，确保前面的先处理
          setTimeout(() => {
            enqueueVisible(currentPath, [item], { priority: 'immediate' });
          }, index * 10); // 每个项目延迟 10ms，确保顺序
        });
      });
    }
  }, 50); // 50ms 防抖延迟

  // 处理滚动事件（节流）
  const handleScroll = throttle(() => {
    if (!container) return;
    
    scrollTop = container.scrollTop;
    
    // 节流处理
    if (scrollTimer) {
      cancelAnimationFrame(scrollTimer);
    }
    
    scrollTimer = requestAnimationFrame(() => {
      calculateVisibleRange();
      scrollTimer = null;
    });
  }, scrollThrottleDelay);

  // 处理容器大小变化
  function handleResize() {
    if (!container) return;
    
    const newHeight = container.clientHeight;
    if (newHeight !== viewportHeight) {
      viewportHeight = newHeight;
      calculateVisibleRange();
    }
  }

  // 处理项目点击
  function handleItemClick(item: FsItem, index: number) {
    dispatch('itemClick', { item, index });
    onItemSelect({ item, index, multiSelect: false });
  }

  // 处理项目右键
  function handleItemContextMenu(event: MouseEvent, item: FsItem) {
    dispatch('itemContextMenu', { event, item });
  }

  // 处理项目双击（快速打开）
  function handleItemDoubleClick(item: FsItem, index: number) {
    dispatch('itemDoubleClick', { item, index });
    onItemDoubleClick({ item, index });
  }

  // 处理项目选择（多选模式）
  function handleItemSelect(item: FsItem, index: number, multiSelect: boolean = false) {
    dispatch('itemSelect', { item, index, multiSelect });
    onItemSelect({ item, index, multiSelect });
  }

  // 处理项目键盘事件
  function handleItemKeydown(event: KeyboardEvent, item: FsItem, index: number) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleItemClick(item, index);
        break;
      case 'ContextMenu':
        event.preventDefault();
        // 模拟右键点击
        const mouseEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 0,
          clientY: 0
        });
        handleItemContextMenu(mouseEvent, item);
        break;
    }
  }

  // 格式化文件大小
  function formatSize(bytes: number, isDir: boolean): string {
    if (isDir) {
      return bytes === 0 ? '空文件夹' : `${bytes} 项`;
    }
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  // 格式化日期
  function formatDate(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  // 切换项目选中状态
  function toggleItemSelection(path: string) {
    const next = new Set(selectedItems);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    onSelectionChange({ selectedItems: next });
    dispatch('selectionChange', { selectedItems: next });
  }

  // 获取缩略图键 - 统一使用toRelativeKey
  function getThumbnailKey(item: FsItem): string {
    return toRelativeKey(item.path);
  }

  // 获取项目在列表中的实际索引
  function getItemIndex(item: FsItem): number {
    return items.findIndex(i => i.path === item.path);
  }

  // 组件挂载时初始化
  onMount(() => {
    if (container) {
      viewportHeight = container.clientHeight;
      calculateVisibleRange();
      
      // 设置ResizeObserver监听容器大小变化
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    }
  });

  // 组件销毁时清理
  onDestroy(() => {
    if (scrollTimer) {
      cancelAnimationFrame(scrollTimer);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
  });

  // 监听项目变化
  $effect(() => {
    if (items.length > 0) {
      calculateVisibleRange();
    } else {
      totalHeight = 0;
    }
  });

  // 监听视图模式变化，调整项目高度
  $effect(() => {
    itemHeight = viewMode === 'list' ? 60 : 150;
    calculateVisibleRange();
  });

  // 键盘导航支持
  function handleKeydown(e: KeyboardEvent) {
    if (items.length === 0) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = Math.min(selectedIndex + 1, items.length - 1);
        if (nextIndex !== selectedIndex) {
          onSelectedIndexChange({ index: nextIndex });
          dispatch('selectedIndexChange', { index: nextIndex });
          // 确保选中项在视口中可见
          scrollToItem(nextIndex);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = Math.max(selectedIndex - 1, 0);
        if (prevIndex !== selectedIndex) {
          onSelectedIndexChange({ index: prevIndex });
          dispatch('selectedIndexChange', { index: prevIndex });
          scrollToItem(prevIndex);
        }
        break;
      case 'Home':
        e.preventDefault();
        if (selectedIndex !== 0) {
          onSelectedIndexChange({ index: 0 });
          dispatch('selectedIndexChange', { index: 0 });
          scrollToItem(0);
        }
        break;
      case 'End':
        e.preventDefault();
        if (selectedIndex !== items.length - 1) {
          const last = items.length - 1;
          onSelectedIndexChange({ index: last });
          dispatch('selectedIndexChange', { index: last });
          scrollToItem(last);
        }
        break;
    }
  }

  // 滚动到指定项目
  function scrollToItem(index: number) {
    if (!container || index < 0 || index >= items.length) return;
    
    const targetScrollTop = index * itemHeight - viewportHeight / 2 + itemHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
  }
</script>

<div 
  bind:this={container}
  class="virtual-list-container flex-1 overflow-y-auto focus:outline-none" 
  tabindex="0" 
  role="listbox"
  aria-label="文件列表"
  onscroll={handleScroll}
  onkeydown={handleKeydown}
>
  {#if viewMode === 'list'}
    <!-- 列表视图 - 虚拟滚动 -->
    <div class="virtual-list" style="height: {totalHeight}px; position: relative;" role="presentation">
      <div 
        class="virtual-list-viewport" 
        style="transform: translateY({offsetY}px); position: absolute; top: 0; left: 0; right: 0;"
        role="presentation"
      >
        {#each items.slice(startIndex, endIndex + 1) as item, i (item.path)}
          {@const actualIndex = startIndex + i}
          {@const isSelected = selectedIndex === actualIndex}
          <div
            class="group flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors {isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-gray-200'}"
            style="height: {itemHeight}px;"
            role="option"
            aria-selected={isSelected}
            aria-label={item.name}
            tabindex={isSelected ? 0 : -1}
            onclick={() => handleItemClick(item, actualIndex)}
            oncontextmenu={(e) => handleItemContextMenu(e, item)}
            onkeydown={(e) => handleItemKeydown(e, item, actualIndex)}
          >
            <!-- 勾选框（勾选模式） -->
            {#if isCheckMode}
              <button
                class="flex-shrink-0"
                onclick={(e) => {
                  e.stopPropagation();
                  toggleItemSelection(item.path);
                }}
              >
                <div class="h-5 w-5 rounded border-2 flex items-center justify-center transition-colors {selectedItems.has(item.path) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}">
                  {#if selectedItems.has(item.path)}
                    <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </div>
              </button>
            {/if}

            <!-- 删除按钮（删除模式） -->
            {#if isDeleteMode}
              <button
                class="flex-shrink-0"
                onclick={(e) => {
                  e.stopPropagation();
                  dispatch('deleteItem', { item });
                }}
                title="删除"
              >
                <div class="h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
                  <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              </button>
            {/if}

            <!-- 图标或缩略图 -->
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded">
              {#if thumbnails.has(getThumbnailKey(item))}
                <!-- 显示缩略图 -->
                <img 
                  src={thumbnails.get(getThumbnailKey(item))} 
                  alt={item.name}
                  class="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              {:else if item.isDir}
                <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
              {:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
                <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
              {:else if item.isImage}
                <Image class="h-8 w-8 text-green-500 transition-colors group-hover:text-green-600" />
              {:else}
                <File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
              {/if}
            </div>

            <!-- 信息 -->
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{item.name}</div>
              <div class="text-xs text-gray-500">
                {formatSize(item.size, item.isDir)} · {formatDate(item.modified)}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <!-- 缩略图网格视图 - 虚拟滚动 -->
    <div class="virtual-grid" style="height: {totalHeight}px; position: relative;" role="grid" aria-label="缩略图网格">
      <div 
        class="virtual-grid-viewport" 
        style="transform: translateY({offsetY}px); position: absolute; top: 0; left: 0; right: 0;"
        role="presentation"
      >
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 p-2" role="presentation">
          {#each items.slice(startIndex, endIndex + 1) as item, i (item.path)}
            {@const actualIndex = startIndex + i}
            {@const isSelected = selectedIndex === actualIndex}
            <div
              class="group flex flex-col items-center gap-2 p-2 rounded border cursor-pointer transition-colors {isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-gray-200'}"
              style="height: {itemHeight}px;"
              role="option"
              aria-selected={isSelected}
              aria-label={item.name}
              tabindex={isSelected ? 0 : -1}
              onclick={() => handleItemClick(item, actualIndex)}
              oncontextmenu={(e) => handleItemContextMenu(e, item)}
              onkeydown={(e) => handleItemKeydown(e, item, actualIndex)}
            >
              <!-- 勾选框（勾选模式） -->
              {#if isCheckMode}
                <button
                  class="self-start"
                  onclick={(e) => {
                    e.stopPropagation();
                    toggleItemSelection(item.path);
                  }}
                >
                  <div class="h-5 w-5 rounded border-2 flex items-center justify-center transition-colors {selectedItems.has(item.path) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}">
                    {#if selectedItems.has(item.path)}
                      <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                      </svg>
                    {/if}
                  </div>
                </button>
              {/if}

              <!-- 缩略图容器 -->
              <div class="w-full aspect-square flex items-center justify-center overflow-hidden rounded bg-gray-100">
                {#if thumbnails.has(getThumbnailKey(item))}
                  <!-- 显示缩略图 -->
                  <img 
                    src={thumbnails.get(getThumbnailKey(item))} 
                    alt={item.name}
                    class="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                {:else if item.isDir}
                  <Folder class="h-12 w-12 text-blue-500" />
                {:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
                  <FileArchive class="h-12 w-12 text-purple-500" />
                {:else if item.isImage}
                  <Image class="h-12 w-12 text-green-500" />
                {:else}
                  <File class="h-12 w-12 text-gray-400" />
                {/if}
              </div>

              <!-- 文件名 -->
              <div class="w-full text-center">
                <div class="truncate text-sm font-medium">{item.name}</div>
                <div class="text-xs text-gray-500">
                  {formatSize(item.size, item.isDir)}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .virtual-list-container {
    height: 100%;
    overflow-y: auto;
    scroll-behavior: smooth;
  }
  
  /* 自定义滚动条样式 */
  .virtual-list-container::-webkit-scrollbar {
    width: 8px;
  }
  
  .virtual-list-container::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .virtual-list-container::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  
  .virtual-list-container::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }
  
  /* 确保项目高度一致 */
  .virtual-list-viewport > * {
    box-sizing: border-box;
  }
  
  .virtual-grid-viewport > div > * {
    box-sizing: border-box;
  }
</style>