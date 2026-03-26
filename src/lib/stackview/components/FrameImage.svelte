<!--
  FrameImage - 统一的图片渲染组件
  所有 Layer（单页/双页/全景）都用它
  自动处理：
  - 超分图替换
  - GPU 加速
  - 样式统一
  - 根据 loadModeStore 切换 img/canvas 渲染
  - 颜色滤镜应用（支持仅黑白模式）
  - 图像裁剪（四边百分比裁剪 + 自动去黑边/白边）
-->
<script lang="ts">
  import { imagePool } from '../stores/imagePool.svelte';
  import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
  import { bookStore } from '$lib/stores/book.svelte';
  import { stackImageLoader } from '../utils/stackImageLoader';
  import { filterStore, type FilterSettings } from '$lib/stores/filterStore.svelte';
  import { generateCssFilter } from '$lib/utils/colorFilters';
  import { imageTrimStore, trimToClipPath, mergeClipPaths, type ImageTrimSettings } from '$lib/stores/imageTrimStore.svelte';
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
  // 图像裁剪设置
  let trimSettings = $state<ImageTrimSettings | null>(null);
  
  $effect(() => {
    const unsubscribe = filterStore.subscribe((s) => {
      filterSettings = s;
    });
    return unsubscribe;
  });
  
  // 订阅裁剪设置
  $effect(() => {
    const unsubscribe = imageTrimStore.subscribe((s) => {
      trimSettings = s;
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
  
  // ==================== 【性能优化 #4】ViewSource 渲染延迟 ====================
  // 快速翻页时延迟渲染图片，减少主线程解码压力
  let settledUrl = $state('');
  let settleTimer = 0;

  $effect(() => {
    // 依赖 displayUrl
    const targetUrl = displayUrl;
    
    // 如果已经在渲染同个 URL，直接跳过
    if (settledUrl === targetUrl) return;

    // 清理旧定时器
    if (settleTimer) clearTimeout(settleTimer);

    // 如果还没有 settledUrl（第一次加载），或者是在快速翻页
    // 使用 60ms 的延迟，这个延迟符合 NeeView 的表现，且对视觉影响极小
    settleTimer = window.setTimeout(() => {
      settledUrl = targetUrl;
    }, 60);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
    };
  });

  // 【性能优化 #5】Mini-Thumbnail (BlurHash) 占位符
  let thumbnailUrl = $derived(bookStore.currentBook?.pages[pageIndex]?.thumbnail || '');
  let showThumbnail = $state(true);

  // 当 Full Image 加载完成后隐藏缩略图
  function handleMainImageLoad(e: Event) {
    showThumbnail = false;
    if (onload) onload(e);
  }

  // 合成最终 clip-path（裁剪 + 页面分割）
  let effectiveClipPath = $derived.by(() => {
    const trimClip = trimSettings ? trimToClipPath(trimSettings) : '';
    return mergeClipPaths(trimClip, clipPath);
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
  <div class="image-container {className}" style:background-image={showThumbnail && thumbnailUrl ? `url(${thumbnailUrl})` : 'none'}>
    <CanvasImage
      {pageIndex}
      url={settledUrl}
      {alt}
      {transform}
      clipPath={effectiveClipPath}
      style={combinedStyle}
      class={effectiveClipPath && effectiveClipPath !== 'none' ? 'is-split' : ''}
      onload={handleMainImageLoad}
    />
  </div>
{:else}
  <!-- img 渲染模式：传统方式 -->
  <div class="image-container {className}" style:background-image={showThumbnail && thumbnailUrl ? "url(" + thumbnailUrl + ")" : 'none'}>
    <img
      src={settledUrl}
      {alt}
      class="frame-image"
      class:is-split={!!effectiveClipPath && effectiveClipPath !== 'none'}
      class:loading={showThumbnail}
      style:transform={transform || undefined}
      style:clip-path={effectiveClipPath && effectiveClipPath !== 'none' ? effectiveClipPath : undefined}
      style:filter={filterCss || undefined}
      style={style || undefined}
      onload={handleMainImageLoad}
      draggable="false"
    />
  </div>
{/if}

<style>
  .image-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-size: cover;
    background-position: center;
    /* 缩略图模糊效果，模拟 BlurHash */
    backdrop-filter: blur(10px);
    overflow: hidden;
  }

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
    /* 使用高质量渲染，避免锯齿 */
    image-rendering: auto;
    content-visibility: visible;
    /* 主图加载前透明 */
    transition: opacity 0.2s ease-in-out;
  }

  .frame-image.loading {
    opacity: 0;
  }

  .frame-image.is-split {
    max-width: 200%;
    width: 200%;
  }
</style>
