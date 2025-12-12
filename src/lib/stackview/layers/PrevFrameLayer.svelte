<!--
  PrevFrameLayer - 前帧层（预加载，隐藏）
  z-index: 20
  用于预解码，翻页时秒切
  
  支持 PageFrame 的 cropRect 裁剪区域
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath, getClipPathFromCropRect } from '../utils/transform';
  import FrameImage from '../components/FrameImage.svelte';
  import '../styles/frameLayer.css';
  
  let {
    frame,
    layout = 'single',
    direction = 'ltr',
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
  } = $props();
  
  let layoutClass = $derived.by(() => {
    const classes: string[] = [];
    if (layout === 'double') {
      classes.push('frame-double');
      if (direction === 'rtl') {
        classes.push('frame-rtl');
      }
    } else if (layout === 'panorama') {
      classes.push('frame-panorama');
    } else {
      classes.push('frame-single');
    }
    return classes.join(' ');
  });

  // 计算裁剪路径：优先使用 cropRect，否则使用 splitHalf
  function getEffectiveClipPath(img: Frame['images'][0]): string {
    if (img.cropRect) {
      return getClipPathFromCropRect(img.cropRect);
    }
    return getClipPath(img.splitHalf);
  }
</script>

{#if frame.images.length > 0}
  <div 
    class="frame-layer prev-frame-layer {layoutClass}"
    data-layer="PrevFrameLayer"
    data-layer-id="prev"
    style:z-index={LayerZIndex.PREV_FRAME}
  >
    {#each frame.images as img, i (i)}
      <FrameImage
        pageIndex={img.physicalIndex}
        url={img.url}
        alt="Previous {i}"
        transform={getImageTransform(img)}
        clipPath={getEffectiveClipPath(img)}
      />
    {/each}
  </div>
{/if}

<style>
  /* 前帧层特有样式（基础样式来自 frameLayer.css） */
  .prev-frame-layer {
    opacity: 0;
    pointer-events: none;
  }
</style>
