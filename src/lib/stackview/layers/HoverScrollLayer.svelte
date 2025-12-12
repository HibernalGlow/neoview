<!--
  HoverScrollLayer - 原生滚动悬停层
  
  原理：使用浏览器原生滚动 API，性能最佳
  - 鼠标偏离中心的距离 * 倍率 = 滚动速度
  - 利用浏览器硬件加速滚动
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
  
  // 核心滚动逻辑 - 倍率滚动
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
    
    // 计算鼠标相对于中心的偏移（-0.5 到 0.5）
    const effectiveWidth = rect.width - 2 * sidebarMargin;
    const effectiveX = localX - sidebarMargin;
    const normalizedX = (effectiveX / effectiveWidth) - 0.5; // -0.5 到 0.5
    const normalizedY = (localY / rect.height) - 0.5; // -0.5 到 0.5
    
    // 滚动速度 = 偏移 * 倍率 * 基础速度
    const baseSpeed = 15; // 基础速度（像素/帧）
    const scrollDeltaX = normalizedX * scrollSpeed * baseSpeed;
    const scrollDeltaY = normalizedY * scrollSpeed * baseSpeed;
    
    // 应用滚动
    if (maxScrollLeft > 0) {
      const newX = Math.max(0, Math.min(maxScrollLeft, 
        targetContainer.scrollLeft + scrollDeltaX));
      targetContainer.scrollLeft = newX;
    }
    
    if (maxScrollTop > 0) {
      const newY = Math.max(0, Math.min(maxScrollTop, 
        targetContainer.scrollTop + scrollDeltaY));
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
  
  // 检测鼠标是否在 UI 元素上（边栏、工具栏、设置面板等）
  function isOverUIElement(e: MouseEvent): boolean {
    const target = e.target as HTMLElement;
    if (!target) return false;
    
    // 检查是否在以下 UI 元素内
    const uiSelectors = [
      '[data-sidebar]',           // 边栏
      '[data-panel]',             // 面板
      '[data-toolbar]',           // 工具栏
      '.settings-panel',          // 设置面板
      '.sidebar',                 // 边栏
      '.panel',                   // 面板
      '.toolbar',                 // 工具栏
      '.popover',                 // 弹出框
      '.dialog',                  // 对话框
      '[role="dialog"]',          // 对话框
      '[role="menu"]',            // 菜单
      '.top-toolbar',             // 顶部工具栏
      '.bottom-toolbar',          // 底部工具栏
      '.info-panel',              // 信息面板
      '.folder-panel',            // 文件夹面板
      'button',                   // 按钮
      'input',                    // 输入框
      'select',                   // 选择框
      '[data-radix-popper-content-wrapper]', // Radix UI 弹出内容
    ];
    
    for (const selector of uiSelectors) {
      if (target.closest(selector)) {
        return true;
      }
    }
    
    return false;
  }

  function onMouseMove(e: MouseEvent) {
    if (!enabled) return;
    
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    
    // 如果鼠标在 UI 元素上，停止滚动
    if (isOverUIElement(e)) {
      if (isHovering) {
        isHovering = false;
      }
      return;
    }
    
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
