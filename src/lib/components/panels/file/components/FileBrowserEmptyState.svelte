<script lang="ts">
  import { Search, Folder, FolderOpen } from '@lucide/svelte';

  export let loading = false;
  export let isSearching = false;
  export let searchQuery = '';
  export let hasSearchResults = false;
  export let itemsCount = 0;
  export let currentPath = '';
  export let onSelectFolder: () => void = () => {};
</script>

{#if loading}
  <div class="flex flex-1 items-center justify-center">
    <div class="flex flex-col items-center gap-3">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      <div class="text-sm text-gray-500">加载中...</div>
    </div>
  </div>
{:else if isSearching}
  <div class="flex flex-1 items-center justify-center">
    <div class="flex flex-col items-center gap-3">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      <div class="text-sm text-gray-500">搜索中...</div>
    </div>
  </div>
{:else if searchQuery && !hasSearchResults}
  <div class="flex flex-1 items-center justify-center">
    <div class="text-center text-gray-400">
      <Search class="mx-auto mb-2 h-16 w-16 opacity-50" />
      <p class="text-sm">未找到匹配的文件</p>
      <p class="text-xs text-gray-500 mt-1">搜索词: "{searchQuery}"</p>
    </div>
  </div>
{:else if itemsCount === 0 && currentPath}
  <div class="flex flex-1 items-center justify-center">
    <div class="text-center text-gray-400">
      <Folder class="mx-auto mb-2 h-16 w-16 opacity-50" />
      <p class="text-sm">此目录为空</p>
    </div>
  </div>
{:else if itemsCount === 0}
  <div class="flex flex-1 items-center justify-center">
    <div class="text-center">
      <FolderOpen class="mx-auto mb-4 h-20 w-20 text-gray-300" />
      <p class="text-lg font-medium text-gray-600 mb-2">选择文件夹开始浏览</p>
      <p class="text-sm text-gray-400 mb-6">点击上方的"选择文件夹"按钮</p>
      <button
        onclick={onSelectFolder}
        class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
      >
        选择文件夹
      </button>
    </div>
  </div>
{/if}
