<script lang="ts">
/**
 * 流光溢彩背景设置卡片
 * 提供流光溢彩动画样式、速度、模糊度、强度的控制界面
 */
import { onMount } from 'svelte';
import { settingsManager, type NeoViewSettings } from '$lib/settings/settingsManager';
import { RotateCcw } from '@lucide/svelte';

// 样式选项
const styleOptions = [
  { value: 'gentle', label: '柔和', desc: '缓慢轻微的移动' },
  { value: 'vibrant', label: '鲜艳', desc: '类似灵动岛效果' },
  { value: 'dynamic', label: '动感', desc: '快速大幅的移动' },
] as const;

// 背景模式选项
const modeOptions = [
  { value: 'solid', label: '固定颜色' },
  { value: 'auto', label: '自动匹配' },
  { value: 'ambient', label: '✨ 流光溢彩' },
] as const;

let settings = $state<NeoViewSettings | null>(null);

onMount(() => {
  settings = settingsManager.getSettings();
  const unsubscribe = settingsManager.addListener((s: NeoViewSettings) => {
    settings = s;
  });
  return unsubscribe;
});

// 当前背景模式
let backgroundMode = $derived(settings?.view.backgroundMode ?? 'solid');
let isAmbientEnabled = $derived(backgroundMode === 'ambient');

// ambient 设置
let ambientStyle = $derived(settings?.view.ambient?.style ?? 'vibrant');
let ambientSpeed = $derived(settings?.view.ambient?.speed ?? 8);
let ambientBlur = $derived(settings?.view.ambient?.blur ?? 80);
let ambientOpacity = $derived(settings?.view.ambient?.opacity ?? 0.8);

// 切换启用
function toggleAmbient() {
  if (!settings) return;
  const newMode = isAmbientEnabled ? 'solid' : 'ambient';
  settingsManager.updateNestedSettings('view', {
    backgroundMode: newMode
  });
}

// 更新背景模式
function updateMode(mode: 'solid' | 'auto' | 'ambient') {
  settingsManager.updateNestedSettings('view', {
    backgroundMode: mode
  });
}

// 更新 ambient 设置
function updateAmbient(updates: Partial<{
  style: 'gentle' | 'vibrant' | 'dynamic';
  speed: number;
  blur: number;
  opacity: number;
}>) {
  if (!settings) return;
  settingsManager.updateNestedSettings('view', {
    ambient: {
      style: settings.view.ambient?.style ?? 'vibrant',
      speed: settings.view.ambient?.speed ?? 8,
      blur: settings.view.ambient?.blur ?? 80,
      opacity: settings.view.ambient?.opacity ?? 0.8,
      ...updates
    }
  });
}

// 重置设置
function resetSettings() {
  settingsManager.updateNestedSettings('view', {
    backgroundMode: 'solid',
    ambient: {
      speed: 8,
      blur: 80,
      opacity: 0.8,
      style: 'vibrant'
    }
  });
}
</script>

{#if settings}
  <div class="space-y-3 text-sm">
    <!-- 启用开关 -->
    <div class="flex items-center justify-between">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isAmbientEnabled}
          onchange={toggleAmbient}
          class="w-4 h-4 rounded border-border"
        />
        <span>启用流光溢彩</span>
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

    <!-- 背景模式选择 -->
    <div class="space-y-1">
      <span class="text-xs text-muted-foreground">背景模式</span>
      <select
        value={backgroundMode}
        onchange={(e) => updateMode(e.currentTarget.value as 'solid' | 'auto' | 'ambient')}
        class="w-full px-2 py-1 text-xs bg-background border border-border rounded"
      >
        {#each modeOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>

    {#if isAmbientEnabled}
      <!-- 动画样式 -->
      <div class="space-y-1">
        <span class="text-xs text-muted-foreground">动画样式</span>
        <div class="grid grid-cols-3 gap-1">
          {#each styleOptions as option}
            <button
              type="button"
              class="px-2 py-1.5 text-xs rounded border transition-colors {ambientStyle === option.value 
                ? 'bg-primary text-primary-foreground border-primary' 
                : 'bg-background border-border hover:bg-accent'}"
              onclick={() => updateAmbient({ style: option.value })}
              title={option.desc}
            >
              {option.label}
            </button>
          {/each}
        </div>
        <p class="text-[10px] text-muted-foreground">
          {styleOptions.find(o => o.value === ambientStyle)?.desc}
        </p>
      </div>

      <!-- 动画速度 -->
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-muted-foreground">动画速度</span>
          <span>{ambientSpeed}s</span>
        </div>
        <input
          type="range"
          min="2"
          max="20"
          step="1"
          value={ambientSpeed}
          oninput={(e) => updateAmbient({ speed: Number(e.currentTarget.value) })}
          class="w-full h-1 accent-primary"
        />
        <div class="flex justify-between text-[10px] text-muted-foreground">
          <span>快 (2s)</span>
          <span>慢 (20s)</span>
        </div>
      </div>

      <!-- 模糊程度 -->
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-muted-foreground">模糊程度</span>
          <span>{ambientBlur}px</span>
        </div>
        <input
          type="range"
          min="20"
          max="150"
          step="10"
          value={ambientBlur}
          oninput={(e) => updateAmbient({ blur: Number(e.currentTarget.value) })}
          class="w-full h-1 accent-primary"
        />
        <div class="flex justify-between text-[10px] text-muted-foreground">
          <span>清晰</span>
          <span>模糊</span>
        </div>
      </div>

      <!-- 效果强度 -->
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-muted-foreground">效果强度</span>
          <span>{Math.round(ambientOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.3"
          max="1"
          step="0.05"
          value={ambientOpacity}
          oninput={(e) => updateAmbient({ opacity: Number(e.currentTarget.value) })}
          class="w-full h-1 accent-primary"
        />
        <div class="flex justify-between text-[10px] text-muted-foreground">
          <span>淡</span>
          <span>浓</span>
        </div>
      </div>

      <!-- 预览区域 -->
      <div class="pt-2 border-t border-border">
        <span class="text-xs text-muted-foreground">效果预览</span>
        <div class="mt-2 h-20 rounded overflow-hidden relative bg-black">
          <div 
            class="ambient-preview absolute inset-0"
            style="--preview-speed: {ambientSpeed}s; --preview-blur: {Math.min(ambientBlur / 4, 20)}px; --preview-opacity: {ambientOpacity};"
            class:preview-gentle={ambientStyle === 'gentle'}
            class:preview-vibrant={ambientStyle === 'vibrant'}
            class:preview-dynamic={ambientStyle === 'dynamic'}
          >
            <div class="preview-blob blob-1"></div>
            <div class="preview-blob blob-2"></div>
            <div class="preview-blob blob-3"></div>
          </div>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-[10px] text-white/60 bg-black/30 px-2 py-0.5 rounded">
              {styleOptions.find(o => o.value === ambientStyle)?.label}
            </span>
          </div>
        </div>
      </div>

      <!-- 说明 -->
      <p class="text-[10px] text-muted-foreground pt-1">
        ✨ 从图片中提取主色调，生成类似苹果灵动岛的流动渐变效果
      </p>
    {/if}
  </div>
{:else}
  <div class="text-sm text-muted-foreground text-center py-2">
    加载中...
  </div>
{/if}

<style>
  .ambient-preview {
    filter: blur(var(--preview-blur, 15px));
    opacity: var(--preview-opacity, 0.8);
  }

  .preview-blob {
    position: absolute;
    border-radius: 50%;
    mix-blend-mode: screen;
  }

  .blob-1 {
    width: 60%;
    height: 80%;
    background: radial-gradient(circle, #6366f1 0%, transparent 70%);
    top: -10%;
    left: -10%;
  }

  .blob-2 {
    width: 50%;
    height: 70%;
    background: radial-gradient(circle, #ec4899 0%, transparent 70%);
    top: 20%;
    right: -5%;
  }

  .blob-3 {
    width: 55%;
    height: 75%;
    background: radial-gradient(circle, #22c55e 0%, transparent 70%);
    bottom: -20%;
    left: 30%;
  }

  /* 柔和动画 */
  .preview-gentle .blob-1 {
    animation: gentle-1 calc(var(--preview-speed) * 1.5) ease-in-out infinite;
  }
  .preview-gentle .blob-2 {
    animation: gentle-2 calc(var(--preview-speed) * 1.8) ease-in-out infinite;
    animation-delay: calc(var(--preview-speed) * -0.3);
  }
  .preview-gentle .blob-3 {
    animation: gentle-3 calc(var(--preview-speed) * 2) ease-in-out infinite;
    animation-delay: calc(var(--preview-speed) * -0.6);
  }

  @keyframes gentle-1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(5%, 3%) scale(1.05); }
  }
  @keyframes gentle-2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(-4%, 5%) scale(0.95); }
  }
  @keyframes gentle-3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(3%, -4%) scale(1.03); }
  }

  /* 鲜艳动画 */
  .preview-vibrant .blob-1 {
    animation: vibrant-1 var(--preview-speed) ease-in-out infinite;
  }
  .preview-vibrant .blob-2 {
    animation: vibrant-2 calc(var(--preview-speed) * 1.2) ease-in-out infinite;
    animation-delay: calc(var(--preview-speed) * -0.25);
  }
  .preview-vibrant .blob-3 {
    animation: vibrant-3 calc(var(--preview-speed) * 0.9) ease-in-out infinite;
    animation-delay: calc(var(--preview-speed) * -0.5);
  }

  @keyframes vibrant-1 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(10%, 5%) scale(1.1) rotate(5deg); }
    50% { transform: translate(5%, 10%) scale(0.95) rotate(-3deg); }
    75% { transform: translate(-5%, 5%) scale(1.05) rotate(3deg); }
  }
  @keyframes vibrant-2 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(-8%, 10%) scale(0.9) rotate(-5deg); }
    50% { transform: translate(-15%, 5%) scale(1.1) rotate(5deg); }
    75% { transform: translate(-5%, -5%) scale(1) rotate(-3deg); }
  }
  @keyframes vibrant-3 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    25% { transform: translate(8%, -8%) scale(1.05) rotate(8deg); }
    50% { transform: translate(15%, 5%) scale(0.9) rotate(-5deg); }
    75% { transform: translate(5%, 10%) scale(1.1) rotate(3deg); }
  }

  /* 动感动画 */
  .preview-dynamic .blob-1 {
    animation: dynamic-1 calc(var(--preview-speed) * 0.6) ease-in-out infinite;
  }
  .preview-dynamic .blob-2 {
    animation: dynamic-2 calc(var(--preview-speed) * 0.7) ease-in-out infinite;
    animation-delay: calc(var(--preview-speed) * -0.1);
  }
  .preview-dynamic .blob-3 {
    animation: dynamic-3 calc(var(--preview-speed) * 0.5) ease-in-out infinite;
    animation-delay: calc(var(--preview-speed) * -0.2);
  }

  @keyframes dynamic-1 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(15%, 10%) scale(1.2) rotate(10deg); }
    40% { transform: translate(25%, -5%) scale(0.8) rotate(-15deg); }
    60% { transform: translate(10%, -15%) scale(1.1) rotate(5deg); }
    80% { transform: translate(-10%, -5%) scale(0.9) rotate(-5deg); }
  }
  @keyframes dynamic-2 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(-20%, 15%) scale(0.8) rotate(-12deg); }
    40% { transform: translate(-10%, 25%) scale(1.15) rotate(8deg); }
    60% { transform: translate(10%, 15%) scale(0.9) rotate(-8deg); }
    80% { transform: translate(5%, -10%) scale(1.1) rotate(5deg); }
  }
  @keyframes dynamic-3 {
    0%, 100% { transform: translate(0, 0) scale(1) rotate(0deg); }
    20% { transform: translate(20%, -20%) scale(1.15) rotate(15deg); }
    40% { transform: translate(30%, 10%) scale(0.85) rotate(-10deg); }
    60% { transform: translate(5%, 20%) scale(1.2) rotate(8deg); }
    80% { transform: translate(-15%, 5%) scale(0.9) rotate(-5deg); }
  }
</style>
