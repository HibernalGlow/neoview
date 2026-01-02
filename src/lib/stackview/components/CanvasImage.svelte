<!--
  CanvasImage - 使用 Canvas + ImageBitmap 的高性能图片渲染组件
  
  【完全兼容 FrameImage 接口】
  - 支持 transform、clipPath、style 等所有 CSS 属性
  - onload 回调模拟 img.onload 事件（包含 naturalWidth/naturalHeight）
  
  【性能优势】
  - 在 Worker 中预解码，不阻塞主线程
  - ImageBitmap 可直接绘制到 Canvas，无需重复解码
  - 复用 ImageBitmap 计算背景色，避免二次解码
  - 支持 GPU 加速
  
  【无闪烁切换】
  - 保持旧图片显示，直到新图片解码完成
  - 解码完成后立即替换，无灰屏
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { decodeImageInWorker } from '$lib/workers/imageDecoderManager';
  import { imagePool } from '../stores/imagePool.svelte';
  import { computeBackgroundColorFromBitmap } from '$lib/utils/autoBackground';
  import { stackImageLoader } from '../utils/stackImageLoader';
  
  interface Props {
    /** 页面索引（用于超分图替换） */
    pageIndex: number;
    /** Blob URL 或普通 URL */
    url: string;
    /** 可选的 Blob 对象（如果有，优先使用，避免重新 fetch） */
    blob?: Blob;
    /** alt 文本 */
    alt?: string;
    /** CSS transform */
    transform?: string;
    /** CSS clip-path */
    clipPath?: string;
    /** 额外的样式 */
    style?: string;
    /** 额外的 CSS 类 */
    class?: string;
    /** 加载完成回调（模拟 img.onload，e.target 包含 naturalWidth/naturalHeight） */
    onload?: (e: Event) => void;
  }
  
  let {
    pageIndex,
    url,
    blob,
    alt = '',
    transform = '',
    clipPath = '',
    style = '',
    class: className = '',
    onload,
  }: Props = $props();
  
  let canvas: HTMLCanvasElement;
  let currentBitmap: ImageBitmap | null = null;
  let hasError = $state(false);
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  // 记录当前显示的 URL
  let renderedUrl = '';
  // 当前正在加载的 URL（用于取消过时的加载）
  let pendingUrl = '';
  
  // 获取显示 URL（优先超分图，响应式）
  let displayUrl = $derived.by(() => {
    const version = imagePool.version;
    const hasUpscaled = imagePool.hasUpscaled(pageIndex);
    return hasUpscaled 
      ? imagePool.getUpscaledUrl(pageIndex) ?? url 
      : url;
  });
  
  // 当 displayUrl 或 Blob 变化时重新加载
  $effect(() => {
    const currentUrl = displayUrl;
    const currentBlob = blob;
    // 只有 URL 真正变化时才加载
    if (currentUrl && currentUrl !== renderedUrl) {
      loadAndRender(currentUrl, currentBlob);
    }
  });
  
  async function loadAndRender(imageUrl: string, imageBlob?: Blob) {
    if (!canvas || !imageUrl) return;
    
    // 标记正在加载的 URL
    pendingUrl = imageUrl;
    hasError = false;
    
    try {
      let blobToUse = imageBlob;
      
      // 如果没有 Blob，从 URL fetch
      if (!blobToUse && imageUrl) {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        blobToUse = await response.blob();
      }
      
      // 检查是否已被新的加载请求取代
      if (pendingUrl !== imageUrl) {
        return; // 放弃过时的加载
      }
      
      if (!blobToUse) {
        throw new Error('No image data available');
      }
      
      // 在 Worker 中解码
      const result = await decodeImageInWorker(blobToUse);
      
      // 再次检查是否已被取代
      if (pendingUrl !== imageUrl) {
        result.bitmap.close(); // 释放不需要的 bitmap
        return;
      }
      
      // 【关键】先设置 canvas 尺寸和绘制，再释放旧 bitmap
      // 这样可以避免闪烁
      canvas.width = result.width;
      canvas.height = result.height;
      
      const ctx = canvas.getContext('2d', { 
        alpha: false,
        desynchronized: true
      });
      
      if (ctx) {
        ctx.drawImage(result.bitmap, 0, 0);
      }
      
      // 【性能优化】复用 ImageBitmap 计算背景色，避免二次解码
      const bgColor = computeBackgroundColorFromBitmap(result.bitmap, imageUrl);
      if (bgColor) {
        // 缓存背景色到 stackImageLoader
        stackImageLoader.cacheBackgroundColor(pageIndex, bgColor);
      }
      
      // 绘制完成后再释放旧的 bitmap
      if (currentBitmap) {
        currentBitmap.close();
      }
      currentBitmap = result.bitmap;
      naturalWidth = result.width;
      naturalHeight = result.height;
      renderedUrl = imageUrl;
      
      // 模拟 img.onload 事件
      if (onload) {
        const fakeEvent = new Event('load');
        Object.defineProperty(fakeEvent, 'target', {
          value: {
            naturalWidth: result.width,
            naturalHeight: result.height,
            width: result.width,
            height: result.height,
          },
          writable: false,
        });
        onload(fakeEvent);
      }
      
    } catch (error) {
      // 只有当前加载才显示错误
      if (pendingUrl === imageUrl) {
        console.error('CanvasImage 加载失败:', error);
        hasError = true;
      }
    }
  }
  
  onDestroy(() => {
    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }
  });
</script>

<canvas
  bind:this={canvas}
  class="canvas-image {className}"
  class:error={hasError}
  style:transform={transform || undefined}
  style:clip-path={clipPath || undefined}
  style={style || undefined}
  aria-label={alt}
  draggable="false"
></canvas>

<style>
  .canvas-image {
    /* 与 FrameImage 保持一致的默认样式 */
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
  }
  
  .canvas-image.error {
    opacity: 0.3;
  }
</style>
