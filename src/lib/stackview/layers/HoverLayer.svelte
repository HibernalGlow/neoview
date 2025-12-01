<!--
  HoverLayer - 悬停滚动控制器（原生滚动方案）
  
  原理：控制外部滚动容器的 scrollLeft/scrollTop
  - 利用浏览器原生滚动优化（compositor thread + tile rendering）
  - 对超高分辨率图片友好，只渲染可见区域
  - 事件驱动，无持续轮询
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    enabled = false,
    sidebarMargin = 50,
    deadZoneRatio = 0.2,
    // 滚动容器引用
    scrollContainer = null as HTMLElement | null,
  }: {
    enabled?: boolean;
    sidebarMargin?: number;
    deadZoneRatio?: number;
    scrollContainer?: HTMLElement | null;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let rafId: number | null = null;
  let pendingScroll: { x: number; y: number } | null = null;
  
  // 调度滚动更新
  function scheduleScroll(ratioX: number, ratioY: number) {
    pendingScroll = { x: ratioX, y: ratioY };
    if (rafId === null) {
      rafId = requestAnimationFrame(flushScroll);
    }
  }
  
  function flushScroll() {
    rafId = null;
    if (!pendingScroll || !scrollContainer) return;
    
    const { scrollWidth, scrollHeight, clientWidth, clientHeight } = scrollContainer;
    const maxScrollX = scrollWidth - clientWidth;
    const maxScrollY = scrollHeight - clientHeight;
    
    if (maxScrollX > 0 || maxScrollY > 0) {
      scrollContainer.scrollTo({
        left: pendingScroll.x * maxScrollX,
        top: pendingScroll.y * maxScrollY,
        // behavior: 'auto' 比 'smooth' 更适合跟随鼠标
      });
    }
    
    pendingScroll = null;
  }
  
  function onMouseMove(e: MouseEvent) {
    if (!enabled || !layerRef || !scrollContainer) return;
    
    const rect = layerRef.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    
    // 边界检测
    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
      return;
    }
    
    // 侧边栏排除
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      return;
    }
    
    // 死区检测
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relX = localX - centerX;
    const relY = localY - centerY;
    const deadZoneSizeX = rect.width * deadZoneRatio / 2;
    const deadZoneSizeY = rect.height * deadZoneRatio / 2;
    
    if (Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY) {
      return;
    }
    
    // 计算滚动比例 (0-1)
    const ratioX = localX / rect.width;
    const ratioY = localY / rect.height;
    
    scheduleScroll(ratioX, ratioY);
  }
  
  onMount(() => {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
  });
  
  onDestroy(() => {
    window.removeEventListener('mousemove', onMouseMove);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
</script>

<!-- 隐藏的参考元素，用于获取视口边界 -->
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
