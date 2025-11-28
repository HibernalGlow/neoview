<!--
  StackViewerNode - StackViewer 节点（Flow 模式）
  
  显示 StackView 和 LayerTreeView 调试面板
-->
<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import { StackView } from '$lib/stackview';
  import { LayerTreeView } from '$lib/stackview/layers';
  import { bookStore } from '$lib/stores';
  import { settingsManager } from '$lib/settings/settingsManager';
  
  let { data }: NodeProps = $props();
  
  let stackViewRef: HTMLDivElement | null = $state(null);
  let showLayerTree = $state(true);
  let settings = $state(settingsManager.getSettings());
  
  settingsManager.addListener((newSettings) => {
    settings = newSettings;
  });
  
  // 获取当前图片 URL（从 bookStore 获取）
  let upscaledUrl = $derived(bookStore.upscaledImageData);
  let viewMode: 'single' | 'double' | 'panorama' = 'single';
  let direction: 'ltr' | 'rtl' = $derived(
    settings.book.readingDirection === 'right-to-left' ? 'rtl' : 'ltr'
  );
</script>

<div class="stack-viewer-node">
  <!-- 拖拽手柄 -->
  <div class="drag-handle">
    <span class="icon">📚</span>
    <span>StackViewer</span>
    <button 
      type="button"
      class="toggle-btn"
      onclick={() => showLayerTree = !showLayerTree}
    >
      {showLayerTree ? '▲' : '▼'}
    </button>
  </div>
  
  <!-- 内容区域 -->
  <div class="node-content">
    <!-- StackView 容器 -->
    <div class="stack-view-container" bind:this={stackViewRef}>
      <StackView
        currentUrl={null}
        upscaledUrl={upscaledUrl}
        layout={viewMode}
        {direction}
      />
    </div>
    
    <!-- LayerTreeView 调试面板 -->
    {#if showLayerTree && stackViewRef}
      <div class="layer-tree-container">
        <LayerTreeView containerRef={stackViewRef} />
      </div>
    {/if}
  </div>
  
  <!-- 连接点 -->
  <Handle type="target" position={Position.Left} />
  <Handle type="source" position={Position.Right} />
</div>

<style>
  .stack-viewer-node {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
    min-width: 600px;
    min-height: 400px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .drag-handle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    cursor: grab;
    font-size: 14px;
    font-weight: 500;
  }
  
  .drag-handle:active {
    cursor: grabbing;
  }
  
  .toggle-btn {
    margin-left: auto;
    background: transparent;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--muted-foreground);
    border-radius: 4px;
  }
  
  .toggle-btn:hover {
    background: var(--accent);
    color: var(--accent-foreground);
  }
  
  .node-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  
  .stack-view-container {
    flex: 1;
    position: relative;
    min-width: 400px;
    background: #1a1a1a;
  }
  
  .layer-tree-container {
    width: 300px;
    border-left: 1px solid var(--border);
    overflow: auto;
    background: var(--background);
  }
</style>
