<!--
  LayerTreeView - 层树视图（Flow 模式调试用）
  
  显示 StackView 中所有层的真实节点结构
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  let {
    containerRef = null,
    refreshInterval = 1000,
  }: {
    containerRef?: HTMLElement | null;
    refreshInterval?: number;
  } = $props();
  
  // 层节点类型
  interface LayerNode {
    id: string;
    name: string;
    zIndex: number;
    visible: boolean;
    empty: boolean;
    children: LayerNodeChild[];
  }
  
  interface LayerNodeChild {
    tag: string;
    className?: string;
    info?: string;
  }
  
  let layers = $state<LayerNode[]>([]);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  
  // 从 DOM 收集层信息
  function collectLayerNodes(): LayerNode[] {
    if (!containerRef) return [];
    
    const result: LayerNode[] = [];
    
    // 查找所有带 data-layer 属性的元素
    containerRef.querySelectorAll('[data-layer]').forEach(el => {
      const htmlEl = el as HTMLElement;
      const style = getComputedStyle(htmlEl);
      
      const layer: LayerNode = {
        id: htmlEl.getAttribute('data-layer-id') || '',
        name: htmlEl.getAttribute('data-layer') || htmlEl.className.split(' ')[0] || 'unknown',
        zIndex: parseInt(style.zIndex) || 0,
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        empty: htmlEl.children.length === 0,
        children: [],
      };
      
      // 收集直接子节点信息
      Array.from(htmlEl.children).slice(0, 5).forEach(child => {
        const childEl = child as HTMLElement;
        const childInfo = childEl.getAttribute('data-info');
        
        layer.children.push({
          tag: childEl.tagName.toLowerCase(),
          className: childEl.className.split(' ')[0] || undefined,
          info: childInfo || getElementInfo(childEl),
        });
      });
      
      // 如果子节点超过5个，添加省略提示
      if (htmlEl.children.length > 5) {
        layer.children.push({
          tag: '...',
          info: `+${htmlEl.children.length - 5} more`,
        });
      }
      
      result.push(layer);
    });
    
    return result.sort((a, b) => a.zIndex - b.zIndex);
  }
  
  // 获取元素的额外信息
  function getElementInfo(el: HTMLElement): string | undefined {
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement;
      if (img.complete && img.naturalWidth) {
        return `${img.naturalWidth}x${img.naturalHeight}`;
      }
      return 'loading...';
    }
    if (el.tagName === 'VIDEO') {
      const video = el as HTMLVideoElement;
      return video.paused ? 'paused' : 'playing';
    }
    return undefined;
  }
  
  // 刷新层信息
  function refresh() {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        layers = collectLayerNodes();
      });
    } else {
      layers = collectLayerNodes();
    }
  }
  
  onMount(() => {
    refresh();
    intervalId = setInterval(refresh, refreshInterval);
  });
  
  onDestroy(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });
  
  // 手动刷新
  export function forceRefresh() {
    refresh();
  }
</script>

<div class="layer-tree">
  <div class="tree-header">
    <span class="header-title">StackView</span>
    <span class="header-count">({layers.length} layers)</span>
    <button class="refresh-btn" onclick={refresh} type="button">↻</button>
  </div>
  
  <div class="tree-content">
    {#each layers as layer, i (layer.id || i)}
      {@const isLast = i === layers.length - 1}
      <div class="tree-node" class:hidden={!layer.visible} class:empty={layer.empty}>
        <span class="node-prefix">{isLast ? '└──' : '├──'}</span>
        <span class="node-name">{layer.name}</span>
        <span class="node-zindex">(z:{layer.zIndex})</span>
        {#if !layer.visible}
          <span class="node-badge hidden">[hidden]</span>
        {/if}
        {#if layer.empty}
          <span class="node-badge empty">[empty]</span>
        {/if}
        
        {#each layer.children as child, j}
          {@const isChildLast = j === layer.children.length - 1}
          <div class="tree-child">
            <span class="child-prefix">{isLast ? '    ' : '│   '}{isChildLast ? '└──' : '├──'}</span>
            <span class="child-tag">{child.tag}</span>
            {#if child.className}
              <span class="child-class">.{child.className}</span>
            {/if}
            {#if child.info}
              <span class="child-info">[{child.info}]</span>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
    
    {#if layers.length === 0}
      <div class="tree-empty">No layers found</div>
    {/if}
  </div>
</div>

<style>
  .layer-tree {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.8);
    color: #e0e0e0;
    border-radius: 4px;
    padding: 8px;
    max-width: 400px;
    max-height: 500px;
    overflow: auto;
  }
  
  .tree-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #444;
    margin-bottom: 8px;
  }
  
  .header-title {
    font-weight: bold;
    color: #fff;
  }
  
  .header-count {
    color: #888;
  }
  
  .refresh-btn {
    margin-left: auto;
    background: transparent;
    border: 1px solid #555;
    color: #aaa;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  
  .refresh-btn:hover {
    background: #333;
    color: #fff;
  }
  
  .tree-content {
    line-height: 1.6;
  }
  
  .tree-node {
    white-space: nowrap;
  }
  
  .tree-node.hidden {
    opacity: 0.5;
  }
  
  .tree-node.empty .node-name {
    color: #888;
  }
  
  .node-prefix,
  .child-prefix {
    color: #555;
  }
  
  .node-name {
    color: #4fc3f7;
  }
  
  .node-zindex {
    color: #888;
    margin-left: 4px;
  }
  
  .node-badge {
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 2px;
    font-size: 10px;
  }
  
  .node-badge.hidden {
    background: #5d4037;
    color: #ffab91;
  }
  
  .node-badge.empty {
    background: #37474f;
    color: #90a4ae;
  }
  
  .tree-child {
    color: #aaa;
  }
  
  .child-tag {
    color: #81c784;
  }
  
  .child-class {
    color: #ffb74d;
  }
  
  .child-info {
    color: #9e9e9e;
    margin-left: 4px;
  }
  
  .tree-empty {
    color: #666;
    font-style: italic;
  }
</style>
