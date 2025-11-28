<!--
  NextFrameLayer - 后帧层（预加载）
  z-index: 30
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  
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
    class="next-frame-layer {layoutClass}"
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
  .next-frame-layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
  }
  
  .frame-single {
    justify-content: center;
  }
  
  .frame-double {
    flex-direction: row;
    gap: 4px;
  }
  
  .frame-panorama {
    flex-direction: row;
    gap: 4px;
  }
  
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  .frame-double .frame-image {
    max-width: 50%;
  }
</style>
