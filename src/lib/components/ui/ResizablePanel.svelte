<script lang="ts">
  /**
   * 可调整大小的面板组件
   */
  import { onMount } from 'svelte';

  interface Props {
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    side?: 'left' | 'right';
    onResize?: (width: number) => void;
    children?: any;
  }

  let {
    minWidth = 200,
    maxWidth = 600,
    defaultWidth = 300,
    side = 'left',
    onResize,
    children
  }: Props = $props();

  let width = $state(defaultWidth);
  let isResizing = $state(false);
  let startX = $state(0);
  let startWidth = $state(0);

  function handleMouseDown(e: MouseEvent) {
    isResizing = true;
    startX = e.clientX;
    startWidth = width;
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;

    const delta = side === 'left' ? e.clientX - startX : startX - e.clientX;
    const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
    
    width = newWidth;
    onResize?.(newWidth);
  }

  function handleMouseUp() {
    isResizing = false;
  }

  onMount(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  });
</script>

<svelte:window onmousemove={handleMouseMove} onmouseup={handleMouseUp} />

<div class="relative flex" style="width: {width}px">
  <!-- 面板内容 -->
  <div class="flex-1 overflow-hidden">
    {@render children?.()}
  </div>

  <!-- 可拖拽的分隔条 -->
  <div
    class="absolute top-0 bottom-0 w-1 cursor-col-resize group {isResizing ? 'bg-blue-500' : 'hover:bg-blue-400 bg-gray-200'} transition-colors"
    style="{side === 'left' ? 'right: -1px' : 'left: -1px'}"
    onmousedown={handleMouseDown}
  >
    <!-- 拖拽区域（加大点击区域） -->
    <div class="absolute top-0 bottom-0 -left-1 -right-1"></div>
  </div>
</div>
