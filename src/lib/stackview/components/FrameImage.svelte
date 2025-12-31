<!--
  FrameImage - 统一的图片渲染组件
  所有 Layer（单页/双页/全景）都用它
  自动处理：
  - 超分图替换
  - GPU 加速
  - 样式统一
  - 根据 loadModeStore 切换 img/canvas 渲染
  - 颜色滤镜应用（支持仅黑白模式）
-->
<script lang="ts">
  import { imagePool } from '../stores/imagePool.svelte';
  import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
  import { stackImageLoader } from '../utils/stackImageLoader';
  import { filterStore, type FilterSettings } from '$lib/stores/filterStore.svelte';
  import { generateCssFilter } from '$lib/utils/colorFilters';
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
  
  // 滤镜设置
  let filterSettings = $state<FilterSettings | null>(null);
  // 当前图像是否为黑白
  let isBlackAndWhite = $state(false);
  // 上一次检测的 URL
  let lastCheckedUrl = '';
  
  $effect(() => {
    const unsubscribe = filterStore.subscribe((s) => {
      filterSettings = s;
    });
    return unsubscribe;
  });
  
  // 检测图像是否为黑白（仅在启用「仅黑白」时）
  $effect(() => {
    const checkUrl = displayUrl;
    if (filterSettings?.colorizeEnabled && filterSettings?.onlyBlackAndWhite && checkUrl !== lastCheckedUrl) {
      lastCheckedUrl = checkUrl;
      filterStore.checkIsBlackAndWhite(checkUrl).then((result) => {
        isBlackAndWhite = result;
      });
    }
  });
  
  // 计算实际的滤镜 CSS
  let filterCss = $derived.by(() => {
    if (!filterSettings) return '';
    
    // 如果启用「仅黑白」且当前图像不是黑白，则跳过上色滤镜
    if (filterSettings.colorizeEnabled && filterSettings.onlyBlackAndWhite && !isBlackAndWhite) {
      // 创建一个临时设置，禁用上色
      const tempSettings = { ...filterSettings, colorizeEnabled: false };
      return generateCssFilter(tempSettings);
    }
    
    return filterStore.getCssFilter();
  });
  
  // 获取显示 URL（优先级：超分图 > 预解码 > 原始 URL）
  // 【翻页性能优化】优先使用预解码的 URL
  let displayUrl = $derived.by(() => {
    // 依赖版本号以建立响应式关系
    const _version = imagePool.version;
    
    // 1. 检查超分图
    const hasUpscaled = imagePool.hasUpscaled(pageIndex);
    if (hasUpscaled) {
      return imagePool.getUpscaledUrl(pageIndex) ?? url;
    }
    
    // 2. 检查预解码缓存（关键优化点）
    const preDecodedUrl = stackImageLoader.getPreDecodedUrl(pageIndex);
    if (preDecodedUrl) {
      return preDecodedUrl;
    }
    
    // 3. 使用原始 URL
    return url;
  });
  
  // 是否使用 Canvas 渲染
  let useCanvas = $derived(loadModeStore.isCanvasMode);
  
  // 合并样式（包含滤镜）
  let combinedStyle = $derived.by(() => {
    const parts: string[] = [];
    if (style) parts.push(style);
    if (filterCss) parts.push(`filter: ${filterCss}`);
    return parts.join('; ');
  });
</script>

{#if useCanvas}
  <!-- Canvas 渲染模式：Worker 预解码，性能更好 -->
  <CanvasImage
    {pageIndex}
    url={displayUrl}
    {alt}
    {transform}
    {clipPath}
    style={combinedStyle}
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
    style:filter={filterCss || undefined}
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
    /* 【修复内存泄露】移除 will-change，仅保留基本 GPU 加速 */
    transform: translateZ(0);
    backface-visibility: hidden;
    image-rendering: -webkit-optimize-contrast;
    content-visibility: visible;
  }
</style>
