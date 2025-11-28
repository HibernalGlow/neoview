<!--
  UpscaleLayer - 超分层
  z-index: 50
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { Frame } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  
  let {
    frame,
    layout = 'single',
    direction = 'ltr',
    transform = 'none',
    visible = true,
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
    transform?: string;
    visible?: boolean;
  } = $props();
  
  let layoutClass = $derived.by(() => {
    if (layout === 'double') {
      return direction === 'rtl' ? 'frame-double frame-rtl' : 'frame-double';
    }
    if (layout === 'panorama') {
      return direction === 'rtl' ? 'frame-panorama frame-rtl' : 'frame-panorama';
    }
    return 'frame-single';
  });
</script>

{#if visible && frame.images.length > 0}
  <div 
    class="upscale-layer {layoutClass}"
    data-layer="UpscaleLayer"
    data-layer-id="upscale"
    style:z-index={LayerZIndex.UPSCALE}
    style:transform={transform}
  >
    {#each frame.images as img, i (i)}
      <img
        src={img.url}
        alt="Upscaled {i}"
        class="frame-image"
        style:transform={getImageTransform(img)}
        style:clip-path={getClipPath(img.splitHalf)}
        draggable="false"
      />
    {/each}
  </div>
{/if}

<style>
  .upscale-layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 渐入动画 */
    animation: fadeIn 0.3s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  .frame-single {
    justify-content: center;
  }
  
  .frame-double {
    flex-direction: row;
    gap: 4px;
  }
  
  .frame-double.frame-rtl {
    flex-direction: row-reverse;
  }
  
  .frame-panorama {
    flex-direction: row;
    gap: 4px;
  }
  
  .frame-panorama.frame-rtl {
    flex-direction: row-reverse;
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
