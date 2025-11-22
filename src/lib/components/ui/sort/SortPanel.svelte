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
    <div class="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
      {#each sortOptions as option}
        {@const IconComponent = option.icon}
        {@const SortIconComponent = getSortIcon(option.field)}
        <button
          class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between group"
          onclick={() => setSortField(option.field)}
        >
          <div class="flex items-center gap-2">
            <IconComponent class="h-4 w-4 text-gray-500" />
            <span>{option.label}</span>
          </div>
          <SortIconComponent class="h-4 w-4 text-gray-400 {sortField === option.field ? 'text-blue-500' : ''}" />
        </button>
      {/each}
      
      <div class="border-t border-gray-200 my-1"></div>
      
      <!-- 排序顺序 -->
      <div class="px-3 py-2">
        <div class="text-xs text-gray-500 mb-2">排序顺序</div>
        <div class="flex gap-2">
          <button
            class="flex-1 px-2 py-1 text-xs {sortOrder === 'asc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'} rounded transition-colors"
            onclick={() => {
              onSortChange(sortField, 'asc');
            }}
          >
            升序
          </button>
          <button
            class="flex-1 px-2 py-1 text-xs {sortOrder === 'desc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'} rounded transition-colors"
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