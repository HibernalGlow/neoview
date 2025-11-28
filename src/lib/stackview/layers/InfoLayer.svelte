<!--
  InfoLayer - 信息层
  z-index: 70
-->
<script lang="ts">
  import { LayerZIndex } from '../types/layer';
  
  let {
    currentIndex = 0,
    totalPages = 0,
    isLoading = false,
    isDivided = false,
    showPageInfo = true,
    showProgress = true,
    showLoading = true,
  }: {
    currentIndex?: number;
    totalPages?: number;
    isLoading?: boolean;
    isDivided?: boolean;
    showPageInfo?: boolean;
    showProgress?: boolean;
    showLoading?: boolean;
  } = $props();
  
  let progress = $derived(totalPages > 0 ? ((currentIndex + 1) / totalPages) * 100 : 0);
</script>

<div 
  class="info-layer"
  style:z-index={LayerZIndex.INFO}
>
  <!-- 页面信息 -->
  {#if showPageInfo && totalPages > 0}
    <div class="page-info">
      <span>{currentIndex + 1} / {totalPages}</span>
      {#if isDivided}
        <span class="badge">分割</span>
      {/if}
    </div>
  {/if}
  
  <!-- 加载指示器 -->
  {#if showLoading && isLoading}
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
  
  .badge {
    background: rgba(255, 255, 255, 0.2);
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10px;
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
