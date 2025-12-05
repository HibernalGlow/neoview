<!--
  UpscaleLayer - 超分状态指示器
  
  V2 架构变更：
  - 超分图现在通过 imagePool 显示，不再需要独立显示层
  - 此组件仅作为状态指示器，显示超分处理进度
  - 原有图片系统（缩放/旋转）完全复用
  
  z-index: 50
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { LayerZIndex } from '../types/layer';
  import { getUpscaleStore } from '../stores/upscaleStore.svelte';
  import { imagePool } from '../stores/imagePool.svelte';
  
  // ============================================================================
  // Props
  // ============================================================================
  
  let {
    pageIndex = 0,
    enabled = false,
    showIndicator = true,
  }: {
    /** 当前页面索引 */
    pageIndex?: number;
    /** 是否启用超分 */
    enabled?: boolean;
    /** 是否显示加载指示器 */
    showIndicator?: boolean;
  } = $props();
  
  // ============================================================================
  // Store
  // ============================================================================
  
  const upscaleStore = getUpscaleStore();
  
  // ============================================================================
  // Derived
  // ============================================================================
  
  /** 当前页面的超分状态 */
  let status = $derived.by(() => {
    return upscaleStore.getPageStatus(pageIndex);
  });
  
  /** 是否正在加载 */
  let isLoading = $derived(
    enabled && (status === 'pending' || status === 'processing' || status === 'checking')
  );
  
  /** 是否已完成超分 */
  let isUpscaled = $derived(enabled && imagePool.hasUpscaled(pageIndex));
  
  // ============================================================================
  // Lifecycle
  // ============================================================================
  
  onMount(async () => {
    // 确保 store 已初始化
    await upscaleStore.init();
  });
</script>

<!-- 
  注意：超分图现在通过 imagePool.getDisplayUrl() 显示
  此组件不再渲染图片，只显示状态指示器
-->

<!-- 加载指示器 -->
{#if showIndicator && isLoading}
  <div 
    class="upscale-loading-indicator"
    style:z-index={LayerZIndex.UPSCALE + 1}
    data-page-index={pageIndex}
    data-status={status}
  >
    <div class="loading-spinner"></div>
    <span class="loading-text">超分处理中...</span>
  </div>
{/if}

<!-- 完成指示器（可选，短暂显示后隐藏） -->
{#if showIndicator && isUpscaled && status === 'completed'}
  <div 
    class="upscale-complete-indicator"
    style:z-index={LayerZIndex.UPSCALE + 1}
  >
    <span class="complete-icon">✓</span>
    <span class="complete-text">已超分</span>
  </div>
{/if}

<style>
  /* 加载指示器 */
  .upscale-loading-indicator {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.7);
    border-radius: 8px;
    color: white;
    font-size: 12px;
    pointer-events: none;
    animation: fadeIn 0.2s ease;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .loading-text {
    white-space: nowrap;
  }
  
  /* 完成指示器 */
  .upscale-complete-indicator {
    position: absolute;
    bottom: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(34, 139, 34, 0.8);
    border-radius: 6px;
    color: white;
    font-size: 11px;
    pointer-events: none;
    animation: fadeIn 0.2s ease, fadeOut 0.3s ease 2s forwards;
  }
  
  .complete-icon {
    font-size: 14px;
  }
  
  .complete-text {
    white-space: nowrap;
  }
</style>
