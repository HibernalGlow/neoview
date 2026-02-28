<!--
  ImageRenderer - 图片渲染器
  
  功能：
  - 渲染单张图片
  - 支持分割、旋转
  - 检测图片尺寸
-->
<script lang="ts">
  import type { FrameImage } from '../types/frame';
  import { getImageTransform, getClipPath } from '../utils/transform';
  
  let {
    image,
    onLoad,
    onError,
  }: {
    image: FrameImage;
    onLoad?: (width: number, height: number) => void;
    onError?: (error: Error) => void;
  } = $props();
  
  function handleLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    if (img && onLoad) {
      onLoad(img.naturalWidth, img.naturalHeight);
    }
  }
  
  function handleError() {
    onError?.(new Error(`Failed to load image: ${image.url}`));
  }
</script>

<img
  src={image.url}
  alt="预览图"
  class="image-renderer"
  class:is-split={!!image.splitHalf}
  style:transform={getImageTransform(image)}
  style:clip-path={getClipPath(image.splitHalf)}
  onload={handleLoad}
  onerror={handleError}
  draggable="false"
/>

<style>
  .image-renderer {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }

  .image-renderer.is-split {
    max-width: 200%;
    width: 200%;
  }
</style>
