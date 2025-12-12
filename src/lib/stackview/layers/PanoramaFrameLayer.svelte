<!--
  PanoramaFrameLayer - 全景帧层
  显示多个帧单元，支持滚动
  
  【性能优化】原生滚动方案：
  - 使用浏览器原生滚动，硬件加速
  - HoverScrollLayer 直接操作 scrollLeft/scrollTop
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { PanoramaUnit, PanoramaImage } from '../stores/panoramaStore.svelte';
  import FrameImage from '../components/FrameImage.svelte';
  import '../styles/frameLayer.css';
  import type { WidePageStretch } from '$lib/settings/settingsManager';
  
  let {
    units = [],
    pageMode = 'single',
    orientation = 'horizontal',
    direction = 'ltr',
    currentPageIndex = 0,
    viewportSize = { width: 0, height: 0 },
    widePageStretch = 'uniformHeight',
    onScroll,
  }: {
    units: PanoramaUnit[];
    pageMode?: 'single' | 'double';
    orientation?: 'horizontal' | 'vertical';
    direction?: 'ltr' | 'rtl';
    currentPageIndex?: number;
    viewportSize?: { width: number; height: number };
    widePageStretch?: WidePageStretch;
    onScroll?: (e: Event) => void;
  } = $props();
  
  let containerRef: HTMLDivElement | null = $state(null);
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // 当前页索引变化时滚动到对应单元（使用防抖）
  $effect(() => {
    const idx = currentPageIndex;
    
    // 清除之前的滚动计划
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    scrollTimeout = setTimeout(() => {
      if (!containerRef || units.length === 0) return;
      
      const step = pageMode === 'double' ? 2 : 1;
      const targetUnitIndex = Math.floor(idx / step);
      
      const unitElements = containerRef.querySelectorAll('.panorama-unit');
      const targetUnit = units.findIndex(u => Math.floor(u.startIndex / step) === targetUnitIndex);
      
      if (targetUnit >= 0 && targetUnit < unitElements.length) {
        // 使用 instant 而不是 smooth 提升性能
        unitElements[targetUnit].scrollIntoView({
          behavior: 'instant',
          block: orientation === 'vertical' ? 'center' : 'nearest',
          inline: orientation === 'horizontal' ? 'center' : 'nearest',
        });
      }
    }, 100);
  });
  
  /**
   * 计算宽页拉伸的 scale 值
   * 参考 ContentScaleCalculator 的算法
   */
  function calculateStretchScales(images: PanoramaImage[], stretch: WidePageStretch): number[] {
    if (images.length === 0) return [];
    if (images.length === 1) return [1.0];
    
    const sizes = images.map(img => ({
      width: img.width ?? 0,
      height: img.height ?? 0
    }));
    
    // 检查是否有有效尺寸
    const hasValidSizes = sizes.every(s => s.width > 0 && s.height > 0);
    if (!hasValidSizes) {
      return images.map(() => 1.0);
    }
    
    switch (stretch) {
      case 'uniformHeight': {
        // 高度统一：scale = maxHeight / elementHeight
        const maxHeight = Math.max(...sizes.map(s => s.height));
        return sizes.map(s => s.height > 0 ? maxHeight / s.height : 1.0);
      }
      case 'uniformWidth': {
        // 宽度统一：scale = avgWidth / elementWidth
        const avgWidth = sizes.reduce((sum, s) => sum + s.width, 0) / sizes.length;
        return sizes.map(s => s.width > 0 ? avgWidth / s.width : 1.0);
      }
      default:
        // none：不拉伸
        return images.map(() => 1.0);
    }
  }
  
  /**
   * 计算单张图片的显示样式
   * 双页模式下应用宽页拉伸
   */
  function getImageStyle(img: PanoramaImage, unit: PanoramaUnit, imgIndex: number): string {
    const vp = viewportSize;
    if (!vp.width || !vp.height) {
      return 'max-width: 100%; max-height: 100%;';
    }
    
    const imgWidth = img.width ?? 0;
    const imgHeight = img.height ?? 0;
    
    // 单页模式或无尺寸信息：使用简单的 contain 模式
    if (pageMode !== 'double' || !imgWidth || !imgHeight) {
      const effectiveWidth = pageMode === 'double' ? (vp.width - 4) / 2 : vp.width;
      return `max-width: ${effectiveWidth}px; max-height: ${vp.height}px;`;
    }
    
    // 双页模式：应用宽页拉伸
    const scales = calculateStretchScales(unit.images, widePageStretch);
    const scale = scales[imgIndex] ?? 1.0;
    
    // 应用 scale 后的显示尺寸
    const displayWidth = imgWidth * scale;
    const displayHeight = imgHeight * scale;
    
    // 计算两张图片的总尺寸（应用 scale 后）
    let totalWidth = 0;
    let maxHeight = 0;
    unit.images.forEach((uImg, i) => {
      const w = (uImg.width ?? 0) * (scales[i] ?? 1.0);
      const h = (uImg.height ?? 0) * (scales[i] ?? 1.0);
      totalWidth += w;
      maxHeight = Math.max(maxHeight, h);
    });
    
    if (totalWidth > 0 && maxHeight > 0) {
      // 计算整体缩放比例以适应视口
      const scaleX = vp.width / totalWidth;
      const scaleY = vp.height / maxHeight;
      const frameScale = Math.min(scaleX, scaleY);
      
      // 应用帧缩放到当前图片
      const finalWidth = displayWidth * frameScale;
      const finalHeight = displayHeight * frameScale;
      
      return `width: ${finalWidth}px; height: ${finalHeight}px; max-width: none; max-height: none; object-fit: fill;`;
    }
    
    // 回退到简单模式
    const effectiveWidth = (vp.width - 4) / 2;
    return `max-width: ${effectiveWidth}px; max-height: ${vp.height}px;`;
  }
  
  // 单页模式的图片样式
  // 全景模式下图片应该铺满：
  // - 水平全景：高度铺满视口，宽度自适应
  // - 垂直全景：宽度铺满视口，高度自适应
  let singleImageStyle = $derived.by(() => {
    const vp = viewportSize;
    if (!vp.width || !vp.height) {
      return 'max-width: 100%; max-height: 100%;';
    }
    
    if (orientation === 'vertical') {
      // 垂直全景：宽度铺满，高度自适应
      return `width: ${vp.width}px; height: auto; max-width: none; max-height: none;`;
    } else {
      // 水平全景：高度铺满，宽度自适应
      return `width: auto; height: ${vp.height}px; max-width: none; max-height: none;`;
    }
  });
  
  // 【性能优化】原生滚动方案，不再使用 transform-origin
  
  let containerClass = $derived.by(() => {
    const classes = ['panorama-frame-layer'];
    
    if (orientation === 'vertical') {
      classes.push('vertical');
    }
    
    if (direction === 'rtl') {
      classes.push('rtl');
    }
    
    if (pageMode === 'double') {
      classes.push('double-mode');
    }
    
    return classes.join(' ');
  });
</script>

{#if units.length > 0}
  <!-- 【性能优化】可滚动容器 -->
  <div 
    bind:this={containerRef}
    class="scroll-frame-container {containerClass}"
    data-layer="PanoramaFrameLayer"
    style:z-index={LayerZIndex.CURRENT_FRAME}
  >
    <div class="scroll-frame-content">
      {#each units as unit (unit.id)}
        <div class="panorama-unit" data-unit-id={unit.id}>
          {#each unit.images as img, i (img.pageIndex)}
            <FrameImage
              pageIndex={img.pageIndex}
              url={img.url}
              alt="Page {img.pageIndex + 1}"
              class="panorama-image"
              style={pageMode === 'double' ? getImageStyle(img, unit, i) : singleImageStyle}
            />
          {/each}
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div 
    class="scroll-frame-container panorama-frame-layer empty"
    data-layer="PanoramaFrameLayer"
    style:z-index={LayerZIndex.CURRENT_FRAME}
  >
    <span class="text-muted-foreground">加载中...</span>
  </div>
{/if}

<style>
  /* 【性能优化】可滚动容器 - 原生滚动方案，支持双向滚动 */
  .scroll-frame-container {
    position: absolute;
    inset: 0;
    overflow: auto; /* 双向滚动 */
    /* 隐藏滚动条 */
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
    /* GPU 加速 */
    will-change: scroll-position;
    -webkit-overflow-scrolling: touch;
  }
  
  .scroll-frame-container::-webkit-scrollbar {
    display: none;
  }

  .scroll-frame-content {
    display: flex;
    flex-direction: row;
    gap: 0;
    padding: 0;
    align-items: center;
    justify-content: center; /* 居中显示 */
    /* 确保内容区域至少和容器一样大，使居中生效 */
    min-width: 100%;
    min-height: 100%;
    /* GPU 加速 */
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
  }

  /* .panorama-frame-layer 作为容器的修饰类，样式由子选择器定义 */
  
  /* vertical 和 rtl 应用于 scroll-frame-content */
  .panorama-frame-layer.vertical .scroll-frame-content {
    flex-direction: column;
  }
  
  .panorama-frame-layer.rtl .scroll-frame-content {
    flex-direction: row-reverse;
  }
  
  .panorama-frame-layer.vertical.rtl .scroll-frame-content {
    flex-direction: column-reverse;
  }
  
  .panorama-unit {
    flex-shrink: 0;
    display: flex;
    flex-direction: row;
    gap: 0;
    align-items: center;
    justify-content: center;
    scroll-snap-align: center;
  }
  
  /* 水平全景：单元高度铺满视口 */
  .panorama-frame-layer:not(.vertical) .panorama-unit {
    height: 100%;
    min-height: 100%;
  }
  
  /* 垂直全景：单元宽度铺满视口 */
  .panorama-frame-layer.vertical .panorama-unit {
    width: 100%;
    min-width: 100%;
  }
  
  /* 双页模式：单元内图片并排 */
  .panorama-frame-layer.double-mode .panorama-unit {
    flex-direction: row;
  }
  
  .panorama-frame-layer.double-mode.rtl .panorama-unit {
    flex-direction: row-reverse;
  }
  
  .panorama-image {
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    flex-shrink: 0;
  }
  
  /* 水平全景：图片高度铺满视口 */
  .panorama-frame-layer:not(.vertical) .panorama-image {
    height: 100%;
    width: auto;
    max-height: none;
  }
  
  /* 垂直全景：图片宽度铺满视口 */
  .panorama-frame-layer.vertical .panorama-image {
    width: 100%;
    height: auto;
    max-width: none;
  }
  
  /* 双页模式：每张图最多占50%宽度 */
  .panorama-frame-layer.double-mode .panorama-image {
    max-width: 50%;
  }
  
  .panorama-frame-layer.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
  }
</style>
