<!--
  HoverLayer - 悬停滚动层
  
  原理：输出 0-100% 的位置值，用于 CSS object-position
  百分比天然限制边界，绝对不会超出图片范围
  
  - 0% = 显示左/上边缘
  - 50% = 居中
  - 100% = 显示右/下边缘
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
    
    // 回调：位置百分比变化（0-100）
    onPositionChange,
  }: {
    enabled?: boolean;
    sidebarMargin?: number;
    deadZoneRatio?: number;
    onPositionChange?: (x: number, y: number) => void;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let animationFrameId: number | null = null;
  let lastMousePos = { x: 0, y: 0 };
  let isHovering = $state(false);
  
  /**
   * 计算位置百分比（0-100）
   * 鼠标在左边 -> 0%（显示左边缘）
   * 鼠标在中间 -> 50%（居中）
   * 鼠标在右边 -> 100%（显示右边缘）
   */
  let lastLoggedPos = { x: -1, y: -1 };
  
  function calculatePosition(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!layerRef) return null;
    
    const rect = layerRef.getBoundingClientRect();
    
    // 排除侧边栏区域
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      return null;
    }
    
    // 计算相对于中心的位置
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relX = localX - centerX;
    const relY = localY - centerY;
    
    // 应用死区（只在中心小区域内不响应）
    const deadZoneSizeX = rect.width * deadZoneRatio / 2;
    const deadZoneSizeY = rect.height * deadZoneRatio / 2;
    
    if (Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY) {
      return null;
    }
    
    // 转换为 0-100 百分比
    const x = Math.max(0, Math.min(100, (localX / rect.width) * 100));
    const y = Math.max(0, Math.min(100, (localY / rect.height) * 100));
    
    // 只在位置变化较大时输出日志
    if (Math.abs(x - lastLoggedPos.x) > 5 || Math.abs(y - lastLoggedPos.y) > 5) {
      console.log('[HoverLayer] position:', x.toFixed(0), y.toFixed(0));
      lastLoggedPos = { x, y };
    }
    
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
  
  // 使用 window 事件监听
  function onWindowMouseMove(e: MouseEvent) {
    if (!layerRef || !enabled) return;
    const rect = layerRef.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      lastMousePos = { x: e.clientX, y: e.clientY };
      if (!isHovering) {
        isHovering = true;
      }
    } else {
      if (isHovering) {
        isHovering = false;
      }
    }
  }
  
  onMount(() => {
    window.addEventListener('mousemove', onWindowMouseMove);
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
