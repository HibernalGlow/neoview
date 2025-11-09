<script lang="ts">
  /**
   * 路径面包屑导航栏
   */
  import { ChevronRight, Home, FolderOpen } from '@lucide/svelte';

  interface Breadcrumb {
    name: string;
    path: string;
  }

  interface Props {
    currentPath: string;
    isArchive?: boolean;
    onNavigate?: (path: string) => void;
  }

  let {
    currentPath = $bindable(''),
    isArchive = false,
    onNavigate
  }: Props = $props();

  /**
   * 获取路径的面包屑导航
   */
  function getBreadcrumbs(path: string): Breadcrumb[] {
    if (!path) return [];
    
    // 检测路径分隔符
    const hasBackslash = path.includes('\\');
    const separator = hasBackslash ? '\\' : '/';
    
    const parts = path.split(/[/\\]/).filter(Boolean);
    const breadcrumbs: Breadcrumb[] = [];
    
    if (parts.length === 0) return breadcrumbs;
    
    // Windows 驱动器 (如 C:)
    if (parts[0].includes(':')) {
      const drivePath = parts[0] + separator;
      breadcrumbs.push({ name: parts[0], path: drivePath });
      
      // 添加子目录
      let currentPath = drivePath;
      for (let i = 1; i < parts.length; i++) {
        currentPath = currentPath + parts[i];
        breadcrumbs.push({ name: parts[i], path: currentPath });
        if (i < parts.length - 1) {
          currentPath += separator;
        }
      }
    } else {
      // Unix 路径
      breadcrumbs.push({ name: '/', path: '/' });
      let currentPath = '/';
      
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) currentPath += '/';
        currentPath += parts[i];
        breadcrumbs.push({ name: parts[i], path: currentPath });
      }
    }
    
    return breadcrumbs;
  }

  const breadcrumbs = $derived(getBreadcrumbs(currentPath));

  function handleNavigate(path: string) {
    onNavigate?.(path);
  }
</script>

<div class="flex items-center gap-1 px-4 py-2 bg-gray-50 border-b overflow-x-auto">
  <!-- 主页图标 -->
  <button
    class="p-1 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
    onclick={() => handleNavigate('')}
    title="主页"
  >
    <Home class="h-4 w-4 text-gray-600" />
  </button>

  {#if currentPath}
    <ChevronRight class="h-4 w-4 text-gray-400 flex-shrink-0" />

    <!-- 面包屑路径 -->
    {#each breadcrumbs as breadcrumb, index}
      <button
        class="px-2 py-1 rounded text-sm font-medium transition-colors whitespace-nowrap {index === breadcrumbs.length - 1 ? 'text-blue-600' : 'text-gray-700 hover:bg-gray-200'}"
        onclick={() => handleNavigate(breadcrumb.path)}
        title={breadcrumb.path}
      >
        {breadcrumb.name}
      </button>
      
      {#if index < breadcrumbs.length - 1}
        <ChevronRight class="h-4 w-4 text-gray-400 flex-shrink-0" />
      {/if}
    {/each}
  {:else}
    <div class="text-sm text-gray-500 flex items-center gap-2">
      <FolderOpen class="h-4 w-4" />
      <span>选择文件夹开始浏览</span>
    </div>
  {/if}
</div>
