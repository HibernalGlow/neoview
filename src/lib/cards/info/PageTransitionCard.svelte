<script lang="ts">
/**
 * 翻页动画设置卡片
 * 提供翻页动画类型、时长、缓动函数的控制界面
 */
import { onMount } from 'svelte';
import {
  pageTransitionStore,
  transitionTypeNames,
  easingNames,
  type PageTransitionSettings,
  type PageTransitionType,
  type EasingType,
} from '$lib/stores/pageTransitionStore.svelte';
import { RotateCcw } from '@lucide/svelte';

let settings = $state<PageTransitionSettings | null>(null);

// 动画类型列表
const transitionTypes: PageTransitionType[] = ['none', 'fade', 'slide', 'slideUp', 'zoom', 'flip'];

// 缓动函数列表
const easingTypes: EasingType[] = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut', 'easeOutQuad', 'easeOutCubic'];

onMount(() => {
  const unsubscribe = pageTransitionStore.subscribe((s) => {
    settings = s;
  });
  return unsubscribe;
});

// 切换启用
function toggleEnabled() {
  if (settings) {
    pageTransitionStore.setEnabled(!settings.enabled);
  }
}

// 重置设置
function resetSettings() {
  pageTransitionStore.reset();
}
</script>

{#if settings}
  <div class="space-y-3 text-sm">
    <!-- 启用开关 -->
    <div class="flex items-center justify-between">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.enabled}
          onchange={toggleEnabled}
          class="w-4 h-4 rounded border-border"
        />
        <span>启用翻页动画</span>
      </label>
      <button
        type="button"
        onclick={resetSettings}
        class="p-1 hover:bg-accent rounded"
        title="重置设置"
      >
        <RotateCcw class="w-4 h-4" />
      </button>
    </div>

    {#if settings.enabled}
      <!-- 动画类型 -->
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground">动画类型</span>
        <select
          value={settings.type}
          onchange={(e) => pageTransitionStore.setType(e.currentTarget.value as PageTransitionType)}
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
        >
          {#each transitionTypes as type}
            <option value={type}>{transitionTypeNames[type]}</option>
          {/each}
        </select>
      </div>

      <!-- 动画时长 -->
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-muted-foreground">动画时长</span>
          <span>{settings.duration}ms</span>
        </div>
        <input
          type="range"
          min="0"
          max="500"
          step="10"
          value={settings.duration}
          oninput={(e) => pageTransitionStore.setDuration(Number(e.currentTarget.value))}
          class="w-full h-1 accent-primary"
        />
        <div class="flex justify-between text-[10px] text-muted-foreground">
          <span>0ms</span>
          <span>500ms</span>
        </div>
      </div>

      <!-- 缓动函数 -->
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground">缓动函数</span>
        <select
          value={settings.easing}
          onchange={(e) => pageTransitionStore.setEasing(e.currentTarget.value as EasingType)}
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
        >
          {#each easingTypes as easing}
            <option value={easing}>{easingNames[easing]}</option>
          {/each}
        </select>
      </div>

      <!-- 预览区域 -->
      <div class="pt-2 border-t border-border">
        <span class="text-xs text-muted-foreground">预览</span>
        <div class="mt-2 h-16 bg-muted/30 rounded overflow-hidden relative">
          <div
            class="absolute inset-2 bg-primary/20 rounded flex items-center justify-center text-xs text-muted-foreground transition-all preview-box"
            style="transition: all {settings.duration}ms {settings.easing === 'easeOutQuad' ? 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' : settings.easing === 'easeOutCubic' ? 'cubic-bezier(0.215, 0.61, 0.355, 1)' : settings.easing};"
          >
            {transitionTypeNames[settings.type]}
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="text-sm text-muted-foreground text-center py-2">
    加载中...
  </div>
{/if}

<style>
  .preview-box:hover {
    transform: scale(0.95);
    opacity: 0.7;
  }
</style>
