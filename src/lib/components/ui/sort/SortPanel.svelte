<script lang="ts">
  import { ArrowUpDown, ArrowUp, ArrowDown, Type, Calendar, HardDrive, FileImage, FileArchive, Folder } from '@lucide/svelte';
  import type { FsItem } from '$lib/types';

  let { 
    items = [], 
    onSort = () => {} 
  }: {
    items: FsItem[];
    onSort: (sortedItems: FsItem[]) => void;
  } = $props();

  // 排序选项
  type SortField = 'name' | 'modified' | 'size' | 'type' | 'path';
  type SortOrder = 'asc' | 'desc';

  let sortField = $state<SortField>('path');
  let sortOrder = $state<SortOrder>('asc');
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
   * 获取文件类型用于排序
   */
  function getItemType(item: FsItem): string {
    if (item.isDir) return '0_folder';
    if (item.name.endsWith('.zip') || item.name.endsWith('.cbz') || 
        item.name.endsWith('.rar') || item.name.endsWith('.cbr')) return '1_archive';
    if (item.isImage) return '2_image';
    return '3_file';
  }

  /**
   * 执行排序
   */
  function performSort() {
    const sorted = [...items].sort((a, b) => {
      // 文件夹始终在前面
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }

      let comparison = 0;

      switch (sortField) {
        case 'path':
          comparison = a.path.localeCompare(b.path, undefined, { numeric: true });
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          break;
        case 'modified':
          comparison = (a.modified || 0) - (b.modified || 0);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'type':
          comparison = getItemType(a).localeCompare(getItemType(b));
          if (comparison === 0) {
            comparison = a.name.localeCompare(b.name);
          }
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    onSort(sorted);
    showSortMenu = false;
  }

  /**
   * 切换排序字段
   */
  function setSortField(field: SortField) {
    if (sortField === field) {
      // 如果点击相同字段，切换排序顺序
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortOrder = 'asc';
    }
    performSort();
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
    <span>排序</span>
  </button>

  <!-- 排序菜单 -->
  {#if showSortMenu}
    <div class="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
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
              sortOrder = 'asc';
              performSort();
            }}
          >
            升序
          </button>
          <button
            class="flex-1 px-2 py-1 text-xs {sortOrder === 'desc' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'} rounded transition-colors"
            onclick={() => {
              sortOrder = 'desc';
              performSort();
            }}
          >
            降序
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>