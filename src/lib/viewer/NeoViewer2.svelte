<!--
  NeoViewer2 - 完全基于 bookStore2 的图片查看器
  
  特点：
  - 完全使用 bookStore2 的虚拟页面系统
  - 自动处理横向分割和自动旋转
  - 图片加载后自动更新尺寸信息
  - 预加载后续页面
-->
<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import ImageRenderer from './ImageRenderer.svelte';
  import { GestureHandler, type GestureEvents } from './GestureHandler';
  
  // 导入 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom } from '$lib/stores';
  import { bookStore2 } from '$lib/stores/bookStore2';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import type { ReadingDirection } from '$lib/settings/settingsManager';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  type ViewMode = 'single' | 'double' | 'panorama';
  type Point = { x: number; y: number };
  
  let {
    // 兼容旧接口的 props，但优先使用 bookStore2
    imageData = null,
    imageData2 = null,
    upscaledImageData = null,
    viewMode = 'single',
    orientation = 'horizontal',
    panoramaPages = $bindable([] as Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>),
    panX = 0,
    panY = 0,
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
  
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // ============================================================================
  // bookStore2 数据
  // ============================================================================
  
  let bookState = $derived($bookStore2);
  
  // 当前虚拟页面信息
  let virtualPageInfo = $derived.by(() => {
    const frame = bookState.currentFrame;
    if (!frame || !frame.elements.length) return null;
    return frame.elements[0].virtualPage;
  });
  
  // 计算分割半边 - 完全从 bookStore2 获取
  let splitHalf = $derived.by((): 'left' | 'right' | null => {
    if (virtualPageInfo?.isDivided) {
      return virtualPageInfo.part === 0 ? 'left' : 'right';
    }
    return null;
  });
  
  // 计算旋转 - 虚拟页面旋转 + UI 旋转
  let effectiveRotation = $derived.by(() => {
    const vpRotation = virtualPageInfo?.rotation ?? 0;
    const normalizedUI = uiRotation % 360;
    const total = (vpRotation + normalizedUI) % 360;
    if (total === 0 || total === 90 || total === 180 || total === 270) {
      return total as 0 | 90 | 180 | 270;
    }
    return 0 as const;
  });
  
  // 当前显示的图片 URL（优先使用超分后的）
  let currentSrc = $derived(upscaledImageData || imageData);
  
  // 总平移量
  let totalPanX = $derived(panX + localPan.x);
  let totalPanY = $derived(panY + localPan.y);
  
  // 全景模式检查
  let hasPanoramaImages = $derived(
    viewMode === 'panorama' && panoramaPages.some(p => p.data !== null)
  );
  
  // ============================================================================
  // 手势处理
  // ============================================================================
  
  const gestureEvents: GestureEvents = {
    onPan: (delta) => {
      localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y };
    },
    onTap: (point) => {
      // 点击左侧 30% 上一页，右侧 30% 下一页
      if (containerRef) {
        const rect = containerRef.getBoundingClientRect();
        const relX = (point.x - rect.left) / rect.width;
        
        if (relX < 0.3) {
          handlePrevPage();
        } else if (relX > 0.7) {
          handleNextPage();
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
  
  /** 处理图片尺寸检测，更新到 bookStore2 */
  function handleSizeDetected(width: number, height: number) {
    if (virtualPageInfo) {
      const physicalIndex = virtualPageInfo.physicalPage.index;
      bookStore2.updatePhysicalPageSize(physicalIndex, width, height);
    }
  }
  
  /** 下一页 - 使用 bookStore2 */
  function handleNextPage() {
    // 使用 bookStore2 的虚拟页面翻页
    const success = bookStore2.nextPage();
    if (success) {
      // 同步到旧系统（保持兼容）
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    // 也调用外部回调（如果有）
    onNextPage?.();
  }
  
  /** 上一页 - 使用 bookStore2 */
  function handlePrevPage() {
    const success = bookStore2.prevPage();
    if (success) {
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    onPrevPage?.();
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
        >
          {#each panoramaPages as page (page.index)}
            {#if page.data}
              <img
                src={page.data}
                alt={`Page ${page.index + 1}`}
                class="neo-viewer__panorama-image"
                style={`transform: rotate(${uiRotation}deg);`}
                draggable="false"
              />
            {/if}
          {/each}
        </div>
      {:else}
        <div class="neo-viewer__empty">
          <slot name="empty">
            <span class="text-muted-foreground">暂无图片</span>
          </slot>
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
          onSizeDetected={handleSizeDetected}
        />
      </div>
    {:else if viewMode === 'double'}
      <!-- 双页模式 -->
      {#if treatHorizontalAsDoublePage}
        <div class="neo-viewer__double">
          <ImageRenderer
            src={currentSrc}
            rotation={effectiveRotation}
            scale={scale}
            offset={{ x: totalPanX, y: totalPanY }}
            fitMode="contain"
            onSizeDetected={handleSizeDetected}
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
              onSizeDetected={handleSizeDetected}
            />
          {:else}
            <ImageRenderer
              src={currentSrc}
              rotation={effectiveRotation}
              scale={scale}
              offset={{ x: totalPanX, y: totalPanY }}
              fitMode="contain"
              onSizeDetected={handleSizeDetected}
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
    <!-- 空状态 -->
    <div class="neo-viewer__empty">
      <slot name="empty">
        <span class="text-muted-foreground">暂无图片</span>
      </slot>
    </div>
  {/if}
  
  <!-- 页面信息覆盖层 -->
  {#if bookState.isOpen}
    <div class="neo-viewer__page-info">
      <span class="text-xs text-muted-foreground">
        {bookState.currentIndex + 1} / {bookState.virtualPageCount}
        {#if bookState.divideLandscape}
          (分割)
        {/if}
      </span>
    </div>
  {/if}
</div>

<style>
  .neo-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--background);
  }
  
  .neo-viewer__single,
  .neo-viewer__double {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .neo-viewer__double-spread {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  
  .neo-viewer__panorama {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-origin: center center;
  }
  
  .neo-viewer__panorama-inner {
    display: flex;
    gap: 4px;
  }
  
  .neo-viewer__panorama-inner--horizontal {
    flex-direction: row;
  }
  
  .neo-viewer__panorama-inner--vertical {
    flex-direction: column;
  }
  
  .neo-viewer__panorama-inner--rtl {
    flex-direction: row-reverse;
  }
  
  .neo-viewer__panorama-image {
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  .neo-viewer__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .neo-viewer__page-info {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    pointer-events: none;
  }
</style>
