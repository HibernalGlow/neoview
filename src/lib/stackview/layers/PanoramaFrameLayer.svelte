<!--
  PanoramaFrameLayer - 全景帧层
  显示多个帧单元，支持滚动
  
  【性能优化】原生滚动方案：
  - 使用浏览器原生滚动，硬件加速
  - HoverScrollLayer 直接操作 scrollLeft/scrollTop
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { PanoramaUnit } from '../stores/panoramaStore.svelte';
  import FrameImage from '../components/FrameImage.svelte';
  import '../styles/frameLayer.css';
  
  let {
    units = [],
    pageMode = 'single',
    orientation = 'horizontal',
    direction = 'ltr',
    currentPageIndex = 0,
    viewportSize = { width: 0, height: 0 },
    onScroll,
  }: {
    units: PanoramaUnit[];
    pageMode?: 'single' | 'double';
    orientation?: 'horizontal' | 'vertical';
    direction?: 'ltr' | 'rtl';
    currentPageIndex?: number;
    viewportSize?: { width: number; height: number };
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
  
  // 计算图片尺寸：全景模式
  // 水平全景：高度固定为视口高度，宽度自适应（与非全景 fitHeight 一致）
  // 纵向全景：宽度固定为视口宽度，高度自适应（与非全景 fitWidth 一致）
  let imageStyle = $derived.by(() => {
    const vp = viewportSize;
    if (!vp.width || !vp.height) {
      return orientation === 'vertical'
        ? 'width: 100%; height: auto;'
        : 'height: 100%; width: auto;';
    }
    
    if (orientation === 'vertical') {
      // 纵向全景：宽度固定，高度自适应
      return `width: ${vp.width}px; height: auto;`;
    } else {
      // 水平全景：高度固定，宽度自适应
      return `height: ${vp.height}px; width: auto;`;
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
              style={imageStyle}
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
  
  /* 水平全景：单元高度100% */
  .panorama-frame-layer:not(.vertical) .panorama-unit {
    height: 100%;
  }
  
  /* 垂直全景：单元宽度100% */
  .panorama-frame-layer.vertical .panorama-unit {
    width: 100%;
  }
  
  /* 双页模式：单元内图片并排 */
  .panorama-frame-layer.double-mode .panorama-unit {
    flex-direction: row;
  }
  
  .panorama-frame-layer.double-mode.rtl .panorama-unit {
    flex-direction: row-reverse;
  }
  
  .panorama-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  /* 水平全景：图片高度适应 */
  .panorama-frame-layer:not(.vertical) .panorama-image {
    height: 100%;
    width: auto;
  }
  
  /* 垂直全景：图片宽度适应 */
  .panorama-frame-layer.vertical .panorama-image {
    width: 100%;
    height: auto;
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
