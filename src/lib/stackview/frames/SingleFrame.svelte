<!--
  SingleFrame - 单页帧布局
  
  功能：
  - 显示单张图片
  - 支持分割显示（左半/右半）
  - 支持旋转
-->
<script lang="ts">
  import type { FrameImage } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  
  let {
    images = [],
    onImageLoad,
  }: {
    images: FrameImage[];
    onImageLoad?: (e: Event, index: number) => void;
  } = $props();
</script>

<div class="single-frame">
  {#each images as img, i (i)}
    <img
      src={img.url}
      alt="Page {i}"
      class="frame-image"
      class:is-split={!!img.splitHalf}
      style:transform={getImageTransform(img)}
      style:clip-path={getClipPath(img.splitHalf)}
      onload={(e) => onImageLoad?.(e, i)}
      draggable="false"
    />
  {/each}
</div>

<style>
  .single-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }

  /* 分割图像由于被裁剪了一半，需要倍增宽度以填满区域 */
  .frame-image.is-split {
    max-width: 200%;
    width: 200%;
  }
</style>
