<!--
  NextFrameLayer - 后帧层（预加载，隐藏）
  z-index: 30
  用于预解码，翻页时秒切
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
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
    class="frame-layer next-frame-layer {layoutClass}"
    data-layer="NextFrameLayer"
    data-layer-id="next"
    style:z-index={LayerZIndex.NEXT_FRAME}
  >
    {#each frame.images as img, i (i)}
      <img
        src={img.url}
        alt="Next {i}"
        class="frame-image"
        style:transform={getImageTransform(img)}
        style:clip-path={getClipPath(img.splitHalf)}
        draggable="false"
      />
    {/each}
  </div>
{/if}

<style>
  /* 后帧层特有样式（基础样式来自 frameLayer.css） */
  .next-frame-layer {
    opacity: 0;
    pointer-events: none;
  }
</style>
