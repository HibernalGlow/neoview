<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
  
  支持布局:
  - single: 单页
  - double: 双页（水平排列）
  - double-vertical: 双页（垂直排列）
  - panorama: 全景（水平排列）
  - panorama-vertical: 全景（垂直排列）
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
    scale = 1,
    rotation = 0,
    // 当前平移位置（由外部 HoverLayer 控制）
    panPosition = { x: 0, y: 0 },
    onImageLoad,
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
    orientation?: 'horizontal' | 'vertical';
    scale?: number;
    rotation?: number;
    panPosition?: { x: number; y: number };
    onImageLoad?: (e: Event, index: number) => void;
  } = $props();
  
  // 计算 transform 字符串
  // 顺序：translate -> scale -> rotate
  // CSS transform 从右到左应用，所以写成 scale rotate translate 实际上是先 translate
  let transformStyle = $derived.by(() => {
    const parts: string[] = [];
    // translate 要在 scale 之前应用（所以放最后）
    // 这样 pan 值不会被 scale 放大
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
    if (panPosition.x !== 0 || panPosition.y !== 0) {
      // 除以 scale 来抵消 scale 的放大效果
      const adjustedX = panPosition.x / scale;
      const adjustedY = panPosition.y / scale;
      parts.push(`translate(${adjustedX}px, ${adjustedY}px)`);
    }
    return parts.length > 0 ? parts.join(' ') : 'none';
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
    class="current-frame-layer {layoutClass}"
    data-layer="CurrentFrameLayer"
    data-layer-id="current"
    style:z-index={LayerZIndex.CURRENT_FRAME}
    style:transform={transformStyle}
  >
    {#each frame.images as img, i (i)}
      <img
        src={img.url}
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
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s ease;
    overflow: hidden;
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
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
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
