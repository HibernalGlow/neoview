<!--
  GestureLayer - 手势层
  z-index: 90
  
  功能：
  - 处理点击、拖拽、缩放手势
  - 支持视频模式（只在边缘区域捕获事件）
  - 可配置的点击区域
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { GestureHandler, type GestureEvents as HandlerEvents } from '../GestureHandler';
  import type { TapZone, Point, GestureConfig } from '../types/gesture';
  import { defaultGestureConfig } from '../types/gesture';

  interface Props {
    /** 是否为视频模式 */
    isVideoMode?: boolean;
    /** 手势配置 */
    config?: Partial<GestureConfig>;
    /** 左侧点击回调 */
    onTapLeft?: () => void;
    /** 右侧点击回调 */
    onTapRight?: () => void;
    /** 中间点击回调 */
    onTapCenter?: () => void;
    /** 双击回调 */
    onDoubleTap?: (point: Point) => void;
    /** 平移回调 */
    onPan?: (delta: Point) => void;
    /** 平移开始回调 */
    onPanStart?: (point: Point) => void;
    /** 平移结束回调 */
    onPanEnd?: (point: Point) => void;
    /** 缩放回调 */
    onZoom?: (scale: number, center: Point) => void;
  }

  let {
    isVideoMode = false,
    config = {},
    onTapLeft,
    onTapRight,
    onTapCenter,
    onDoubleTap,
    onPan,
    onPanStart,
    onPanEnd,
    onZoom,
  }: Props = $props();

  let layerRef: HTMLDivElement | null = $state(null);
  let handler: GestureHandler | null = null;

  // 合并配置
  let mergedConfig = $derived({ ...defaultGestureConfig, ...config });

  // 确定点击区域
  function getTapZone(point: Point, rect: DOMRect): TapZone {
    const relX = point.x / rect.width;
    if (relX < mergedConfig.tapZones.left) {
      return 'left';
    } else if (relX > mergedConfig.tapZones.right) {
      return 'right';
    }
    return 'center';
  }

  // 手势事件处理
  function createGestureEvents(): HandlerEvents {
    return {
      onTap: (point) => {
        if (!layerRef || !mergedConfig.enableTap) return;
        const rect = layerRef.getBoundingClientRect();
        const zone = getTapZone(point, rect);
        
        switch (zone) {
          case 'left':
            onTapLeft?.();
            break;
          case 'right':
            onTapRight?.();
            break;
          case 'center':
            onTapCenter?.();
            break;
        }
      },
      
      onDoubleTap: (point) => {
        if (!mergedConfig.enableDoubleTap) return;
        onDoubleTap?.(point);
      },
      
      onPan: (delta) => {
        if (!mergedConfig.enablePan) return;
        onPan?.(delta);
      },
      
      onPanStart: (point) => {
        onPanStart?.(point);
      },
      
      onPanEnd: (point) => {
        onPanEnd?.(point);
      },
      
      onZoom: (scale, center) => {
        if (!mergedConfig.enableWheel && !mergedConfig.enablePinch) return;
        onZoom?.(scale, center);
      },
    };
  }

  onMount(() => {
    if (layerRef) {
      handler = new GestureHandler(layerRef, createGestureEvents(), {
        enableZoom: mergedConfig.enableWheel || mergedConfig.enablePinch,
        enablePan: mergedConfig.enablePan,
        enableTap: mergedConfig.enableTap,
      });
    }
  });

  onDestroy(() => {
    handler?.destroy();
    handler = null;
  });
</script>

<div
  class="gesture-layer"
  class:video-mode={isVideoMode}
  bind:this={layerRef}
  data-layer="GestureLayer"
  data-layer-id="gesture"
>
  {#if isVideoMode}
    <!-- 视频模式下的边缘点击区域 -->
    <div class="edge-zone left-zone"></div>
    <div class="edge-zone right-zone"></div>
  {/if}
</div>

<style>
  .gesture-layer {
    position: absolute;
    inset: 0;
    z-index: 90;
    cursor: grab;
  }

  .gesture-layer:active {
    cursor: grabbing;
  }

  /* 视频模式：中心区域不捕获事件 */
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
  }

  .left-zone {
    left: 0;
  }

  .right-zone {
    right: 0;
  }
</style>
