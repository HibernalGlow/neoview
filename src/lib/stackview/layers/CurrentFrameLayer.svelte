<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
  
  整合 StackViewer 优化：
  - 支持超分图无缝替换
  - GPU 加速
  - 支持单页/双页/全景布局
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  import { imagePool } from '../stores/imagePool.svelte';
  import '../styles/frameLayer.css';
  
  let {
    frame,
    layout = 'single',
    direction = 'ltr',
    orientation = 'horizontal',
    scale = 1,
    rotation = 0,
    // 视口位置百分比（0-100）
    viewPositionX = 50,
    viewPositionY = 50,
    // 视口和图片尺寸（用于计算边界）
    viewportSize = { width: 0, height: 0 },
    imageSize = { width: 0, height: 0 },
    onImageLoad,
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
    orientation?: 'horizontal' | 'vertical';
    scale?: number;
    rotation?: number;
    viewPositionX?: number;
    viewPositionY?: number;
    viewportSize?: { width: number; height: number };
    imageSize?: { width: number; height: number };
    onImageLoad?: (e: Event, index: number) => void;
  } = $props();
  
  // 计算 transform-origin（基于 viewPositionX/Y）
  // 悬停滚动通过改变缩放原点来实现平移效果
  let transformOrigin = $derived(`${viewPositionX}% ${viewPositionY}%`);
  
  // 计算 transform（只包含 scale 和 rotation）
  let transformStyle = $derived.by(() => {
    const parts: string[] = [];
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
    return parts.length > 0 ? parts.join(' ') : 'none';
  });
  
  // 计算显示 URL 列表（响应式，超分完成时自动更新）
  let displayUrls = $derived.by(() => {
    // 依赖版本号以建立响应式关系
    const _ = imagePool.version;
    return frame.images.map(img => {
      const upscaledUrl = imagePool.getDisplayUrl(img.physicalIndex);
      return upscaledUrl ?? img.url;
    });
  });
  
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
    class="frame-layer current-frame-layer {layoutClass}"
    data-layer="CurrentFrameLayer"
    data-layer-id="current"
    style:z-index={LayerZIndex.CURRENT_FRAME}
    style:transform={transformStyle}
    style:transform-origin={transformOrigin}
  >
    {#each frame.images as img, i (i)}
      <img
        src={displayUrls[i]}
        alt="Current {i}"
        class="frame-image"
        style:transform={getImageTransform(img)}
        style:clip-path={getClipPath(img.splitHalf)}
        onload={(e) => onImageLoad?.(e, i)}
        draggable="false"
      />
    {/each}
  </div>
{:else}
  <div 
    class="frame-layer current-frame-layer frame-empty"
    data-layer="CurrentFrameLayer"
    data-layer-id="current"
    style:z-index={LayerZIndex.CURRENT_FRAME}
  >
    <span class="text-muted-foreground">暂无图片</span>
  </div>
{/if}

<style>
  /* 当前帧层特有样式（基础样式来自 frameLayer.css） */
  .current-frame-layer {
    opacity: 1;
    transition: opacity 0.15s ease;
  }
</style>
