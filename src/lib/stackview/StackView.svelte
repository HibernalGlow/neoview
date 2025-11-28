<!--
  StackView - 层叠式图片查看器主组件
  
  架构：
  - Layer 0: 背景层
  - Layer 2: 前帧层（预加载）
  - Layer 3: 后帧层（预加载）
  - Layer 4: 当前帧层
  - Layer 5: 超分层
  - Layer 7: 信息层
  - Layer 9: 手势层
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    BackgroundLayer,
    PrevFrameLayer,
    NextFrameLayer,
    CurrentFrameLayer,
    UpscaleLayer,
    InfoLayer,
    GestureLayer,
  } from './layers';
  import { 
    currentFrame, 
    prevFrame, 
    nextFrame, 
    upscaledFrame,
    updateImageUrl,
  } from './stores/frameStore';
  import { getBaseTransform } from './utils/transform';
  import type { Frame, FrameLayout } from './types/frame';
  import { emptyFrame } from './types/frame';
  
  // 导入外部 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom } from '$lib/stores';
  import { bookStore2 } from '$lib/stores/bookStore2';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  let {
    // 背景色
    backgroundColor = 'var(--background)',
    // 布局
    layout = 'single',
    // 阅读方向
    direction = 'ltr',
    // 是否为视频模式
    isVideoMode = false,
    // 显示配置
    showPageInfo = true,
    showProgress = true,
    showLoading = true,
    // 外部传入的图片 URL（兼容旧系统）
    currentUrl = null,
    prevUrl = null,
    nextUrl = null,
    upscaledUrl = null,
  }: {
    backgroundColor?: string;
    layout?: FrameLayout;
    direction?: 'ltr' | 'rtl';
    isVideoMode?: boolean;
    showPageInfo?: boolean;
    showProgress?: boolean;
    showLoading?: boolean;
    currentUrl?: string | null;
    prevUrl?: string | null;
    nextUrl?: string | null;
    upscaledUrl?: string | null;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let localPan = $state({ x: 0, y: 0 });
  let isLoading = $state(false);
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let rotation = $derived($rotationAngle);
  let bookState = $derived($bookStore2);
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // ============================================================================
  // 帧数据
  // ============================================================================
  
  // 使用外部 URL 或 store 中的帧
  let currentFrameData = $derived.by((): Frame => {
    if (currentUrl) {
      return {
        id: 'external-current',
        images: [{ url: currentUrl, physicalIndex: 0, virtualIndex: 0 }],
        layout: 'single',
      };
    }
    return $currentFrame;
  });
  
  let prevFrameData = $derived.by((): Frame => {
    if (prevUrl) {
      return {
        id: 'external-prev',
        images: [{ url: prevUrl, physicalIndex: 0, virtualIndex: 0 }],
        layout: 'single',
      };
    }
    return $prevFrame;
  });
  
  let nextFrameData = $derived.by((): Frame => {
    if (nextUrl) {
      return {
        id: 'external-next',
        images: [{ url: nextUrl, physicalIndex: 0, virtualIndex: 0 }],
        layout: 'single',
      };
    }
    return $nextFrame;
  });
  
  let upscaledFrameData = $derived.by((): Frame => {
    if (upscaledUrl) {
      return {
        id: 'external-upscaled',
        images: [{ url: upscaledUrl, physicalIndex: 0, virtualIndex: 0 }],
        layout: 'single',
      };
    }
    return $upscaledFrame;
  });
  
  // ============================================================================
  // 变换
  // ============================================================================
  
  let baseTransform = $derived(getBaseTransform(scale, rotation, localPan.x, localPan.y));
  
  // ============================================================================
  // 方法
  // ============================================================================
  
  function resetView() {
    storeResetZoom();
    localPan = { x: 0, y: 0 };
  }
  
  function handleImageLoad(e: Event, index: number) {
    const img = e.target as HTMLImageElement;
    if (img) {
      // 更新 bookStore2 的尺寸信息
      const frame = currentFrameData;
      if (frame.images[index]) {
        const physicalIndex = frame.images[index].physicalIndex;
        bookStore2.updatePhysicalPageSize(physicalIndex, img.naturalWidth, img.naturalHeight);
      }
    }
    isLoading = false;
  }
  
  function handlePrevPage() {
    const success = bookStore2.prevPage();
    if (success) {
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    localPan = { x: 0, y: 0 };
  }
  
  function handleNextPage() {
    const success = bookStore2.nextPage();
    if (success) {
      const vp = bookStore2.getVirtualPage(untrack(() => $bookStore2.currentIndex));
      if (vp) {
        bookStore.navigateToPage(vp.physicalPage.index);
      }
    }
    localPan = { x: 0, y: 0 };
  }
  
  function handlePan(delta: { x: number; y: number }) {
    localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y };
  }
  
  // 根据阅读方向决定点击行为
  let isRTL = $derived(settings.book.readingDirection === 'right-to-left');
  
  export { resetView };
</script>

<div class="stack-view">
  <!-- Layer 0: 背景层 -->
  <BackgroundLayer color={backgroundColor} />
  
  <!-- Layer 2: 前帧层 -->
  <PrevFrameLayer frame={prevFrameData} layout={layout} />
  
  <!-- Layer 3: 后帧层 -->
  <NextFrameLayer frame={nextFrameData} layout={layout} />
  
  <!-- Layer 4: 当前帧层 -->
  <CurrentFrameLayer 
    frame={currentFrameData} 
    layout={layout}
    direction={direction}
    transform={baseTransform}
    onImageLoad={handleImageLoad}
  />
  
  <!-- Layer 5: 超分层 -->
  <UpscaleLayer 
    frame={upscaledFrameData}
    layout={layout}
    direction={direction}
    transform={baseTransform}
    visible={upscaledFrameData.images.length > 0}
  />
  
  <!-- Layer 7: 信息层 -->
  <InfoLayer 
    currentIndex={bookState.currentIndex}
    totalPages={bookState.virtualPageCount}
    isLoading={isLoading}
    isDivided={bookState.divideLandscape}
    showPageInfo={showPageInfo}
    showProgress={showProgress}
    showLoading={showLoading}
  />
  
  <!-- Layer 9: 手势层 -->
  <GestureLayer 
    isVideoMode={isVideoMode}
    onTapLeft={isRTL ? handleNextPage : handlePrevPage}
    onTapRight={isRTL ? handlePrevPage : handleNextPage}
    onPan={handlePan}
  />
</div>

<style>
  .stack-view {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
