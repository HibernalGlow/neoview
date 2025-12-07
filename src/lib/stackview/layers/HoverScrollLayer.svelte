<!--
  HoverScrollLayer - 原生滚动悬停层
  
  原理：使用浏览器原生滚动 API，性能最佳
  - 鼠标位置映射到 scrollLeft/scrollTop
  - 利用浏览器硬件加速滚动
  - 无需 transform-origin，无需 CSS 变量
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    enabled = false,
    sidebarMargin = 50,
    deadZoneRatio = 0.2,
    targetSelector = '.scroll-frame-container',
  }: {
    enabled?: boolean;
    sidebarMargin?: number;
    deadZoneRatio?: number;
    targetSelector?: string;
  } = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  
  // 缓存目标容器和 rect
  let targetContainer: HTMLElement | null = null;
  let cachedRect: DOMRect | null = null;
  
  // RAF 相关
  let rafId: number | null = null;
  let currentMouseX = 0;
  let currentMouseY = 0;
  let isHovering = false;
  
  function updateTargetContainer() {
    targetContainer = document.querySelector(targetSelector) as HTMLElement | null;
    if (targetContainer) {
      cachedRect = targetContainer.getBoundingClientRect();
    }
  }
  
  function updateRect() {
    if (targetContainer) {
      cachedRect = targetContainer.getBoundingClientRect();
    }
  }
  
  // 核心滚动逻辑
  function scrollStep() {
    rafId = null;
    
    if (!enabled || !isHovering || !targetContainer || !cachedRect) {
      return;
    }
    
    const rect = cachedRect;
    const localX = currentMouseX - rect.left;
    const localY = currentMouseY - rect.top;
    
    // 边界检测
    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
      return;
    }
    
    // 侧边栏排除
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      return;
    }
    
    // 计算最大滚动范围
    const maxScrollLeft = targetContainer.scrollWidth - targetContainer.clientWidth;
    const maxScrollTop = targetContainer.scrollHeight - targetContainer.clientHeight;
    
    // 如果没有可滚动区域，直接返回
    if (maxScrollLeft <= 0 && maxScrollTop <= 0) {
      return;
    }
    
    // 死区检测
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relX = localX - centerX;
    const relY = localY - centerY;
    const deadZoneSizeX = (rect.width * deadZoneRatio) / 2;
    const deadZoneSizeY = (rect.height * deadZoneRatio) / 2;
    
    // 在死区内不滚动
    if (Math.abs(relX) < deadZoneSizeX && Math.abs(relY) < deadZoneSizeY) {
      return;
    }
    
    // 计算目标滚动位置（直接映射鼠标位置到滚动范围）
    // 考虑侧边栏和死区
    const effectiveWidth = rect.width - 2 * sidebarMargin;
    const effectiveX = localX - sidebarMargin;
    const normalizedX = Math.max(0, Math.min(1, effectiveX / effectiveWidth));
    
    const effectiveHeight = rect.height;
    const normalizedY = Math.max(0, Math.min(1, localY / effectiveHeight));
    
    // 应用死区平滑过渡
    let targetScrollX = normalizedX * maxScrollLeft;
    let targetScrollY = normalizedY * maxScrollTop;
    
    // 只滚动有内容的方向
    if (maxScrollLeft > 0) {
      // 使用 lerp 平滑过渡
      const currentX = targetContainer.scrollLeft;
      const newX = currentX + (targetScrollX - currentX) * 0.1;
      targetContainer.scrollLeft = newX;
    }
    
    if (maxScrollTop > 0) {
      const currentY = targetContainer.scrollTop;
      const newY = currentY + (targetScrollY - currentY) * 0.1;
      targetContainer.scrollTop = newY;
    }
    
    // 继续动画循环
    scheduleScroll();
  }
  
  function scheduleScroll() {
    if (rafId === null && isHovering && enabled) {
      rafId = requestAnimationFrame(scrollStep);
    }
  }
  
  function onMouseMove(e: MouseEvent) {
    if (!enabled) return;
    
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    
    // 检测是否在目标区域内
    if (cachedRect) {
      const inBounds = 
        currentMouseX >= cachedRect.left &&
        currentMouseX <= cachedRect.right &&
        currentMouseY >= cachedRect.top &&
        currentMouseY <= cachedRect.bottom;
      
      if (inBounds && !isHovering) {
        isHovering = true;
        scheduleScroll();
      } else if (!inBounds && isHovering) {
        isHovering = false;
      }
    }
    
    // 如果正在 hover，继续调度滚动
    if (isHovering) {
      scheduleScroll();
    }
  }
  
  function onMouseLeave() {
    isHovering = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  
  onMount(() => {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('scroll', updateRect, { capture: true, passive: true });
    window.addEventListener('resize', updateRect, { passive: true });
    
    // 延迟初始化，等待 DOM 渲染
    setTimeout(() => {
      updateTargetContainer();
    }, 100);
    
    if (layerRef) {
      resizeObserver = new ResizeObserver(() => {
        updateRect();
        updateTargetContainer();
      });
      resizeObserver.observe(layerRef);
      
      // 监听 DOM 变化
      let mutationTimeout: ReturnType<typeof setTimeout> | null = null;
      mutationObserver = new MutationObserver(() => {
        if (mutationTimeout) clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(() => {
          updateTargetContainer();
        }, 100);
      });
      mutationObserver.observe(layerRef.parentElement || document.body, {
        childList: true,
        subtree: true
      });
    }
  });
  
  onDestroy(() => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('scroll', updateRect, { capture: true });
    window.removeEventListener('resize', updateRect);
    
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    
    if (mutationObserver) {
      mutationObserver.disconnect();
    }
    
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  });
  
  // 当 enabled 变化时重置
  $effect(() => {
    if (enabled) {
      updateTargetContainer();
    } else {
      isHovering = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  });
</script>

<!-- 隐藏的参考元素 -->
<div class="hover-scroll-layer-ref" bind:this={layerRef} role="presentation"></div>

<style>
  .hover-scroll-layer-ref {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
</style>
