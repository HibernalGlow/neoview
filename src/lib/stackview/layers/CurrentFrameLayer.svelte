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
    // 视口位置百分比（0-100）
    // 50 = 居中，0 = 显示左/上边缘，100 = 显示右/下边缘
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
  
  /**
   * 计算安全的 transform-origin 值
   * 确保图片边缘始终贴近或超出视口边缘
   * 
   * viewPositionX/Y 范围是 0-100（来自 HoverLayer）
   * 需要映射到 transform-origin 的安全范围
   */
  let safeOrigin = $derived.by(() => {
    if (!viewportSize.width || !viewportSize.height || !imageSize.width || !imageSize.height || scale <= 0) {
      return { x: 50, y: 50 };
    }
    
    // 缩放后的图片尺寸
    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;
    
    // 计算溢出量（单侧）
    const overflowX = (scaledWidth - viewportSize.width) / 2;
    const overflowY = (scaledHeight - viewportSize.height) / 2;
    
    // 如果没有溢出，位置固定在 50%
    let safeX = 50, safeY = 50;
    
    if (overflowX > 0) {
      // 图片比视口宽
      // transform-origin 安全范围
      const rangeX = (overflowX / scaledWidth) * 100;
      const minX = 50 - rangeX;
      const maxX = 50 + rangeX;
      
      // 将 viewPositionX (0-100) 映射到 (minX-maxX)
      // viewPositionX=0 -> minX, viewPositionX=50 -> 50, viewPositionX=100 -> maxX
      safeX = minX + (viewPositionX / 100) * (maxX - minX);
    }
    
    if (overflowY > 0) {
      // 图片比视口高
      const rangeY = (overflowY / scaledHeight) * 100;
      const minY = 50 - rangeY;
      const maxY = 50 + rangeY;
      
      // 将 viewPositionY (0-100) 映射到 (minY-maxY)
      safeY = minY + (viewPositionY / 100) * (maxY - minY);
    }
    
    return { x: safeX, y: safeY };
  });
  
  // 计算 transform-origin
  let transformOrigin = $derived(`${safeOrigin.x}% ${safeOrigin.y}%`);
  
  // 计算 transform（只包含 scale 和 rotation）
  let transformStyle = $derived.by(() => {
    const parts: string[] = [];
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
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
    style:transform-origin={transformOrigin}
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
