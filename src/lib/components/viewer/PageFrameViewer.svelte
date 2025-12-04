<script lang="ts">
  /**
   * PageFrameViewer - 基于新架构的页面帧查看器
   * 
   * 展示如何使用 bookStore2 和新的页面系统
   * 支持 img/canvas 两种渲染模式
   */
  
  import { onMount, onDestroy } from 'svelte';
  import { bookStore2, currentPageInfo, viewTransformCSS, canNavigate } from '../../stores/bookStore2';
  import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
  import type { VirtualPage } from '../../core/types';
  
  // Props
  export let containerClass: string = '';
  
  // 本地状态
  let containerElement: HTMLDivElement;
  let imageElement: HTMLImageElement;
  let canvasElement: HTMLCanvasElement;
  let currentImageUrl: string | null = null;
  let isImageLoading = false;
  let imageWidth = 0;
  let imageHeight = 0;
  
  // 响应式获取渲染模式
  $: isCanvasMode = loadModeStore.isCanvasMode;
  
  // 响应式订阅
  $: state = $bookStore2;
  $: pageInfo = $currentPageInfo;
  $: transformCSS = $viewTransformCSS;
  $: navigation = $canNavigate;
  
  // 监听当前帧变化，加载图像
  $: if (state.currentFrame && state.currentFrame.elements.length > 0) {
    loadCurrentImage();
  }
  
  // 容器尺寸监听
  let resizeObserver: ResizeObserver | null = null;
  
  onMount(() => {
    if (containerElement) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          bookStore2.setContainerSize(width, height);
        }
      });
      resizeObserver.observe(containerElement);
    }
  });
  
  onDestroy(() => {
    resizeObserver?.disconnect();
    if (currentImageUrl) {
      URL.revokeObjectURL(currentImageUrl);
    }
    bookStore2.destroy();
  });
  
  // 加载当前图像
  async function loadCurrentImage() {
    if (!state.currentFrame) return;
    
    const element = state.currentFrame.elements[0];
    if (!element || element.isDummy) return;
    
    isImageLoading = true;
    
    try {
      // 先尝试从缓存获取
      let blob = bookStore2.getImageCache(element.virtualPage.virtualIndex);
      
      // 如果没有缓存，请求加载
      if (!blob) {
        blob = await bookStore2.requestImage(element.virtualPage.virtualIndex);
      }
      
      if (blob) {
        // 释放旧的 URL
        if (currentImageUrl) {
          URL.revokeObjectURL(currentImageUrl);
        }
        currentImageUrl = URL.createObjectURL(blob);
        
        // 使用新 Image 对象获取尺寸
        const img = new Image();
        img.onload = () => {
          imageWidth = img.naturalWidth;
          imageHeight = img.naturalHeight;
          bookStore2.setContentSize(imageWidth, imageHeight);
          bookStore2.fitToContainer();
          
          // 如果是 canvas 模式，渲染到 canvas
          if (isCanvasMode && canvasElement) {
            renderToCanvas(img);
          }
        };
        img.src = currentImageUrl;
      }
    } catch (error) {
      console.error('Failed to load image:', error);
    } finally {
      isImageLoading = false;
    }
  }
  
  // 渲染到 canvas
  function renderToCanvas(img: HTMLImageElement) {
    const canvas = canvasElement;
    if (!canvas) return;
    
    canvasElement.width = img.naturalWidth;
    canvasElement.height = img.naturalHeight;
    
    const ctx = canvasElement.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0);
    }
  }
  
  // 当渲染模式切换时，重新渲染
  $: if (isCanvasMode && currentImageUrl && canvasElement && imageWidth > 0) {
    const img = new Image();
    img.onload = () => renderToCanvas(img);
    img.src = currentImageUrl;
  }
  
  // 键盘导航
  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowLeft':
        if (state.readOrder === 'rtl') {
          bookStore2.nextPage();
        } else {
          bookStore2.prevPage();
        }
        break;
      case 'ArrowRight':
        if (state.readOrder === 'rtl') {
          bookStore2.prevPage();
        } else {
          bookStore2.nextPage();
        }
        break;
      case 'Home':
        bookStore2.goToFirst();
        break;
      case 'End':
        bookStore2.goToLast();
        break;
      case 'PageUp':
        bookStore2.prevFolder();
        break;
      case 'PageDown':
        bookStore2.nextFolder();
        break;
      case '+':
      case '=':
        bookStore2.zoom(1);
        break;
      case '-':
        bookStore2.zoom(-1);
        break;
      case '0':
        bookStore2.resetZoom();
        break;
      case 'r':
        bookStore2.rotate(90);
        break;
    }
  }
  
  // 鼠标滚轮缩放
  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    
    if (state.viewState.mode === 'panorama') {
      bookStore2.panoramaScroll(event.deltaY);
    } else {
      const delta = event.deltaY > 0 ? -1 : 1;
      bookStore2.zoom(delta, event.clientX, event.clientY);
    }
  }
  
  // 拖拽
  let isDragging = false;
  
  function handleMouseDown(event: MouseEvent) {
    if (event.button === 0) {
      isDragging = true;
      bookStore2.startDrag(event.clientX, event.clientY);
    }
  }
  
  function handleMouseMove(event: MouseEvent) {
    if (isDragging) {
      bookStore2.drag(event.clientX, event.clientY);
    }
    
    if (state.viewState.mode === 'loupe') {
      bookStore2.loupeMove(event.clientX, event.clientY);
    }
  }
  
  function handleMouseUp() {
    if (isDragging) {
      isDragging = false;
      bookStore2.endDrag();
    }
  }
  
  // 点击翻页
  function handleClick(event: MouseEvent) {
    if (isDragging) return;
    
    const rect = containerElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;
    
    // 左侧 1/3 区域
    if (x < width / 3) {
      if (state.readOrder === 'rtl') {
        bookStore2.nextPage();
      } else {
        bookStore2.prevPage();
      }
    }
    // 右侧 1/3 区域
    else if (x > width * 2 / 3) {
      if (state.readOrder === 'rtl') {
        bookStore2.prevPage();
      } else {
        bookStore2.nextPage();
      }
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  bind:this={containerElement}
  class="page-frame-viewer {containerClass}"
  on:wheel={handleWheel}
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseUp}
  on:click={handleClick}
  role="img"
  tabindex="0"
>
  {#if state.isOpen}
    <div class="content-wrapper" style={transformCSS}>
      {#if currentImageUrl}
        {#if isCanvasMode}
          <canvas
            bind:this={canvasElement}
            width={imageWidth}
            height={imageHeight}
            class="page-image"
            class:loading={isImageLoading}
            role="img"
            aria-label="Page {state.currentIndex + 1}"
          ></canvas>
        {:else}
          <img
            bind:this={imageElement}
            src={currentImageUrl}
            alt="Page {state.currentIndex + 1}"
            class="page-image"
            class:loading={isImageLoading}
            draggable="false"
          />
        {/if}
      {:else if isImageLoading}
        <div class="loading-indicator">
          <span>Loading...</span>
        </div>
      {/if}
    </div>
    
    <!-- 页面信息 -->
    {#if pageInfo}
      <div class="page-info">
        {pageInfo.displayText}
      </div>
    {/if}
    
    <!-- 导航按钮 -->
    <div class="navigation">
      <button
        class="nav-button prev"
        disabled={!navigation.canPrev}
        on:click|stopPropagation={() => bookStore2.prevPage()}
      >
        ←
      </button>
      <button
        class="nav-button next"
        disabled={!navigation.canNext}
        on:click|stopPropagation={() => bookStore2.nextPage()}
      >
        →
      </button>
    </div>
  {:else}
    <div class="empty-state">
      <p>No book open</p>
    </div>
  {/if}
</div>

<style>
  .page-frame-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #1a1a1a;
    user-select: none;
    outline: none;
  }
  
  .content-wrapper {
    position: absolute;
    top: 50%;
    left: 50%;
    transform-origin: center center;
    will-change: transform;
  }
  
  .page-image {
    display: block;
    max-width: none;
    max-height: none;
    transform: translate(-50%, -50%);
    transition: opacity 0.2s ease;
  }
  
  .page-image.loading {
    opacity: 0.5;
  }
  
  .loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 200px;
    height: 200px;
    color: #888;
    font-size: 14px;
    transform: translate(-50%, -50%);
  }
  
  .page-info {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 12px;
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 12px;
    border-radius: 4px;
    pointer-events: none;
  }
  
  .navigation {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    pointer-events: none;
  }
  
  .nav-button {
    pointer-events: auto;
    padding: 12px 16px;
    background-color: rgba(0, 0, 0, 0.4);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 20px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  
  .page-frame-viewer:hover .nav-button {
    opacity: 1;
  }
  
  .nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .nav-button:hover:not(:disabled) {
    background-color: rgba(0, 0, 0, 0.6);
  }
  
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: #666;
    font-size: 16px;
  }
</style>
