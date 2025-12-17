<script lang="ts">
  /**
   * MagicCard - 鼠标跟随光效卡片组件
   * 基于 animation-svelte 实现，使用主题色
   */
  import { cn } from "$lib/utils";

  interface Props {
    gradientSize?: number;
    gradientOpacity?: number;
    class?: string;
    children?: import('svelte').Snippet;
  }

  let {
    gradientSize = 200,
    gradientOpacity = 0.5,
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
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  class={cn("group relative overflow-hidden", className)}
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
    style="--glow-size: {gradientSize}px; --glow-x: {mouseX}px; --glow-y: {mouseY}px; --glow-opacity: {gradientOpacity};"
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
