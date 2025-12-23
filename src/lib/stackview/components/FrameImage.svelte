<!--
  FrameImage - 统一的图片渲染组件
  所有 Layer（单页/双页/全景）都用它
  自动处理：
  - 超分图替换
  - GPU 加速
  - 样式统一
  - 根据 loadModeStore 切换 img/canvas 渲染
-->
<script lang="ts">
  import { imagePool } from '../stores/imagePool.svelte';
  import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
  import CanvasImage from './CanvasImage.svelte';
  
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
    const version = imagePool.version;
    // 使用 hasUpscaled 正确判断是否有超分图
    const hasUpscaled = imagePool.hasUpscaled(pageIndex);
    const result = hasUpscaled 
      ? imagePool.getUpscaledUrl(pageIndex) ?? url 
      : url;
    return result;
  });
  
  // 是否使用 Canvas 渲染
  let useCanvas = $derived(loadModeStore.isCanvasMode);
</script>

{#if useCanvas}
  <!-- Canvas 渲染模式：Worker 预解码，性能更好 -->
  <CanvasImage
    {pageIndex}
    url={displayUrl}
    {alt}
    {transform}
    {clipPath}
    {style}
    class={className}
    {onload}
  />
{:else}
  <!-- img 渲染模式：传统方式 -->
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
{/if}

<style>
  .frame-image {
    /* 默认尺寸限制，可被父组件通过 style prop 覆盖 */
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
    /* 【性能优化】GPU 加速 */
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    image-rendering: -webkit-optimize-contrast;
    content-visibility: visible;
  }
</style>
