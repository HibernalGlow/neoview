<script lang="ts">
  import { ArrowUpDown, ArrowUp, ArrowDown, Type, Calendar, HardDrive, FileImage, Folder } from '@lucide/svelte';
  import type { SortField, SortOrder } from '$lib/stores/fileBrowser.svelte';

  let { 
    sortField = 'name',
    sortOrder = 'asc',
    onSortChange = () => {} 
  }: {
    sortField: SortField;
    sortOrder: SortOrder;
    onSortChange: (field: SortField, order: SortOrder) => void;
  } = $props();

  let showSortMenu = $state(false);

  // 排序配置
  const sortOptions = [
    { field: 'path' as SortField, label: '路径', icon: Folder },
    { field: 'name' as SortField, label: '名称', icon: Type },
    { field: 'modified' as SortField, label: '修改时间', icon: Calendar },
    { field: 'size' as SortField, label: '大小', icon: HardDrive },
    { field: 'type' as SortField, label: '类型', icon: FileImage }
  ];

  /**
   * 切换排序字段
   */
  function setSortField(field: SortField) {
    let newOrder: SortOrder = 'asc';
    if (sortField === field) {
      // 如果点击相同字段，切换排序顺序
      newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      newOrder = 'asc';
    }
    onSortChange(field, newOrder);
    // showSortMenu = false; // Optional: keep menu open for quick toggling? Usually close it.
  }

  /**
   * 获取当前排序图标
   */
  function getSortIcon(field: SortField) {
    if (sortField !== field) {
      return ArrowUpDown;
    }
    return sortOrder === 'asc' ? ArrowUp : ArrowDown;
  }

  // 全局点击事件
  $effect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sort-panel')) {
        showSortMenu = false;
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });
</script>

<div class="sort-panel relative">
  <!-- 排序按钮 -->
  <button
    class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 rounded transition-colors"
    onclick={() => showSortMenu = !showSortMenu}
    title="排序选项"
  >
    <ArrowUpDown class="h-4 w-4" />
  </button>

  <!-- 排序菜单 -->
  {#if showSortMenu}
    <div class="absolute top-full right-0 mt-1 z-50 min-w-[180px] rounded-md border bg-popover text-popover-foreground shadow-lg py-1">
      {#each sortOptions as option}
        {@const IconComponent = option.icon}
        {@const SortIconComponent = getSortIcon(option.field)}
        <button
          class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
          onclick={() => setSortField(option.field)}
        >
          <div class="flex items-center gap-2">
            <IconComponent class="h-4 w-4 text-muted-foreground" />
            <span>{option.label}</span>
          </div>
          <SortIconComponent class="h-4 w-4 {sortField === option.field ? 'text-primary' : 'text-muted-foreground'}" />
        </button>
      {/each}
      
      <div class="my-1 border-t border-border/60"></div>
      
      <!-- 排序顺序 -->
      <div class="px-3 py-2">
        <div class="mb-2 text-xs text-muted-foreground">排序顺序</div>
        <div class="flex gap-2">
          <button
            class="flex-1 rounded px-2 py-1 text-xs transition-colors {sortOrder === 'asc' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
            onclick={() => {
              onSortChange(sortField, 'asc');
            }}
          >
            升序
          </button>
          <button
            class="flex-1 rounded px-2 py-1 text-xs transition-colors {sortOrder === 'desc' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
            onclick={() => {
              onSortChange(sortField, 'desc');
            }}
          >
            降序
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>