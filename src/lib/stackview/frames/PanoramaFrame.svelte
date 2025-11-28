<!--
  PanoramaFrame - 全景帧布局
  
  功能：
  - 横向滚动显示多张图片
  - 支持 LTR/RTL 阅读方向
-->
<script lang="ts">
  import type { FrameImage } from '../types/frame';
  
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

<div class="panorama-frame" class:rtl={direction === 'rtl'}>
  {#each images as img, i (i)}
    <img
      src={img.url}
      alt="Page {i}"
      class="frame-image"
      onload={(e) => onImageLoad?.(e, i)}
      draggable="false"
    />
  {/each}
</div>

<style>
  .panorama-frame {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }
  
  .panorama-frame.rtl {
    flex-direction: row-reverse;
  }
  
  .frame-image {
    height: 100%;
    max-width: none;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
