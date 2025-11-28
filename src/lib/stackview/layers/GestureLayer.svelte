<!--
  GestureLayer - 手势层
  z-index: 90
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { LayerZIndex } from '../types/layer';
  import type { TapZones, GestureCallbacks, Point } from '../types/gesture';
  
  let {
    // 是否为视频模式（视频模式下只处理边缘区域）
    isVideoMode = false,
    // 点击区域配置
    tapZones = { left: 0.3, right: 0.7 },
    // 启用配置
    enablePan = true,
    enableTap = true,
    // 事件回调
    onTapLeft,
    onTapRight,
    onTapCenter,
    onPan,
    onPanStart,
    onPanEnd,
  }: {
    isVideoMode?: boolean;
    tapZones?: TapZones;
    enablePan?: boolean;
    enableTap?: boolean;
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
    /* 确保不会覆盖边栏，使用较低的 z-index */
    z-index: 1 !important;
  }
  
  .gesture-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    touch-action: none;
    cursor: grab;
    /* 阻止图片拖拽 */
    -webkit-user-drag: none;
    user-select: none;
  }
  
  .gesture-layer:active {
    cursor: grabbing;
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
    cursor: pointer;
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
