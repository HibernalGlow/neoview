<script lang="ts">
  /**
   * FileItemCard - 共用的文件项展示组件
   * 支持列表视图和网格视图，显示缩略图、名称、信息等
   * 用于 FileBrowser、HistoryPanel、BookmarkPanel
   */
  import { Folder, File, Image, FileArchive, Check, Star } from '@lucide/svelte';
  import type { FsItem } from '$lib/types';
  import { bookmarkStore } from '$lib/stores/bookmark.svelte';
  import { emmMetadataStore, isCollectTagHelper } from '$lib/stores/emmMetadata.svelte';
  import type { EMMCollectTag } from '$lib/api/emm';

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

  // EMM 元数据
  let emmMetadata = $state<{ translatedTitle?: string; tags?: Record<string, string[]> } | null>(null);
  let collectTags = $state<EMMCollectTag[]>([]);
  let metadataLoading = $state(false);
  let lastLoadedPath = $state<string | null>(null);

  // 加载收藏标签（确保初始化完成）
  $effect(() => {
    // 确保初始化完成
    emmMetadataStore.initialize().then(() => {
      collectTags = emmMetadataStore.getCollectTags();
      console.debug('[FileItemCard] 收藏标签已加载，数量:', collectTags.length);
    }).catch(err => {
      console.error('[FileItemCard] 初始化 EMM Store 失败:', err);
    });
  });

  // 加载 EMM 元数据（延迟加载，避免同时加载太多）
  $effect(() => {
    if (item.path && !item.isDir && item.path !== lastLoadedPath && !metadataLoading) {
      metadataLoading = true;
      lastLoadedPath = item.path;
      
      console.debug('[FileItemCard] 开始加载 EMM 元数据，item:', item.name, 'path:', item.path);
      
      // 延迟加载，避免同时发起太多请求
      const timeoutId = setTimeout(() => {
        emmMetadataStore.loadMetadataByPath(item.path).then(metadata => {
          console.debug('[FileItemCard] EMM 元数据加载完成，item:', item.name, 'metadata:', metadata);
          if (metadata && item.path === lastLoadedPath) {
            emmMetadata = {
              translatedTitle: metadata.translated_title,
              tags: metadata.tags
            };
            console.debug('[FileItemCard] EMM 元数据已设置，item:', item.name, 'translatedTitle:', metadata.translated_title, 'tags:', metadata.tags);
          } else {
            console.debug('[FileItemCard] EMM 元数据未设置（路径不匹配或元数据为空），item:', item.name, 'lastLoadedPath:', lastLoadedPath, 'metadata:', metadata);
          }
          metadataLoading = false;
        }).catch((err) => {
          console.error('[FileItemCard] EMM 元数据加载失败，item:', item.name, 'error:', err);
          metadataLoading = false;
        });
      }, Math.random() * 500); // 随机延迟 0-500ms，分散请求
      
      return () => {
        clearTimeout(timeoutId);
        metadataLoading = false;
      };
    }
  });

  // 检查标签是否为收藏标签（支持完整格式 "category:tag" 或单独 tag）
  function isCollectTag(tag: string, category?: string): EMMCollectTag | null {
    console.debug('[FileItemCard] isCollectTag 调用:', {
      item: item.name,
      category,
      tag,
      collectTagsLength: collectTags.length
    });
    
    // 先尝试完整格式 "category:tag"
    if (category) {
      const fullTag = `${category}:${tag}`;
      const result = isCollectTagHelper(fullTag, collectTags);
      console.debug('[FileItemCard] isCollectTag 完整格式结果:', {
        fullTag,
        result
      });
      if (result) return result;
    }
    // 再尝试单独 tag
    const fallbackResult = isCollectTagHelper(tag, collectTags);
    console.debug('[FileItemCard] isCollectTag 仅标签结果:', {
      tag,
      result: fallbackResult
    });
    return fallbackResult;
  }

  // 获取显示的标签（前3个，高亮收藏的）
  const displayTags = $derived(() => {
    if (!emmMetadata?.tags) {
      console.debug('[FileItemCard] 没有标签数据，item:', item.name);
      return [];
    }
    
    console.debug('[FileItemCard] 开始处理标签，item:', item.name, 'tags:', $state.snapshot(emmMetadata.tags));
    console.debug('[FileItemCard] 收藏标签列表:', $state.snapshot(collectTags));
    
    const allTags: Array<{ tag: string; isCollect: boolean; color?: string }> = [];
    for (const [category, tags] of Object.entries(emmMetadata.tags)) {
      for (const tag of tags) {
        const collectTag = isCollectTag(tag, category);
        const isCollect = !!collectTag;
        const fullTag = `${category}:${tag}`;
        console.debug(`[FileItemCard] 标签检查: item="${item.name}", category="${category}", tag="${tag}", fullTag="${fullTag}", isCollect=${isCollect}, color=${collectTag?.color}`);
        allTags.push({
          tag: fullTag,
          isCollect,
          color: collectTag?.color
        });
      }
    }
    
    // 收藏标签优先显示
    const collectTagsList = allTags.filter(t => t.isCollect);
    const normalTagsList = allTags.filter(t => !t.isCollect);
    const result = [...collectTagsList, ...normalTagsList].slice(0, 3);
    
    console.debug('[FileItemCard] 处理后的标签列表:', $state.snapshot(result));
    return result;
  });

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
      <div class="font-medium break-words" title={emmMetadata?.translatedTitle || item.name}>
        {emmMetadata?.translatedTitle || item.name}
      </div>
      {#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
        <div class="text-xs text-muted-foreground break-words mt-0.5" title={item.name}>
          {item.name}
        </div>
      {/if}
      <div class="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
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
      {#if displayTags().length > 0}
        <div class="flex items-center gap-1 mt-1 flex-wrap">
          {#each displayTags() as tagInfo}
            <span
              class="text-xs px-1.5 py-0.5 rounded {tagInfo.isCollect ? 'font-semibold' : ''}"
              style="background-color: {tagInfo.isCollect ? (tagInfo.color || '#409EFF') + '20' : 'rgba(0,0,0,0.05)'}; color: {tagInfo.isCollect ? (tagInfo.color || '#409EFF') : 'inherit'}; border: 1px solid {tagInfo.isCollect ? (tagInfo.color || '#409EFF') + '40' : 'transparent'};"
              title={tagInfo.tag}
            >
              {tagInfo.tag.split(':')[1]}
            </span>
          {/each}
        </div>
      {/if}
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
      <div class="font-medium text-sm break-words" title={emmMetadata?.translatedTitle || item.name}>
        {emmMetadata?.translatedTitle || item.name}
      </div>
      {#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
        <div class="text-xs text-muted-foreground break-words mt-0.5" title={item.name}>
          {item.name}
        </div>
      {/if}
      <div class="text-xs text-muted-foreground mt-1">
        {#if currentPage !== undefined && totalPages !== undefined}
          <span>{currentPage}/{totalPages}</span>
        {:else if timestamp}
          <span>{formatTime(timestamp)}</span>
        {:else}
          <span>{formatSize(item.size || 0, item.isDir || false)}</span>
        {/if}
      </div>
      {#if displayTags().length > 0}
        <div class="flex items-center gap-1 mt-1 flex-wrap">
          {#each displayTags() as tagInfo}
            <span
              class="text-xs px-1 py-0.5 rounded {tagInfo.isCollect ? 'font-semibold' : ''}"
              style="background-color: {tagInfo.isCollect ? (tagInfo.color || '#409EFF') + '20' : 'rgba(0,0,0,0.05)'}; color: {tagInfo.isCollect ? (tagInfo.color || '#409EFF') : 'inherit'}; border: 1px solid {tagInfo.isCollect ? (tagInfo.color || '#409EFF') + '40' : 'transparent'};"
              title={tagInfo.tag}
            >
              {tagInfo.tag.split(':')[1]}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

