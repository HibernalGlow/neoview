<!--
  StackViewer2 - 增强版层叠式图片查看器
  
  架构：
  - 每层可以包含多张图片（支持单页、双页、全景）
  - Layer 1: 前帧层 (预加载，隐藏)
  - Layer 2: 后帧层 (预加载，隐藏)
  - Layer 3: 当前帧层 (可见)
  - Layer 4: 超分层 (可选，覆盖在当前帧上)
  
  帧 (Frame) = 一次显示的内容，可能包含：
  - 单页模式: 1张图片
  - 双页模式: 2张图片
  - 全景模式: N张图片
-->
<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { GestureHandler, type GestureEvents } from './GestureHandler';
  
  // 导入 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom } from '$lib/stores';
  import { bookStore2 } from '$lib/stores/bookStore2';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import type { ReadingDirection } from '$lib/settings/settingsManager';
  
  // ============================================================================
  // 类型定义
  // ============================================================================
  
  interface FrameImage {
    url: string;
    splitHalf?: 'left' | 'right' | null;
    rotation?: number;
  }
  
  interface Frame {
    images: FrameImage[];
  }
  
  // ============================================================================
  // Props
  // ============================================================================
  
  let {
    // 当前帧的图片列表
    currentFrame = { images: [] },
    // 前一帧（预加载）
    prevFrame = { images: [] },
    // 后一帧（预加载）
    nextFrame = { images: [] },
    // 超分后的图片（覆盖当前帧）
    upscaledFrame = { images: [] },
    // 视图模式
    viewMode = 'single',
    // 阅读方向
    direction = 'ltr',
    // 背景色（可以是颜色值或 'auto'）
    backgroundColor = 'var(--background)',
    // 回调
    onPrevPage,
    onNextPage,
    onSizeDetected,
  }: {
    currentFrame?: Frame;
    prevFrame?: Frame;
    nextFrame?: Frame;
    upscaledFrame?: Frame;
    viewMode?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
    backgroundColor?: string;
    onPrevPage?: () => void;
    onNextPage?: () => void;
    onSizeDetected?: (width: number, height: number, index: number) => void;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let containerRef: HTMLDivElement | null = $state(null);
  let gestureHandler: GestureHandler | null = null;
  let localPan = $state({ x: 0, y: 0 });
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let uiRotation = $derived($rotationAngle);
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);
  
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // ============================================================================
  // bookStore2 数据
  // ============================================================================
  
  let bookState = $derived($bookStore2);
  
  // ============================================================================
  // 样式计算
  // ============================================================================
  
  // 基础变换（缩放、旋转、平移）
  let baseTransform = $derived.by(() => {
    const parts = [];
    
    if (scale !== 1) {
      parts.push(`scale(${scale})`);
    }
    
    if (uiRotation !== 0) {
      parts.push(`rotate(${uiRotation}deg)`);
    }
    
    if (localPan.x !== 0 || localPan.y !== 0) {
      parts.push(`translate(${localPan.x}px, ${localPan.y}px)`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'none';
  });
  
  // 计算单张图片的样式
  function getImageStyle(img: FrameImage): string {
    const parts = [];
    
    // 分割页面的位移补偿
    if (img.splitHalf === 'left') {
      parts.push('translateX(25%)');
    } else if (img.splitHalf === 'right') {
      parts.push('translateX(-25%)');
    }
    
    // 图片自身的旋转
    if (img.rotation && img.rotation !== 0) {
      parts.push(`rotate(${img.rotation}deg)`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'none';
  }
  
  // 计算裁剪路径
  function getClipPath(img: FrameImage): string {
    if (img.splitHalf === 'left') {
      return 'inset(0 50% 0 0)';
    } else if (img.splitHalf === 'right') {
      return 'inset(0 0 0 50%)';
    }
    return 'none';
  }
  
  // 帧布局类名
  let frameLayoutClass = $derived.by(() => {
    if (viewMode === 'panorama') {
      return 'frame-panorama';
    } else if (viewMode === 'double') {
      return direction === 'rtl' ? 'frame-double frame-rtl' : 'frame-double';
    }
    return 'frame-single';
  });
  
  // ============================================================================
  // 手势处理
  // ============================================================================
  
  const gestureEvents: GestureEvents = {
    onPan: (delta) => {
      localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y };
    },
    onTap: (point) => {
      if (containerRef) {
        const rect = containerRef.getBoundingClientRect();
        const relX = (point.x - rect.left) / rect.width;
        
        const isRTL = readingDirection === 'right-to-left';
        
        if (relX < 0.3) {
          isRTL ? handleNextPage() : handlePrevPage();
        } else if (relX > 0.7) {
          isRTL ? handlePrevPage() : handleNextPage();
        }
      }
    },
  };
  
  // ============================================================================
  // 生命周期
  // ============================================================================
  
  onMount(() => {
    if (containerRef) {
      gestureHandler = new GestureHandler(containerRef, gestureEvents, {
        enableZoom: false,
      });
    }
  });
  
  onDestroy(() => {
    gestureHandler?.destroy();
  });
  
  // ============================================================================
  // 方法
  // ============================================================================
  
  function resetView() {
    storeResetZoom();
    localPan = { x: 0, y: 0 };
  }
  
  function handleImageLoad(event: Event, index: number) {
    const img = event.target as HTMLImageElement;
    if (img && onSizeDetected) {
      onSizeDetected(img.naturalWidth, img.naturalHeight, index);
    }
  }
  
  function handleNextPage() {
    const success = bookStore2.nextPage();
    if (success) {
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    onNextPage?.();
    localPan = { x: 0, y: 0 };
  }
  
  function handlePrevPage() {
    const success = bookStore2.prevPage();
    if (success) {
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    onPrevPage?.();
    localPan = { x: 0, y: 0 };
  }
  
  export { resetView };
</script>

<div 
  class="stack-viewer"
  bind:this={containerRef}
  style:background-color={backgroundColor}
>
  <!-- Layer 0: 背景层 (由 CSS background-color 处理) -->
  
  <!-- Layer 1: 前帧层 (预加载) -->
  {#if prevFrame.images.length > 0}
    <div class="stack-layer prev-layer {frameLayoutClass}">
      {#each prevFrame.images as img, i (i)}
        <img
          src={img.url}
          alt="Previous frame {i}"
          class="frame-image"
          style:transform={getImageStyle(img)}
          style:clip-path={getClipPath(img)}
          draggable="false"
        />
      {/each}
    </div>
  {/if}
  
  <!-- Layer 2: 后帧层 (预加载) -->
  {#if nextFrame.images.length > 0}
    <div class="stack-layer next-layer {frameLayoutClass}">
      {#each nextFrame.images as img, i (i)}
        <img
          src={img.url}
          alt="Next frame {i}"
          class="frame-image"
          style:transform={getImageStyle(img)}
          style:clip-path={getClipPath(img)}
          draggable="false"
        />
      {/each}
    </div>
  {/if}
  
  <!-- Layer 3: 当前帧层 -->
  {#if currentFrame.images.length > 0}
    <div 
      class="stack-layer current-layer {frameLayoutClass}"
      style:transform={baseTransform}
    >
      {#each currentFrame.images as img, i (i)}
        <img
          src={img.url}
          alt="Current frame {i}"
          class="frame-image"
          style:transform={getImageStyle(img)}
          style:clip-path={getClipPath(img)}
          onload={(e) => handleImageLoad(e, i)}
          draggable="false"
        />
      {/each}
    </div>
  {:else}
    <div class="stack-empty">
      <span class="text-muted-foreground">暂无图片</span>
    </div>
  {/if}
  
  <!-- Layer 4: 超分层 -->
  {#if upscaledFrame.images.length > 0}
    <div 
      class="stack-layer upscale-layer {frameLayoutClass}"
      style:transform={baseTransform}
    >
      {#each upscaledFrame.images as img, i (i)}
        <img
          src={img.url}
          alt="Upscaled {i}"
          class="frame-image"
          style:transform={getImageStyle(img)}
          style:clip-path={getClipPath(img)}
          draggable="false"
        />
      {/each}
    </div>
  {/if}
  
  <!-- 页面信息 -->
  {#if bookState.isOpen}
    <div class="stack-info">
      <span class="text-xs">
        {bookState.currentIndex + 1} / {bookState.virtualPageCount}
        {#if bookState.divideLandscape}
          (分割)
        {/if}
      </span>
    </div>
  {/if}
</div>

<style>
  .stack-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--background);
  }
  
  .stack-layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s ease;
  }
  
  /* 前帧层 - 隐藏但预加载 */
  .prev-layer {
    z-index: 1;
    opacity: 0;
    pointer-events: none;
  }
  
  /* 后帧层 - 隐藏但预加载 */
  .next-layer {
    z-index: 2;
    opacity: 0;
    pointer-events: none;
  }
  
  /* 当前帧层 - 可见 */
  .current-layer {
    z-index: 3;
    opacity: 1;
  }
  
  /* 超分层 - 覆盖在当前帧上 */
  .upscale-layer {
    z-index: 4;
    opacity: 1;
  }
  
  /* 帧布局 - 单页 */
  .frame-single {
    justify-content: center;
  }
  
  /* 帧布局 - 双页 */
  .frame-double {
    flex-direction: row;
    gap: 4px;
  }
  
  .frame-double.frame-rtl {
    flex-direction: row-reverse;
  }
  
  /* 帧布局 - 全景 */
  .frame-panorama {
    flex-direction: row;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  /* 双页模式下每张图片占一半 */
  .frame-double .frame-image {
    max-width: 50%;
  }
  
  /* 全景模式下图片高度固定 */
  .frame-panorama .frame-image {
    max-width: none;
    height: 100%;
  }
  
  .stack-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .stack-info {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    color: white;
    pointer-events: none;
    z-index: 10;
  }
</style>
