<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import SortPanel from '$lib/components/ui/sort/SortPanel.svelte';
  import { sortFieldLabels, type SortConfig } from '$lib/components/panels/file/services/sortService';
  import {
    Home,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    FolderOpen,
    RefreshCw,
    FileArchive,
    CheckSquare,
    Trash2,
    List,
    Grid3x3,
  } from '@lucide/svelte';

  let {
    isArchiveView = false,
    hasHomepage = false,
    canGoBackInHistory = false,
    canGoForwardInHistory = false,
    canNavigateBack = false,
    isCheckMode = false,
    isDeleteMode = false,
    viewMode = 'list',
    sortConfig = { field: 'path', order: 'asc' },
    onGoHome = () => {},
    onGoBackInHistory = () => {},
    onGoForwardInHistory = () => {},
    onGoBack = () => {},
    onSelectFolder = () => {},
    onRefresh = () => {},
    onToggleCheckMode = () => {},
    onToggleDeleteMode = () => {},
    onToggleViewMode = () => {},
    onClearThumbnailCache = () => {},
    onSort = () => {},
  }: {
    isArchiveView?: boolean;
    hasHomepage?: boolean;
    canGoBackInHistory?: boolean;
    canGoForwardInHistory?: boolean;
    canNavigateBack?: boolean;
    isCheckMode?: boolean;
    isDeleteMode?: boolean;
    viewMode?: 'list' | 'thumbnails';
    sortConfig?: SortConfig;
    onGoHome?: () => void;
    onGoBackInHistory?: () => void;
    onGoForwardInHistory?: () => void;
    onGoBack?: () => void;
    onSelectFolder?: () => void;
    onRefresh?: () => void;
    onToggleCheckMode?: () => void;
    onToggleDeleteMode?: () => void;
    onToggleViewMode?: () => void;
    onClearThumbnailCache?: () => void;
    onSort?: (config: SortConfig) => void;
  } = $props();
</script>

<div class="flex items-center gap-1 border-b px-2 py-1.5 bg-background/50">
  <div class="flex items-center gap-1">
    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onGoHome}
      disabled={!hasHomepage}
      title="主页"
    >
      <Home class="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onGoBackInHistory}
      disabled={!canGoBackInHistory}
      title="后退"
    >
      <ChevronLeft class="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onGoForwardInHistory}
      disabled={!canGoForwardInHistory}
      title="前进"
    >
      <ChevronRight class="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onGoBack}
      disabled={!canNavigateBack}
      title="上一级 (Backspace)"
    >
      <ChevronUp class="h-4 w-4" />
    </Button>

    <div class="w-px h-6 bg-border mx-1"></div>

    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onSelectFolder}
      title="选择文件夹"
    >
      <FolderOpen class="h-4 w-4" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onRefresh}
      disabled={!canNavigateBack}
      title="刷新 (F5)"
    >
      <RefreshCw class="h-4 w-4" />
    </Button>
  </div>

  <div class="flex-1"></div>

  <div class="flex items-center gap-1">
    {#if isArchiveView}
      <div class="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <FileArchive class="h-3.5 w-3.5 text-purple-500" />
        <span>压缩包</span>
      </div>
      <div class="w-px h-6 bg-border mx-1"></div>
    {/if}

    <div class="w-px h-6 bg-border mx-1"></div>

    <Button
      variant={isCheckMode ? 'default' : 'ghost'}
      size="icon"
      class="h-8 w-8"
      onclick={onToggleCheckMode}
      title={isCheckMode ? '退出勾选模式' : '勾选模式'}
    >
      <CheckSquare class="h-4 w-4" />
    </Button>

    <Button
      variant={isDeleteMode ? 'destructive' : 'ghost'}
      size="icon"
      class="h-8 w-8"
      onclick={onToggleDeleteMode}
      title={isDeleteMode ? '退出删除模式' : '删除模式'}
    >
      <Trash2 class="h-4 w-4" />
    </Button>

    <div class="w-px h-6 bg-border mx-1"></div>

    <Button
      variant={viewMode === 'list' ? 'default' : 'ghost'}
      size="icon"
      class="h-8 w-8"
      onclick={onToggleViewMode}
      title={viewMode === 'list' ? '切换到缩略图视图' : '切换到列表视图'}
    >
      {#if viewMode === 'list'}
        <List class="h-4 w-4" />
      {:else}
        <Grid3x3 class="h-4 w-4" />
      {/if}
    </Button>

    <div class="flex items-center gap-2 text-xs text-muted-foreground px-2">
      <span>当前排序:</span>
      <span class="font-medium">{sortFieldLabels[sortConfig.field]}</span>
      <span>· {sortConfig.order === 'asc' ? '升序' : '降序'}</span>
    </div>

    <SortPanel onSortChange={onSort} />

    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={onClearThumbnailCache}
      title="清理缩略图缓存"
    >
      <Trash2 class="h-4 w-4" />
    </Button>
  </div>
</div>
