<!--
  ViewerJSWrapper - ViewerJS 封装组件
  
  提供基于 ViewerJS 的图片查看功能：
  - 缩放 (滚轮/双指捏合)
  - 平移 (拖动)
  - 旋转
  - 双击切换原始尺寸
-->
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import Viewer from 'viewerjs';
  import 'viewerjs/dist/viewer.css';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  let {
    imageUrl = '',
    scale = 1,
    rotation = 0,
    zoomOnWheel = true,
    zoomOnTouch = true,
    movable = true,
    rotatable = false,
    keyboard = false,
    toolbar = false,
    navbar = false,
    title = false,
    inline = true,
    transition = true,
    minZoomRatio = 0.1,
    maxZoomRatio = 10,
    initialCoverage = 0.95,
    onReady,
    onZoom,
    onMove,
    onRotate,
    onView,
  }: {
    imageUrl?: string;
    scale?: number;
    rotation?: number;
    zoomOnWheel?: boolean;
    zoomOnTouch?: boolean;
    movable?: boolean;
    rotatable?: boolean;
    keyboard?: boolean;
    toolbar?: boolean;
    navbar?: boolean;
    title?: boolean;
    inline?: boolean;
    transition?: boolean;
    minZoomRatio?: number;
    maxZoomRatio?: number;
    initialCoverage?: number;
    onReady?: () => void;
    onZoom?: (ratio: number) => void;
    onMove?: (x: number, y: number) => void;
    onRotate?: (degree: number) => void;
    onView?: () => void;
  } = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let containerRef: HTMLDivElement | null = $state(null);
  let imgRef: HTMLImageElement | null = $state(null);
  let viewer: Viewer | null = null;
  let isReady = $state(false);
  let currentRatio = $state(1);
  
  // ============================================================================
  // ViewerJS 初始化
  // ============================================================================
  
  function initViewer() {
    if (!imgRef || viewer) return;
    
    viewer = new Viewer(imgRef, {
      inline,
      button: false,
      navbar: navbar,
      title: title,
      toolbar: toolbar,
      tooltip: false,
      movable,
      rotatable,
      scalable: true,
      zoomable: true,
      zoomOnTouch,
      zoomOnWheel,
      slideOnTouch: false,
      toggleOnDblclick: true,
      transition,
      keyboard,
      fullscreen: false,
      loading: false,
      loop: false,
      minZoomRatio,
      maxZoomRatio,
      initialCoverage,
      backdrop: false,
      container: containerRef,
      
      ready: () => {
        isReady = true;
        onReady?.();
        
        // 应用初始缩放和旋转
        if (viewer) {
          if (scale !== 1) {
            viewer.zoomTo(scale);
          }
          if (rotation !== 0) {
            viewer.rotateTo(rotation);
          }
        }
      },
      
      zoom: (e: CustomEvent) => {
        currentRatio = e.detail.ratio;
        onZoom?.(e.detail.ratio);
      },
      
      move: (e: CustomEvent) => {
        onMove?.(e.detail.x, e.detail.y);
      },
      
      rotate: (e: CustomEvent) => {
        onRotate?.(e.detail.degree);
      },
      
      view: () => {
        onView?.();
      },
    });
    
    // inline 模式需要手动显示
    if (inline) {
      viewer.show();
    }
  }
  
  function destroyViewer() {
    if (viewer) {
      viewer.destroy();
      viewer = null;
      isReady = false;
    }
  }
  
  // ============================================================================
  // Effects
  // ============================================================================
  
  // 初始化
  onMount(() => {
    // 延迟初始化确保 DOM 就绪
    tick().then(() => {
      if (imageUrl && imgRef) {
        initViewer();
      }
    });
  });
  
  // 清理
  onDestroy(() => {
    destroyViewer();
  });
  
  // 图片 URL 变化时更新
  $effect(() => {
    const url = imageUrl;
    
    if (!url) {
      destroyViewer();
      return;
    }
    
    if (viewer && isReady) {
      // 如果 viewer 已存在，更新图片
      viewer.update();
    } else if (imgRef && !viewer) {
      // 首次创建 viewer
      tick().then(() => initViewer());
    }
  });
  
  // 缩放变化时应用
  $effect(() => {
    if (viewer && isReady && Math.abs(scale - currentRatio) > 0.01) {
      viewer.zoomTo(scale);
    }
  });
  
  // 旋转变化时应用
  $effect(() => {
    if (viewer && isReady) {
      viewer.rotateTo(rotation);
    }
  });
  
  // ============================================================================
  // 导出方法
  // ============================================================================
  
  function zoom(ratio: number, showTooltip = false) {
    viewer?.zoom(ratio, showTooltip);
  }
  
  function zoomTo(ratio: number, showTooltip = false) {
    viewer?.zoomTo(ratio, showTooltip);
  }
  
  function rotateTo(degree: number) {
    viewer?.rotateTo(degree);
  }
  
  function rotate(degree: number) {
    viewer?.rotate(degree);
  }
  
  function move(x: number, y?: number) {
    viewer?.move(x, y);
  }
  
  function moveTo(x: number, y?: number) {
    viewer?.moveTo(x, y);
  }
  
  function reset() {
    viewer?.reset();
  }
  
  function toggle() {
    viewer?.toggle();
  }
  
  export {
    zoom,
    zoomTo,
    rotateTo,
    rotate,
    move,
    moveTo,
    reset,
    toggle,
    isReady,
  };
</script>

<div class="viewerjs-wrapper" bind:this={containerRef}>
  {#if imageUrl}
    <img
      bind:this={imgRef}
      src={imageUrl}
      alt="Viewer"
      class="viewerjs-image"
      draggable="false"
    />
  {:else}
    <div class="viewerjs-placeholder">
      <span class="text-muted-foreground">暂无图片</span>
    </div>
  {/if}
</div>

<style>
  .viewerjs-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
  }
  
  .viewerjs-image {
    /* 隐藏原始图片，ViewerJS 会创建自己的渲染 */
    display: none;
  }
  
  .viewerjs-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  /* ViewerJS inline 模式样式覆盖 */
  :global(.viewerjs-wrapper .viewer-container) {
    background: transparent !important;
  }
  
  :global(.viewerjs-wrapper .viewer-canvas) {
    background: transparent !important;
  }
  
  :global(.viewerjs-wrapper .viewer-backdrop) {
    display: none !important;
  }
  
  /* 移除默认边框和阴影 */
  :global(.viewerjs-wrapper .viewer-canvas > img) {
    box-shadow: none !important;
  }
</style>
