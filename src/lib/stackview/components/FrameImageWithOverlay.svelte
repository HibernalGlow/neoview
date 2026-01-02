<!--
  FrameImageWithOverlay - 带翻译叠加层的图片组件
  
  用于包装 FrameImage 和 TranslationOverlay，使翻译层紧密跟随图片
-->
<script lang="ts">
  import FrameImage from './FrameImage.svelte';
  import TranslationOverlay from '../layers/TranslationOverlay.svelte';
  import { translationStore } from '$lib/stores/translation/translationStore.svelte';
  
  interface Props {
    pageIndex: number;
    url: string;
    alt?: string;
    transform?: string;
    clipPath?: string;
    style?: string;
    class?: string;
    /** 图片原始宽度（用于叠加层） */
    imageWidth?: number;
    /** 图片原始高度（用于叠加层） */
    imageHeight?: number;
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
    imageWidth = 0,
    imageHeight = 0,
    onload,
  }: Props = $props();
  
  // 本地图片尺寸（从 onload 获取）
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  
  // 优先使用传入的尺寸，其次使用加载后的尺寸
  let effectiveWidth = $derived(imageWidth > 0 ? imageWidth : naturalWidth);
  let effectiveHeight = $derived(imageHeight > 0 ? imageHeight : naturalHeight);
  
  // 是否显示叠加层
  let showOverlay = $derived.by(() => {
    void translationStore.version;
    const settings = translationStore.overlaySettings;
    return settings.enabled && effectiveWidth > 0 && effectiveHeight > 0;
  });
  
  function handleLoad(e: Event) {
    const target = e.target as HTMLImageElement | HTMLCanvasElement;
    if (target) {
      // 获取尺寸
      if ('naturalWidth' in target) {
        naturalWidth = target.naturalWidth;
        naturalHeight = target.naturalHeight;
      } else if ('width' in target) {
        naturalWidth = target.width;
        naturalHeight = target.height;
      }
    }
    onload?.(e);
  }
</script>

<div class="frame-image-wrapper {className}">
  <FrameImage
    {pageIndex}
    {url}
    {alt}
    {transform}
    {clipPath}
    {style}
    onload={handleLoad}
  />
  
  {#if showOverlay}
    <TranslationOverlay
      {pageIndex}
      imageWidth={effectiveWidth}
      imageHeight={effectiveHeight}
    />
  {/if}
</div>

<style>
  .frame-image-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  /* 确保叠加层尺寸正确 */
  .frame-image-wrapper :global(.translation-overlay) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
