<script lang="ts">
  /**
   * FileItemCard - 共用的文件项展示组件
    const collectTagsList = allTags.filter(t => t.isCollect);
    const normalTagsList = allTags.filter(t => !t.isCollect);
    
    // 如果有收藏标签，优先展示收藏标签；否则展示普通标签
    // 不限制数量，显示完整
    return [...collectTagsList, ...normalTagsList];
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
      <!-- 原文件名 -->
      <div class="font-medium break-words" title={item.name}>
        {item.name}
      </div>
      <!-- 翻译标题 -->
      {#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
        <div class="mt-1">
          <span class="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 break-words" title={emmMetadata.translatedTitle}>
            {emmMetadata.translatedTitle}
          </span>
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
              {tagInfo.display}
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
```
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

  // 订阅全局 EMM 设置
  let enableEMM = $state(true);
  let fileListTagDisplayMode = $state<'all' | 'collect' | 'none'>('collect');
  let translationMap = $state<Map<string, string>>(new Map());
  
  $effect(() => {
    const unsubscribe = emmMetadataStore.subscribe(state => {
      enableEMM = state.enableEMM;
      fileListTagDisplayMode = state.fileListTagDisplayMode;
      translationMap = state.translationMap;
    });
    return unsubscribe;
  });

  // 加载 EMM 元数据（仅针对压缩包，且路径变化时加载）
  $effect(() => {
    if (enableEMM && isArchive && item.path && !item.isDir && item.path !== lastLoadedPath && !metadataLoading) {
      metadataLoading = true;
      lastLoadedPath = item.path;
      
      // console.debug('[FileItemCard] 开始加载 EMM 元数据 (Archive):', item.name);
      
      // 立即加载，不使用随机延迟
      emmMetadataStore.loadMetadataByPath(item.path).then(metadata => {
        if (metadata && item.path === lastLoadedPath) {
          emmMetadata = {
            translatedTitle: metadata.translated_title,
            tags: metadata.tags
          };
          // console.debug('[FileItemCard] EMM 元数据加载成功:', item.name);
        }
        metadataLoading = false;
      }).catch((err) => {
        console.error('[FileItemCard] EMM 元数据加载失败:', item.name, err);
        metadataLoading = false;
      });
      
      return () => {
        metadataLoading = false;
      };
    } else if (!enableEMM) {
      // 如果禁用了 EMM，清除元数据
      emmMetadata = null;
      lastLoadedPath = null;
    }
  });

  // 获取显示的标签（前3个，高亮收藏的）
  const displayTags = $derived(() => {
    if (!emmMetadata?.tags || fileListTagDisplayMode === 'none') return [];
    
    const map = $collectTagMap; // Use the shared map
    const normalize = (s: string) => s.trim().toLowerCase();
    
    // 使用响应式的 translationMap
    const currentTranslationMap = translationMap;
    
    const allTags: Array<{ tag: string; isCollect: boolean; color?: string; display: string }> = [];
    
    for (const [category, tags] of Object.entries(emmMetadata.tags)) {
      for (const tag of tags) {
        // 尝试多种组合查找
        const fullTagKey = normalize(`${category}:${tag}`);
        let collectTag = map.get(fullTagKey);
        
        if (!collectTag) {
          collectTag = map.get(normalize(tag));
        }
        
        const isCollect = !!collectTag;
        
        // 根据显示模式过滤
        if (fileListTagDisplayMode === 'collect' && !isCollect) {
          continue;
        }
        
        // 获取翻译后的显示
        const translated = getTranslatedTag(`${category}:${tag}`, currentTranslationMap);
        
        allTags.push({
          tag: `${category}:${tag}`,
          isCollect,
          color: collectTag?.color,
          // 如果是收藏标签，优先使用收藏配置的 display，否则使用翻译后的格式
          display: collectTag?.display || translated.display
        });
      }
    }
    
    // 排序：收藏的在前，然后按字母顺序
    allTags.sort((a, b) => {
      if (a.isCollect && !b.isCollect) return -1;
      if (!a.isCollect && b.isCollect) return 1;
      return a.display.localeCompare(b.display);
    });

    // 限制显示数量
    return allTags.slice(0, 3);
  });
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
      <!-- 原文件名 -->
      <div class="font-medium break-words" title={item.name}>
        {item.name}
      </div>
      <!-- 翻译标题 -->
      {#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
        <div class="mt-1">
          <span class="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 break-words" title={emmMetadata.translatedTitle}>
            {emmMetadata.translatedTitle}
          </span>
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
              {tagInfo.display}
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
      <!-- 原文件名 -->
      <div class="font-medium text-sm break-words" title={item.name}>
        {item.name}
      </div>
      <!-- 翻译标题 -->
      {#if emmMetadata?.translatedTitle && emmMetadata.translatedTitle !== item.name}
        <div class="mt-1">
          <span class="text-[10px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded border border-blue-100 break-words" title={emmMetadata.translatedTitle}>
            {emmMetadata.translatedTitle}
          </span>
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
              class="text-[10px] px-1 py-0.5 rounded {tagInfo.isCollect ? 'font-semibold' : ''}"
              style="background-color: {tagInfo.isCollect ? (tagInfo.color || '#409EFF') + '20' : 'rgba(0,0,0,0.05)'}; color: {tagInfo.isCollect ? (tagInfo.color || '#409EFF') : 'inherit'}; border: 1px solid {tagInfo.isCollect ? (tagInfo.color || '#409EFF') + '40' : 'transparent'};"
              title={tagInfo.tag}
            >
              {tagInfo.display}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
```
