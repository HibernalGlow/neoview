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
  }

  let {
    currentPath = $bindable(''),
    isArchive = false,
    onNavigate,
    onSetHomepage
  }: Props = $props();

  /**
   * 获取路径的面包屑导航
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

  function handleNavigate(path: string) {
    onNavigate?.(path);
  }

  function handleSetHomepage(path: string) {
    onSetHomepage?.(path);
  }
</script>

<div class="flex items-center gap-1 px-4 py-2 bg-gray-50 border-b overflow-x-auto">
  {#if currentPath}
    <Breadcrumb.Root>
      <Breadcrumb.List>
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
