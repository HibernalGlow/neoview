<script lang="ts">
  import { ArrowUpDown, ArrowUp, ArrowDown, Type, Calendar, Star, Hash } from '@lucide/svelte';

  interface BookmarkEntry {
    id: string;
    path: string;
    name: string;
    isDir: boolean;
    timestamp: number;
    starred: boolean;
  }

  let { 
    bookmarks = [], 
    onSort = () => {} 
  }: {
    bookmarks: BookmarkEntry[];
    onSort: (sortedBookmarks: BookmarkEntry[]) => void;
  } = $props();

  // 排序选项
  type SortField = 'name' | 'timestamp' | 'path' | 'starred';
  type SortOrder = 'asc' | 'desc';

  let sortField: SortField = 'timestamp';
  let sortOrder: SortOrder = 'desc';
  let showSortMenu = $state(false);

  // 排序配置
  const sortOptions = [
    { field: 'timestamp' as SortField, label: '添加时间', icon: Calendar },
    { field: 'path' as SortField, label: '路径', icon: Type },
    { field: 'name' as SortField, label: '名称', icon: Type },
    { field: 'starred' as SortField, label: '星标', icon: Star }
  ];

  /**
   * 执行排序
   */
  function performSort() {
    const sorted = [...bookmarks].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { numeric: true });
          break;
        case 'path':
          comparison = a.path.localeCompare(b.path, undefined, { numeric: true });
          break;
        case 'timestamp':
          comparison = a.timestamp - b.timestamp;
          break;
        case 'starred':
          // 星标的书签排在前面
          if (a.starred !== b.starred) {
            comparison = a.starred ? -1 : 1;
          } else {
            // 如果星标状态相同，按名称排序
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
      if (!target.closest('.bookmark-sort-panel')) {
        showSortMenu = false;
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });
</script>

<div class="bookmark-sort-panel relative">
  <!-- 排序按钮 -->
  <button
    class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-100 rounded transition-colors"
    onclick={() => showSortMenu = !showSortMenu}
    title="排序书签"
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