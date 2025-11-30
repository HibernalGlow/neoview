<!--
  StackView - 层叠式图片查看器（独立模式）
  
  使用 imageStore 管理图片加载，复用现有手势和缩放
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    BackgroundLayer,
    CurrentFrameLayer,
    InfoLayer,
    GestureLayer,
  } from './layers';
  import { getBaseTransform } from './utils/transform';
  import { 
    isLandscape, 
    getInitialSplitHalf, 
    getNextSplitHalf, 
    getPrevSplitHalf,
    buildFrameImages,
    getPageStep,
    type SplitState,
    type FrameBuildConfig,
    type PageData,
  } from './utils/viewMode';
  import { createZoomModeManager, type ViewportSize } from './utils/zoomModeHandler';
  import type { ZoomMode } from '$lib/settings/settingsManager';
  import type { Frame, FrameLayout, FrameImage } from './types/frame';
  import { emptyFrame } from './types/frame';
  import { getImageStore } from './stores/imageStore.svelte';
  
  // 导入外部 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom, viewMode, lockedViewMode } from '$lib/stores';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import { appState } from '$lib/core/state/appState';
  
  // ============================================================================
  // 获取 viewer 状态
  // ============================================================================
  
  // 使用 appState 获取 orientation（没有独立 store）
  function getOrientation(): 'horizontal' | 'vertical' {
    return appState.getSnapshot().viewer.orientation;
  }
  
  // ============================================================================
  // Props
  // ============================================================================
  
  let {
    backgroundColor = 'var(--background)',
    showPageInfo = true,
    showProgress = true,
    showLoading = true,
  }: {
    backgroundColor?: string;
    showPageInfo?: boolean;
    showProgress?: boolean;
    showLoading?: boolean;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  const imageStore = getImageStore();
  const zoomModeManager = createZoomModeManager();
  
  let localPan = $state({ x: 0, y: 0 });
  let splitState = $state<SplitState | null>(null);
  let containerRef: HTMLDivElement | null = $state(null);
  let viewportSize = $state<ViewportSize>({ width: 0, height: 0 });
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let rotation = $derived($rotationAngle);
  let layout = $derived($viewMode as FrameLayout);
  let orientation = $state<'horizontal' | 'vertical'>('horizontal');
  
  // 监听 appState 变化更新 orientation
  $effect(() => {
    orientation = getOrientation();
    // 订阅 appState 变化
    const unsubscribe = appState.subscribe(
      (state) => state.viewer.orientation,
      (value) => { orientation = value; }
    );
    return unsubscribe;
  });
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  settingsManager.addListener((s) => { settings = s; });
  
  // 从设置获取配置
  let direction = $derived<'ltr' | 'rtl'>(settings.book.readingDirection === 'right-to-left' ? 'rtl' : 'ltr');
  let divideLandscape = $derived(settings.view.pageLayout?.splitHorizontalPages ?? false);
  let treatHorizontalAsDoublePage = $derived(settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false);
  
  // 判断当前图是否横向
  let isCurrentLandscape = $derived(
    imageStore.state.dimensions ? isLandscape(imageStore.state.dimensions) : false
  );
  
  // 是否为视频
  let isVideoMode = $derived.by(() => {
    const page = bookStore.currentPage;
    if (!page) return false;
    const ext = (page.innerPath || page.path || '').split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext || '');
  });
  
  // 是否处于分割模式
  let isInSplitMode = $derived(
    divideLandscape && isCurrentLandscape && layout === 'single' && !isVideoMode
  );
  
  // ============================================================================
  // 帧配置
  // ============================================================================
  
  let frameConfig = $derived.by((): FrameBuildConfig => ({
    layout: layout as 'single' | 'double' | 'panorama',
    orientation: orientation,
    direction: direction,
    divideLandscape: divideLandscape,
    treatHorizontalAsDoublePage: treatHorizontalAsDoublePage,
    autoRotate: false, // TODO: 从设置读取
  }));
  
  // ============================================================================
  // 帧数据
  // ============================================================================
  
  let currentFrameData = $derived.by((): Frame => {
    const { currentUrl, secondUrl, dimensions } = imageStore.state;
    
    if (!currentUrl) return emptyFrame;
    
    // 构建当前页数据
    const currentPage: PageData = {
      url: currentUrl,
      pageIndex: bookStore.currentPageIndex,
      width: dimensions?.width,
      height: dimensions?.height,
    };
    
    // 构建下一页数据（双页模式需要）
    const nextPage: PageData | null = secondUrl ? {
      url: secondUrl,
      pageIndex: bookStore.currentPageIndex + 1,
    } : null;
    
    // 使用 buildFrameImages 构建图片列表
    const images = buildFrameImages(currentPage, nextPage, frameConfig, splitState);
    
    return { id: `frame-${bookStore.currentPageIndex}`, images, layout };
  });
  
  let upscaledFrameData = $derived.by((): Frame => {
    const url = bookStore.upscaledImageData;
    if (!url) return emptyFrame;
    return {
      id: 'upscaled',
      images: [{ url, physicalIndex: bookStore.currentPageIndex, virtualIndex: 0 }],
      layout: 'single',
    };
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
    splitState = null;
  }
  
  function handlePrevPage() {
    localPan = { x: 0, y: 0 };
    
    if (isInSplitMode && splitState) {
      const prevHalf = getPrevSplitHalf(splitState.half, direction);
      if (prevHalf !== 'prev') {
        splitState = { pageIndex: splitState.pageIndex, half: prevHalf };
        return;
      }
    }
    
    splitState = null;
    
    // 计算翻页步进
    const { currentUrl, secondUrl, dimensions } = imageStore.state;
    if (currentUrl) {
      const currentPage: PageData = {
        url: currentUrl,
        pageIndex: bookStore.currentPageIndex,
        width: dimensions?.width,
        height: dimensions?.height,
      };
      const nextPage: PageData | null = secondUrl ? {
        url: secondUrl,
        pageIndex: bookStore.currentPageIndex + 1,
      } : null;
      const step = getPageStep(currentPage, nextPage, frameConfig);
      bookStore.navigateToPage(Math.max(0, bookStore.currentPageIndex - step));
    } else {
      bookStore.prevPage();
    }
  }
  
  function handleNextPage() {
    localPan = { x: 0, y: 0 };
    
    if (isInSplitMode) {
      if (!splitState) {
        splitState = { pageIndex: bookStore.currentPageIndex, half: getInitialSplitHalf(direction) };
        return;
      }
      const nextHalf = getNextSplitHalf(splitState.half, direction);
      if (nextHalf !== 'next') {
        splitState = { pageIndex: splitState.pageIndex, half: nextHalf };
        return;
      }
    }
    
    splitState = null;
    
    // 计算翻页步进
    const { currentUrl, secondUrl, dimensions } = imageStore.state;
    if (currentUrl) {
      const currentPage: PageData = {
        url: currentUrl,
        pageIndex: bookStore.currentPageIndex,
        width: dimensions?.width,
        height: dimensions?.height,
      };
      const nextPage: PageData | null = secondUrl ? {
        url: secondUrl,
        pageIndex: bookStore.currentPageIndex + 1,
      } : null;
      const step = getPageStep(currentPage, nextPage, frameConfig);
      bookStore.navigateToPage(Math.min(bookStore.totalPages - 1, bookStore.currentPageIndex + step));
    } else {
      bookStore.nextPage();
    }
  }
  
  function handlePan(delta: { x: number; y: number }) {
    localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y };
  }
  
  // ============================================================================
  // Effects
  // ============================================================================
  
  // 记录当前书籍路径，用于检测书籍切换
  let lastBookPath = $state<string | null>(null);
  
  // 书籍变化时重置缓存
  $effect(() => {
    const currentPath = bookStore.currentBook?.path ?? null;
    if (currentPath !== lastBookPath) {
      // 书籍切换，重置缓存
      imageStore.reset();
      zoomModeManager.reset();
      localPan = { x: 0, y: 0 };
      splitState = null;
      lastBookPath = currentPath;
    }
  });
  
  // 页面变化时加载图片
  $effect(() => {
    const pageIndex = bookStore.currentPageIndex;
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;
    
    if (splitState && splitState.pageIndex !== pageIndex) {
      splitState = null;
    }
    
    if (book && page) {
      imageStore.loadCurrentPage(layout);
    }
  });
  
  // 布局变化时重新加载
  $effect(() => {
    const currentLayout = layout;
    if (bookStore.currentBook && currentLayout) {
      imageStore.loadCurrentPage(currentLayout);
    }
  });
  
  // 更新视口尺寸
  function updateViewportSize() {
    if (containerRef) {
      const rect = containerRef.getBoundingClientRect();
      if (rect.width !== viewportSize.width || rect.height !== viewportSize.height) {
        viewportSize = { width: rect.width, height: rect.height };
      }
    }
  }
  
  // 应用缩放模式
  $effect(() => {
    const dims = imageStore.state.dimensions;
    const defaultZoomMode = (settings.view.defaultZoomMode as ZoomMode) ?? 'fit';
    if (dims && viewportSize.width > 0 && viewportSize.height > 0) {
      zoomModeManager.apply(defaultZoomMode, dims, viewportSize);
    }
  });
  
  // 监听窗口大小变化
  $effect(() => {
    if (!containerRef) return;
    
    updateViewportSize();
    
    const resizeObserver = new ResizeObserver(() => {
      updateViewportSize();
    });
    resizeObserver.observe(containerRef);
    
    return () => {
      resizeObserver.disconnect();
    };
  });
  
  onDestroy(() => {
    imageStore.reset();
    zoomModeManager.reset();
  });
  
  let isRTL = $derived(settings.book.readingDirection === 'right-to-left');
  
  export { resetView };
</script>

<div class="stack-view" bind:this={containerRef}>
  <BackgroundLayer color={backgroundColor} />
  
  <CurrentFrameLayer 
    frame={currentFrameData} 
    layout={layout}
    direction={direction}
    orientation={orientation}
    transform={baseTransform}
  />
  
  {#if upscaledFrameData.images.length > 0}
    <CurrentFrameLayer 
      frame={upscaledFrameData} 
      layout="single"
      direction={direction}
      transform={baseTransform}
    />
  {/if}
  
  <InfoLayer 
    currentIndex={bookStore.currentPageIndex}
    totalPages={bookStore.totalPages}
    isLoading={imageStore.state.loading}
    isDivided={isInSplitMode}
    splitHalf={splitState?.half ?? null}
    showPageInfo={showPageInfo}
    showProgress={showProgress}
    showLoading={showLoading}
  />
  
  <GestureLayer 
    isVideoMode={isVideoMode}
    onTapLeft={isRTL ? handleNextPage : handlePrevPage}
    onTapRight={isRTL ? handlePrevPage : handleNextPage}
    onPan={handlePan}
    onNextPage={handleNextPage}
    onPrevPage={handlePrevPage}
    onResetZoom={resetView}
  />
</div>

<style>
  .stack-view {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    isolation: isolate;
    contain: layout style;
  }
</style>
