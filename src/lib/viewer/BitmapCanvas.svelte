<!--
  BitmapCanvas - GPU 加速图片渲染组件
  
  优先使用 ImageBitmap + Canvas 渲染（GPU 加速），
  fallback 到 img 标签
-->
<script lang="ts">
  interface Props {
    bitmap?: ImageBitmap | null;
    url?: string;
    alt?: string;
    className?: string;
    draggable?: boolean;
    onload?: (e: Event) => void;
  }
  
  let {
    bitmap = null,
    url = '',
    alt = 'Image',
    className = '',
    draggable = false,
    onload,
  }: Props = $props();
  
  let canvasRef: HTMLCanvasElement | null = $state(null);
  let useBitmap = $derived(bitmap !== null);
  
  // 当 canvas ref 或 bitmap 变化时重绘
  $effect(() => {
    if (canvasRef && bitmap) {
      // 使用 requestAnimationFrame 确保在下一帧绘制，避免闪烁
      requestAnimationFrame(() => drawBitmap());
    }
  });
  
  function drawBitmap() {
    if (!canvasRef || !bitmap) return;
    
    const ctx = canvasRef.getContext('2d', { 
      alpha: false,
      desynchronized: true, // 允许异步渲染，减少延迟
    });
    if (!ctx) return;
    
    // 绘制 bitmap（GPU 加速）
    // 注意：width/height 已经在模板中设置，这里不需要再设置
    ctx.drawImage(bitmap, 0, 0);
    
    // 触发 onload 回调
    onload?.(new Event('load'));
  }
  
  // img fallback 的 onload 处理
  function handleImgLoad(e: Event) {
    onload?.(e);
  }
</script>

{#if useBitmap && bitmap}
  <!-- Canvas 渲染模式（GPU 加速） -->
  <canvas
    bind:this={canvasRef}
    class="bitmap-canvas {className}"
    width={bitmap.width}
    height={bitmap.height}
    style="max-width: 100%; max-height: 100%; width: auto; height: auto; aspect-ratio: {bitmap.width}/{bitmap.height};"
  ></canvas>
{:else if url}
  <!-- Fallback: img 标签 -->
  <img 
    src={url} 
    alt={alt}
    class="bitmap-img {className}"
    draggable={draggable}
    onload={handleImgLoad}
  />
{/if}

<style>
  canvas {
    /* GPU 加速 */
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    /* 防止模糊 */
    image-rendering: auto;
  }
  
  img {
    /* GPU 加速 */
    will-change: transform;
    transform: translateZ(0);
    backface-visibility: hidden;
    image-rendering: auto;
    content-visibility: auto;
  }
</style>
