<!--
  HoverLayer2 - 悬停滚动层（新方案）
  
  核心原则：绝对不超出边界
  - 计算实际可滚动范围（像素）
  - 鼠标位置映射到滚动位置
  - 边界检查在计算时完成，不依赖后续限制
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
    
    // 视口和图片尺寸
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
  
  // 当前位置（0-100）- 必须用 $state 保持响应式
  let currentX = $state(50);
  let currentY = $state(50);
  
  // 获取最新的 props 值（每次调用都从 props 读取）
  function getLatestProps() {
    return {
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      scale: scale,
    };
  }
  
  /**
   * 计算滚动速度
   * 返回 { vx, vy } 范围 -1 到 1，或 null 表示在死区
   */
  function calculateVelocity(clientX: number, clientY: number): { vx: number; vy: number } | null {
    if (!layerRef) return null;
    
    const rect = layerRef.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    
    // 排除侧边栏区域
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
    
    // 在死区内不滚动
    if (Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY) {
      return null;
    }
    
    // 计算速度
    const effectiveWidth = (rect.width / 2) - deadZoneSizeX;
    const effectiveHeight = (rect.height / 2) - deadZoneSizeY;
    
    let vx = 0;
    let vy = 0;
    
    if (Math.abs(relX) >= deadZoneSizeX && effectiveWidth > 0) {
      const dist = Math.abs(relX) - deadZoneSizeX;
      vx = Math.sign(relX) * Math.min(1, dist / effectiveWidth);
    }
    
    if (Math.abs(relY) >= deadZoneSizeY && effectiveHeight > 0) {
      const dist = Math.abs(relY) - deadZoneSizeY;
      vy = Math.sign(relY) * Math.min(1, dist / effectiveHeight);
    }
    
    return { vx, vy };
  }
  
  // 动画循环
  function startLoop() {
    if (animationFrameId) return;
    
    function loop() {
      if (isHovering && enabled) {
        const vel = calculateVelocity(lastMousePos.x, lastMousePos.y);
        
        // 每次循环都读取最新的 props
        const { imageWidth, imageHeight, viewportWidth, viewportHeight, scale: s } = getLatestProps();
        
        // 如果图片尺寸无效，保持当前位置不变（不要重置）
        if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
          animationFrameId = requestAnimationFrame(loop);
          return;
        }
        
        const scaledWidth = imageWidth * s;
        const scaledHeight = imageHeight * s;
        const canScrollX = scaledWidth > viewportWidth;
        const canScrollY = scaledHeight > viewportHeight;
        
        if (vel) {
          // 只在有溢出时才更新对应轴，无溢出时保持位置不变
          if (canScrollX) {
            currentX = Math.max(0, Math.min(100, currentX + vel.vx * speed));
          }
          
          if (canScrollY) {
            currentY = Math.max(0, Math.min(100, currentY + vel.vy * speed));
          }
          
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
  
  // 重置到居中
  export function reset() {
    currentX = 50;
    currentY = 50;
    onPositionChange?.(currentX, currentY);
  }
  
  // 鼠标事件监听
  function onWindowMouseMove(e: MouseEvent) {
    if (!layerRef || !enabled) return;
    const rect = layerRef.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                   e.clientY >= rect.top && e.clientY <= rect.bottom;
    
    lastMousePos = { x: e.clientX, y: e.clientY };
    isHovering = inside;
  }
  
  onMount(() => {
    window.addEventListener('mousemove', onWindowMouseMove);
    if (enabled) startLoop();
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
