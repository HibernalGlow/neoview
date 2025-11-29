<!--
  StackViewer - 层叠式图片查看器
  
  模块化架构，采用层叠设计：
  - Layer 0: 背景层 (BackgroundLayer)
  - Layer 1: 预加载层 (PreloadLayer)
  - Layer 2: 前帧层 (PrevFrameLayer)
  - Layer 3: 后帧层 (NextFrameLayer)
  - Layer 4: 当前帧层 (CurrentFrameLayer)
  - Layer 5: 超分层 (UpscaleLayer)
  - Layer 7: 信息层 (InfoLayer)
  - Layer 9: 手势层 (GestureLayer)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  // 层组件
  import {
    BackgroundLayer,
    PreloadLayer,
    PrevFrameLayer,
    NextFrameLayer,
    CurrentFrameLayer,
    UpscaleLayer,
    InfoLayer,
    GestureLayer,
  } from './layers';
  
  // 类型
  import type { Frame, LayoutMode, ReadingDirection } from './types/frame';
  import type { Transform } from './types/transform';
  import type { Point } from './types/gesture';
  import { emptyFrame } from './types/frame';
  import { defaultTransform } from './types/transform';
  
  // 外部 stores
  import { bookStore } from '$lib/stores/book.svelte';
  import { zoomIn, zoomOut, resetZoom, setZoomLevel } from '$lib/stores';
  import { settingsManager } from '$lib/settings/settingsManager';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  interface Props {
    /** 当前图片数据 */
    imageData?: string | null;
    /** 第二张图片数据 (双页模式) */
    imageData2?: string | null;
    /** 超分后的图片数据 */
    upscaledImageData?: string | null;
    /** 视图模式 */
    viewMode?: LayoutMode;
    /** 缩放级别 */
    zoomLevel?: number;
    /** 旋转角度 */
    rotationAngle?: number;
    /** 滚动方向 */
    orientation?: 'horizontal' | 'vertical';
    /** 全景模式页面 */
    panoramaPages?: Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>;
    /** 外部平移 X */
    panX?: number;
    /** 外部平移 Y */
    panY?: number;
    /** 横向分割半边 */
    horizontalSplitHalf?: 'left' | 'right' | null;
    /** 是否将横向图视为双页 */
    treatHorizontalAsDoublePage?: boolean;
    /** 是否正在加载 */
    loading?: boolean;
    /** 是否正在超分 */
    isUpscaling?: boolean;
    /** 超分进度 */
    upscaleProgress?: number;
    /** 超分完成 */
    upscaleComplete?: boolean;
    /** 上一页回调 */
    onPrevPage?: () => void;
    /** 下一页回调 */
    onNextPage?: () => void;
    /** 尺寸检测回调 */
    onSizeDetected?: (width: number, height: number) => void;
  }

  let {
    imageData = null,
    imageData2 = null,
    upscaledImageData = null,
    viewMode = 'single',
    zoomLevel = 1,
    rotationAngle = 0,
    orientation = 'horizontal',
    panoramaPages = $bindable([]),
    panX = 0,
    panY = 0,
    horizontalSplitHalf = null,
    treatHorizontalAsDoublePage = false,
    loading = false,
    isUpscaling = false,
    upscaleProgress = 0,
    upscaleComplete = false,
    onPrevPage,
    onNextPage,
    onSizeDetected,
  }: Props = $props();

  // ============================================================================
  // 状态
  // ============================================================================
  
  let containerRef: HTMLDivElement | null = $state(null);
  let localPan = $state<Point>({ x: 0, y: 0 });
  
  // 设置
  let settings = $state(settingsManager.getSettings());
  let readingDirection = $derived<ReadingDirection>(
    settings.book.readingDirection === 'right-to-left' ? 'rtl' : 'ltr'
  );
  let backgroundColor = $derived(settings.view.backgroundColor || '#000000');
  
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // 计算变换 - 使用 props
  let transform = $derived<Transform>({
    scale: zoomLevel,
    offsetX: panX + localPan.x,
    offsetY: panY + localPan.y,
    rotation: (rotationAngle % 360) as 0 | 90 | 180 | 270,
  });
  
  // 构建当前帧
  let currentFrame = $derived.by((): Frame => {
    const images: Frame['images'] = [];
    
    // 使用超分图或原图
    const primarySrc = upscaledImageData || imageData;
    
    if (primarySrc) {
      images.push({
        url: primarySrc,
        physicalIndex: bookStore.currentPageIndex,
        virtualIndex: bookStore.currentPageIndex,
        splitHalf: horizontalSplitHalf,
        rotation: 0,
        loaded: true,
        error: null,
      });
    }
    
    // 双页模式的第二张图
    if (viewMode === 'double' && imageData2 && !treatHorizontalAsDoublePage) {
      images.push({
        url: imageData2,
        physicalIndex: bookStore.currentPageIndex + 1,
        virtualIndex: bookStore.currentPageIndex + 1,
        splitHalf: null,
        rotation: 0,
        loaded: true,
        error: null,
      });
    }
    
    // 全景模式
    if (viewMode === 'panorama' && panoramaPages.length > 0) {
      return {
        id: `panorama-${bookStore.currentPageIndex}`,
        images: panoramaPages
          .filter(p => p.data)
          .map(p => ({
            url: p.data!,
            physicalIndex: p.index,
            virtualIndex: p.index,
            splitHalf: null,
            rotation: 0,
            loaded: true,
            error: null,
          })),
        layout: 'panorama',
        direction: readingDirection,
      };
    }
    
    return {
      id: `frame-${bookStore.currentPageIndex}`,
      images,
      layout: viewMode,
      direction: readingDirection,
    };
  });
  
  // 超分帧
  let upscaledFrame = $derived.by((): Frame => {
    if (!upscaledImageData || !upscaleComplete) {
      return { ...emptyFrame };
    }
    
    return {
      id: `upscaled-${bookStore.currentPageIndex}`,
      images: [{
        url: upscaledImageData,
        physicalIndex: bookStore.currentPageIndex,
        virtualIndex: bookStore.currentPageIndex,
        splitHalf: horizontalSplitHalf,
        rotation: 0,
        loaded: true,
        error: null,
      }],
      layout: viewMode,
      direction: readingDirection,
    };
  });
  
  // 前后帧 (预留，用于预加载)
  let prevFrame = $state<Frame>({ ...emptyFrame });
  let nextFrame = $state<Frame>({ ...emptyFrame });
  
  // ============================================================================
  // 事件处理
  // ============================================================================
  
  function handlePrevPage() {
    onPrevPage?.();
    resetLocalPan();
  }
  
  function handleNextPage() {
    onNextPage?.();
    resetLocalPan();
  }
  
  function handleDoubleTap(point: Point) {
    if (zoomLevel > 1.5) {
      resetView();
    } else {
      setZoomLevel(2);
    }
  }
  
  function handlePan(delta: Point) {
    localPan = {
      x: localPan.x + delta.x,
      y: localPan.y + delta.y,
    };
  }
  
  function handleZoom(zoomScale: number, center: Point) {
    if (zoomScale > 1) {
      zoomIn();
    } else if (zoomScale < 1) {
      zoomOut();
    }
  }
  
  function handleImageLoad(index: number, width: number, height: number) {
    onSizeDetected?.(width, height);
  }
  
  function handleImageError(index: number, error: string) {
    console.error(`[StackViewer] Image load error at index ${index}:`, error);
  }
  
  function resetLocalPan() {
    localPan = { x: 0, y: 0 };
  }
  
  function resetView() {
    resetZoom();
    resetLocalPan();
  }
  
  // ============================================================================
  // 生命周期
  // ============================================================================
  
  onMount(() => {
    // 初始化
  });
  
  onDestroy(() => {
    // 清理
  });
  
  // 导出方法
  export { resetView };
</script>

<div
  class="stack-viewer"
  bind:this={containerRef}
>
  <!-- Layer 0: 背景层 -->
  <BackgroundLayer color={backgroundColor} />
  
  <!-- Layer 2: 前帧层 (预加载) -->
  <PrevFrameLayer frame={prevFrame} />
  
  <!-- Layer 3: 后帧层 (预加载) -->
  <NextFrameLayer frame={nextFrame} />
  
  <!-- Layer 4: 当前帧层 -->
  <CurrentFrameLayer
    frame={currentFrame}
    layout={viewMode}
    direction={readingDirection}
    {transform}
    onImageLoad={handleImageLoad}
    onImageError={handleImageError}
  />
  
  <!-- Layer 5: 超分层 -->
  <UpscaleLayer
    frame={upscaledFrame}
    {transform}
    visible={upscaleComplete}
  />
  
  <!-- Layer 7: 信息层 -->
  <InfoLayer
    currentIndex={bookStore.currentPageIndex}
    totalPages={bookStore.totalPages}
    {loading}
    isDivided={!!horizontalSplitHalf}
    splitHalf={horizontalSplitHalf}
    showPageInfo={true}
    showProgress={true}
    {upscaleProgress}
    {isUpscaling}
    {upscaleComplete}
  />
  
  <!-- Layer 9: 手势层 -->
  <GestureLayer
    isVideoMode={false}
    onTapLeft={handlePrevPage}
    onTapRight={handleNextPage}
    onDoubleTap={handleDoubleTap}
    onPan={handlePan}
    onZoom={handleZoom}
  />
</div>

<style>
  .stack-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--background, #000);
  }
</style>
