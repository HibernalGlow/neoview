<!--
  HoverLayer - 悬停层
  
  功能：
  - 悬停滚动（鼠标靠近边缘时自动滚动）
  - 悬停平移（鼠标位置控制图片平移）
  
  z-index: 85 (在手势层之下)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    // 悬停滚动配置
    enableHoverScroll = false,
    hoverScrollSpeed = 5,
    hoverScrollZone = 0.15, // 边缘区域占比
    
    // 悬停平移配置
    enableHoverPan = false,
    hoverPanSensitivity = 1.0,
    
    // 回调
    onPan,
  }: {
    enableHoverScroll?: boolean;
    hoverScrollSpeed?: number;
    hoverScrollZone?: number;
    enableHoverPan?: boolean;
    hoverPanSensitivity?: number;
    onPan?: (delta: { x: number; y: number }) => void;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let animationFrameId: number | null = null;
  let lastMousePos = { x: 0, y: 0 };
  let isHovering = $state(false);
  
  // 悬停滚动逻辑
  function handleHoverScroll(e: MouseEvent) {
    if (!enableHoverScroll || !layerRef) return;
    
    const rect = layerRef.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    
    let deltaX = 0;
    let deltaY = 0;
    
    // 左边缘
    if (relX < hoverScrollZone) {
      deltaX = hoverScrollSpeed * (1 - relX / hoverScrollZone);
    }
    // 右边缘
    else if (relX > 1 - hoverScrollZone) {
      deltaX = -hoverScrollSpeed * ((relX - (1 - hoverScrollZone)) / hoverScrollZone);
    }
    
    // 上边缘
    if (relY < hoverScrollZone) {
      deltaY = hoverScrollSpeed * (1 - relY / hoverScrollZone);
    }
    // 下边缘
    else if (relY > 1 - hoverScrollZone) {
      deltaY = -hoverScrollSpeed * ((relY - (1 - hoverScrollZone)) / hoverScrollZone);
    }
    
    if (deltaX !== 0 || deltaY !== 0) {
      onPan?.({ x: deltaX, y: deltaY });
    }
  }
  
  // 悬停平移逻辑
  function handleHoverPan(e: MouseEvent) {
    if (!enableHoverPan || !layerRef) return;
    
    const rect = layerRef.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // 计算鼠标相对于中心的偏移
    const offsetX = (e.clientX - rect.left - centerX) / centerX;
    const offsetY = (e.clientY - rect.top - centerY) / centerY;
    
    // 平滑移动
    const deltaX = -offsetX * hoverPanSensitivity;
    const deltaY = -offsetY * hoverPanSensitivity;
    
    onPan?.({ x: deltaX, y: deltaY });
  }
  
  function handleMouseMove(e: MouseEvent) {
    lastMousePos = { x: e.clientX, y: e.clientY };
    
    if (enableHoverScroll) {
      handleHoverScroll(e);
    }
    
    if (enableHoverPan) {
      handleHoverPan(e);
    }
  }
  
  function handleMouseEnter() {
    isHovering = true;
  }
  
  function handleMouseLeave() {
    isHovering = false;
  }
  
  // 动画循环（用于持续滚动）
  function startScrollLoop() {
    if (animationFrameId) return;
    
    function loop() {
      if (isHovering && enableHoverScroll && layerRef) {
        // 模拟鼠标移动事件
        const fakeEvent = {
          clientX: lastMousePos.x,
          clientY: lastMousePos.y,
        } as MouseEvent;
        handleHoverScroll(fakeEvent);
      }
      animationFrameId = requestAnimationFrame(loop);
    }
    
    animationFrameId = requestAnimationFrame(loop);
  }
  
  function stopScrollLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
  
  onMount(() => {
    if (enableHoverScroll) {
      startScrollLoop();
    }
  });
  
  onDestroy(() => {
    stopScrollLoop();
  });
  
  // 响应配置变化
  $effect(() => {
    if (enableHoverScroll) {
      startScrollLoop();
    } else {
      stopScrollLoop();
    }
  });
</script>

{#if enableHoverScroll || enableHoverPan}
  <div 
    class="hover-layer"
    bind:this={layerRef}
    onmousemove={handleMouseMove}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    role="presentation"
  >
    {#if enableHoverScroll}
      <!-- 可视化边缘区域（调试用，生产环境可隐藏） -->
      <div class="hover-zone left" style:width="{hoverScrollZone * 100}%"></div>
      <div class="hover-zone right" style:width="{hoverScrollZone * 100}%"></div>
      <div class="hover-zone top" style:height="{hoverScrollZone * 100}%"></div>
      <div class="hover-zone bottom" style:height="{hoverScrollZone * 100}%"></div>
    {/if}
  </div>
{/if}

<style>
  .hover-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: auto;
  }
  
  /* 边缘区域（调试可视化，默认隐藏） */
  .hover-zone {
    position: absolute;
    pointer-events: none;
    /* 调试时可以取消注释下面的样式 */
    /* background: rgba(255, 0, 0, 0.1); */
  }
  
  .hover-zone.left {
    left: 0;
    top: 0;
    bottom: 0;
  }
  
  .hover-zone.right {
    right: 0;
    top: 0;
    bottom: 0;
  }
  
  .hover-zone.top {
    top: 0;
    left: 0;
    right: 0;
  }
  
  .hover-zone.bottom {
    bottom: 0;
    left: 0;
    right: 0;
  }
</style>
