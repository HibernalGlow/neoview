<!--
  PanoramaFrameLayer - 全景帧层
  显示多个帧单元，支持滚动
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  import type { PanoramaUnit } from '../stores/panoramaStore.svelte';
  
  let {
    units = [],
    pageMode = 'single',
    orientation = 'horizontal',
    direction = 'ltr',
    transform = 'none',
    onScroll,
  }: {
    units: PanoramaUnit[];
    pageMode?: 'single' | 'double';
    orientation?: 'horizontal' | 'vertical';
    direction?: 'ltr' | 'rtl';
    transform?: string;
    onScroll?: (e: Event) => void;
  } = $props();
  
  let containerClass = $derived.by(() => {
    const classes = ['panorama-frame-layer'];
    
    if (orientation === 'vertical') {
      classes.push('vertical');
    }
    
    if (direction === 'rtl') {
      classes.push('rtl');
    }
    
    if (pageMode === 'double') {
      classes.push('double-mode');
    }
    
    return classes.join(' ');
  });
</script>

{#if units.length > 0}
  <div 
    class={containerClass}
    data-layer="PanoramaFrameLayer"
    style:z-index={LayerZIndex.CURRENT_FRAME}
    style:transform={transform}
    onscroll={onScroll}
  >
    {#each units as unit (unit.id)}
      <div class="panorama-unit" data-unit-id={unit.id}>
        {#each unit.images as img, i (img.pageIndex)}
          <img
            src={img.url}
            alt="Page {img.pageIndex + 1}"
            class="panorama-image"
            draggable="false"
          />
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <div 
    class="panorama-frame-layer empty"
    data-layer="PanoramaFrameLayer"
    style:z-index={LayerZIndex.CURRENT_FRAME}
  >
    <span class="text-muted-foreground">加载中...</span>
  </div>
{/if}

<style>
  .panorama-frame-layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row;
    gap: 16px;
    padding: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    scroll-snap-type: x mandatory;
  }
  
  .panorama-frame-layer.vertical {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
  }
  
  .panorama-frame-layer.rtl {
    flex-direction: row-reverse;
  }
  
  .panorama-frame-layer.vertical.rtl {
    flex-direction: column-reverse;
  }
  
  .panorama-unit {
    flex-shrink: 0;
    display: flex;
    flex-direction: row;
    gap: 4px;
    align-items: center;
    justify-content: center;
    scroll-snap-align: center;
  }
  
  /* 水平全景：单元高度100% */
  .panorama-frame-layer:not(.vertical) .panorama-unit {
    height: 100%;
  }
  
  /* 垂直全景：单元宽度100% */
  .panorama-frame-layer.vertical .panorama-unit {
    width: 100%;
  }
  
  /* 双页模式：单元内图片并排 */
  .panorama-frame-layer.double-mode .panorama-unit {
    flex-direction: row;
  }
  
  .panorama-frame-layer.double-mode.rtl .panorama-unit {
    flex-direction: row-reverse;
  }
  
  .panorama-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  /* 水平全景：图片高度适应 */
  .panorama-frame-layer:not(.vertical) .panorama-image {
    height: 100%;
    width: auto;
  }
  
  /* 垂直全景：图片宽度适应 */
  .panorama-frame-layer.vertical .panorama-image {
    width: 100%;
    height: auto;
  }
  
  /* 双页模式：每张图最多占50%宽度 */
  .panorama-frame-layer.double-mode .panorama-image {
    max-width: calc(50% - 2px);
  }
  
  .panorama-frame-layer.empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
  }
</style>
