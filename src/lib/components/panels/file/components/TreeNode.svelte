<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ChevronRight, ChevronDown, Folder, FolderOpen, File, Image, Archive, Music, Video } from '@lucide/svelte';
  import { fileTreeStore } from '$lib/stores/fileTree.svelte';
  import { selectionStore } from '$lib/stores/selection.svelte';
  import type { FsItem, FileTreeNode } from '$lib/types/FsItem';

  interface Props {
    node: {
      path: string;
      name: string;
      isDir: boolean;
      depth: number;
      isExpanded: boolean;
      isLoading: boolean;
      hasChildren: boolean;
      isSpecial?: boolean;
      icon?: any;
    };
    level?: number;
    onToggle?: () => void;
    onSelect?: () => void;
    onContextMenu?: (node: any, event: MouseEvent) => void;
  }

  let {
    node,
    level = 0,
    onToggle = () => {},
    onSelect = () => {},
    onContextMenu = () => {}
  }: Props = $props();

  const dispatch = createEventDispatcher();

  // 订阅 fileTreeStore 状态
  let treeState = $state(fileTreeStore.getState());

  $effect(() => {
    const unsubscribe = fileTreeStore.subscribe(state => {
      treeState = state;
    });
    return unsubscribe;
  });

  // 获取文件类型图标
  function getFileIcon(item: FsItem) {
    if (item.isImage) return Image;
    if (item.name.toLowerCase().endsWith('.zip') || 
        item.name.toLowerCase().endsWith('.rar') ||
        item.name.toLowerCase().endsWith('.7z')) return Archive;
    if (item.name.toLowerCase().endsWith('.mp3') || 
        item.name.toLowerCase().endsWith('.flac') ||
        item.name.toLowerCase().endsWith('.wav')) return Music;
    if (item.name.toLowerCase().endsWith('.mp4') || 
        item.name.toLowerCase().endsWith('.avi') ||
        item.name.toLowerCase().endsWith('.mkv')) return Video;
    return File;
  }

  // 处理切换展开/收起
  async function handleToggle(event: MouseEvent) {
    event.stopPropagation();
    onToggle(node);
  }

  // 处理选择
  function handleSelect(event: MouseEvent) {
    event.stopPropagation();
    onSelect(node);
  }

  // 处理右键菜单
  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(node, event);
  }

  // 键盘导航
  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
      case ' ':
        handleSelect(new MouseEvent('click'));
        break;
      case 'ArrowRight':
        if (!node.isExpanded && node.hasChildren) {
          handleToggle(new MouseEvent('click'));
        }
        break;
      case 'ArrowLeft':
        if (node.isExpanded) {
          handleToggle(new MouseEvent('click'));
        }
        break;
    }
  }

  // 获取缩进样式
  const indentStyle = $derived(`padding-left: ${node.depth * 14}px`);

  // 是否选中
  const isSelected = $derived(treeState.selectedPath === node.path);

  const childNodes = $derived(() => {
    if (!node.children || node.children.length === 0) return [];
    return node.children
      .map((path) => treeState.nodes[path])
      .filter((child): child is typeof node => Boolean(child));
  });
</script>

<li class="tree-node" {indentStyle}>
  <div
    class="tree-node-content flex items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-100 {isSelected ? 'bg-blue-100' : ''}"
    class:selected={isSelected}
    onclick={handleSelect}
    oncontextmenu={handleContextMenu}
    onkeydown={handleKeydown}
    tabindex="0"
    role="treeitem"
    aria-expanded={node.isExpanded}
    aria-selected={isSelected}
  >
    <!-- 展开/收起按钮 -->
    {#if node.isDir && !node.isSpecial}
      <button class="chevron w-4 h-4 mr-1 flex items-center justify-center flex-shrink-0" onclick={handleToggle}>
        {#if node.isLoading}
          <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
        {:else if node.hasChildren}
          {#if node.isExpanded}
            <ChevronDown class="w-3 h-3 text-gray-600" />
          {:else}
            <ChevronRight class="w-3 h-3 text-gray-600" />
          {/if}
        {:else}
          <div class="w-3 h-3" />
        {/if}
      </button>
    {:else}
      <div class="w-4 h-4 mr-1 flex-shrink-0" />
    {/if}

    <!-- 节点图标 -->
    <div class="node-icon mr-2 flex-shrink-0">
      {#if node.icon}
        <svelte:component this={node.icon} class="w-4 h-4 text-gray-600" />
      {:else if node.isDir}
        {#if node.isExpanded}
          <FolderOpen class="w-4 h-4 text-blue-500" />
        {:else}
          <Folder class="w-4 h-4 text-blue-500" />
        {/if}
      {:else}
        <File class="w-4 h-4 text-gray-500" />
      {/if}
    </div>

    <!-- 节点名称 -->
    <span class="node-name text-sm text-gray-700 truncate flex-1">
      {node.name}
    </span>

    <!-- 加载指示器 -->
    {#if node.isLoading}
      <div class="loading-indicator ml-2">
        <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
      </div>
    {/if}
  </div>

  <!-- 子节点 -->
  {#if node.isExpanded && childNodes.length > 0}
    <ul class="tree-children" role="group">
      {#each childNodes as childNode (childNode.path)}
        <TreeNode 
          node={childNode}
          level={level + 1}
          onToggle={onToggle}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .tree-node {
    user-select: none;
    list-style: none;
  }

  .tree-node-content {
    min-height: 28px;
    transition: background-color 0.15s ease;
  }

  .tree-node-content:focus {
    outline: 2px solid #3b82f6;
    outline-offset: -1px;
  }

  .tree-node-content[selected] {
    background-color: #dbeafe;
  }

  .chevron {
    transition: transform 0.2s ease;
  }

  .node-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-children {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* 悬停效果 */
  .tree-node-content:hover .chevron {
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 2px;
  }

  /* 加载状态 */
  .loading-indicator {
    opacity: 0.6;
  }
</style>