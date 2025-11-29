<!--
  NextFrameLayer - 后帧层
  z-index: 30
  
  功能：
  - 预加载下一帧
  - 隐藏但已加载，用于快速翻页
-->
<script lang="ts">
  import type { Frame } from '../types/frame';

  interface Props {
    /** 帧数据 */
    frame?: Frame;
    /** 变换样式 */
    transform?: string;
    /** 图片加载回调 */
    onImageLoad?: (index: number) => void;
  }

  let {
    frame,
    transform = 'none',
    onImageLoad,
  }: Props = $props();

  let hasImages = $derived(frame && frame.images.length > 0);
</script>

<div
  class="next-frame-layer"
  class:hidden={!hasImages}
  style:transform={transform}
  data-layer="NextFrameLayer"
  data-layer-id="nextFrame"
>
  {#if frame}
    {#each frame.images as img, i (i)}
      {#if img.url}
        <img
          src={img.url}
          alt="Next page"
          class="frame-image"
          onload={() => onImageLoad?.(img.physicalIndex)}
          draggable="false"
          data-info="page {img.physicalIndex}, preloaded"
        />
      {/if}
    {/each}
  {/if}
</div>

<style>
  .next-frame-layer {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    visibility: hidden;
  }

  .next-frame-layer.hidden {
    display: none;
  }

  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
