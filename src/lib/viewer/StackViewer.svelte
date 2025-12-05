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
  import { pipelineLatencyStore } from '$lib/stores/pipelineLatency.svelte';
  import CanvasFrame from './components/CanvasFrame.svelte';
  import {
    type FrameSlot,
    createEmptySlot,
    SlotZIndex,
  } from './types/frameSlot';
  
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
    useCanvas = false,  // 使用 Canvas 预渲染模式
    onPageChange,
    onImageLoad,
  }: {
    showUpscale?: boolean;
    transitionDuration?: number;
    scale?: number;
    rotation?: number;
    viewPositionX?: number;
    viewPositionY?: number;
    viewportSize?: { width: number; height: number };
    useCanvas?: boolean;
    onPageChange?: (pageIndex: number) => void;
    onImageLoad?: (e: Event, index: number) => void;
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
  
  /**
   * 预计算图片的 CSS 缩放比例
   * 基于当前视口尺寸，计算适应模式下的缩放值
   */
  function computeScale(imgWidth: number, imgHeight: number): number {
    if (!viewportSize.width || !viewportSize.height) return 1;
    
    // 计算适应视口的缩放（contain 模式）
    const scaleX = viewportSize.width / imgWidth;
    const scaleY = viewportSize.height / imgHeight;
    return Math.min(scaleX, scaleY);
  }
  
  // ============================================================================
  // 核心方法
  // ============================================================================
  
  /**
   * 加载单个槽位的图片（包含预解码）
   */
  async function loadSlot(slot: FrameSlot, pageIndex: number): Promise<FrameSlot> {
    if (pageIndex < 0 || pageIndex >= bookStore.totalPages) {
      return createEmptySlot(slot.position);
    }
    
    const startTime = performance.now();
    
    // 先尝试同步获取缓存
    const cached = imagePool.getSync(pageIndex);
    if (cached) {
      // 预解码图片（确保翻页时不卡顿）
      const decodeStart = performance.now();
      await preDecodeImage(cached.url);
      const decodeMs = performance.now() - decodeStart;
      
      // 记录槽位加载（缓存命中）
      pipelineLatencyStore.record({
        timestamp: Date.now(),
        pageIndex,
        traceId: `slot-${slot.position}-${pageIndex}`,
        bookSyncMs: 0,
        backendLoadMs: 0,
        ipcTransferMs: 0,
        blobCreateMs: decodeMs,  // 用于记录解码时间
        totalMs: performance.now() - startTime,
        dataSize: cached.blob?.size ?? 0,
        cacheHit: true,
        isCurrentPage: slot.position === 'current',
        source: 'cache',
        slot: slot.position,
      });
      
      const dims = cached.width && cached.height 
        ? { width: cached.width, height: cached.height } 
        : null;
      
      return {
        position: slot.position,
        pageIndex,
        url: cached.url,
        blob: cached.blob ?? null,
        dimensions: dims,
        loading: false,
        backgroundColor: imagePool.getBackgroundColor(pageIndex) ?? null,
        precomputedScale: dims ? computeScale(dims.width, dims.height) : null,
      };
    }
    
    // 异步加载
    try {
      const loadStart = performance.now();
      const image = await imagePool.get(pageIndex);
      const loadMs = performance.now() - loadStart;
      
      if (image) {
        // 预解码图片
        const decodeStart = performance.now();
        await preDecodeImage(image.url);
        const decodeMs = performance.now() - decodeStart;
        
        // 记录槽位加载
        pipelineLatencyStore.record({
          timestamp: Date.now(),
          pageIndex,
          traceId: `slot-${slot.position}-${pageIndex}`,
          bookSyncMs: 0,
          backendLoadMs: loadMs,
          ipcTransferMs: loadMs,
          blobCreateMs: decodeMs,
          totalMs: performance.now() - startTime,
          dataSize: image.blob?.size ?? 0,
          cacheHit: false,
          isCurrentPage: slot.position === 'current',
          source: slot.position === 'current' ? 'current' : 'preload',
          slot: slot.position,
        });
        
        const dims = image.width && image.height 
          ? { width: image.width, height: image.height } 
          : null;
          
        return {
          position: slot.position,
          pageIndex,
          url: image.url,
          blob: image.blob ?? null,
          dimensions: dims,
          loading: false,
          backgroundColor: imagePool.getBackgroundColor(pageIndex) ?? null,
          precomputedScale: dims ? computeScale(dims.width, dims.height) : null,
        };
      }
    } catch (err) {
      console.warn(`StackViewer: 加载页面 ${pageIndex} 失败:`, err);
    }
    
    return createEmptySlot(slot.position);
  }
  
  /**
   * 预解码图片（使用 Image.decode() API）
   */
  async function preDecodeImage(url: string): Promise<void> {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      console.log(`✅ 预解码完成: ${url.slice(0, 50)}...`);
    } catch (err) {
      console.warn('预解码失败:', err);
    }
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
    
    const newCurrentIndex = displayedPageIndex + 1;
    if (newCurrentIndex >= bookStore.totalPages) return;
    
    // 如果 nextSlot 还没加载好，先加载
    if (!nextSlot.url || nextSlot.pageIndex !== newCurrentIndex) {
      console.log(`⏳ StackViewer: nextSlot 未就绪，先加载 page ${newCurrentIndex + 1}`);
      nextSlot = await loadSlot(createEmptySlot('next'), newCurrentIndex);
    }
    
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
    
    const newCurrentIndex = displayedPageIndex - 1;
    if (newCurrentIndex < 0) return;
    
    // 如果 prevSlot 还没加载好，先加载
    if (!prevSlot.url || prevSlot.pageIndex !== newCurrentIndex) {
      console.log(`⏳ StackViewer: prevSlot 未就绪，先加载 page ${newCurrentIndex + 1}`);
      prevSlot = await loadSlot(createEmptySlot('prev'), newCurrentIndex);
    }
    
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
   * 跳转到指定页面（优先使用槽位轮转，否则重新初始化）
   */
  async function navigateToPage(pageIndex: number) {
    if (pageIndex === displayedPageIndex) return;
    if (pageIndex < 0 || pageIndex >= bookStore.totalPages) return;
    
    // 优先使用单步轮转（即使槽位未加载，navigateForward/Backward 会自动加载）
    if (pageIndex === displayedPageIndex + 1) {
      await navigateForward();
      return;
    }
    if (pageIndex === displayedPageIndex - 1) {
      await navigateBackward();
      return;
    }
    
    // 跳转多页：完全重新初始化
    console.log(`🔄 StackViewer: 跳转到 page ${pageIndex + 1}，重新初始化槽位`);
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
      void initializeSlots(pageIndex);
      return;
    }
    
    // 同一本书内页面切换（使用槽位轮转，无需等待）
    if (pageIndex !== displayedPageIndex) {
      void navigateToPage(pageIndex);
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
  <!-- 前页层（隐藏，预加载用） -->
  {#if prevSlot.url}
    {#if useCanvas}
      <CanvasFrame
        imageUrl={prevSlot.url}
        imageBlob={prevSlot.blob}
        targetWidth={viewportSize.width}
        targetHeight={viewportSize.height}
        opacity={0}
        zIndex={SlotZIndex.PREV}
      />
    {:else}
      <div 
        class="frame-layer prev-layer"
        style:z-index={SlotZIndex.PREV}
        style:opacity={0}
        data-page-index={prevSlot.pageIndex}
      >
        <img 
          src={prevSlot.url} 
          alt="Previous page"
          class="frame-image"
          draggable="false"
        />
      </div>
    {/if}
  {/if}
  
  <!-- 当前页层 -->
  {#if currentSlot.url}
    {#if useCanvas}
      <!-- Canvas 预渲染模式 -->
      <CanvasFrame
        imageUrl={currentSlot.url}
        imageBlob={currentSlot.blob}
        targetWidth={viewportSize.width}
        targetHeight={viewportSize.height}
        {scale}
        {rotation}
        {transformOrigin}
        opacity={1}
        zIndex={SlotZIndex.CURRENT}
      />
    {:else}
      <!-- 传统 img 模式 -->
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
    {/if}
  {:else if currentSlot.loading}
    <div 
      class="frame-layer loading-layer"
      style:z-index={SlotZIndex.CURRENT}
    >
      <div class="loading-spinner"></div>
    </div>
  {:else}
    <div 
      class="frame-layer empty-layer"
      style:z-index={SlotZIndex.CURRENT}
    >
      <span class="text-muted-foreground">暂无图片</span>
    </div>
  {/if}
  
  <!-- 后页层（隐藏，预加载用） -->
  {#if nextSlot.url}
    {#if useCanvas}
      <CanvasFrame
        imageUrl={nextSlot.url}
        imageBlob={nextSlot.blob}
        targetWidth={viewportSize.width}
        targetHeight={viewportSize.height}
        opacity={0}
        zIndex={SlotZIndex.NEXT}
      />
    {:else}
      <div 
        class="frame-layer next-layer"
        style:z-index={SlotZIndex.NEXT}
        style:opacity={0}
        data-page-index={nextSlot.pageIndex}
      >
        <img 
          src={nextSlot.url} 
          alt="Next page"
          class="frame-image"
          draggable="false"
        />
      </div>
    {/if}
  {/if}
  
  <!-- 超分层 -->
  {#if showUpscale && upscaleUrl}
    <div 
      class="frame-layer upscale-layer"
      style:z-index={SlotZIndex.UPSCALE}
      style:opacity={1}
      style:transition={`opacity ${transitionDuration}ms ease`}
      style:transform={transformStyle}
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
    /* 强制完整解码，避免渐进式渲染导致的跳帧 */
    image-rendering: -webkit-optimize-contrast;
    content-visibility: visible;
    /* 图片本身也启用 GPU 加速 */
    will-change: transform;
    transform: translateZ(0);
  }
  
  /* 隐藏层（保持在 DOM 中但不可见） */
  .prev-layer,
  .next-layer {
    visibility: hidden;
  }
  
  .current-layer,
  .upscale-layer {
    visibility: visible;
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
