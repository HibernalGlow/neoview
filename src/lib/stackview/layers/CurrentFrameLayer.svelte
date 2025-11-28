<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
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
    onImageLoad,
  }: {
    frame: Frame;
    layout?: 'single' | 'double' | 'panorama';
    direction?: 'ltr' | 'rtl';
    transform?: string;
    onImageLoad?: (e: Event, index: number) => void;
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

{#if frame.images.length > 0}
  <div 
    class="current-frame-layer {layoutClass}"
    data-layer="CurrentFrameLayer"
    data-layer-id="current"
    style:z-index={LayerZIndex.CURRENT_FRAME}
    style:transform={transform}
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
    overflow-x: auto;
    overflow-y: hidden;
  }
  
  .frame-panorama.frame-rtl {
    flex-direction: row-reverse;
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
  
  .frame-double .frame-image {
    max-width: 50%;
  }
  
  .frame-panorama .frame-image {
    max-width: none;
    height: 100%;
  }
</style>
