<!--
  SplitRenderer - 分割页面渲染器
  
  功能：
  - 渲染分割后的图片（左半/右半）
  - 内部管理分割状态
  - 支持翻页时切换半边
-->
<script lang="ts">
  import { getClipPath, getSplitTransform } from '../utils/transform';
  
  let {
    url,
    splitHalf = 'left',
    onLoad,
  }: {
    url: string;
    splitHalf?: 'left' | 'right';
    onLoad?: (width: number, height: number) => void;
  } = $props();
  
  function handleLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    if (img && onLoad) {
      onLoad(img.naturalWidth, img.naturalHeight);
    }
  }
  
  let transform = $derived(getSplitTransform(splitHalf));
  let clipPath = $derived(getClipPath(splitHalf));
</script>

<img
  src={url}
  alt="Split page"
  class="split-renderer"
  style:transform={transform}
  style:clip-path={clipPath}
  onload={handleLoad}
  draggable="false"
/>

<style>
  .split-renderer {
    max-width: 200%;
    width: 200%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
</style>
