<!--
  InfoLayer - 信息层
  z-index: 70
  
  功能：
  - 显示页面信息
  - 显示进度条
  - 显示加载指示器
  - 显示超分进度
-->
<script lang="ts">
  interface Props {
    /** 当前页索引 */
    currentIndex?: number;
    /** 总页数 */
    totalPages?: number;
    /** 是否正在加载 */
    loading?: boolean;
    /** 是否为分割页面 */
    isDivided?: boolean;
    /** 分割半边 */
    splitHalf?: 'left' | 'right' | null;
    /** 是否显示页面信息 */
    showPageInfo?: boolean;
    /** 是否显示进度条 */
    showProgress?: boolean;
    /** 超分进度 (0-100) */
    upscaleProgress?: number;
    /** 是否正在超分 */
    isUpscaling?: boolean;
    /** 超分完成 */
    upscaleComplete?: boolean;
  }

  let {
    currentIndex = 0,
    totalPages = 0,
    loading = false,
    isDivided = false,
    splitHalf = null,
    showPageInfo = true,
    showProgress = true,
    upscaleProgress = 0,
    isUpscaling = false,
    upscaleComplete = false,
  }: Props = $props();

  let progress = $derived(
    totalPages > 0 ? ((currentIndex + 1) / totalPages) * 100 : 0
  );

  let pageDisplay = $derived(
    isDivided && splitHalf 
      ? `${currentIndex + 1}${splitHalf === 'left' ? 'L' : 'R'} / ${totalPages}`
      : `${currentIndex + 1} / ${totalPages}`
  );

  // 超分状态指示
  let upscaleStatusClass = $derived.by(() => {
    if (upscaleComplete) return 'status-complete';
    if (isUpscaling) return 'status-processing';
    return '';
  });
</script>

<div
  class="info-layer"
  data-layer="InfoLayer"
  data-layer-id="info"
>
  <!-- 页面信息 -->
  {#if showPageInfo && totalPages > 0}
    <div class="page-info {upscaleStatusClass}">
      <span>{pageDisplay}</span>
      {#if isDivided}
        <span class="badge">分割</span>
      {/if}
      {#if upscaleComplete}
        <span class="badge badge-success">超分</span>
      {:else if isUpscaling}
        <span class="badge badge-processing">超分中 {Math.round(upscaleProgress)}%</span>
      {/if}
    </div>
  {/if}

  <!-- 加载指示器 -->
  {#if loading}
    <div class="loading-indicator">
      <div class="spinner"></div>
    </div>
  {/if}

  <!-- 进度条 -->
  {#if showProgress && totalPages > 0}
    <div class="progress-bar">
      <div class="progress-fill" style:width="{progress}%"></div>
    </div>
  {/if}
</div>

<style>
  .info-layer {
    position: absolute;
    inset: 0;
    z-index: 70;
    pointer-events: none;
  }

  .page-info {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    color: white;
    font-size: 12px;
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .page-info:global(.status-complete) {
    background: rgba(34, 197, 94, 0.7);
  }

  .page-info:global(.status-processing) {
    background: rgba(234, 179, 8, 0.7);
  }

  .badge {
    background: rgba(255, 255, 255, 0.2);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10px;
  }

  .badge-success {
    background: rgba(34, 197, 94, 0.5);
  }

  .badge-processing {
    background: rgba(234, 179, 8, 0.5);
  }

  .loading-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
  }

  .progress-fill {
    height: 100%;
    background: var(--primary, #3b82f6);
    transition: width 0.3s ease;
  }
</style>
