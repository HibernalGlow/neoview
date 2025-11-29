<!--
  PreloadLayer - 扩展预加载层
  z-index: 10
  
  功能：
  - 预加载多个页面
  - 隐藏显示，仅用于缓存
-->
<script lang="ts">
  import type { Frame } from '../types/frame';

  interface Props {
    /** 预加载的帧列表 */
    frames?: Frame[];
    /** 预加载完成回调 */
    onLoad?: (index: number) => void;
  }

  let {
    frames = [],
    onLoad,
  }: Props = $props();

  function handleImageLoad(index: number) {
    onLoad?.(index);
  }
</script>

<div
  class="preload-layer"
  data-layer="PreloadLayer"
  data-layer-id="preload"
>
  {#each frames as frame (frame.id)}
    {#each frame.images as img, i (i)}
      {#if img.url}
        <img
          src={img.url}
          alt=""
          class="preload-image"
          onload={() => handleImageLoad(img.physicalIndex)}
          draggable="false"
        />
      {/if}
    {/each}
  {/each}
</div>

<style>
  .preload-layer {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    visibility: hidden;
    overflow: hidden;
  }

  .preload-image {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
</style>
