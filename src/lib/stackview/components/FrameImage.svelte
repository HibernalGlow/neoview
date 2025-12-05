<!--
  FrameImage - 统一的图片渲染组件
  所有 Layer（单页/双页/全景）都用它
  自动处理：
  - 超分图替换
  - GPU 加速
  - 样式统一
-->
<script lang="ts">
  import { imagePool } from '../stores/imagePool.svelte';
  
  interface Props {
    pageIndex: number;
    url: string;
    alt?: string;
    transform?: string;
    clipPath?: string;
    style?: string;
    class?: string;
    onload?: (e: Event) => void;
  }
  
  let {
    pageIndex,
    url,
    alt = '',
    transform = '',
    clipPath = '',
    style = '',
    class: className = '',
    onload,
  }: Props = $props();
  
  // 获取显示 URL（优先超分图，响应式）
  let displayUrl = $derived.by(() => {
    // 依赖版本号以建立响应式关系
    const _ = imagePool.version;
    const upscaledUrl = imagePool.getDisplayUrl(pageIndex);
    return upscaledUrl ?? url;
  });
</script>

<img
  src={displayUrl}
  {alt}
  class="frame-image {className}"
  style:transform={transform || undefined}
  style:clip-path={clipPath || undefined}
  style={style || undefined}
  onload={onload}
  draggable="false"
/>

<style>
  .frame-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    /* GPU 加速 */
    image-rendering: -webkit-optimize-contrast;
    content-visibility: visible;
  }
</style>
