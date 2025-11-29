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
  
  模式支持：
  - 单页模式：显示一张图
  - 双页模式：并排显示两张图（横向图独占）
  - 全景模式：连续滚动多张图
  - 横向分割：横向图分成两个虚拟页
  - 自动旋转：横向图旋转90度
-->
<script lang="ts">
  import {
    BackgroundLayer,
    PrevFrameLayer,
    NextFrameLayer,
    CurrentFrameLayer,
    UpscaleLayer,
    InfoLayer,
    GestureLayer,
    HoverLayer,
  } from './layers';
  import { 
    currentFrame, 
    prevFrame, 
    nextFrame, 
    upscaledFrame,
  } from './stores/frameStore';
  import { getBaseTransform } from './utils/transform';
  import { 
    isLandscape, 
    getInitialSplitHalf, 
    getNextSplitHalf, 
    getPrevSplitHalf,
    computeDoublePageImages,
    computeDoublePageStep,
    type SplitState,
    type ViewModeConfig,
  } from './utils/viewMode';
  import type { Frame, FrameLayout, FrameImage } from './types/frame';
  import { emptyFrame } from './types/frame';
  
  // 导入外部 stores
  import { zoomLevel, rotationAngle, resetZoom as storeResetZoom } from '$lib/stores';
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
    // 是否启用横向分割
    divideLandscape = false,
    // 是否将横向图视为双页（双页模式下横向图独占）
    treatHorizontalAsDoublePage = false,
    // 是否启用自动旋转
    autoRotate = false,
    // 显示配置
    showPageInfo = true,
    showProgress = true,
    showLoading = true,
    // 外部传入的图片 URL（兼容旧系统）
    currentUrl = null,
    currentUrl2 = null,
    prevUrl = null,
    nextUrl = null,
    upscaledUrl = null,
    // 当前图片尺寸
    currentImageSize = null,
    // 全景模式页面
    panoramaPages = [],
  }: {
    backgroundColor?: string;
    layout?: FrameLayout;
    direction?: 'ltr' | 'rtl';
    isVideoMode?: boolean;
    divideLandscape?: boolean;
    treatHorizontalAsDoublePage?: boolean;
    autoRotate?: boolean;
    showPageInfo?: boolean;
    showProgress?: boolean;
    showLoading?: boolean;
    currentUrl?: string | null;
    currentUrl2?: string | null;
    prevUrl?: string | null;
    nextUrl?: string | null;
    upscaledUrl?: string | null;
    currentImageSize?: { width: number; height: number } | null;
    panoramaPages?: Array<{ index: number; data: string | null }>;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let localPan = $state({ x: 0, y: 0 });
  let isLoading = $state(false);
  
  // 横向分割状态
  let splitState = $state<SplitState | null>(null);
  
  // 从 stores 获取状态
  let scale = $derived($zoomLevel);
  let rotation = $derived($rotationAngle);
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // 视图模式配置
  let viewModeConfig = $derived<ViewModeConfig>({
    layout,
    direction,
    divideLandscape,
    treatHorizontalAsDoublePage,
    autoRotate,
  });
  
  // 判断当前图是否横向
  let isCurrentLandscape = $derived(
    currentImageSize ? isLandscape(currentImageSize) : false
  );
  
  // 是否处于分割模式
  let isInSplitMode = $derived(
    divideLandscape && isCurrentLandscape && layout === 'single' && !isVideoMode
  );
  
  // ============================================================================
  // 帧数据计算
  // ============================================================================
  
  // 构建当前帧
  let currentFrameData = $derived.by((): Frame => {
    // 全景模式
    if (layout === 'panorama' && panoramaPages.length > 0) {
      return {
        id: `panorama-${bookStore.currentPageIndex}`,
        images: panoramaPages
          .filter(p => p.data)
          .map(p => ({
            url: p.data!,
            physicalIndex: p.index,
            virtualIndex: p.index,
          })),
        layout: 'panorama',
      };
    }
    
    // 外部传入 URL
    if (currentUrl) {
      const images: FrameImage[] = [];
      
      // 主图
      let mainImage: FrameImage = {
        url: currentUrl,
        physicalIndex: bookStore.currentPageIndex,
        virtualIndex: bookStore.currentPageIndex,
      };
      
      // 处理分割状态
      if (isInSplitMode && splitState) {
        mainImage = {
          ...mainImage,
          splitHalf: splitState.half,
        };
      }
      
      // 处理自动旋转（仅单页模式，且不在分割模式下）
      if (autoRotate && isCurrentLandscape && layout === 'single' && !isInSplitMode) {
        mainImage = {
          ...mainImage,
          rotation: 90,
        };
      }
      
      images.push(mainImage);
      
      // 双页模式：添加第二张图
      if (layout === 'double' && currentUrl2) {
        // 如果当前图是横向且设置了横向独占，则不添加第二张
        if (!(treatHorizontalAsDoublePage && isCurrentLandscape)) {
          images.push({
            url: currentUrl2,
            physicalIndex: bookStore.currentPageIndex + 1,
            virtualIndex: bookStore.currentPageIndex + 1,
          });
        }
      }
      
      return {
        id: `frame-${bookStore.currentPageIndex}`,
        images,
        layout,
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
    splitState = null;
  }
  
  function handleImageLoad(e: Event, index: number) {
    const img = e.target as HTMLImageElement;
    if (img) {
      console.log('[StackView] Image loaded:', img.naturalWidth, 'x', img.naturalHeight);
    }
    isLoading = false;
  }
  
  function handlePrevPage() {
    localPan = { x: 0, y: 0 };
    
    // 处理分割模式
    if (isInSplitMode && splitState) {
      const prevHalf = getPrevSplitHalf(splitState.half, direction);
      if (prevHalf !== 'prev') {
        splitState = { pageIndex: splitState.pageIndex, half: prevHalf };
        return;
      }
    }
    
    // 正常翻页
    splitState = null;
    
    if (layout === 'double') {
      // 双页模式：后退2页（或1页，取决于上一页是否横向）
      const targetIndex = Math.max(0, bookStore.currentPageIndex - 2);
      bookStore.navigateToPage(targetIndex);
    } else {
      bookStore.prevPage();
      
      // 如果上一页是横向且开启分割，显示最后一半
      // TODO: 需要获取上一页尺寸信息
    }
  }
  
  function handleNextPage() {
    localPan = { x: 0, y: 0 };
    
    // 处理分割模式
    if (isInSplitMode) {
      if (!splitState) {
        // 初始化分割状态
        splitState = {
          pageIndex: bookStore.currentPageIndex,
          half: getInitialSplitHalf(direction),
        };
        return;
      }
      
      const nextHalf = getNextSplitHalf(splitState.half, direction);
      if (nextHalf !== 'next') {
        splitState = { pageIndex: splitState.pageIndex, half: nextHalf };
        return;
      }
    }
    
    // 正常翻页
    splitState = null;
    
    if (layout === 'double') {
      // 双页模式：前进2页（或1页，取决于当前/下一页是否横向）
      const step = treatHorizontalAsDoublePage && isCurrentLandscape ? 1 : 2;
      const targetIndex = Math.min(bookStore.totalPages - 1, bookStore.currentPageIndex + step);
      bookStore.navigateToPage(targetIndex);
    } else {
      bookStore.nextPage();
    }
  }
  
  function handlePan(delta: { x: number; y: number }) {
    localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y };
  }
  
  // 页面变化时重置分割状态
  $effect(() => {
    const pageIndex = bookStore.currentPageIndex;
    if (splitState && splitState.pageIndex !== pageIndex) {
      splitState = null;
    }
  });
  
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
    currentIndex={bookStore.currentPageIndex}
    totalPages={bookStore.totalPages}
    isLoading={isLoading}
    isDivided={isInSplitMode}
    splitHalf={splitState?.half ?? null}
    showPageInfo={showPageInfo}
    showProgress={showProgress}
    showLoading={showLoading}
  />
  
  <!-- Layer 8: 悬停层（暂时禁用，等待设置项添加） -->
  <!-- <HoverLayer 
    enableHoverScroll={false}
    enableHoverPan={false}
    onPan={handlePan}
  /> -->
  
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
    /* 创建独立的堆叠上下文，确保内部 z-index 不会影响外部元素 */
    isolation: isolate;
    /* 确保不会被外部元素的 pointer-events 影响 */
    contain: layout style;
  }
</style>
