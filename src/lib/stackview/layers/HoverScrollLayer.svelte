<!--
  HoverScrollLayer - 原生滚动悬停层
  
  原理：使用浏览器原生滚动 API，性能最佳
  - 核心优化 #7: 运动学平滑滚动 (Kinematics)
  - 鼠标偏离中心的距离 * 倍率 = 目标速度
  - 当前速度平滑插值到目标速度，实现惯性和缓冲
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    enabled = false,
    sidebarMargin = 50,
    scrollSpeed = 2.0, // 滚动倍率
    targetSelector = '.scroll-frame-container',
  }: {
    enabled?: boolean;
    sidebarMargin?: number;
    scrollSpeed?: number;
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
  
  // 运动学状态 (使用组件作用域变量，避免高频渲染触发 Svelte 更新)
  let currentVelX = 0;
  let currentVelY = 0;

  // 【性能优化】使用 RAF 批量更新 rect，避免强制重排
  let rectUpdateScheduled = false;
  
  function updateTargetContainer() {
    targetContainer = document.querySelector(targetSelector) as HTMLElement | null;
    scheduleRectUpdate();
  }
  
  function scheduleRectUpdate() {
    if (rectUpdateScheduled) return;
    rectUpdateScheduled = true;
    requestAnimationFrame(() => {
      rectUpdateScheduled = false;
      if (targetContainer) {
        cachedRect = targetContainer.getBoundingClientRect();
      }
    });
  }
  
  function updateRect() {
    scheduleRectUpdate();
  }
  
  // 核心滚动逻辑 - 运动学滚动
  function scrollStep() {
    rafId = null;
    
    if (!enabled || !isHovering || !targetContainer || !cachedRect) {
      currentVelX = 0;
      currentVelY = 0;
      return;
    }
    
    const rect = cachedRect;
    const localX = currentMouseX - rect.left;
    const localY = currentMouseY - rect.top;
    
    // 计算最大滚动范围
    const maxScrollLeft = targetContainer.scrollWidth - targetContainer.clientWidth;
    const maxScrollTop = targetContainer.scrollHeight - targetContainer.clientHeight;

    // 侧边栏排除
    if (localX < sidebarMargin || localX > rect.width - sidebarMargin) {
      currentVelX *= 0.85; // 缓冲减速
      currentVelY *= 0.85;
    } else {
      // 如果没有可滚动区域，且速度已归零，停止循环
      if (maxScrollLeft <= 0 && maxScrollTop <= 0 && Math.abs(currentVelX) < 0.05 && Math.abs(currentVelY) < 0.05) {
        return;
      }
      
      // 计算针对性偏移 (-0.5 到 0.5)
      const effectiveWidth = rect.width - 2 * sidebarMargin;
      const effectiveX = localX - sidebarMargin;
      const normalizedX = (effectiveX / effectiveWidth) - 0.5;
      const normalizedY = (localY / rect.height) - 0.5;

      // ==================== 【性能优化 #7】运动学平滑滚动 (Kinematics) ====================
      // 计算目标速度 (基础速度提高到 30 以获得更爽快的响应感)
      const targetVelocityX = normalizedX * scrollSpeed * 30;
      const targetVelocityY = normalizedY * scrollSpeed * 30;
      
      // 平滑插值系数 (0-1)，越小越平滑/越有惯性
      // NeeView 风格通常在 0.1 - 0.2 之间
      const smoothing = 0.12; 
      
      // 更新当前速度
      currentVelX += (targetVelocityX - currentVelX) * smoothing;
      currentVelY += (targetVelocityY - currentVelY) * smoothing;
      
      // 停止阈值
      if (Math.abs(currentVelX) < 0.05) currentVelX = 0;
      if (Math.abs(currentVelY) < 0.05) currentVelY = 0;
    }
    
    // 应用滚动
    if (currentVelX !== 0 && maxScrollLeft > 0) {
      targetContainer.scrollLeft += currentVelX;
    }
    
    if (currentVelY !== 0 && maxScrollTop > 0) {
      targetContainer.scrollTop += currentVelY;
    }
    
    // 继续动画循环
    scheduleScroll();
  }
  
  function scheduleScroll() {
    if (rafId === null && isHovering && enabled) {
      rafId = requestAnimationFrame(scrollStep);
    }
  }
  
  function isOverUIElement(e: MouseEvent): boolean {
    const target = e.target as HTMLElement;
    if (!target) return false;
    
    const uiSelectors = [
      '[data-sidebar]', '[data-panel]', '[data-toolbar]',
      '.settings-panel', '.sidebar', '.panel', '.toolbar',
      '.popover', '.dialog', '[role="dialog"]', '[role="menu"]',
      '.top-toolbar', '.bottom-toolbar', '.info-panel', '.folder-panel',
      'button', 'input', 'select', '[data-radix-popper-content-wrapper]',
    ];
    
    for (const selector of uiSelectors) {
      if (target.closest(selector)) return true;
    }
    return false;
  }

  function onMouseMove(e: MouseEvent) {
    if (!enabled) return;
    
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    
    if (isOverUIElement(e)) {
      if (isHovering) isHovering = false;
      return;
    }
    
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
    
    if (isHovering) scheduleScroll();
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
  let mutationTimeout: ReturnType<typeof setTimeout> | null = null;
  let initTimeout: ReturnType<typeof setTimeout> | null = null;
  
  onMount(() => {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('scroll', updateRect, { capture: true, passive: true });
    window.addEventListener('resize', updateRect, { passive: true });
    
    initTimeout = setTimeout(() => {
      updateTargetContainer();
    }, 100);
    
    if (layerRef) {
      resizeObserver = new ResizeObserver(() => {
        updateRect();
        updateTargetContainer();
      });
      resizeObserver.observe(layerRef);
      
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
    
    if (resizeObserver) resizeObserver.disconnect();
    if (mutationObserver) mutationObserver.disconnect();
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (mutationTimeout) clearTimeout(mutationTimeout);
    if (initTimeout) clearTimeout(initTimeout);
  });
  
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

<div class="hover-scroll-layer-ref" bind:this={layerRef} role="presentation"></div>

<style>
  .hover-scroll-layer-ref {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
</style>
