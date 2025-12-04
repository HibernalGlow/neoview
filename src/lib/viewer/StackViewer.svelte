<!--
  StackViewer - 层叠式图片渲染器
  
  核心设计：
  - 维护三个帧槽（prev/current/next），每个槽包含一个预加载的 img
  - 翻页时轮转槽位，而非替换 img.src，避免重解码卡顿
  - 可选超分层覆盖在 current 上方
  
  参考：docs/VIEWER_ARCHITECTURE_COMPARISON.md 方案 A
-->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
  import {
    type FrameSlot,
    type SlotPosition,
    createEmptySlot,
    SlotZIndex,
  } from './types/frameSlot';
  import { ViewerJSWrapper } from './viewerjs';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  let {
    showUpscale = true,
    transitionDuration = 150,
    scale = 1,
    rotation = 0,
    viewPositionX = 50,
    viewPositionY = 50,
    viewportSize = { width: 0, height: 0 },
    useViewerJS = false,
    zoomOnWheel = false,
    onPageChange,
    onImageLoad,
    onZoomChange,
  }: {
    showUpscale?: boolean;
    transitionDuration?: number;
    scale?: number;
    rotation?: number;
    viewPositionX?: number;
    viewPositionY?: number;
    viewportSize?: { width: number; height: number };
    useViewerJS?: boolean;
    zoomOnWheel?: boolean;
    onPageChange?: (pageIndex: number) => void;
    onImageLoad?: (e: Event, index: number) => void;
    onZoomChange?: (ratio: number) => void;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  // 三个帧槽
  let prevSlot = $state<FrameSlot>(createEmptySlot('prev'));
  let currentSlot = $state<FrameSlot>(createEmptySlot('current'));
  let nextSlot = $state<FrameSlot>(createEmptySlot('next'));
  
  // 超分层
  let upscaleUrl = $state<string | null>(null);
  
  // 当前显示的页面索引
  let displayedPageIndex = $state(-1);
  
  // 是否正在过渡动画中
  let isTransitioning = $state(false);
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  settingsManager.addListener((s) => { settings = s; });
  
  // 阅读方向
  let isRTL = $derived(settings.book.readingDirection === 'right-to-left');
  
  // ViewerJS 引用
  let viewerJSRef = $state<ViewerJSWrapper | null>(null);
  
  // ViewerJS 缩放回调
  function handleViewerJSZoom(ratio: number) {
    onZoomChange?.(ratio);
  }
  
  // 当前书本路径（用于检测书本切换）
  let currentBookPath = $state<string | null>(null);
  
  // 计算 transform-origin（基于 viewPositionX/Y）
  let transformOrigin = $derived(`${viewPositionX}% ${viewPositionY}%`);
  
  // 计算 transform（只包含 scale 和 rotation）
  let transformStyle = $derived.by(() => {
    const parts: string[] = [];
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
    return parts.length > 0 ? parts.join(' ') : 'none';
  });
  
  // ============================================================================
  // 核心方法
  // ============================================================================
  
  /**
   * 加载单个槽位的图片
   */
  async function loadSlot(slot: FrameSlot, pageIndex: number): Promise<FrameSlot> {
    if (pageIndex < 0 || pageIndex >= bookStore.totalPages) {
      return createEmptySlot(slot.position);
    }
    
    // 先尝试同步获取缓存
    const cached = imagePool.getSync(pageIndex);
    if (cached) {
      return {
        position: slot.position,
        pageIndex,
        url: cached.url,
        dimensions: cached.width && cached.height 
          ? { width: cached.width, height: cached.height } 
          : null,
        loading: false,
        backgroundColor: imagePool.getBackgroundColor(pageIndex) ?? null,
      };
    }
    
    // 标记为加载中
    const loadingSlot: FrameSlot = {
      ...slot,
      pageIndex,
      loading: true,
    };
    
    // 异步加载
    try {
      const image = await imagePool.get(pageIndex);
      if (image) {
        return {
          position: slot.position,
          pageIndex,
          url: image.url,
          dimensions: image.width && image.height 
            ? { width: image.width, height: image.height } 
            : null,
          loading: false,
          backgroundColor: imagePool.getBackgroundColor(pageIndex) ?? null,
        };
      }
    } catch (err) {
      console.warn(`StackViewer: 加载页面 ${pageIndex} 失败:`, err);
    }
    
    return createEmptySlot(slot.position);
  }
  
  /**
   * 初始化三个槽位（书本切换或首次加载时）
   */
  async function initializeSlots(centerIndex: number) {
    const book = bookStore.currentBook;
    if (!book) {
      prevSlot = createEmptySlot('prev');
      currentSlot = createEmptySlot('current');
      nextSlot = createEmptySlot('next');
      displayedPageIndex = -1;
      return;
    }
    
    // 设置当前书本
    if (currentBookPath !== book.path) {
      currentBookPath = book.path;
      imagePool.setCurrentBook(book.path);
    }
    
    console.log(`📚 StackViewer: 初始化槽位，中心页 ${centerIndex + 1}`);
    
    // 并行加载三个槽位
    const [prev, current, next] = await Promise.all([
      loadSlot(createEmptySlot('prev'), centerIndex - 1),
      loadSlot(createEmptySlot('current'), centerIndex),
      loadSlot(createEmptySlot('next'), centerIndex + 1),
    ]);
    
    prevSlot = prev;
    currentSlot = current;
    nextSlot = next;
    displayedPageIndex = centerIndex;
    
    // 触发预加载更远的页面
    imagePool.preloadRange(centerIndex, 5);
    
    console.log(`✅ StackViewer: 槽位初始化完成`, {
      prev: prev.pageIndex,
      current: current.pageIndex,
      next: next.pageIndex,
    });
  }
  
  /**
   * 向前翻页（next → current）
   */
  async function navigateForward() {
    if (isTransitioning) return;
    if (!nextSlot.url) return; // 没有下一页
    
    const newCurrentIndex = nextSlot.pageIndex;
    if (newCurrentIndex >= bookStore.totalPages) return;
    
    isTransitioning = true;
    
    // 槽位轮转：prev ← current ← next
    prevSlot = { ...currentSlot, position: 'prev' };
    currentSlot = { ...nextSlot, position: 'current' };
    nextSlot = createEmptySlot('next');
    displayedPageIndex = newCurrentIndex;
    
    // 清除超分层（新页面需要重新超分）
    upscaleUrl = null;
    
    // 通知外部
    onPageChange?.(newCurrentIndex);
    
    // 等待 DOM 更新
    await tick();
    
    // 异步加载新的 next 槽
    const newNextIndex = newCurrentIndex + 1;
    if (newNextIndex < bookStore.totalPages) {
      nextSlot = await loadSlot(createEmptySlot('next'), newNextIndex);
    }
    
    // 触发远程预加载
    imagePool.preloadRange(newCurrentIndex, 5);
    
    setTimeout(() => {
      isTransitioning = false;
    }, transitionDuration);
    
    console.log(`➡️ StackViewer: 向前翻页到 ${newCurrentIndex + 1}`);
  }
  
  /**
   * 向后翻页（prev → current）
   */
  async function navigateBackward() {
    if (isTransitioning) return;
    if (!prevSlot.url) return; // 没有上一页
    
    const newCurrentIndex = prevSlot.pageIndex;
    if (newCurrentIndex < 0) return;
    
    isTransitioning = true;
    
    // 槽位轮转：prev → current → next
    nextSlot = { ...currentSlot, position: 'next' };
    currentSlot = { ...prevSlot, position: 'current' };
    prevSlot = createEmptySlot('prev');
    displayedPageIndex = newCurrentIndex;
    
    // 清除超分层
    upscaleUrl = null;
    
    // 通知外部
    onPageChange?.(newCurrentIndex);
    
    // 等待 DOM 更新
    await tick();
    
    // 异步加载新的 prev 槽
    const newPrevIndex = newCurrentIndex - 1;
    if (newPrevIndex >= 0) {
      prevSlot = await loadSlot(createEmptySlot('prev'), newPrevIndex);
    }
    
    // 触发远程预加载
    imagePool.preloadRange(newCurrentIndex, 5);
    
    setTimeout(() => {
      isTransitioning = false;
    }, transitionDuration);
    
    console.log(`⬅️ StackViewer: 向后翻页到 ${newCurrentIndex + 1}`);
  }
  
  /**
   * 跳转到指定页面（完全重新初始化槽位）
   */
  async function navigateToPage(pageIndex: number) {
    if (pageIndex === displayedPageIndex) return;
    if (pageIndex < 0 || pageIndex >= bookStore.totalPages) return;
    
    // 检查是否可以通过单步轮转到达
    if (pageIndex === displayedPageIndex + 1 && nextSlot.url) {
      await navigateForward();
      return;
    }
    if (pageIndex === displayedPageIndex - 1 && prevSlot.url) {
      await navigateBackward();
      return;
    }
    
    // 需要完全重新初始化
    isTransitioning = true;
    await initializeSlots(pageIndex);
    onPageChange?.(pageIndex);
    
    setTimeout(() => {
      isTransitioning = false;
    }, transitionDuration);
  }
  
  /**
   * 设置超分图片
   */
  function setUpscaleUrl(url: string | null) {
    upscaleUrl = url;
  }
  
  // ============================================================================
  // Effects
  // ============================================================================
  
  // 监听 bookStore 页面变化
  $effect(() => {
    const book = bookStore.currentBook;
    const pageIndex = bookStore.currentPageIndex;
    
    if (!book) {
      prevSlot = createEmptySlot('prev');
      currentSlot = createEmptySlot('current');
      nextSlot = createEmptySlot('next');
      displayedPageIndex = -1;
      currentBookPath = null;
      upscaleUrl = null;
      return;
    }
    
    // 书本切换：完全重新初始化
    if (book.path !== currentBookPath) {
      initializeSlots(pageIndex);
      return;
    }
    
    // 同一本书内页面切换
    if (pageIndex !== displayedPageIndex) {
      navigateToPage(pageIndex);
    }
  });
  
  // 监听 bookStore 的超分图片
  $effect(() => {
    const url = bookStore.upscaledImageData;
    if (showUpscale && url) {
      upscaleUrl = url;
    } else {
      upscaleUrl = null;
    }
  });
  
  // 清理
  onDestroy(() => {
    prevSlot = createEmptySlot('prev');
    currentSlot = createEmptySlot('current');
    nextSlot = createEmptySlot('next');
    upscaleUrl = null;
  });
  
  // ============================================================================
  // 导出 API
  // ============================================================================
  
  // 当前图片尺寸（用于外部计算悬停滚动等）
  let currentDimensions = $derived(currentSlot.dimensions);
  
  export {
    navigateForward,
    navigateBackward,
    navigateToPage,
    setUpscaleUrl,
    displayedPageIndex,
    currentDimensions,
  };
</script>

<div class="stack-viewer">
  <!-- 预加载层（隐藏，保持在 DOM 中供预加载） -->
  {#if prevSlot.url}
    <div 
      class="frame-layer preload-layer"
      style:z-index={SlotZIndex.PREV}
      data-page-index={prevSlot.pageIndex}
    >
      <img src={prevSlot.url} alt="Preload prev" draggable="false" />
    </div>
  {/if}
  {#if nextSlot.url}
    <div 
      class="frame-layer preload-layer"
      style:z-index={SlotZIndex.NEXT}
      data-page-index={nextSlot.pageIndex}
    >
      <img src={nextSlot.url} alt="Preload next" draggable="false" />
    </div>
  {/if}
  
  <!-- 主显示层：ViewerJS 模式或原生模式 -->
  {#if useViewerJS}
    <!-- ViewerJS 增强模式 -->
    {#if currentSlot.url}
      <div 
        class="frame-layer viewerjs-layer"
        style:z-index={SlotZIndex.CURRENT}
        data-page-index={currentSlot.pageIndex}
      >
        <ViewerJSWrapper
          bind:this={viewerJSRef}
          imageUrl={currentSlot.url}
          {scale}
          {rotation}
          {zoomOnWheel}
          zoomOnTouch={true}
          movable={true}
          transition={false}
          initialCoverage={0.98}
          minZoomRatio={0.1}
          maxZoomRatio={10}
          onZoom={handleViewerJSZoom}
        />
      </div>
    {:else if currentSlot.loading}
      <div class="frame-layer loading-layer" style:z-index={SlotZIndex.CURRENT}>
        <div class="loading-spinner"></div>
      </div>
    {:else}
      <div class="frame-layer empty-layer" style:z-index={SlotZIndex.CURRENT}>
        <span class="text-muted-foreground">暂无图片</span>
      </div>
    {/if}
  {:else}
    <!-- 原生渲染模式 -->
    {#if currentSlot.url}
      <div 
        class="frame-layer current-layer"
        style:z-index={SlotZIndex.CURRENT}
        style:opacity={1}
        style:transition={`opacity ${transitionDuration}ms ease`}
        style:transform={transformStyle}
        style:transform-origin={transformOrigin}
        data-page-index={currentSlot.pageIndex}
      >
        <img 
          src={currentSlot.url} 
          alt="Current page"
          class="frame-image"
          draggable="false"
          onload={(e) => onImageLoad?.(e, 0)}
        />
      </div>
    {:else if currentSlot.loading}
      <div class="frame-layer loading-layer" style:z-index={SlotZIndex.CURRENT}>
        <div class="loading-spinner"></div>
      </div>
    {:else}
      <div class="frame-layer empty-layer" style:z-index={SlotZIndex.CURRENT}>
        <span class="text-muted-foreground">暂无图片</span>
      </div>
    {/if}
  {/if}
  
  <!-- 超分层（始终使用原生渲染以保持清晰度） -->
  {#if showUpscale && upscaleUrl}
    <div 
      class="frame-layer upscale-layer"
      style:z-index={SlotZIndex.UPSCALE}
      style:opacity={1}
      style:transition={`opacity ${transitionDuration}ms ease`}
      style:transform={useViewerJS ? 'none' : transformStyle}
      style:transform-origin={transformOrigin}
    >
      <img 
        src={upscaleUrl} 
        alt="Upscaled"
        class="frame-image"
        draggable="false"
      />
    </div>
  {/if}
</div>

<style>
  .stack-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    /* 创建层叠上下文 */
    isolation: isolate;
    /* GPU 加速 */
    contain: layout style;
  }
  
  .frame-layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    /* GPU 加速 */
    will-change: opacity, transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    pointer-events: none;
  }
  
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  /* 预加载层（保持在 DOM 中但不可见） */
  .preload-layer {
    visibility: hidden;
    pointer-events: none;
  }
  
  .current-layer,
  .upscale-layer,
  .viewerjs-layer {
    visibility: visible;
  }
  
  .viewerjs-layer {
    pointer-events: auto;
  }
  
  .loading-layer {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .empty-layer {
    color: var(--muted-foreground, #888);
  }
</style>
