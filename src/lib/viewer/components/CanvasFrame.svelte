<!--
  CanvasFrame - 使用 Canvas 显示预渲染的 ImageBitmap
  
  优点：
  - 预渲染后切换无延迟
  - 支持 OffscreenCanvas 后台缩放
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { preRenderManager } from '../utils/preRenderManager';
  
  // Props
  // 【性能优化】transformOrigin 通过 CSS 变量由 HoverLayer 直接操作 DOM
  let {
    imageUrl = '',
    imageBlob,          // 直接传入 Blob，跳过 fetch
    targetWidth = 0,
    targetHeight = 0,
    scale = 1,
    rotation = 0,
    opacity = 1,
    zIndex = 0,
    onReady,
  }: {
    imageUrl?: string;
    imageBlob?: Blob | null;
    targetWidth?: number;
    targetHeight?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    zIndex?: number;
    onReady?: () => void;
  } = $props();
  
  let canvasRef: HTMLCanvasElement | null = $state(null);
  let currentBitmap: ImageBitmap | null = $state(null);
  let isReady = $state(false);
  
  // 渲染 bitmap 到 canvas
  function renderBitmap(bitmap: ImageBitmap) {
    if (!canvasRef) return;
    
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    
    // 设置 canvas 实际像素尺寸
    canvasRef.width = bitmap.width;
    canvasRef.height = bitmap.height;
    
    // 设置 CSS 显示尺寸（除以 dpr 得到正确的显示尺寸）
    canvasRef.style.width = `${bitmap.width / dpr}px`;
    canvasRef.style.height = `${bitmap.height / dpr}px`;
    
    // 清空并绘制
    ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    
    isReady = true;
    onReady?.();
  }
  
  // 监听 imageUrl/imageBlob 变化，触发预渲染
  $effect(() => {
    if ((!imageUrl && !imageBlob) || !targetWidth || !targetHeight) return;
    
    isReady = false;
    
    // 优先使用 Blob（跳过网络请求）
    if (imageBlob) {
      renderFromBlob(imageBlob);
      return;
    }
    
    // 尝试使用 OffscreenCanvas 预渲染
    if (preRenderManager.supported) {
      preRenderManager.preRender(imageUrl, targetWidth, targetHeight)
        .then((bitmap) => {
          if (bitmap) {
            currentBitmap?.close();
            currentBitmap = bitmap;
            renderBitmap(bitmap);
          }
        })
        .catch((err) => {
          console.warn('PreRender failed, fallback to img decode:', err);
          fallbackLoad();
        });
    } else {
      fallbackLoad();
    }
  });
  
  // 从 Blob 直接渲染（最快路径）
  async function renderFromBlob(blob: Blob) {
    try {
      const imageBitmap = await createImageBitmap(blob);
      
      // 考虑设备像素比，避免高 DPI 屏幕模糊
      const dpr = window.devicePixelRatio || 1;
      
      // 计算缩放（目标尺寸 * dpr）
      const scaleRatio = Math.min(
        (targetWidth * dpr) / imageBitmap.width,
        (targetHeight * dpr) / imageBitmap.height
      );
      const scaledWidth = Math.round(imageBitmap.width * scaleRatio);
      const scaledHeight = Math.round(imageBitmap.height * scaleRatio);
      
      // 创建缩放后的 bitmap
      const canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(imageBitmap, 0, 0, scaledWidth, scaledHeight);
      }
      imageBitmap.close();
      
      const resultBitmap = await createImageBitmap(canvas);
      currentBitmap?.close();
      currentBitmap = resultBitmap;
      renderBitmap(resultBitmap);
    } catch (err) {
      console.error('Blob render failed:', err);
    }
  }
  
  // 降级：使用普通 Image 加载
  async function fallbackLoad() {
    if (!imageUrl) return;
    
    const img = new Image();
    img.src = imageUrl;
    
    try {
      await img.decode();
      const bitmap = await createImageBitmap(img);
      currentBitmap?.close();
      currentBitmap = bitmap;
      renderBitmap(bitmap);
    } catch (err) {
      console.error('Fallback load failed:', err);
    }
  }
  
  // 清理
  onDestroy(() => {
    currentBitmap?.close();
  });
  
  // 计算 transform
  let transformStyle = $derived.by(() => {
    const parts: string[] = [];
    if (scale !== 1) parts.push(`scale(${scale})`);
    if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
    return parts.length > 0 ? parts.join(' ') : 'none';
  });
</script>

<div 
  class="canvas-frame frame-layer"
  style:z-index={zIndex}
  style:opacity={opacity}
  style:transform={transformStyle}
>
  <canvas 
    bind:this={canvasRef}
    class="frame-canvas"
    class:ready={isReady}
  ></canvas>
</div>

<style>
  .canvas-frame {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    /* 【性能优化】使用 CSS 变量控制 transform-origin */
    transform-origin: var(--view-x, 50%) var(--view-y, 50%);
  }
  
  .frame-canvas {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  
  .frame-canvas.ready {
    opacity: 1;
  }
</style>
