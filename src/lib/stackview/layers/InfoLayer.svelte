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
    splitHalf = null,
    showPageInfo = true,
    showLoading = true,
  }: {
    currentIndex?: number;
    totalPages?: number;
    isLoading?: boolean;
    isDivided?: boolean;
    splitHalf?: 'left' | 'right' | null;
    showPageInfo?: boolean;
    showLoading?: boolean;
  } = $props();
  
  // 页面显示文本
  let pageDisplay = $derived.by(() => {
    if (isDivided && splitHalf) {
      const halfLabel = splitHalf === 'left' ? 'L' : 'R';
      return `${currentIndex + 1}${halfLabel} / ${totalPages}`;
    }
    return `${currentIndex + 1} / ${totalPages}`;
  });
  
  </script>

<div 
  class="info-layer"
  data-layer="InfoLayer"
  data-layer-id="info"
  style:z-index={LayerZIndex.INFO}
>
  <!-- 页面信息 -->
  {#if showPageInfo && totalPages > 0}
    <div class="page-info">
      <span>{pageDisplay}</span>
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
    padding: 4px 10px;
    background: hsl(var(--primary) / 0.85);
    backdrop-filter: blur(4px);
    border-radius: 6px;
    color: hsl(var(--primary-foreground));
    font-size: 12px;
    font-weight: 500;
    display: flex;
    gap: 4px;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  
  .badge {
    background: hsl(var(--primary-foreground) / 0.2);
    padding: 1px 6px;
    border-radius: 4px;
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
  
</style>
