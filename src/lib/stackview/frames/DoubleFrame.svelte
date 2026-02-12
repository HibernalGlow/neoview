<!--
  DoubleFrame - 双页帧布局
  
  功能：
  - 并排显示两张图片
  - 支持 LTR/RTL 阅读方向
  - 横向图可独占双页
-->
<script lang="ts">
  import type { FrameImage } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  
  let {
    images = [],
    direction = 'ltr',
    onImageLoad,
  }: {
    images: FrameImage[];
    direction?: 'ltr' | 'rtl';
    onImageLoad?: (e: Event, index: number) => void;
  } = $props();
</script>

<div class="double-frame" class:rtl={direction === 'rtl'}>
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
  .double-frame {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100%;
  }
  
  .double-frame.rtl {
    flex-direction: row-reverse;
  }
  
  .frame-image {
    max-width: 50%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
  
  /* 分割图像在双页模式下也需要倍增宽度 (从 50% 到 100%) */
  .frame-image.is-split {
    max-width: 100%;
    width: 100%;
  }

  /* 单张图片时独占整个区域 */
  .double-frame:has(.frame-image:only-child) .frame-image {
    max-width: 100%;
  }
  
  .double-frame:has(.frame-image:only-child) .frame-image.is-split {
    max-width: 200%;
    width: 200%;
  }
</style>
