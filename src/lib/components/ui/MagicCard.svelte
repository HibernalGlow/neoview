<script lang="ts">
  /**
   * MagicCard - 鼠标跟随光效卡片组件
   * 基于 animation-svelte 实现，使用主题色
   * 支持根据卡片大小动态调整光晕尺寸
   */
  import { cn } from "$lib/utils";

  interface Props {
    /** 光晕基础大小，设为 0 则自动根据卡片大小计算 */
    gradientSize?: number;
    /** 光晕透明度 */
    gradientOpacity?: number;
    class?: string;
    /** 自定义样式 */
    style?: string;
    children?: import('svelte').Snippet;
  }

  let {
    gradientSize = 0,
    gradientOpacity = 0.5,
    class: className = "",
    style = "",
    children
  }: Props = $props();

  let containerRef = $state<HTMLDivElement | null>(null);
  let mouseX = $state(-200);
  let mouseY = $state(-200);
  // 【性能优化】缓存容器尺寸，避免每次 mousemove 都读取
  let cachedSize = $state({ width: 300, height: 200 });

  // 动态计算光晕大小：使用缓存的尺寸
  const dynamicSize = $derived(() => {
    if (gradientSize > 0) return gradientSize;
    return Math.min(cachedSize.width, cachedSize.height) * 0.6;
  });

  // 【性能优化】使用 ResizeObserver 监听尺寸变化，而不是每次 mousemove 都读取
  $effect(() => {
    if (!containerRef) return;
    
    // 初始化尺寸
    const rect = containerRef.getBoundingClientRect();
    cachedSize = { width: rect.width, height: rect.height };
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        cachedSize = { 
          width: entry.contentRect.width, 
          height: entry.contentRect.height 
        };
      }
    });
    
    observer.observe(containerRef);
    
    return () => observer.disconnect();
  });

  function handleMouseMove(e: MouseEvent) {
    // 【性能优化】使用 offsetX/offsetY，不需要 getBoundingClientRect
    mouseX = e.offsetX;
    mouseY = e.offsetY;
  }

  function handleMouseLeave() {
    const size = dynamicSize();
    mouseX = -size;
    mouseY = -size;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerRef}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  class={cn("group relative overflow-hidden", className)}
  {style}
>
  <!-- 内容区 -->
  <div class="relative z-10 w-full h-full flex flex-col">
    {#if children}
      {@render children()}
    {:else}
      <div class="flex items-center justify-center h-full text-center">
        <p class="text-2xl">Magic Card</p>
      </div>
    {/if}
  </div>
  <!-- 光效层 -->
  <div
    class="magic-glow pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
    style="--glow-size: {dynamicSize()}px; --glow-x: {mouseX}px; --glow-y: {mouseY}px; --glow-opacity: {gradientOpacity};"
  ></div>
</div>

<style>
  .magic-glow {
    background: radial-gradient(
      var(--glow-size, 200px) circle at var(--glow-x, 0px) var(--glow-y, 0px),
      color-mix(in oklch, var(--color-primary) 40%, transparent),
      transparent 100%
    );
    opacity: var(--glow-opacity, 0.5);
  }
</style>
