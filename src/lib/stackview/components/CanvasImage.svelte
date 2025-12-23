<!--
  CanvasImage - 使用 Canvas + ImageBitmap 的高性能图片渲染组件
  
  【完全兼容 FrameImage 接口】
  - 支持 transform、clipPath、style 等所有 CSS 属性
  - onload 回调模拟 img.onload 事件（包含 naturalWidth/naturalHeight）
  
  【性能优势】
  - 在 Worker 中预解码，不阻塞主线程
  - ImageBitmap 可直接绘制到 Canvas，无需重复解码
  - 支持 GPU 加速
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { decodeImageInWorker } from '$lib/workers/imageDecoderManager';
  import { imagePool } from '../stores/imagePool.svelte';
  
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
  let isLoading = $state(true);
  let hasError = $state(false);
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  // 记录当前加载的 URL，避免重复加载
  let loadedUrl = '';
  
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
    if (currentUrl !== loadedUrl || currentBlob) {
      loadAndRender(currentUrl, currentBlob);
    }
  });
  
  async function loadAndRender(imageUrl: string, imageBlob?: Blob) {
    if (!canvas || !imageUrl) return;
    
    isLoading = true;
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
      
      if (!blobToUse) {
        throw new Error('No image data available');
      }
      
      // 在 Worker 中解码
      const result = await decodeImageInWorker(blobToUse);
      
      // 释放旧的 bitmap
      if (currentBitmap) {
        currentBitmap.close();
      }
      currentBitmap = result.bitmap;
      naturalWidth = result.width;
      naturalHeight = result.height;
      loadedUrl = imageUrl;
      
      // 设置 canvas 尺寸（内部分辨率）
      canvas.width = result.width;
      canvas.height = result.height;
      
      // 绘制到 canvas
      const ctx = canvas.getContext('2d', { 
        alpha: false,  // 不需要透明度，提升性能
        desynchronized: true  // 异步渲染，减少延迟
      });
      
      if (ctx) {
        ctx.drawImage(result.bitmap, 0, 0);
      }
      
      isLoading = false;
      
      // 模拟 img.onload 事件
      if (onload) {
        // 创建一个模拟的事件对象，target 包含 naturalWidth/naturalHeight
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
      console.error('CanvasImage 加载失败:', error);
      hasError = true;
      isLoading = false;
    }
  }
  
  onDestroy(() => {
    // 释放 ImageBitmap
    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
    }
  });
</script>

<canvas
  bind:this={canvas}
  class="canvas-image {className}"
  class:loading={isLoading}
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
    /* GPU 加速 */
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    image-rendering: -webkit-optimize-contrast;
    content-visibility: visible;
  }
  
  .canvas-image.loading {
    opacity: 0.7;
  }
  
  .canvas-image.error {
    opacity: 0.3;
  }
</style>
