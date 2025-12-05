<!--
  PrevFrameLayer - 前帧层（预加载，隐藏）
  z-index: 20
  用于预解码，翻页时秒切
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  import FrameImage from '../components/FrameImage.svelte';
  import '../styles/frameLayer.css';
  
  let {
    frame,
    layout = 'single',
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
  } = $props();
  
  let layoutClass = $derived(
    layout === 'double' ? 'frame-double' : 
    layout === 'panorama' ? 'frame-panorama' : 
    'frame-single'
  );
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
        clipPath={getClipPath(img.splitHalf)}
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
