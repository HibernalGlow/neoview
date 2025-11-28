<!--
  NewViewer - 新版图片查看器
  
  职责：
  - 组合 ImageRenderer 和 GestureHandler
  - 管理视图状态（缩放、平移、旋转）
  - 处理用户交互
  
  使用方式：
  <NewViewer
    src={imageUrl}
    rotation={0}
    cropRect={null}
    isLeftHalf={true}
    onPrevPage={() => {}}
    onNextPage={() => {}}
  />
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Rect, Point } from '$lib/core/types';
  import ImageRenderer from './ImageRenderer.svelte';
  import { GestureHandler, type GestureEvents } from './GestureHandler';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  interface Props {
    /** 图片 URL */
    src: string | null;
    /** 旋转角度 */
    rotation?: 0 | 90 | 180 | 270;
    /** 裁剪区域 */
    cropRect?: Rect | null;
    /** 是否为左半边 */
    isLeftHalf?: boolean;
    /** 加载中 */
    loading?: boolean;
    /** 上一页回调 */
    onPrevPage?: () => void;
    /** 下一页回调 */
    onNextPage?: () => void;
    /** 缩放变化回调 */
    onScaleChange?: (scale: number) => void;
  }
  
  let {
    src,
    rotation = 0,
    cropRect = null,
    isLeftHalf = true,
    loading = false,
    onPrevPage,
    onNextPage,
    onScaleChange,
  }: Props = $props();
  
  // ============================================================================
  // 状态
  // ============================================================================
  
  let containerRef: HTMLDivElement | null = $state(null);
  let gestureHandler: GestureHandler | null = null;
  
  // 视图状态
  let scale = $state(1);
  let offset = $state<Point>({ x: 0, y: 0 });
  let minScale = 0.1;
  let maxScale = 10;
  
  // ============================================================================
  // 手势处理
  // ============================================================================
  
  const gestureEvents: GestureEvents = {
    onPan: (delta) => {
      offset = {
        x: offset.x + delta.x,
        y: offset.y + delta.y,
      };
    },
    
    onZoom: (zoomScale, center) => {
      const newScale = Math.max(minScale, Math.min(maxScale, scale * zoomScale));
      
      // 以中心点为基准缩放
      if (containerRef) {
        const rect = containerRef.getBoundingClientRect();
        const centerX = center.x - rect.width / 2;
        const centerY = center.y - rect.height / 2;
        
        const scaleDiff = newScale / scale;
        offset = {
          x: center.x - (center.x - offset.x) * scaleDiff,
          y: center.y - (center.y - offset.y) * scaleDiff,
        };
      }
      
      scale = newScale;
      onScaleChange?.(scale);
    },
    
    onDoubleTap: () => {
      // 双击切换缩放
      if (scale > 1.5) {
        resetView();
      } else {
        scale = 2;
        onScaleChange?.(scale);
      }
    },
    
    onTap: (point) => {
      // 点击左右区域翻页
      if (containerRef) {
        const rect = containerRef.getBoundingClientRect();
        const x = point.x / rect.width;
        
        if (x < 0.3) {
          onPrevPage?.();
        } else if (x > 0.7) {
          onNextPage?.();
        }
      }
    },
  };
  
  // ============================================================================
  // 生命周期
  // ============================================================================
  
  onMount(() => {
    if (containerRef) {
      gestureHandler = new GestureHandler(containerRef, gestureEvents);
    }
  });
  
  onDestroy(() => {
    gestureHandler?.destroy();
  });
  
  // ============================================================================
  // 方法
  // ============================================================================
  
  function resetView() {
    scale = 1;
    offset = { x: 0, y: 0 };
    onScaleChange?.(scale);
  }
  
  function zoomIn() {
    scale = Math.min(maxScale, scale * 1.2);
    onScaleChange?.(scale);
  }
  
  function zoomOut() {
    scale = Math.max(minScale, scale / 1.2);
    onScaleChange?.(scale);
  }
  
  // 导出方法
  export { resetView, zoomIn, zoomOut, scale };
</script>

<div 
  class="new-viewer"
  bind:this={containerRef}
>
  <ImageRenderer
    {src}
    {rotation}
    {cropRect}
    {isLeftHalf}
    {scale}
    {offset}
    {loading}
  />
  
  <!-- 缩放指示器 -->
  {#if scale !== 1}
    <div class="new-viewer__zoom-indicator">
      {Math.round(scale * 100)}%
    </div>
  {/if}
  
  <!-- 点击区域指示（调试用） -->
  <div class="new-viewer__tap-zones">
    <div class="new-viewer__tap-zone new-viewer__tap-zone--left" />
    <div class="new-viewer__tap-zone new-viewer__tap-zone--right" />
  </div>
</div>

<style>
  .new-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--background, #000);
    cursor: grab;
  }
  
  .new-viewer:active {
    cursor: grabbing;
  }
  
  .new-viewer__zoom-indicator {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 0.75rem;
    border-radius: 0.25rem;
    pointer-events: none;
  }
  
  .new-viewer__tap-zones {
    position: absolute;
    inset: 0;
    display: flex;
    pointer-events: none;
    opacity: 0;
  }
  
  .new-viewer:hover .new-viewer__tap-zones {
    opacity: 0.1;
  }
  
  .new-viewer__tap-zone {
    flex: 1;
  }
  
  .new-viewer__tap-zone--left {
    background: linear-gradient(to right, rgba(255,255,255,0.3), transparent);
  }
  
  .new-viewer__tap-zone--right {
    background: linear-gradient(to left, rgba(255,255,255,0.3), transparent);
  }
</style>
