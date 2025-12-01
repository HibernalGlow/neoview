<!--
  HoverLayer - 悬停滚动层
  
  原理：根据图片溢出量计算安全的 transform-origin 范围
  - 当图片 <= 视口：位置固定在 50%（居中）
  - 当图片 > 视口：位置范围限制在安全区间，确保边缘不露出
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    // 启用悬停滚动
    enabled = false,
    
    // 侧边栏排除区域（像素）
    sidebarMargin = 50,
    
    // 中心死区占短边比例（0-1）
    deadZoneRatio = 0.2,
    
    // 视口和图片尺寸（用于计算边界）
    viewportSize = { width: 0, height: 0 },
    imageSize = { width: 0, height: 0 },
    scale = 1,
    
    // 回调：位置百分比变化（0-100）
    onPositionChange,
  }: {
    enabled?: boolean;
    sidebarMargin?: number;
    deadZoneRatio?: number;
    viewportSize?: { width: number; height: number };
    imageSize?: { width: number; height: number };
    scale?: number;
    onPositionChange?: (x: number, y: number) => void;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let animationFrameId: number | null = null;
  let lastMousePos = { x: 0, y: 0 };
  let isHovering = $state(false);
  
  // 性能优化：缓存结果
  let lastOverlayCheck = 0;
  let lastOverlayResult = true;
  let cachedRect: DOMRect | null = null;
  let lastRectUpdate = 0;
  const OVERLAY_CHECK_INTERVAL = 100; // ms
  const RECT_CACHE_INTERVAL = 50; // ms
  
  /**
   * 计算安全的 transform-origin 范围
   */
  function calculateBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    // 尺寸无效时返回全范围，让悬停滚动仍可用
    if (!viewportSize.width || !viewportSize.height || !imageSize.width || !imageSize.height) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    }
    
    // 计算图片在 CSS 中的实际显示尺寸（受 max-width/max-height: 100% 约束）
    const imgAspect = imageSize.width / imageSize.height;
    const vpAspect = viewportSize.width / viewportSize.height;
    
    let displayWidth: number;
    let displayHeight: number;
    
    if (imgAspect > vpAspect) {
      displayWidth = viewportSize.width;
      displayHeight = viewportSize.width / imgAspect;
    } else {
      displayHeight = viewportSize.height;
      displayWidth = viewportSize.height * imgAspect;
    }
    
    // 应用缩放
    const scaledWidth = displayWidth * scale;
    const scaledHeight = displayHeight * scale;
    
    // 计算溢出量（单侧），添加 1px 阈值避免浮点误差
    const THRESHOLD = 1;
    const overflowX = Math.max(0, (scaledWidth - viewportSize.width) / 2);
    const overflowY = Math.max(0, (scaledHeight - viewportSize.height) / 2);
    const hasOverflowX = overflowX > THRESHOLD;
    const hasOverflowY = overflowY > THRESHOLD;
    
    // 如果没有溢出，固定在 50%
    if (!hasOverflowX && !hasOverflowY) {
      return { minX: 50, maxX: 50, minY: 50, maxY: 50 };
    }
    
    // 当有溢出时，使用 0-100 全范围
    return {
      minX: hasOverflowX ? 0 : 50,
      maxX: hasOverflowX ? 100 : 50,
      minY: hasOverflowY ? 0 : 50,
      maxY: hasOverflowY ? 100 : 50,
    };
  }
  
  /**
   * 计算位置百分比，映射到安全范围
   */
  function calculatePosition(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!layerRef) return null;
    
    const rect = layerRef.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    
    // 排除侧边栏区域
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      return null;
    }
    
    // 应用死区
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relX = localX - centerX;
    const relY = localY - centerY;
    const deadZoneSizeX = rect.width * deadZoneRatio / 2;
    const deadZoneSizeY = rect.height * deadZoneRatio / 2;
    
    if (Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY) {
      return null;
    }
    
    // 获取安全边界并映射
    const bounds = calculateBounds();
    const normalizedX = localX / rect.width;
    const normalizedY = localY / rect.height;
    
    const x = bounds.minX + normalizedX * (bounds.maxX - bounds.minX);
    const y = bounds.minY + normalizedY * (bounds.maxY - bounds.minY);
    
    return { x, y };
  }
  
  // 动画循环
  function startLoop() {
    if (animationFrameId) return;
    
    function loop() {
      if (isHovering && enabled) {
        const pos = calculatePosition(lastMousePos.x, lastMousePos.y);
        if (pos) {
          onPositionChange?.(pos.x, pos.y);
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    }
    
    animationFrameId = requestAnimationFrame(loop);
  }
  
  function stopLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
  
  // 获取缓存的 rect（减少 reflow）
  function getCachedRect(): DOMRect | null {
    if (!layerRef) return null;
    const now = performance.now();
    if (!cachedRect || now - lastRectUpdate > RECT_CACHE_INTERVAL) {
      cachedRect = layerRef.getBoundingClientRect();
      lastRectUpdate = now;
    }
    return cachedRect;
  }
  
  // 使用 window 事件监听（节流优化）
  function onWindowMouseMove(e: MouseEvent) {
    if (!layerRef || !enabled) return;
    const rect = getCachedRect();
    if (!rect) return;
    
    // 检查鼠标是否在 StackView 区域内
    const inBounds = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top && e.clientY <= rect.bottom;
    
    if (inBounds) {
      // 节流检测覆盖元素（每 100ms 检测一次）
      const now = performance.now();
      if (now - lastOverlayCheck > OVERLAY_CHECK_INTERVAL) {
        lastOverlayCheck = now;
        const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
        lastOverlayResult = elementUnderMouse?.closest('.stack-view') !== null;
      }
      
      if (lastOverlayResult) {
        lastMousePos = { x: e.clientX, y: e.clientY };
        if (!isHovering) {
          isHovering = true;
        }
        return;
      }
    }
    
    if (isHovering) {
      isHovering = false;
    }
  }
  
  onMount(() => {
    // passive: true 提升滚动性能
    window.addEventListener('mousemove', onWindowMouseMove, { passive: true });
    if (enabled) {
      startLoop();
    }
  });
  
  onDestroy(() => {
    window.removeEventListener('mousemove', onWindowMouseMove);
    stopLoop();
  });
  
  $effect(() => {
    if (enabled) {
      startLoop();
    } else {
      stopLoop();
    }
  });
</script>

<!-- 隐藏的参考元素，用于获取边界 -->
<div 
  class="hover-layer-ref"
  bind:this={layerRef}
  role="presentation"
></div>

<style>
  .hover-layer-ref {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
</style>
