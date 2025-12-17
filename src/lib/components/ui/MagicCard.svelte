<script lang="ts">
  /**
   * MagicCard - 鼠标跟随光效卡片组件
   * 基于 animation-svelte 实现
   */
  import { cn } from "$lib/utils";

  interface Props {
    gradientSize?: number;
    gradientColor?: string;
    gradientOpacity?: number;
    class?: string;
    children?: import('svelte').Snippet;
  }

  let {
    gradientSize = 200,
    gradientColor = "#262626",
    gradientOpacity = 0.8,
    class: className = "",
    children
  }: Props = $props();

  let mouseX = $state(-gradientSize);
  let mouseY = $state(-gradientSize);

  function handleMouseMove(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  }

  function handleMouseLeave() {
    mouseX = -gradientSize;
    mouseY = -gradientSize;
  }

  // 构建渐变背景
  const bg = $derived(`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 100%)`);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  class={cn("group relative overflow-hidden", className)}
>
  <!-- 内容区 -->
  <div class="relative z-10 w-full">
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
    class="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
    style="background: {bg}; opacity: {gradientOpacity};"
  ></div>
</div>
