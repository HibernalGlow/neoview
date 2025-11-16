<script lang="ts">
  /**
   * FileItemCard - 共用的文件项展示组件
   * 支持列表视图和网格视图，显示缩略图、名称、信息等
   * 用于 FileBrowser、HistoryPanel、BookmarkPanel
   */
  import { Folder, File, Image, FileArchive, Check, Star } from '@lucide/svelte';
  import type { FsItem } from '$lib/types';
  import { bookmarkStore } from '$lib/stores/bookmark.svelte';

  let {
    item,
    thumbnail = undefined,
    viewMode = 'list' as 'list' | 'grid',
    isSelected = false,
    isCheckMode = false,
    isDeleteMode = false,
    showReadMark = false,
    showBookmarkMark = true,
    currentPage = undefined,
    totalPages = undefined,
    timestamp = undefined,
    onClick = undefined,
    onDoubleClick = undefined,
    onContextMenu = undefined,
    onToggleSelection = undefined,
    onDelete = undefined
  }: {
    item: FsItem;
    thumbnail?: string;
    viewMode?: 'list' | 'grid';
    isSelected?: boolean;
    isCheckMode?: boolean;
    isDeleteMode?: boolean;
    showReadMark?: boolean;
    showBookmarkMark?: boolean;
    currentPage?: number;
    totalPages?: number;
    timestamp?: number;
    onClick?: () => void;
    onDoubleClick?: () => void;
    onContextMenu?: (e: MouseEvent) => void;
    onToggleSelection?: () => void;
    onDelete?: () => void;
  } = $props();

  // 检查是否为收藏（使用 $derived 避免在每次渲染时调用）
  const isBookmarked = $derived.by(() => {
    if (!showBookmarkMark) return false;
    try {
      const bookmarks = bookmarkStore.getAll();
      return bookmarks.some(b => b.path === item.path);
    } catch (err) {
      console.debug('检查收藏状态失败:', err);
      return false;
    }
  });

  // 判断文件类型
  const isArchive = $derived(
    item.name.endsWith('.zip') || 
    item.name.endsWith('.cbz') || 
    item.name.endsWith('.rar') || 
    item.name.endsWith('.cbr') ||
    item.name.endsWith('.7z') ||
    item.name.endsWith('.cb7')
  );

  // 格式化时间
  function formatTime(ts?: number): string {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(ts).toLocaleDateString();
  }

  // 格式化文件大小
  function formatSize(bytes: number, isDir: boolean): string {
    if (isDir) {
      return bytes === 0 ? '空文件夹' : `${bytes} 项`;
    }
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
</script>

{#if viewMode === 'list'}
  <!-- 列表视图 -->
  <div
    class="group flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors {isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-gray-200'}"
    onclick={onClick}
    ondblclick={onDoubleClick}
    oncontextmenu={onContextMenu}
    onkeydown={(e) => {
      if ((e.key === 'Enter' || e.key === ' ') && onClick) {
        e.preventDefault();
        onClick();
      }
    }}
    role="button"
    tabindex="0"
  >
    <!-- 勾选框（勾选模式） -->
    {#if isCheckMode}
      <button
        class="flex-shrink-0"
        onclick={(e) => {
          e.stopPropagation();
          onToggleSelection?.();
        }}
      >
        <div class="h-5 w-5 rounded border-2 flex items-center justify-center transition-colors {isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}">
          {#if isSelected}
            <Check class="h-3 w-3 text-white" />
          {/if}
        </div>
      </button>
    {/if}

    <!-- 删除按钮（删除模式） -->
    {#if isDeleteMode}
      <button
        class="flex-shrink-0"
        onclick={(e) => {
          e.stopPropagation();
          onDelete?.();
        }}
        title="删除"
      >
        <div class="h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
          <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      </button>
    {/if}

    <!-- 缩略图或图标 -->
    <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded relative">
      {#if thumbnail}
        <img 
          src={thumbnail} 
          alt={item.name}
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      {:else if item.isDir}
        <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
      {:else if isArchive}
        <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
      {:else if item.isImage}
        <Image class="h-8 w-8 text-green-500 transition-colors group-hover:text-green-600" />
      {:else}
        <File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
      {/if}
      
      <!-- 阅读标记（对勾） -->
      {#if showReadMark}
        <div class="absolute top-0 right-0 bg-green-500 rounded-full p-0.5">
          <Check class="h-3 w-3 text-white" />
        </div>
      {/if}
      
      <!-- 收藏标记（星标） -->
      {#if isBookmarked}
        <div class="absolute bottom-0 right-0 bg-yellow-500 rounded-full p-0.5">
          <Star class="h-3 w-3 text-white fill-white" />
        </div>
      {/if}
    </div>

    <!-- 信息 -->
    <div class="min-w-0 flex-1">
      <div class="font-medium truncate" title={item.name}>
        {item.name}
      </div>
      <div class="text-sm text-muted-foreground mt-1 flex items-center gap-2">
        {#if currentPage !== undefined && totalPages !== undefined}
          <span>页码: {currentPage}/{totalPages}</span>
        {/if}
        {#if timestamp}
          <span>{formatTime(timestamp)}</span>
        {/if}
        {#if !currentPage && !timestamp}
          <span>{formatSize(item.size || 0, item.isDir || false)}</span>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <!-- 网格视图 -->
  <div
    class="group relative flex flex-col rounded border overflow-hidden cursor-pointer transition-all hover:shadow-md {isSelected ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200'}"
    onclick={onClick}
    ondblclick={onDoubleClick}
    oncontextmenu={onContextMenu}
    onkeydown={(e) => {
      if ((e.key === 'Enter' || e.key === ' ') && onClick) {
        e.preventDefault();
        onClick();
      }
    }}
    role="button"
    tabindex="0"
  >
    <!-- 缩略图区域 -->
    <div class="relative w-full aspect-[3/4] bg-secondary overflow-hidden">
      {#if thumbnail}
        <img 
          src={thumbnail} 
          alt={item.name}
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      {:else if item.isDir}
        <div class="h-full w-full flex items-center justify-center">
          <Folder class="h-16 w-16 text-blue-500" />
        </div>
      {:else if isArchive}
        <div class="h-full w-full flex items-center justify-center">
          <FileArchive class="h-16 w-16 text-purple-500" />
        </div>
      {:else if item.isImage}
        <div class="h-full w-full flex items-center justify-center">
          <Image class="h-16 w-16 text-green-500" />
        </div>
      {:else}
        <div class="h-full w-full flex items-center justify-center">
          <File class="h-16 w-16 text-gray-400" />
        </div>
      {/if}
      
      <!-- 阅读标记（对勾） -->
      {#if showReadMark}
        <div class="absolute top-2 right-2 bg-green-500 rounded-full p-1">
          <Check class="h-4 w-4 text-white" />
        </div>
      {/if}
      
      <!-- 收藏标记（星标） -->
      {#if isBookmarked}
        <div class="absolute top-2 left-2 bg-yellow-500 rounded-full p-1">
          <Star class="h-4 w-4 text-white fill-white" />
        </div>
      {/if}
      
      <!-- 进度条（历史记录） -->
      {#if currentPage !== undefined && totalPages !== undefined && totalPages > 0}
        <div class="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
          <div
            class="h-full bg-primary transition-all"
            style="width: {(currentPage / totalPages) * 100}%"
          ></div>
        </div>
      {/if}
    </div>

    <!-- 信息区域 -->
    <div class="p-2 bg-background">
      <div class="font-medium text-sm truncate" title={item.name}>
        {item.name}
      </div>
      <div class="text-xs text-muted-foreground mt-1">
        {#if currentPage !== undefined && totalPages !== undefined}
          <span>{currentPage}/{totalPages}</span>
        {:else if timestamp}
          <span>{formatTime(timestamp)}</span>
        {:else}
          <span>{formatSize(item.size || 0, item.isDir || false)}</span>
        {/if}
      </div>
    </div>
  </div>
{/if}

