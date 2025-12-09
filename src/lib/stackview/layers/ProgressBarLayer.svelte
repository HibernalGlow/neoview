<!--
  ProgressBarLayer - 进度条层
  从 ImageViewerProgressBar 移植，集成到 StackView 层系统
  z-index: 65
-->
<script lang="ts">
  import { bookStore } from '$lib/stores/book.svelte';
  import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';
  import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
  import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
  import { settingsManager } from '$lib/settings/settingsManager';
  import type { ReadingDirection } from '$lib/settings/settingsManager';
  import { LayerZIndex } from '../types/layer';

  let {
    showProgressBar = true,
    preUpscaleProgress = 0,
    totalPreUpscalePages = 0
  }: {
    showProgressBar?: boolean;
    preUpscaleProgress?: number;
    totalPreUpscalePages?: number;
  } = $props();

  // 从 bookStore 获取数据
  let totalPages = $derived(bookStore.totalPages);
  let currentPageIndex = $derived(bookStore.currentPageIndex);

  // 内部状态
  let progressColor = $state('#FDFBF7');
  let progressBlinking = $state(false);

  // 阅读方向
  let settings = $state(settingsManager.getSettings());
  let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);

  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });

  // 计算预超分覆盖范围
  const furthestPreUpscaledIndex = $derived(bookStore.getFurthestPreUpscaledIndex());
  const preUpscaledCount = $derived(
    furthestPreUpscaledIndex >= 0 ? furthestPreUpscaledIndex + 1 : 0
  );
  const preUpscaleExtent = $derived(
    totalPages > 0 && preUpscaledCount > 0 ? (preUpscaledCount / totalPages) * 100 : 0
  );
  const preUpscaleBarWidth = $derived(
    preUpscaleProgress > 0 ? preUpscaleProgress : preUpscaleExtent
  );

  // 计算已完成超分的页面数（用于超分实时进度条）
  // 使用 imagePool.hasUpscaled() 判断，与 UpscaleLayer 保持一致
  // 依赖 imagePool.version 和 upscaleStore.version 触发响应式更新
  const upscaleEnabled = $derived(upscaleStore.enabled);
  const imagePoolVersion = $derived(imagePool.version);
  const upscaleStoreVersion = $derived(upscaleStore.version);
  const upscaledPagesCount = $derived(() => {
    // 依赖两个 version 触发更新
    void imagePoolVersion;
    void upscaleStoreVersion;
    let count = 0;
    for (let i = 0; i < totalPages; i++) {
      if (imagePool.hasUpscaled(i)) {
        count++;
      }
    }
    return count;
  });
  const upscaleProgressPercent = $derived(
    totalPages > 0 ? (upscaledPagesCount() / totalPages) * 100 : 0
  );
  
  // 检查是否有正在处理中的超分任务
  const hasActiveUpscale = $derived(
    upscaleStore.stats.processingTasks > 0 || upscaleStore.stats.pendingTasks > 0
  );

  // 根据当前页面状态和全局状态计算进度条状态
  const currentPageStatus = $derived(
    totalPages > 0 ? bookStore.getPageUpscaleStatus(currentPageIndex) : 'none'
  );
  const isCurrentPageUpscaling = $derived(
    upscaleState.isUpscaling && upscaleState.currentImageHash !== null
  );
  const isLastPage = $derived(totalPages > 0 && currentPageIndex === totalPages - 1);

  // 更新进度条状态
  $effect(() => {
    if (isCurrentPageUpscaling) {
      progressColor = '#FFFFFF';
      progressBlinking = true;
    } else if (currentPageStatus === 'done') {
      progressColor = '#bbf7d0';
      progressBlinking = false;
    } else if (currentPageStatus === 'failed') {
      progressColor = '#ef4444';
      progressBlinking = false;
    } else if (isLastPage) {
      progressColor = 'var(--primary)';
      progressBlinking = false;
    } else {
      progressColor = 'var(--accent)';
      progressBlinking = false;
    }
  });
</script>

{#if showProgressBar && totalPages > 0}
  <div 
    class="progress-bar-layer"
    data-layer="ProgressBarLayer"
    data-layer-id="progress-bar"
    style:z-index={LayerZIndex.INFO - 5}
  >
    <div class="bar-track" class:rtl={readingDirection === 'right-to-left'}>
      <!-- 最底层：预超分覆盖进度条 -->
      {#if preUpscaleBarWidth > 0}
        <div
          class="preup-bar"
          class:rtl={readingDirection === 'right-to-left'}
          style:width="{Math.min(preUpscaleBarWidth, 100)}%"
        ></div>
      {/if}

      <!-- 中层：超分实时进度条（青色并行处理颜色）-->
      {#if upscaleEnabled}
        <!-- 超分进度条轨道（始终显示） -->
        <div
          class="upscale-track"
          class:rtl={readingDirection === 'right-to-left'}
        ></div>
        <!-- 超分进度条（显示已完成超分的页面进度） -->
        {#if upscaleProgressPercent > 0}
          <div
            class="upscale-progress-bar"
            class:rtl={readingDirection === 'right-to-left'}
            class:processing={hasActiveUpscale}
            style:width="{Math.min(upscaleProgressPercent, 100)}%"
          ></div>
        {/if}
      {/if}

      <!-- 上层：阅读进度 + 当前页状态 -->
      <div
        class="reading-bar"
        class:animate-pulse={progressBlinking}
        class:rtl={readingDirection === 'right-to-left'}
        style:width="{((currentPageIndex + 1) / totalPages) * 100}%"
        style:background-color={progressColor}
      ></div>
    </div>
  </div>
{/if}

<style>
  .progress-bar-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1.8rem;
    background: transparent;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  .bar-track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 4px;
    background: color-mix(in srgb, var(--muted), transparent 50%);
  }

  .bar-track.rtl {
    direction: rtl;
  }

  /* 预超分覆盖进度条 */
  .preup-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 100%;
    background-color: rgba(250, 204, 21, 0.7);
    transition: width 0.4s ease;
    border-radius: 0 2px 2px 0;
  }

  .preup-bar.rtl {
    left: auto;
    right: 0;
    border-radius: 2px 0 0 2px;
  }

  /* 超分进度条轨道 - 与主进度条重叠位置 */
  .upscale-track {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 100%;
    background: rgba(6, 182, 212, 0.2);
    border-radius: 2px;
  }

  .upscale-track.rtl {
    direction: rtl;
  }

  /* 超分实时进度条 - 青色（并行处理颜色，类似 jwalk 的并行特性） */
  /* 与主进度条重叠，作为背景层 */
  .upscale-progress-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 100%;
    background: linear-gradient(90deg, #06b6d4 0%, #22d3ee 50%, #67e8f9 100%);
    transition: width 0.4s ease;
    border-radius: 0 2px 2px 0;
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.6), 0 0 16px rgba(6, 182, 212, 0.3);
  }

  .upscale-progress-bar.rtl {
    left: auto;
    right: 0;
    border-radius: 2px 0 0 2px;
  }

  .upscale-progress-bar.processing {
    animation: upscale-glow 1.5s ease-in-out infinite;
  }

  @keyframes upscale-glow {
    0%, 100% {
      box-shadow: 0 0 8px rgba(6, 182, 212, 0.6), 0 0 16px rgba(6, 182, 212, 0.3);
    }
    50% {
      box-shadow: 0 0 12px rgba(6, 182, 212, 0.9), 0 0 24px rgba(6, 182, 212, 0.5);
    }
  }

  /* 主阅读进度条在最上层，覆盖超分进度条 */
  .reading-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 100%;
    border-radius: 0 2px 2px 0;
    transition:
      width 0.3s ease,
      background-color 0.3s ease;
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
  }

  .reading-bar.rtl {
    left: auto;
    right: 0;
    border-radius: 2px 0 0 2px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
