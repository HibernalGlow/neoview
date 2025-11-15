<script lang="ts">
  /**
   * 路径面包屑导航栏 - 使用 shadcn-svelte Breadcrumb 重构
   */
  import { Home, FolderOpen, HomeIcon } from '@lucide/svelte';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuTrigger,
    ContextMenuItem,
  } from '$lib/components/ui/context-menu';

  interface BreadcrumbItem {
    name: string;
    path: string;
  }

  interface Props {
    currentPath: string;
    isArchive?: boolean;
    onNavigate?: (path: string) => void;
    onSetHomepage?: (path: string) => void;
    navigationState?: {
      canGoBack: boolean;
      canGoForward: boolean;
      canGoHome: boolean;
      hasHomepage: boolean;
      homepage?: string;
    };
  }

  let {
    currentPath = $bindable(''),
    isArchive = false,
    onNavigate,
    onSetHomepage,
    navigationState
  }: Props = $props();

  /**
   * 获取路径的面包屑导航 - 保持原有顺序（从根到当前）
   */
  function getBreadcrumbs(path: string): BreadcrumbItem[] {
    if (!path) return [];
    
    // 检测路径分隔符
    const hasBackslash = path.includes('\\');
    const separator = hasBackslash ? '\\' : '/';
    
    const parts = path.split(/[\\/]/).filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];
    
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

  /**
   * 处理导航
   */
  function handleNavigate(path: string) {
    if (onNavigate) {
      onNavigate(path);
    }
  }

  /**
   * 处理设置主页
   */
  function handleSetHomepage(path: string) {
    if (onSetHomepage) {
      onSetHomepage(path);
    }
  }

  /**
   * 复制路径
   */
  async function handleCopyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      // TODO: 显示 toast 提示
      console.log('Path copied to clipboard:', path);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  }

  /**
   * 在资源管理器中打开
   */
  async function handleOpenInExplorer(path: string) {
    try {
      const { showInFileManager } = await import('$lib/api/filesystem');
      await showInFileManager(path);
    } catch (error) {
      console.error('Failed to open in file manager:', error);
    }
  }
</script>

<div class="flex items-center gap-1 px-2 py-1 bg-gray-50 border-b overflow-x-auto whitespace-nowrap justify-end">
  {#if currentPath}
    <Breadcrumb.Root>
      <Breadcrumb.List class="flex items-center gap-1 flex-nowrap whitespace-nowrap">
        <!-- 主页 -->
        <Breadcrumb.Item>
          <ContextMenu>
            <ContextMenuTrigger>
              <Breadcrumb.Link href="#" onclick={() => handleNavigate('')}>
                <Home class="h-4 w-4 text-gray-600" />
              </Breadcrumb.Link>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onclick={() => handleSetHomepage('')}>
                <HomeIcon class="h-4 w-4 mr-2" />
                设置为主页
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </Breadcrumb.Item>

        <!-- 面包屑路径 -->
        {#each breadcrumbs as breadcrumb, index}
          <Breadcrumb.Separator />
          <Breadcrumb.Item>
            <ContextMenu>
              <ContextMenuTrigger>
                {#if index === breadcrumbs.length - 1}
                  <Breadcrumb.Page>{breadcrumb.name}</Breadcrumb.Page>
                {:else}
                  <Breadcrumb.Link href="#" onclick={() => handleNavigate(breadcrumb.path)}>
                    {breadcrumb.name}
                  </Breadcrumb.Link>
                {/if}
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onclick={() => handleSetHomepage(breadcrumb.path)}>
                  <HomeIcon class="h-4 w-4 mr-2" />
                  设置为主页
                </ContextMenuItem>
                <ContextMenuItem onclick={() => handleCopyPath(breadcrumb.path)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制路径
                </ContextMenuItem>
                <ContextMenuItem onclick={() => handleOpenInExplorer(breadcrumb.path)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  在资源管理器中打开
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </Breadcrumb.Item>
        {/each}
      </Breadcrumb.List>
    </Breadcrumb.Root>
  {:else}
    <div class="text-sm text-gray-500 flex items-center gap-2">
      <FolderOpen class="h-4 w-4" />
      <span>选择文件夹开始浏览</span>
    </div>
  {/if}
</div>
