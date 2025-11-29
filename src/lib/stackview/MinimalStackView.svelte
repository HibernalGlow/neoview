<!--
  MinimalStackView - 最小可用的层叠式图片查看器
  
  目标：减少对旧 viewer 的依赖，实现单页图显示
  
  架构：
  - Layer 0: 背景层
  - Layer 4: 当前帧层
  - Layer 7: 信息层（可选）
  - Layer 9: 手势层
  
  预留接口：
  - 顶栏状态（缩放、旋转）
  - 翻页回调
  - 图片加载状态
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { BackgroundLayer, CurrentFrameLayer, InfoLayer, GestureLayer } from './layers';
  import { getBaseTransform } from './utils/transform';
  import type { Frame, FrameLayout } from './types/frame';
  import { emptyFrame } from './types/frame';
  import { bookStore2 } from '$lib/stores/bookStore2';
  import { getImageUrl, updateImageSize, clearImageCache } from './stores/imageLoader';
  
  // ============================================================================
  // Props - 顶栏状态接口
  // ============================================================================
  
  let {
    // === 显示配置 ===
    backgroundColor = 'var(--background)',
    layout = 'single',
    direction = 'ltr',
    
    // === 顶栏状态（外部控制） ===
    scale = 1,
    rotation = 0,
    
    // === UI 显示选项 ===
    showPageInfo = true,
    showProgress = true,
    showLoading = true,
    
    // === 回调接口 ===
    onPrevPage,
    onNextPage,
    onTapCenter,
    onScaleChange,
    onRotationChange,
    onImageLoad,
  }: {
    // 显示配置
    backgroundColor?: string;
    layout?: FrameLayout;
    direction?: 'ltr' | 'rtl';
    
    // 顶栏状态
    scale?: number;
    rotation?: number;
    
    // UI 选项
    showPageInfo?: boolean;
    showProgress?: boolean;
    showLoading?: boolean;
    
    // 回调
    onPrevPage?: () => void;
    onNextPage?: () => void;
    onTapCenter?: () => void;
    onScaleChange?: (scale: number) => void;
    onRotationChange?: (rotation: number) => void;
    onImageLoad?: (physicalIndex: number, width: number, height: number) => void;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let localPan = $state({ x: 0, y: 0 });
  let isLoading = $state(false);
  let currentImageUrl = $state<string | null>(null);
  
  // 从 bookStore2 获取状态
  let bookState = $derived($bookStore2);
  
  // ============================================================================
  // 帧数据
  // ============================================================================
  
  let currentFrameData = $derived.by((): Frame => {
    if (!bookState.isOpen || !bookState.currentFrame) {
      return emptyFrame;
    }
    
    const frame = bookState.currentFrame;
    if (!frame.elements.length) {
      return emptyFrame;
    }
    
    // 使用缓存的 URL
    if (!currentImageUrl) {
      return emptyFrame;
    }
    
    const element = frame.elements[0];
    const vp = element.virtualPage;
    
    return {
      id: `frame-${bookState.currentIndex}`,
      images: [{
        url: currentImageUrl,
        physicalIndex: vp.physicalPage.index,
        virtualIndex: vp.virtualIndex,
        splitHalf: vp.isDivided ? (vp.part === 0 ? 'left' : 'right') : null,
        rotation: vp.rotation || 0,
        width: vp.physicalPage.size?.width,
        height: vp.physicalPage.size?.height,
      }],
      layout: 'single',
    };
  });
  
  // ============================================================================
  // 变换
  // ============================================================================
  
  let baseTransform = $derived(getBaseTransform(scale, rotation, localPan.x, localPan.y));
  
  // ============================================================================
  // 图片加载
  // ============================================================================
  
  async function loadCurrentImage() {
    if (!bookState.isOpen || !bookState.currentFrame) {
      currentImageUrl = null;
      return;
    }
    
    const frame = bookState.currentFrame;
    if (!frame.elements.length) {
      currentImageUrl = null;
      return;
    }
    
    const physicalIndex = frame.elements[0].virtualPage.physicalPage.index;
    
    isLoading = true;
    try {
      const url = await getImageUrl(physicalIndex);
      currentImageUrl = url;
    } catch (error) {
      console.error('[MinimalStackView] Failed to load image:', error);
      currentImageUrl = null;
    } finally {
      isLoading = false;
    }
  }
  
  // 监听页面变化，加载图片
  $effect(() => {
    if (bookState.isOpen && bookState.currentFrame) {
      loadCurrentImage();
    } else {
      currentImageUrl = null;
    }
  });
  
  // ============================================================================
  // 方法
  // ============================================================================
  
  function resetView() {
    localPan = { x: 0, y: 0 };
    onScaleChange?.(1);
    onRotationChange?.(0);
  }
  
  function handleImageLoad(e: Event, index: number) {
    const img = e.target as HTMLImageElement;
    if (img && currentFrameData.images[index]) {
      const physicalIndex = currentFrameData.images[index].physicalIndex;
      updateImageSize(physicalIndex, img.naturalWidth, img.naturalHeight);
      onImageLoad?.(physicalIndex, img.naturalWidth, img.naturalHeight);
    }
    isLoading = false;
  }
  
  function handlePrevPage() {
    if (onPrevPage) {
      onPrevPage();
    } else {
      // 默认行为：使用 bookStore2
      bookStore2.prevPage();
    }
    localPan = { x: 0, y: 0 };
  }
  
  function handleNextPage() {
    if (onNextPage) {
      onNextPage();
    } else {
      // 默认行为：使用 bookStore2
      bookStore2.nextPage();
    }
    localPan = { x: 0, y: 0 };
  }
  
  function handlePan(delta: { x: number; y: number }) {
    localPan = { x: localPan.x + delta.x, y: localPan.y + delta.y };
  }
  
  function handleTapCenter() {
    onTapCenter?.();
  }
  
  // 清理
  onDestroy(() => {
    // 可选：清理缓存
    // clearImageCache();
  });
  
  export { resetView };
</script>

<div class="minimal-stack-view">
  <!-- Layer 0: 背景层 -->
  <BackgroundLayer color={backgroundColor} />
  
  <!-- Layer 4: 当前帧层 -->
  <CurrentFrameLayer 
    frame={currentFrameData} 
    layout={layout}
    direction={direction}
    transform={baseTransform}
    onImageLoad={handleImageLoad}
  />
  
  <!-- Layer 7: 信息层 -->
  <InfoLayer 
    currentIndex={bookState.currentIndex}
    totalPages={bookState.virtualPageCount}
    isLoading={isLoading && showLoading}
    isDivided={bookState.divideLandscape}
    showPageInfo={showPageInfo}
    showProgress={showProgress}
    showLoading={showLoading}
  />
  
  <!-- Layer 9: 手势层 -->
  <GestureLayer 
    onTapLeft={direction === 'rtl' ? handleNextPage : handlePrevPage}
    onTapRight={direction === 'rtl' ? handlePrevPage : handleNextPage}
    onTapCenter={handleTapCenter}
    onPan={handlePan}
  />
</div>

<style>
  .minimal-stack-view {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
