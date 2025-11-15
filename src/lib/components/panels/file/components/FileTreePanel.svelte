<script lang="ts">
  import { onMount } from 'svelte';
  import { Home, Bookmark, Clock, HardDrive, Star } from '@lucide/svelte';
  import { fileTreeStore } from '$lib/stores/fileTree.svelte';
  import { selectionStore } from '$lib/stores/selection.svelte';
  import { fileBrowserService } from '../services/fileBrowserService';
  import { navigateToDirectory } from '../services/navigationService';
  import { homeDir } from '@tauri-apps/api/path';
  import TreeNode from './TreeNode.svelte';
  import type { FsItem } from '$lib/types/FsItem';

  // 根节点配置
  const rootNodes = [
    {
      path: 'home',
      name: '主页',
      icon: Home,
      isSpecial: true
    },
    {
      path: 'bookmarks',
      name: '书签',
      icon: Bookmark,
      isSpecial: true
    },
    {
      path: 'recent',
      name: '最近使用',
      icon: Clock,
      isSpecial: true
    },
    {
      path: 'drives',
      name: '驱动器',
      icon: HardDrive,
      isSpecial: true
    }
  ];

  // 创建导航选项
  function createNavigationOptions() {
    return {
      sortConfig: { field: 'name', direction: 'asc' },
      thumbnails: new Map(),
      clearSelection: () => selectionStore.clear()
    };
  }

  // 订阅 fileTreeStore 状态
  let treeState = $state(fileTreeStore.getState());

  // 订阅状态更新
  $effect(() => {
    const unsubscribe = fileTreeStore.subscribe(state => {
      treeState = state;
    });
    return unsubscribe;
  });

  // 切换节点展开状态
  async function handleToggle(node: any) {
    if (node.isSpecial) {
      await handleSpecialNode(node);
      return;
    }

    if (node.isExpanded) {
      // 收起节点
      fileTreeStore.collapseNode(node.path);
    } else {
      // 展开节点
      if (!node.hasChildren) {
        // 懒加载子节点
        await loadNodeChildren(node);
      }
      fileTreeStore.expandNode(node.path);
    }
  }

  // 处理特殊节点
  async function handleSpecialNode(node: any) {
    switch (node.path) {
      case 'home':
        const home = await homeDir();
        if (home) {
          selectPath(home);
        }
        break;
      case 'bookmarks':
        // TODO: 实现书签导航
        console.log('Navigate to bookmarks');
        break;
      case 'recent':
        // TODO: 实现最近使用导航
        console.log('Navigate to recent files');
        break;
      case 'drives':
        // TODO: 实现驱动器列表
        console.log('Navigate to drives');
        break;
    }
  }

  // 加载节点子项
  async function loadNodeChildren(node: any) {
    fileTreeStore.setNodeLoading(node.path, true);
    
    try {
      const children = await fileBrowserService.browseDirectory(node.path);
      fileTreeStore.setChildren(node.path, children);
      
      // 更新节点的 hasChildren 状态
      const hasSubDirs = children.some(item => item.isDir);
      fileTreeStore.updateNode(node.path, { hasChildren: hasSubDirs });
    } catch (error) {
      console.error('Failed to load children for node:', node.path, error);
    } finally {
      fileTreeStore.setNodeLoading(node.path, false);
    }
  }

  // 选择路径
  async function selectPath(path: string) {
    fileTreeStore.selectPath(path);
    selectionStore.clear();
    
    // 触发导航
    await navigateToDirectory(path, createNavigationOptions());
  }

  // 处理节点选择
  function handleSelect(node: any) {
    if (node.isSpecial) {
      handleSpecialNode(node);
    } else if (node.isDir) {
      selectPath(node.path);
    }
  }

  // 处理右键菜单
  function handleContextMenu(node: any, event: MouseEvent) {
    // TODO: 实现右键菜单
    console.log('Context menu for:', node);
  }

  // 初始化
  onMount(async () => {
    // 初始化根节点
    rootNodes.forEach(root => {
      fileTreeStore.ensureNode({
        path: root.path,
        name: root.name,
        isDir: true,
        hasChildren: true,
        isExpanded: false,
        children: []
      });
    });
  });
</script>

<div class="file-tree-panel h-full bg-gray-50 border-r border-gray-200 overflow-y-auto">
  <div class="p-2">
    <ul class="tree-root" role="tree">
      {#each rootNodes as root (root.path)}
        {@const node = treeState.nodes[root.path] || null}
        {#if node}
          <TreeNode 
            node={node}
            onToggle={handleToggle}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
          />
        {/if}
      {/each}
    </ul>
  </div>
</div>

<style>
  .tree-root {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .file-tree-panel {
    font-size: 13px;
  }
</style>