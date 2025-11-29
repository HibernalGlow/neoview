<!--
  UpscaleLayer - 超分层
  z-index: 50
  
  功能：
  - 显示超分后的图片
  - 覆盖在原图上
  - 支持渐进显示
-->
<script lang="ts">
  import type { Frame } from '../types/frame';
  import { computeTransformCSS } from '../types/transform';
  import type { Transform } from '../types/transform';

  interface Props {
    /** 帧数据 */
    frame?: Frame;
    /** 变换状态 */
    transform?: Transform;
    /** 是否可见 */
    visible?: boolean;
  }

  let {
    frame,
    transform = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    visible = true,
  }: Props = $props();

  let hasImages = $derived(frame && frame.images.length > 0);
  let transformCSS = $derived(computeTransformCSS(transform));
</script>

{#if visible && hasImages && frame}
  <div
    class="upscale-layer"
    style:transform={transformCSS}
    data-layer="UpscaleLayer"
    data-layer-id="upscale"
  >
    {#each frame.images as img, i (i)}
      {#if img.url}
        <img
          src={img.url}
          alt="Upscaled {img.physicalIndex + 1}"
          class="upscale-image"
          draggable="false"
          data-info="upscaled page {img.physicalIndex}"
        />
      {/if}
    {/each}
  </div>
{/if}

<style>
  .upscale-layer {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .upscale-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
