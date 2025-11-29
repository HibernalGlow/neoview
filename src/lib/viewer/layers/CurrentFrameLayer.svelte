<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
  
  功能：
  - 显示当前页面
  - 支持单页/双页/全景布局
  - 支持分割和旋转
  - 应用缩放/平移变换
-->
<script lang="ts">
  import type { Frame, LayoutMode, ReadingDirection } from '../types/frame';
  import { computeClipPath, computeSplitTranslate, computeTransformCSS } from '../types/transform';
  import type { Transform } from '../types/transform';

  interface Props {
    /** 帧数据 */
    frame?: Frame;
    /** 布局模式 */
    layout?: LayoutMode;
    /** 阅读方向 */
    direction?: ReadingDirection;
    /** 变换状态 */
    transform?: Transform;
    /** 图片加载回调 */
    onImageLoad?: (index: number, width: number, height: number) => void;
    /** 图片错误回调 */
    onImageError?: (index: number, error: string) => void;
  }

  let {
    frame,
    layout = 'single',
    direction = 'ltr',
    transform = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    onImageLoad,
    onImageError,
  }: Props = $props();

  let hasImages = $derived(frame && frame.images.length > 0);
  let isDouble = $derived(layout === 'double' && frame && frame.images.length > 1);
  let isPanorama = $derived(layout === 'panorama');

  // 计算基础变换 CSS
  let baseTransformCSS = $derived(computeTransformCSS(transform));

  // 图片类型
  type FrameImageType = Frame['images'][0];

  // 计算单个图片的完整样式
  function getImageStyle(img: FrameImageType): string {
    const parts: string[] = [];
    
    // 分割位移补偿
    const splitTranslate = computeSplitTranslate(img.splitHalf);
    if (splitTranslate) {
      parts.push(splitTranslate);
    }
    
    // 基础变换 (缩放、平移、旋转)
    if (baseTransformCSS !== 'none') {
      parts.push(baseTransformCSS);
    }
    
    // 图片自身的旋转
    if (img.rotation) {
      parts.push(`rotate(${img.rotation}deg)`);
    }
    
    const transformValue = parts.length > 0 ? parts.join(' ') : 'none';
    const clipPath = computeClipPath(img.splitHalf);
    
    let style = `transform: ${transformValue};`;
    if (clipPath !== 'none') {
      style += ` clip-path: ${clipPath};`;
    }
    
    return style;
  }

  function handleLoad(event: Event, img: FrameImageType) {
    const imgEl = event.target as HTMLImageElement;
    onImageLoad?.(img.physicalIndex, imgEl.naturalWidth, imgEl.naturalHeight);
  }

  function handleError(event: Event, img: FrameImageType) {
    onImageError?.(img.physicalIndex, 'Failed to load image');
  }

  // 排序图片 (根据阅读方向)
  let sortedImages = $derived.by(() => {
    if (!frame) return [];
    if (direction === 'rtl' && isDouble) {
      return [...frame.images].reverse();
    }
    return frame.images;
  });
</script>

<div
  class="current-frame-layer"
  class:single={layout === 'single'}
  class:double={isDouble}
  class:panorama={isPanorama}
  class:rtl={direction === 'rtl'}
  data-layer="CurrentFrameLayer"
  data-layer-id="currentFrame"
>
  {#if hasImages}
    {#if isPanorama}
      <!-- 全景模式 -->
      <div class="panorama-container" class:rtl={direction === 'rtl'}>
        {#each sortedImages as img, i (i)}
          {#if img.url}
            <img
              src={img.url}
              alt="Page {img.physicalIndex + 1}"
              class="panorama-image"
              style={getImageStyle(img)}
              onload={(e) => handleLoad(e, img)}
              onerror={(e) => handleError(e, img)}
              draggable="false"
              data-info="page {img.physicalIndex}, {img.width}x{img.height}, loaded"
            />
          {/if}
        {/each}
      </div>
    {:else if isDouble}
      <!-- 双页模式 -->
      <div class="double-container">
        {#each sortedImages as img, i (i)}
          {#if img.url}
            <img
              src={img.url}
              alt="Page {img.physicalIndex + 1}"
              class="double-image"
              style={getImageStyle(img)}
              onload={(e) => handleLoad(e, img)}
              onerror={(e) => handleError(e, img)}
              draggable="false"
              data-info="page {img.physicalIndex}, {img.width}x{img.height}, loaded"
            />
          {/if}
        {/each}
      </div>
    {:else if frame}
      <!-- 单页模式 -->
      {#each frame.images as img, i (i)}
        {#if img.url}
          <img
            src={img.url}
            alt="Page {img.physicalIndex + 1}"
            class="single-image"
            style={getImageStyle(img)}
            onload={(e) => handleLoad(e, img)}
            onerror={(e) => handleError(e, img)}
            draggable="false"
            data-info="page {img.physicalIndex}, {img.width}x{img.height}, loaded"
          />
        {/if}
      {/each}
    {/if}
  {:else}
    <div class="empty-state">
      <span>无图片</span>
    </div>
  {/if}
</div>

<style>
  .current-frame-layer {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  /* 单页模式 */
  .single-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    transition: transform 0.15s ease-out;
  }

  /* 双页模式 */
  .double-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100%;
  }

  .double-image {
    max-width: 48%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    transition: transform 0.15s ease-out;
  }

  /* 全景模式 */
  .panorama-container {
    display: flex;
    align-items: center;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .panorama-container.rtl {
    flex-direction: row-reverse;
  }

  .panorama-image {
    height: 100%;
    width: auto;
    flex-shrink: 0;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    margin: 0 -1px;
  }

  /* 空状态 */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--muted-foreground, #666);
  }
</style>
