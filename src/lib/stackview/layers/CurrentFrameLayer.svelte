<!--
  CurrentFrameLayer - 当前帧层（原生滚动方案）
  z-index: 40
  
  支持布局:
  - single: 单页
  - double: 双页（水平排列）
  - panorama: 全景
  
  特性:
  - 使用原生滚动容器，支持超高分辨率图片
  - 利用浏览器 tile rendering 优化
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  
  let {
    frame,
    layout = 'single',
    direction = 'ltr',
    orientation = 'horizontal',
    // 视口尺寸
    viewportSize = { width: 0, height: 0 },
    // 图片原始尺寸
    imageSize = { width: 0, height: 0 },
    // 缩放比例（基于 fit 后的额外缩放）
    scale = 1,
    rotation = 0,
    onImageLoad,
    onContainerReady,
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
    orientation?: 'horizontal' | 'vertical';
    viewportSize?: { width: number; height: number };
    imageSize?: { width: number; height: number };
    scale?: number;
    rotation?: number;
    onImageLoad?: (e: Event, index: number) => void;
    onContainerReady?: (el: HTMLElement | null) => void;
  } = $props();
  
  let containerRef: HTMLDivElement | null = $state(null);
  
  // 容器就绪时通知父组件
  $effect(() => {
    onContainerReady?.(containerRef);
  });
  
  // 计算图片显示尺寸（像素）
  let displaySize = $derived.by(() => {
    if (!viewportSize.width || !viewportSize.height || !imageSize.width || !imageSize.height) {
      return null;
    }
    
    const vw = viewportSize.width;
    const vh = viewportSize.height;
    const iw = imageSize.width;
    const ih = imageSize.height;
    
    // 计算 fit 后的基础尺寸
    const ratioW = vw / iw;
    const ratioH = vh / ih;
    const fitRatio = Math.min(ratioW, ratioH);
    
    // 应用 scale
    const finalRatio = fitRatio * scale;
    
    return {
      width: Math.round(iw * finalRatio),
      height: Math.round(ih * finalRatio),
    };
  });
  
  // 图片尺寸样式
  let imageSizeStyle = $derived.by(() => {
    if (!displaySize) {
      // 没有尺寸信息时使用默认限制
      return 'max-width: 100%; max-height: 100%;';
    }
    // 设置实际像素尺寸
    return `width: ${displaySize.width}px; height: ${displaySize.height}px; max-width: none; max-height: none;`;
  });
  
  // 旋转样式
  let rotationStyle = $derived(rotation !== 0 ? `transform: rotate(${rotation}deg)` : '');
  
  let layoutClass = $derived.by(() => {
    const classes: string[] = [];
    
    if (layout === 'double') {
      // 双页模式：始终左右排列，不受 orientation 影响
      classes.push('frame-double');
      if (direction === 'rtl') {
        classes.push('frame-rtl');
      }
    } else if (layout === 'panorama') {
      // 全景模式：orientation 控制滚动方向
      classes.push('frame-panorama');
      if (orientation === 'vertical') {
        classes.push('frame-vertical');
      }
      if (direction === 'rtl') {
        classes.push('frame-rtl');
      }
    } else {
      classes.push('frame-single');
    }
    
    return classes.join(' ');
  });
</script>

{#if frame.images.length > 0}
  <div 
    class="current-frame-layer {layoutClass}"
    data-layer="CurrentFrameLayer"
    data-layer-id="current"
    style:z-index={LayerZIndex.CURRENT_FRAME}
    bind:this={containerRef}
  >
    <!-- 内层容器 -->
    <div class="frame-content" style={rotationStyle}>
      {#each frame.images as img, i (i)}
        <img
          src={img.url}
          alt="Current {i}"
          class="frame-image"
          style="{imageSizeStyle} {getImageTransform(img) ? `transform: ${getImageTransform(img)};` : ''}"
          style:clip-path={getClipPath(img.splitHalf)}
          onload={(e) => onImageLoad?.(e, i)}
          draggable="false"
        />
      {/each}
    </div>
  </div>
{:else}
  <div 
    class="current-frame-layer frame-empty"
    data-layer="CurrentFrameLayer"
    data-layer-id="current"
    style:z-index={LayerZIndex.CURRENT_FRAME}
  >
    <span class="text-muted-foreground">暂无图片</span>
  </div>
{/if}

<style>
  .current-frame-layer {
    position: absolute;
    inset: 0;
    overflow: auto;
    /* 隐藏滚动条，但保留滚动功能 */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .current-frame-layer::-webkit-scrollbar {
    display: none;
  }
  
  .frame-content {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* 内容尺寸由图片决定 */
    min-width: 100%;
    min-height: 100%;
    width: fit-content;
    height: fit-content;
    transform-origin: center center;
  }
  
  .frame-single {
    justify-content: center;
  }
  
  /* 双页 - 始终水平排列（左右两页） */
  .frame-double {
    flex-direction: row;
    gap: 4px;
  }
  
  .frame-double.frame-rtl {
    flex-direction: row-reverse;
  }
  
  /* 双页模式不受 orientation 影响，始终左右排列 */
  
  /* 全景 - 水平滚动 */
  .frame-panorama {
    flex-direction: row;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap;
    padding: 4px;
    justify-content: flex-start;
    align-items: center;
  }
  
  .frame-panorama.frame-rtl {
    flex-direction: row-reverse;
  }
  
  /* 全景 - 垂直滚动 */
  .frame-panorama.frame-vertical {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    justify-content: flex-start;
    align-items: center;
  }
  
  .frame-panorama.frame-vertical.frame-rtl {
    flex-direction: column-reverse;
  }
  
  .frame-empty {
    color: var(--muted-foreground);
  }
  
  .frame-image {
    /* 默认尺寸由 imageStyleScale 控制 */
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    flex-shrink: 0;
  }
  
  /* 双页 - 每张图占50%宽度（始终左右排列） */
  .frame-double .frame-image {
    max-width: calc(50% - 2px);
    max-height: 100%;
  }
  
  /* 全景水平 - 图片高度100% */
  .frame-panorama .frame-image {
    max-width: none;
    height: 100%;
  }
  
  /* 全景垂直 - 图片宽度100% */
  .frame-panorama.frame-vertical .frame-image {
    max-width: 100%;
    max-height: none;
    width: 100%;
  }
</style>
