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
    HoverLayer,
  } from './layers';
  import PanoramaFrameLayer from './layers/PanoramaFrameLayer.svelte';
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
  import { getPanoramaStore } from './stores/panoramaStore.svelte';
  
  // 导入外部 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom, viewMode as legacyViewMode, orientation as legacyOrientation } from '$lib/stores';
  import { bookContextManager, type BookContext } from '$lib/stores/bookContext.svelte';
  import { bookStore } from '$lib/stores/book.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  
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
  const panoramaStore = getPanoramaStore();
  const zoomModeManager = createZoomModeManager();
  
  let localPan = $state({ x: 0, y: 0 });
  let splitState = $state<SplitState | null>(null);
  let containerRef: HTMLDivElement | null = $state(null);
  let viewportSize = $state<ViewportSize>({ width: 0, height: 0 });
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let rotation = $derived($rotationAngle);
  
  // 当前书本上下文
  let bookContext = $state<BookContext | null>(null);
  
  // 同步旧版 viewMode 到 BookContext（桥接）
  $effect(() => {
    const ctx = bookContext;
    if (!ctx) return;
    
    const mode = $legacyViewMode as 'single' | 'double' | 'panorama';
    const orient = $legacyOrientation as 'horizontal' | 'vertical';
    
    // 根据旧模式设置 BookContext
    if (mode === 'panorama') {
      ctx.setPanoramaEnabled(true);
    } else {
      ctx.setPanoramaEnabled(false);
      ctx.setPageMode(mode);
    }
    ctx.setOrientation(orient);
  });
  
  // 从 BookContext 获取视图状态
  let pageMode = $derived(bookContext?.pageMode ?? 'single');
  let isPanorama = $derived(bookContext?.panoramaEnabled ?? false);
  let orientation = $derived(bookContext?.orientation ?? 'horizontal');
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  settingsManager.addListener((s) => { settings = s; });
  
  // 切换页面模式（单页/双页）
  function togglePageMode() {
    bookContext?.togglePageMode();
  }
  
  // 切换全景模式
  function togglePanorama() {
    bookContext?.togglePanorama();
  }
  
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
    divideLandscape && isCurrentLandscape && pageMode === 'single' && !isPanorama && !isVideoMode
  );
  
  // ============================================================================
  // 帧配置（使用方案 B 的 pageMode）
  // ============================================================================
  
  // 计算帧布局：根据 pageMode 和 isPanorama
  let frameLayout = $derived<FrameLayout>(isPanorama ? 'panorama' : pageMode);
  
  let frameConfig = $derived.by((): FrameBuildConfig => ({
    layout: pageMode, // 使用 pageMode 而不是 layout
    orientation: orientation,
    direction: direction,
    divideLandscape: divideLandscape,
    treatHorizontalAsDoublePage: treatHorizontalAsDoublePage,
    autoRotate: false,
  }));
  
  // ============================================================================
  // 帧数据
  // ============================================================================
  
  let currentFrameData = $derived.by((): Frame => {
    const { currentUrl, secondUrl, dimensions } = imageStore.state;
    
    // 全景模式时不使用此组件，由 PanoramaFrameLayer 处理
    if (isPanorama) {
      return emptyFrame;
    }
    
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
    
    return { id: `frame-${bookStore.currentPageIndex}`, images, layout: pageMode };
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
  
  // 悬停滚动处理（NeeView 风格）
  function handleHoverScroll(pos: { x: number; y: number }, _duration: number) {
    // pos 是目标位置，直接设置 localPan
    console.log('[StackView] handleHoverScroll:', pos);
    localPan = { x: pos.x, y: pos.y };
  }
  
  // 悬停滚动状态
  let hoverScrollEnabled = $derived(settings.image?.hoverScrollEnabled ?? false);
  
  $effect(() => {
    console.log('[StackView] hoverScrollEnabled:', hoverScrollEnabled, 'scaledContentSize:', scaledContentSize, 'viewportSize:', viewportSize);
  });
  
  // 缩放后的内容尺寸（用于悬停滚动计算）
  let scaledContentSize = $derived.by(() => {
    const dims = imageStore.state.dimensions;
    if (!dims) return { width: 0, height: 0 };
    return {
      width: dims.width * scale,
      height: dims.height * scale,
    };
  });
  
  // ============================================================================
  // Effects
  // ============================================================================
  
  // 书籍变化时初始化 BookContext
  $effect(() => {
    const book = bookStore.currentBook;
    const currentPath = book?.path ?? null;
    
    if (currentPath) {
      // 获取或创建书本上下文
      const ctx = bookContextManager.setCurrent(currentPath, book?.pages?.length ?? 0);
      
      // 如果是新书本，重置状态（imagePool 会自动处理缓存）
      if (bookContext?.path !== currentPath) {
        imageStore.reset();
        panoramaStore.reset();
        zoomModeManager.reset();
        localPan = { x: 0, y: 0 };
        splitState = null;
      }
      
      bookContext = ctx;
    } else {
      bookContextManager.clearCurrent();
      bookContext = null;
    }
  });
  
  // 追踪上一次的状态，用于检测变化
  let lastPageMode = $state<'single' | 'double' | null>(null);
  let lastPanorama = $state<boolean>(false);
  
  // 页面或模式变化时加载图片
  $effect(() => {
    const pageIndex = bookStore.currentPageIndex;
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;
    const currentPageMode = pageMode;
    const currentPanorama = isPanorama;
    
    if (splitState && splitState.pageIndex !== pageIndex) {
      splitState = null;
    }
    
    if (book && page) {
      // 检测模式是否变化
      const modeChanged = currentPageMode !== lastPageMode || currentPanorama !== lastPanorama;
      lastPageMode = currentPageMode;
      lastPanorama = currentPanorama;
      
      // 根据模式加载
      if (currentPanorama) {
        // 全景模式：使用全景 store
        panoramaStore.setEnabled(true);
        panoramaStore.loadPanorama(pageIndex, currentPageMode);
      } else {
        // 普通模式：使用图片 store
        panoramaStore.setEnabled(false);
        imageStore.loadCurrentPage(currentPageMode, modeChanged);
      }
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
    panoramaStore.reset();
    zoomModeManager.reset();
  });
  
  let isRTL = $derived(settings.book.readingDirection === 'right-to-left');
  
  export { resetView, togglePageMode, togglePanorama, pageMode, isPanorama, bookContext };
</script>

<div class="stack-view" bind:this={containerRef}>
  <BackgroundLayer color={backgroundColor} />
  
  {#if isPanorama}
    <!-- 全景模式：显示滚动视图 -->
    <PanoramaFrameLayer 
      units={panoramaStore.state.units}
      pageMode={pageMode}
      orientation={orientation}
      direction={direction}
      currentPageIndex={bookStore.currentPageIndex}
      scale={scale}
    />
  {:else}
    <!-- 普通模式：显示当前帧 -->
    <CurrentFrameLayer 
      frame={currentFrameData} 
      layout={pageMode}
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
  {/if}
  
  <InfoLayer 
    currentIndex={bookStore.currentPageIndex}
    totalPages={bookStore.totalPages}
    isLoading={isPanorama ? panoramaStore.state.loading : imageStore.state.loading}
    isDivided={isInSplitMode}
    splitHalf={splitState?.half ?? null}
    showPageInfo={showPageInfo}
    showProgress={showProgress}
    showLoading={showLoading}
  />
  
  <GestureLayer 
    isVideoMode={isVideoMode}
    enablePan={false}
    onTapLeft={isRTL ? handleNextPage : handlePrevPage}
    onTapRight={isRTL ? handlePrevPage : handleNextPage}
    onNextPage={handleNextPage}
    onPrevPage={handlePrevPage}
    onResetZoom={resetView}
  />
  
  <!-- 悬停滚动层（NeeView 风格） -->
  <HoverLayer
    enabled={hoverScrollEnabled}
    duration={0.5}
    sidebarMargin={50}
    deadZoneRatio={0.2}
    {viewportSize}
    contentSize={scaledContentSize}
    onScroll={handleHoverScroll}
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
