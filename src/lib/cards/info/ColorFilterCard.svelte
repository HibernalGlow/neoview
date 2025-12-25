<script lang="ts">
/**
 * 颜色滤镜设置卡片
 * 提供上色和基础滤镜的控制界面
 */
import { onMount } from 'svelte';
import { filterStore, colorPresets, type FilterSettings } from '$lib/stores/filterStore.svelte';
import { presetNames } from '$lib/utils/colorFilters';
import { RotateCcw } from '@lucide/svelte';

let settings = $state<FilterSettings | null>(null);

// 预设列表
const presetList = Object.keys(colorPresets);

onMount(() => {
  // 初始化滤镜
  filterStore.init();
  
  const unsubscribe = filterStore.subscribe((s) => {
    settings = s;
  });
  return unsubscribe;
});

// 切换上色
function toggleColorize() {
  if (settings) {
    filterStore.setColorizeEnabled(!settings.colorizeEnabled);
  }
}

// 切换反色
function toggleInvert() {
  if (settings) {
    filterStore.setInvert(!settings.invert);
  }
}

// 切换负片
function toggleNegative() {
  if (settings) {
    filterStore.setNegative(!settings.negative);
  }
}

// 重置滤镜
function resetFilters() {
  filterStore.reset();
}
</script>

{#if settings}
  <div class="space-y-3 text-sm">
    <!-- 上色开关和预设 -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.colorizeEnabled}
            onchange={toggleColorize}
            class="w-4 h-4 rounded border-border"
          />
          <span>上色</span>
        </label>
        <button
          type="button"
          onclick={resetFilters}
          class="p-1 hover:bg-accent rounded"
          title="重置所有滤镜"
        >
          <RotateCcw class="w-4 h-4" />
        </button>
      </div>
      
      {#if settings.colorizeEnabled}
        <select
          value={settings.colorizePreset}
          onchange={(e) => filterStore.setColorizePreset(e.currentTarget.value)}
          class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
        >
          {#each presetList as preset}
            <option value={preset}>{presetNames[preset] || preset}</option>
          {/each}
        </select>
      {/if}
    </div>

    <!-- 亮度 -->
    <div class="space-y-1">
      <div class="flex justify-between text-xs">
        <span class="text-muted-foreground">亮度</span>
        <span>{settings.brightness}%</span>
      </div>
      <input
        type="range"
        min="50"
        max="150"
        value={settings.brightness}
        oninput={(e) => filterStore.setBrightness(Number(e.currentTarget.value))}
        class="w-full h-1 accent-primary"
      />
    </div>

    <!-- 对比度 -->
    <div class="space-y-1">
      <div class="flex justify-between text-xs">
        <span class="text-muted-foreground">对比度</span>
        <span>{settings.contrast}%</span>
      </div>
      <input
        type="range"
        min="50"
        max="150"
        value={settings.contrast}
        oninput={(e) => filterStore.setContrast(Number(e.currentTarget.value))}
        class="w-full h-1 accent-primary"
      />
    </div>

    <!-- 饱和度 -->
    <div class="space-y-1">
      <div class="flex justify-between text-xs">
        <span class="text-muted-foreground">饱和度</span>
        <span>{settings.saturation}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="200"
        value={settings.saturation}
        oninput={(e) => filterStore.setSaturation(Number(e.currentTarget.value))}
        class="w-full h-1 accent-primary"
      />
    </div>

    <!-- 褐色 -->
    <div class="space-y-1">
      <div class="flex justify-between text-xs">
        <span class="text-muted-foreground">褐色</span>
        <span>{settings.sepia}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={settings.sepia}
        oninput={(e) => filterStore.setSepia(Number(e.currentTarget.value))}
        class="w-full h-1 accent-primary"
      />
    </div>

    <!-- 色相旋转 -->
    <div class="space-y-1">
      <div class="flex justify-between text-xs">
        <span class="text-muted-foreground">色相</span>
        <span>{settings.hueRotate}°</span>
      </div>
      <input
        type="range"
        min="0"
        max="360"
        value={settings.hueRotate}
        oninput={(e) => filterStore.setHueRotate(Number(e.currentTarget.value))}
        class="w-full h-1 accent-primary"
      />
    </div>

    <!-- 反色和负片 -->
    <div class="flex gap-4 pt-1">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.invert}
          onchange={toggleInvert}
          class="w-4 h-4 rounded border-border"
        />
        <span class="text-xs">反色</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.negative}
          onchange={toggleNegative}
          class="w-4 h-4 rounded border-border"
        />
        <span class="text-xs">负片</span>
      </label>
    </div>
  </div>
{:else}
  <div class="text-sm text-muted-foreground text-center py-2">
    加载中...
  </div>
{/if}
