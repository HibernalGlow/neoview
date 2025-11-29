<!--
  StackView - 层叠式图片查看器（独立模式）
  
  使用 imageStore 管理图片加载，复用现有手势和缩放
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    BackgroundLayer,
    CurrentFrameLayer,
    InfoLayer,
    GestureLayer,
  } from './layers';
  import { getBaseTransform } from './utils/transform';
  import { isLandscape, getInitialSplitHalf, getNextSplitHalf, getPrevSplitHalf, type SplitState } from './utils/viewMode';
  import type { Frame, FrameLayout, FrameImage } from './types/frame';
  import { emptyFrame } from './types/frame';
  import { getImageStore } from './stores/imageStore.svelte';
  
  // 导入外部 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom } from '$lib/stores';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import { readable } from 'svelte/store';
  import { appState, type StateSelector } from '$lib/core/state/appState';
  
  // ============================================================================
  // 创建 viewerState store
  // ============================================================================
  
  function createAppStateStore<T>(selector: StateSelector<T>) {
    const initial = selector(appState.getSnapshot());
    return readable(initial, (set) => {
      const unsubscribe = appState.subscribe(selector, (value) => set(value));
      return unsubscribe;
    });
  }
  
  const viewerState = createAppStateStore((state) => state.viewer);
  
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
  
  let localPan = $state({ x: 0, y: 0 });
  let splitState = $state<SplitState | null>(null);
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let rotation = $derived($rotationAngle);
  let layout = $derived($viewerState.viewMode as FrameLayout);
  
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
  // 帧数据
  // ============================================================================
  
  let currentFrameData = $derived.by((): Frame => {
    const { currentUrl, secondUrl, dimensions } = imageStore.state;
    
    if (!currentUrl) return emptyFrame;
    
    const images: FrameImage[] = [];
    
    // 主图
    let mainImage: FrameImage = {
      url: currentUrl,
      physicalIndex: bookStore.currentPageIndex,
      virtualIndex: bookStore.currentPageIndex,
      width: dimensions?.width,
      height: dimensions?.height,
    };
    
    // 处理分割
    if (isInSplitMode && splitState) {
      mainImage.splitHalf = splitState.half;
    }
    
    images.push(mainImage);
    
    // 双页模式
    if (layout === 'double' && secondUrl) {
      if (!(treatHorizontalAsDoublePage && isCurrentLandscape)) {
        images.push({
          url: secondUrl,
          physicalIndex: bookStore.currentPageIndex + 1,
          virtualIndex: bookStore.currentPageIndex + 1,
        });
      }
    }
    
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
    
    if (layout === 'double') {
      const step = treatHorizontalAsDoublePage && isCurrentLandscape ? 1 : 2;
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
    
    if (layout === 'double') {
      const step = treatHorizontalAsDoublePage && isCurrentLandscape ? 1 : 2;
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
  
  // 页面变化时加载图片
  $effect(() => {
    const pageIndex = bookStore.currentPageIndex;
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;
    
    console.log('[StackView] Effect triggered:', {
      pageIndex,
      hasBook: !!book,
      hasPage: !!page,
      pagePath: page?.path,
      layout,
    });
    
    if (splitState && splitState.pageIndex !== pageIndex) {
      splitState = null;
    }
    
    if (book && page) {
      console.log('[StackView] Calling imageStore.loadCurrentPage');
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
  
  onDestroy(() => {
    imageStore.reset();
  });
  
  let isRTL = $derived(settings.book.readingDirection === 'right-to-left');
  
  export { resetView };
</script>

<div class="stack-view">
  <BackgroundLayer color={backgroundColor} />
  
  <CurrentFrameLayer 
    frame={currentFrameData} 
    layout={layout}
    direction={direction}
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
