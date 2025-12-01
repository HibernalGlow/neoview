<!--
  HoverLayer - 悬停滚动层
  
  原理：计算鼠标距离中心的相对偏移，输出增量式的位置变化
  - 鼠标在死区内：不更新位置
  - 鼠标离开死区：根据距离中心的偏移计算速度，持续更新位置
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    // 启用悬停滚动
    enabled = false,
    
    // 滚动速度（每帧最大移动百分比）
    speed = 2,
    
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
    speed?: number;
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
  
  // 当前位置（0-100）- 使用 $state 确保响应式
  let currentX = $state(50);
  let currentY = $state(50);
  
  /**
   * 计算位置边界
   * 输出 0-100 范围，由 CurrentFrameLayer 负责映射到 transform-origin 安全范围
   * 只检查是否有溢出来决定能否滚动
   */
  function calculateBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    if (!viewportSize.width || !viewportSize.height || !imageSize.width || !imageSize.height) {
      return { minX: 50, maxX: 50, minY: 50, maxY: 50 };
    }
    
    // 缩放后的图片尺寸
    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;
    
    // 检查是否有溢出（只有溢出时才允许滚动）
    const hasOverflowX = scaledWidth > viewportSize.width;
    const hasOverflowY = scaledHeight > viewportSize.height;
    
    return {
      minX: hasOverflowX ? 0 : 50,
      maxX: hasOverflowX ? 100 : 50,
      minY: hasOverflowY ? 0 : 50,
      maxY: hasOverflowY ? 100 : 50,
    };
  }
  
  /**
   * 计算滚动速度（-1 到 1）
   * 返回 null 表示在死区内
   */
  function calculateVelocity(clientX: number, clientY: number): { vx: number; vy: number } | null {
    if (!layerRef) return null;
    
    const rect = layerRef.getBoundingClientRect();
    
    // 排除侧边栏区域
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      return null;
    }
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relX = localX - centerX;
    const relY = localY - centerY;
    
    // 死区大小
    const deadZoneSizeX = rect.width * deadZoneRatio / 2;
    const deadZoneSizeY = rect.height * deadZoneRatio / 2;
    
    // 检查是否在死区内
    const inDeadZone = Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY;
    
    if (inDeadZone) {
      return null; // 死区内不滚动
    }
    
    // 计算速度（-1 到 1）
    // 有效区域是从死区边缘到视口边缘
    const effectiveWidth = (rect.width / 2) - deadZoneSizeX;
    const effectiveHeight = (rect.height / 2) - deadZoneSizeY;
    
    let vx = 0;
    let vy = 0;
    
    if (Math.abs(relX) >= deadZoneSizeX) {
      const distFromDeadZone = Math.abs(relX) - deadZoneSizeX;
      vx = (distFromDeadZone / effectiveWidth) * Math.sign(relX);
    }
    
    if (Math.abs(relY) >= deadZoneSizeY) {
      const distFromDeadZone = Math.abs(relY) - deadZoneSizeY;
      vy = (distFromDeadZone / effectiveHeight) * Math.sign(relY);
    }
    
    return { vx: Math.max(-1, Math.min(1, vx)), vy: Math.max(-1, Math.min(1, vy)) };
  }
  
  // 动画循环
  function startLoop() {
    if (animationFrameId) return;
    
    function loop() {
      if (isHovering && enabled) {
        const vel = calculateVelocity(lastMousePos.x, lastMousePos.y);
        if (vel) {
          // 获取边界
          const bounds = calculateBounds();
          
          // 根据速度更新位置，并限制在边界内
          currentX = Math.max(bounds.minX, Math.min(bounds.maxX, currentX + vel.vx * speed));
          currentY = Math.max(bounds.minY, Math.min(bounds.maxY, currentY + vel.vy * speed));
          onPositionChange?.(currentX, currentY);
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
  
  // 重置位置（翻页时调用）
  export function reset() {
    currentX = 50;
    currentY = 50;
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
