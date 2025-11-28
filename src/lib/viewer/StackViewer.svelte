<!--
  StackViewer - 层叠式图片查看器
  
  架构：
  - Layer 1: 前页层 (预加载，隐藏)
  - Layer 2: 后页层 (预加载，隐藏)
  - Layer 3: 当前页层 (可见)
  - Layer 4: 超分层 (可选，覆盖在当前页上)
  
  优点：
  - 无闪屏：图片已预加载，切换只需改变显示状态
  - 简单缓存：浏览器自动管理 img 元素的缓存
  - 平滑过渡：可以添加 CSS 动画
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
  // Props
  // ============================================================================
  
  let {
    // 图片 URL（从父组件传入，由旧系统加载）
    currentUrl = null,
    prevUrl = null,
    nextUrl = null,
    upscaledUrl = null,
    // 视图模式
    viewMode = 'single',
    // 回调
    onPrevPage,
    onNextPage,
    onSizeDetected,
  }: {
    currentUrl?: string | null;
    prevUrl?: string | null;
    nextUrl?: string | null;
    upscaledUrl?: string | null;
    viewMode?: 'single' | 'double' | 'panorama';
    onPrevPage?: () => void;
    onNextPage?: () => void;
    onSizeDetected?: (width: number, height: number) => void;
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
  
  // 当前虚拟页面信息
  let virtualPageInfo = $derived.by(() => {
    const frame = bookState.currentFrame;
    if (!frame || !frame.elements.length) return null;
    return frame.elements[0].virtualPage;
  });
  
  // 计算分割半边
  let splitHalf = $derived.by((): 'left' | 'right' | null => {
    if (virtualPageInfo?.isDivided) {
      return virtualPageInfo.part === 0 ? 'left' : 'right';
    }
    return null;
  });
  
  // 计算旋转
  let effectiveRotation = $derived.by(() => {
    const vpRotation = virtualPageInfo?.rotation ?? 0;
    const normalizedUI = uiRotation % 360;
    return (vpRotation + normalizedUI) % 360;
  });
  
  // ============================================================================
  // 样式计算
  // ============================================================================
  
  // 图片变换样式
  let imageTransform = $derived.by(() => {
    const parts = [];
    
    // 缩放
    if (scale !== 1) {
      parts.push(`scale(${scale})`);
    }
    
    // 旋转
    if (effectiveRotation !== 0) {
      parts.push(`rotate(${effectiveRotation}deg)`);
    }
    
    // 平移
    if (localPan.x !== 0 || localPan.y !== 0) {
      parts.push(`translate(${localPan.x}px, ${localPan.y}px)`);
    }
    
    return parts.length > 0 ? parts.join(' ') : 'none';
  });
  
  // 裁剪样式（用于分割页面）
  let clipPath = $derived.by(() => {
    if (!splitHalf) return 'none';
    if (splitHalf === 'left') {
      return 'inset(0 50% 0 0)';
    } else {
      return 'inset(0 0 0 50%)';
    }
  });
  
  // 分割页面的位移补偿
  let splitTranslateX = $derived.by(() => {
    if (!splitHalf) return 0;
    // 分割后图片只显示一半，需要移动到中心
    return splitHalf === 'left' ? 25 : -25; // 百分比
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
        
        // 根据阅读方向决定点击区域
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
  
  /** 处理图片加载完成，获取尺寸 */
  function handleImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img && onSizeDetected) {
      onSizeDetected(img.naturalWidth, img.naturalHeight);
    }
    
    // 同时更新 bookStore2
    if (virtualPageInfo) {
      const physicalIndex = virtualPageInfo.physicalPage.index;
      bookStore2.updatePhysicalPageSize(physicalIndex, img.naturalWidth, img.naturalHeight);
    }
  }
  
  /** 下一页 */
  function handleNextPage() {
    // 使用 bookStore2 翻页
    const success = bookStore2.nextPage();
    if (success) {
      // 同步到旧系统
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    onNextPage?.();
    // 重置平移
    localPan = { x: 0, y: 0 };
  }
  
  /** 上一页 */
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
>
  <!-- Layer 1: 前页层 (预加载) -->
  {#if prevUrl}
    <img
      src={prevUrl}
      alt="Previous page"
      class="stack-layer prev-layer"
      draggable="false"
    />
  {/if}
  
  <!-- Layer 2: 后页层 (预加载) -->
  {#if nextUrl}
    <img
      src={nextUrl}
      alt="Next page"
      class="stack-layer next-layer"
      draggable="false"
    />
  {/if}
  
  <!-- Layer 3: 当前页层 -->
  {#if currentUrl}
    <img
      src={currentUrl}
      alt="Current page"
      class="stack-layer current-layer"
      class:split={splitHalf !== null}
      style:transform={imageTransform}
      style:clip-path={clipPath}
      style:--split-translate-x="{splitTranslateX}%"
      onload={handleImageLoad}
      draggable="false"
    />
  {:else}
    <div class="stack-empty">
      <span class="text-muted-foreground">暂无图片</span>
    </div>
  {/if}
  
  <!-- Layer 4: 超分层 -->
  {#if upscaledUrl}
    <img
      src={upscaledUrl}
      alt="Upscaled"
      class="stack-layer upscale-layer"
      class:split={splitHalf !== null}
      style:transform={imageTransform}
      style:clip-path={clipPath}
      style:--split-translate-x="{splitTranslateX}%"
      draggable="false"
    />
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
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    transition: opacity 0.15s ease;
  }
  
  /* 前页层 - 隐藏但预加载 */
  .prev-layer {
    z-index: 1;
    opacity: 0;
    pointer-events: none;
  }
  
  /* 后页层 - 隐藏但预加载 */
  .next-layer {
    z-index: 2;
    opacity: 0;
    pointer-events: none;
  }
  
  /* 当前页层 - 可见 */
  .current-layer {
    z-index: 3;
    opacity: 1;
  }
  
  /* 超分层 - 覆盖在当前页上 */
  .upscale-layer {
    z-index: 4;
    opacity: 1;
  }
  
  /* 分割页面的位移补偿 */
  .split {
    transform: translateX(var(--split-translate-x, 0));
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
