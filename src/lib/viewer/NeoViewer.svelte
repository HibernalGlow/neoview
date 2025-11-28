<!--
  NeoViewer - 新一代图片查看器
  
  模块化架构，支持：
  - 图片渲染（ImageRenderer）
  - 手势处理（GestureHandler）
  - 缩放/旋转（集成 UI stores）
  - 横向分割、自动旋转
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import ImageRenderer from './ImageRenderer.svelte';
  import { GestureHandler, type GestureEvents } from './GestureHandler';
  
  // 导入 UI stores
  import { 
    zoomLevel, 
    rotationAngle, 
    zoomIn as storeZoomIn, 
    zoomOut as storeZoomOut,
    resetZoom as storeResetZoom,
  } from '$lib/stores';
  import { bookStore2 } from '$lib/stores/bookStore2';
  import { settingsManager } from '$lib/settings/settingsManager';
  import type { ReadingDirection } from '$lib/settings/settingsManager';
  import { hoverScroll } from '$lib/utils/scroll/hoverScroll';
  import { mapLogicalHalfToPhysical } from '$lib/utils/viewer/horizontalPageLayout';
  import type { HorizontalSplitHalf } from '$lib/utils/viewer/horizontalPageLayout';
  
  // ============================================================================
  // Props - 兼容 ImageViewerDisplay 接口
  // ============================================================================
  
  type ViewMode = 'single' | 'double' | 'panorama';
  type Point = { x: number; y: number };
  
  let {
    imageData = null,
    imageData2 = null,
    upscaledImageData = null,
    viewMode = 'single',
    orientation = 'horizontal',
    panoramaPages = $bindable([] as Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>),
    panX = 0,
    panY = 0,
    horizontalSplitHalf = null,
    treatHorizontalAsDoublePage = false,
    onPrevPage,
    onNextPage,
  }: {
    imageData?: string | null;
    imageData2?: string | null;
    upscaledImageData?: string | null;
    viewMode?: ViewMode;
    orientation?: 'horizontal' | 'vertical';
    panoramaPages?: Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>;
    panX?: number;
    panY?: number;
    horizontalSplitHalf?: HorizontalSplitHalf | null;
    treatHorizontalAsDoublePage?: boolean;
    onPrevPage?: () => void;
    onNextPage?: () => void;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let containerRef: HTMLDivElement | null = $state(null);
  let gestureHandler: GestureHandler | null = null;
  let localPan = $state<Point>({ x: 0, y: 0 });
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let uiRotation = $derived($rotationAngle);
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);
  let hoverScrollEnabled = $derived(settings.image.hoverScrollEnabled ?? true);
  
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // 计算当前显示的图片 URL
  let currentSrc = $derived(upscaledImageData || imageData);
  
  // 计算旋转角度
  let normalizedRotation = $derived.by(() => {
    const r = uiRotation % 360;
    if (r === 0 || r === 90 || r === 180 || r === 270) {
      return r as 0 | 90 | 180 | 270;
    }
    return 0 as const;
  });
  
  // 从 bookStore2 获取虚拟页面信息
  let bookState = $derived($bookStore2);
  let virtualPageInfo = $derived.by(() => {
    const frame = bookState.currentFrame;
    if (!frame || !frame.elements.length) return null;
    return frame.elements[0].virtualPage;
  });
  
  // 计算分割半边 - 优先使用 bookStore2 的虚拟页面信息
  let splitHalf = $derived.by(() => {
    // 优先从 bookStore2 获取
    if (virtualPageInfo?.isDivided) {
      return virtualPageInfo.part === 0 ? 'left' : 'right';
    }
    // 回退到 props
    if (!horizontalSplitHalf) return null;
    const physicalHalf = mapLogicalHalfToPhysical(horizontalSplitHalf, readingDirection);
    return physicalHalf as 'left' | 'right' | null;
  });
  
  // 计算旋转 - 优先使用虚拟页面的旋转
  let effectiveRotation = $derived.by((): 0 | 90 | 180 | 270 => {
    // 优先从 bookStore2 获取自动旋转
    const vpRotation = virtualPageInfo?.rotation;
    if (vpRotation !== undefined && vpRotation !== 0) {
      if (vpRotation === 90 || vpRotation === 180 || vpRotation === 270) {
        return vpRotation;
      }
    }
    // 回退到 UI 旋转
    return normalizedRotation;
  });
  
  // 合并平移
  let totalPanX = $derived(panX + localPan.x);
  let totalPanY = $derived(panY + localPan.y);
  
  // 全景模式
  let hasPanoramaImages = $state(false);
  let scrollContainer = $state<HTMLElement | null>(null);
  
  $effect(() => {
    if (viewMode === 'panorama') {
      hasPanoramaImages = panoramaPages.some((p) => !!p.data);
    } else {
      hasPanoramaImages = false;
    }
  });
  
  // ============================================================================
  // 手势处理
  // ============================================================================
  
  const gestureEvents: GestureEvents = {
    onPan: (delta) => {
      localPan = {
        x: localPan.x + delta.x,
        y: localPan.y + delta.y,
      };
    },
    
    onZoom: (zoomScale) => {
      if (zoomScale > 1) {
        storeZoomIn();
      } else if (zoomScale < 1) {
        storeZoomOut();
      }
    },
    
    onDoubleTap: () => {
      if ($zoomLevel > 1.5) {
        resetView();
      } else {
        zoomLevel.set(2);
      }
    },
    
    onTap: (point) => {
      if (containerRef) {
        const rect = containerRef.getBoundingClientRect();
        const x = point.x / rect.width;
        
        if (x < 0.3) {
          onPrevPage?.();
        } else if (x > 0.7) {
          onNextPage?.();
        }
      }
    },
  };
  
  onMount(() => {
    if (containerRef) {
      gestureHandler = new GestureHandler(containerRef, gestureEvents);
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
  
  function scrollToCenter(
    node: HTMLElement,
    params: { isCenter: boolean; orientation: 'horizontal' | 'vertical' }
  ) {
    let { isCenter, orientation: orient } = params;

    const scrollToNodeCenter = () => {
      if (!isCenter) return;
      const container = node.parentElement as HTMLElement | null;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();

      if (orient === 'horizontal') {
        const containerCenter = containerRect.left + containerRect.width / 2;
        const nodeCenter = nodeRect.left + nodeRect.width / 2;
        const delta = nodeCenter - containerCenter;
        container.scrollLeft = container.scrollLeft + delta;
      } else {
        const containerCenter = containerRect.top + containerRect.height / 2;
        const nodeCenter = nodeRect.top + nodeRect.height / 2;
        const delta = nodeCenter - containerCenter;
        container.scrollTop = container.scrollTop + delta;
      }
    };

    if (isCenter) {
      requestAnimationFrame(() => {
        scrollToNodeCenter();
      });
    }

    return {
      update(newParams: { isCenter: boolean; orientation: 'horizontal' | 'vertical' }) {
        isCenter = newParams.isCenter;
        orient = newParams.orientation;
        if (isCenter) {
          scrollToNodeCenter();
        }
      }
    };
  }
  
  export { resetView };
</script>

<div 
  class="neo-viewer"
  bind:this={containerRef}
>
  {#if viewMode === 'panorama'}
    <!-- 全景模式 -->
    <div
      class="neo-viewer__panorama"
      class:neo-viewer__panorama--horizontal={orientation === 'horizontal'}
      class:neo-viewer__panorama--vertical={orientation === 'vertical'}
      style={`transform: scale(${scale});`}
    >
      {#if hasPanoramaImages}
        <div
          class="neo-viewer__panorama-inner"
          class:neo-viewer__panorama-inner--horizontal={orientation === 'horizontal'}
          class:neo-viewer__panorama-inner--vertical={orientation === 'vertical'}
          class:neo-viewer__panorama-inner--rtl={readingDirection === 'right-to-left'}
          bind:this={scrollContainer}
          use:hoverScroll={{ enabled: hoverScrollEnabled, axis: 'both' }}
        >
          {#each panoramaPages as page (page.index)}
            {#if page.data}
              <img
                src={page.data}
                alt={`Page ${page.index + 1}`}
                class="neo-viewer__panorama-image"
                class:neo-viewer__panorama-image--horizontal={orientation === 'horizontal'}
                class:neo-viewer__panorama-image--vertical={orientation === 'vertical'}
                style={`transform: rotate(${uiRotation}deg);`}
                use:scrollToCenter={{ isCenter: page.position === 'center', orientation }}
              />
            {/if}
          {/each}
        </div>
      {:else if currentSrc}
        <div class="neo-viewer__fallback">
          <ImageRenderer
            src={currentSrc}
            rotation={effectiveRotation}
            scale={1}
            fitMode="contain"
          />
        </div>
      {/if}
    </div>
  {:else if currentSrc}
    {#if viewMode === 'single'}
      <!-- 单页模式 -->
      <div class="neo-viewer__single">
        <ImageRenderer
          src={currentSrc}
          rotation={effectiveRotation}
          scale={scale}
          offset={{ x: totalPanX, y: totalPanY }}
          fitMode="contain"
          {splitHalf}
        />
      </div>
    {:else if viewMode === 'double'}
      {#if treatHorizontalAsDoublePage}
        <div class="neo-viewer__double">
          <ImageRenderer
            src={currentSrc}
            rotation={effectiveRotation}
            scale={scale}
            offset={{ x: totalPanX, y: totalPanY }}
            fitMode="contain"
          />
        </div>
      {:else}
        <div class="neo-viewer__double-spread">
          {#if readingDirection === 'right-to-left'}
            {#if imageData2}
              <ImageRenderer
                src={imageData2}
                rotation={effectiveRotation}
                scale={scale}
                offset={{ x: totalPanX, y: totalPanY }}
                fitMode="contain"
              />
            {/if}
            <ImageRenderer
              src={currentSrc}
              rotation={effectiveRotation}
              scale={scale}
              offset={{ x: totalPanX, y: totalPanY }}
              fitMode="contain"
            />
          {:else}
            <ImageRenderer
              src={currentSrc}
              rotation={effectiveRotation}
              scale={scale}
              offset={{ x: totalPanX, y: totalPanY }}
              fitMode="contain"
            />
            {#if imageData2}
              <ImageRenderer
                src={imageData2}
                rotation={effectiveRotation}
                scale={scale}
                offset={{ x: totalPanX, y: totalPanY }}
                fitMode="contain"
              />
            {/if}
          {/if}
        </div>
      {/if}
    {/if}
  {:else}
    <div class="neo-viewer__empty">
      <span>无图片</span>
    </div>
  {/if}
  
  {#if scale !== 1}
    <div class="neo-viewer__zoom-indicator">
      {Math.round(scale * 100)}%
    </div>
  {/if}
</div>

<style>
  .neo-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--viewer-background, #000);
    cursor: grab;
  }
  
  .neo-viewer:active {
    cursor: grabbing;
  }
  
  .neo-viewer__single,
  .neo-viewer__double {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .neo-viewer__double-spread {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
  }
  
  .neo-viewer__double-spread :global(.image-renderer) {
    max-width: 45%;
    max-height: 100%;
  }
  
  .neo-viewer__panorama {
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
  }
  
  .neo-viewer__panorama--horizontal {
    align-items: center;
    overflow-x: auto;
  }
  
  .neo-viewer__panorama--vertical {
    align-items: flex-start;
    overflow-y: auto;
  }
  
  .neo-viewer__panorama-inner {
    display: flex;
    padding: 0;
  }
  
  .neo-viewer__panorama-inner--horizontal {
    flex-direction: row;
    height: 100%;
    min-width: 100%;
    align-items: center;
    overflow-x: auto;
  }
  
  .neo-viewer__panorama-inner--horizontal.neo-viewer__panorama-inner--rtl {
    flex-direction: row-reverse;
  }
  
  .neo-viewer__panorama-inner--vertical {
    flex-direction: column;
    width: 100%;
    min-height: 100%;
    align-items: center;
    overflow-y: auto;
  }
  
  .neo-viewer__panorama-image {
    flex-shrink: 0;
    object-fit: cover;
    transition: transform 0.2s;
  }
  
  .neo-viewer__panorama-image--horizontal {
    height: 100%;
    width: auto;
    margin: 0 -1px;
  }
  
  .neo-viewer__panorama-image--vertical {
    width: 100%;
    height: auto;
    margin: -1px 0;
  }
  
  .neo-viewer__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .neo-viewer__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #666;
  }
  
  .neo-viewer__zoom-indicator {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 0.75rem;
    border-radius: 0.25rem;
    pointer-events: none;
  }
</style>
