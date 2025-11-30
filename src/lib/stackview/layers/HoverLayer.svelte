<!--
  HoverLayer - 悬停滚动层（复刻 NeeView HoverScroll）
  
  原理：
  - 鼠标位置相对于视口中心的比例（-1 到 1）
  - 乘以图片超出视口的距离
  - 只对超出视口的图片生效
  
  配置：
  - enabled: 是否启用
  - duration: 滚动动画时长（秒）
  - sidebarMargin: 侧边栏排除区域（像素）
  - deadZoneRatio: 中心死区占短边比例
  
  回调：
  - onScroll: 返回目标位置 { x, y }，单位为像素
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    // 启用悬停滚动
    enabled = false,
    
    // 滚动动画时长（秒）
    duration = 0.5,
    
    // 侧边栏排除区域（像素）
    sidebarMargin = 50,
    
    // 中心死区占短边比例（0-1）
    deadZoneRatio = 0.2,
    
    // 视口尺寸
    viewportSize = { width: 0, height: 0 },
    
    // 内容（图片）尺寸
    contentSize = { width: 0, height: 0 },
    
    // 回调：目标平移位置（像素）
    onScroll,
  }: {
    enabled?: boolean;
    duration?: number;
    sidebarMargin?: number;
    deadZoneRatio?: number;
    viewportSize?: { width: number; height: number };
    contentSize?: { width: number; height: number };
    onScroll?: (pos: { x: number; y: number }, duration: number) => void;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let animationFrameId: number | null = null;
  let lastMousePos = { x: 0, y: 0 };
  let isHovering = $state(false);
  
  /**
   * 计算悬停滚动位置（NeeView 算法）
   * 
   * 算法：
   * 1. rateX = point.X / ViewRect.Width * -2.0（范围约 -1 到 1）
   * 2. x = Math.Max(ContentRect.Width - ViewRect.Width, 0.0) * clamp(rateX, -0.5, 0.5)
   * 3. 只对超出视口的图片生效
   */
  function calculateScrollPosition(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!layerRef) {
      console.log('[HoverLayer] no layerRef');
      return null;
    }
    
    console.log('[HoverLayer] calc: viewport=', viewportSize, 'content=', contentSize);
    
    const rect = layerRef.getBoundingClientRect();
    
    // 排除侧边栏区域
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      return null;
    }
    
    // 计算相对于中心的比例（-1 到 1）
    // NeeView: rateX = point.X / ViewRect.Width * -2.0
    // point.X 是相对于视口中心的坐标，所以等价于：
    // rateX = ((clientX - centerX) / (width/2)) * -1 = (centerX - clientX) / (width/2) * 1
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // 转换为相对中心的坐标
    const relX = localX - centerX;
    const relY = localY - centerY;
    
    // 计算比例（-1 到 1）
    let rateX = (relX / centerX) * -1; // 鼠标往右，图片往左（显示右边内容）
    let rateY = (relY / centerY) * -1;
    
    // 应用死区
    const shortSide = Math.min(rect.width, rect.height);
    const deadZonePixels = shortSide * deadZoneRatio;
    
    if (Math.abs(relX) < deadZonePixels && Math.abs(relY) < deadZonePixels) {
      return null;
    }
    
    // 限制到 -0.5 到 0.5（NeeView 的 Clamp）
    rateX = Math.max(-0.5, Math.min(0.5, rateX));
    rateY = Math.max(-0.5, Math.min(0.5, rateY));
    
    // 计算超出部分
    const overflowX = Math.max(contentSize.width - viewportSize.width, 0);
    const overflowY = Math.max(contentSize.height - viewportSize.height, 0);
    
    // 如果图片没有超出视口，不需要滚动
    if (overflowX <= 0 && overflowY <= 0) {
      return null;
    }
    
    // 计算目标位置
    const x = overflowX * rateX;
    const y = overflowY * rateY;
    
    return { x, y };
  }
  
  // 动画循环
  function startLoop() {
    if (animationFrameId) return;
    console.log('[HoverLayer] startLoop, enabled:', enabled);
    
    function loop() {
      if (isHovering && enabled) {
        const pos = calculateScrollPosition(lastMousePos.x, lastMousePos.y);
        if (pos) {
          console.log('[HoverLayer] scroll to:', pos);
          onScroll?.(pos, duration);
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
  
  // 使用 window 事件监听，不阻止其他层的交互
  function onWindowMouseMove(e: MouseEvent) {
    if (!layerRef || !enabled) return;
    const rect = layerRef.getBoundingClientRect();
    // 检查鼠标是否在 layerRef 区域内
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      lastMousePos = { x: e.clientX, y: e.clientY };
      if (!isHovering) {
        console.log('[HoverLayer] mouse entered, rect:', rect);
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
