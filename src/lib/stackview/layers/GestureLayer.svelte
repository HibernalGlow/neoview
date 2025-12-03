<!--
  GestureLayer - 手势层（独立模式）
  处理滚轮、键盘、点击区域等手势，通过 keybindingsStore 执行操作
  z-index: 90
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { LayerZIndex } from '../types/layer';
  import type { TapZones, GestureCallbacks, Point } from '../types/gesture';
  import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
  import { generateKeyCombo } from '$lib/stores/keyboard.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import { zoomIn, zoomOut, resetZoom, toggleFullscreen } from '$lib/stores';
  import { showToast } from '$lib/utils/toast';
  
  // 简单的操作 toast（调试用，可以禁用）
  const DEBUG_ACTIONS = false;
  function showActionToast(message: string) {
    if (!DEBUG_ACTIONS) return;
    console.log(`🎯 GestureLayer: ${message}`);
  }
  
  // 调试模式
  let {
    // 是否为视频模式（视频模式下只处理边缘区域）
    isVideoMode = false,
    // 点击区域配置
    tapZones = { left: 0.3, right: 0.7 },
    // 启用配置
    enablePan = true,
    enableTap = true,
    enableWheel = true,
    enableKeyboard = true,
    // 事件回调
    onTapLeft,
    onTapRight,
    onTapCenter,
    onPan,
    onPanStart,
    onPanEnd,
    onNextPage,
    onPrevPage,
    onZoomIn,
    onZoomOut,
    onResetZoom,
  }: {
    isVideoMode?: boolean;
    tapZones?: TapZones;
    enablePan?: boolean;
    enableTap?: boolean;
    enableWheel?: boolean;
    enableKeyboard?: boolean;
    onNextPage?: () => void;
    onPrevPage?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onResetZoom?: () => void;
  } & GestureCallbacks = $props();
  
  let layerRef: HTMLDivElement | null = $state(null);
  let isPanning = $state(false);
  let lastPoint: Point | null = null;
  
  function handlePointerDown(e: PointerEvent) {
    if (!enablePan) return;
    
    isPanning = true;
    lastPoint = { x: e.clientX, y: e.clientY };
    onPanStart?.({ x: e.clientX, y: e.clientY });
    
    (e.target as HTMLElement)?.setPointerCapture(e.pointerId);
  }
  
  function handlePointerMove(e: PointerEvent) {
    if (!isPanning || !lastPoint || !enablePan) return;
    
    const delta = {
      x: e.clientX - lastPoint.x,
      y: e.clientY - lastPoint.y,
    };
    
    lastPoint = { x: e.clientX, y: e.clientY };
    onPan?.(delta);
  }
  
  function handlePointerUp(e: PointerEvent) {
    if (isPanning) {
      onPanEnd?.({ x: e.clientX, y: e.clientY });
    }
    isPanning = false;
    lastPoint = null;
  }
  
  function handleClick(e: MouseEvent) {
    if (!enableTap || !layerRef) return;
    
    // 如果有拖拽，不触发点击
    if (isPanning) return;
    
    const rect = layerRef.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    
    if (relX < tapZones.left) {
      onTapLeft?.();
    } else if (relX > tapZones.right) {
      onTapRight?.();
    } else {
      onTapCenter?.();
    }
  }
  
  // ============================================================================
  // 滚轮处理
  // ============================================================================
  
  function executeAction(action: string, source: string) {
    const settings = settingsManager.getSettings();
    const readingDirection = settings.book.readingDirection;
    
    switch (action) {
      case 'nextPage':
        showActionToast(`${source}: 下一页`);
        onNextPage?.();
        break;
      case 'prevPage':
        showActionToast(`${source}: 上一页`);
        onPrevPage?.();
        break;
      case 'pageLeft':
        showActionToast(`${source}: 向左翻页`);
        if (readingDirection === 'right-to-left') {
          onNextPage?.();
        } else {
          onPrevPage?.();
        }
        break;
      case 'pageRight':
        showActionToast(`${source}: 向右翻页`);
        if (readingDirection === 'right-to-left') {
          onPrevPage?.();
        } else {
          onNextPage?.();
        }
        break;
      case 'zoomIn':
        showActionToast(`${source}: 放大`);
        if (onZoomIn) onZoomIn(); else zoomIn();
        break;
      case 'zoomOut':
        showActionToast(`${source}: 缩小`);
        if (onZoomOut) onZoomOut(); else zoomOut();
        break;
      case 'resetZoom':
        showActionToast(`${source}: 重置缩放`);
        if (onResetZoom) onResetZoom(); else resetZoom();
        break;
      case 'toggleFullscreen':
        showActionToast(`${source}: 切换全屏`);
        toggleFullscreen();
        break;
    }
  }
  
  function handleWheel(e: WheelEvent) {
    if (!enableWheel) return;
    
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    const direction = e.deltaY < 0 ? 'up' : 'down';
    const action = keyBindingsStore.findActionByMouseWheel(direction);
    
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      executeAction(action, '滚轮');
    }
  }
  
  // ============================================================================
  // 键盘处理
  // ============================================================================
  
  function handleKeydown(e: KeyboardEvent) {
    if (!enableKeyboard) return;
    
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    const keyCombo = generateKeyCombo(e);
    const action = keyBindingsStore.findActionByKeyCombo(keyCombo);
    
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      executeAction(action, '键盘');
    }
  }
  
  // 挂载时添加事件监听
  onMount(() => {
    if (layerRef) {
      layerRef.addEventListener('wheel', handleWheel, { passive: false });
      // 需要 tabindex 才能接收键盘事件
      layerRef.tabIndex = 0;
      layerRef.addEventListener('keydown', handleKeydown);
      // 自动获取焦点
      layerRef.focus();
    }
  });
  
  onDestroy(() => {
    if (layerRef) {
      layerRef.removeEventListener('wheel', handleWheel);
      layerRef.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

<!-- 外层容器不捕获事件 -->
<div 
  class="gesture-layer-container"
  data-layer="GestureLayer"
  data-layer-id="gesture"
  style:z-index={LayerZIndex.GESTURE}
>
  <!-- 内层区域捕获事件，但不覆盖边栏 -->
  <div 
    class="gesture-layer"
    class:video-mode={isVideoMode}
    bind:this={layerRef}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    onclick={handleClick}
    role="presentation"
  ></div>
  
  {#if isVideoMode}
    <!-- 视频模式：左右边缘区域 -->
    <button 
      type="button" 
      class="edge-zone left" 
      onclick={() => onTapLeft?.()}
      aria-label="上一页"
    ></button>
    <button 
      type="button" 
      class="edge-zone right" 
      onclick={() => onTapRight?.()}
      aria-label="下一页"
    ></button>
  {/if}
</div>

<style>
  .gesture-layer-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* 使用较低的 z-index，但仍在容器内部 */
    z-index: 90;
    /* 确保不会溢出父容器 */
    overflow: hidden;
  }
  
  .gesture-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    touch-action: none;
    cursor: inherit; /* 继承父级 cursor，支持自动隐藏 */
    /* 阻止图片拖拽 */
    -webkit-user-drag: none;
    user-select: none;
  }
  
  /* 视频模式：主区域不捕获事件 */
  .gesture-layer.video-mode {
    pointer-events: none;
  }
  
  /* 边缘区域 */
  .edge-zone {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20%;
    pointer-events: auto;
    cursor: inherit;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
  }
  
  .edge-zone.left {
    left: 0;
  }
  
  .edge-zone.right {
    right: 0;
  }
</style>
