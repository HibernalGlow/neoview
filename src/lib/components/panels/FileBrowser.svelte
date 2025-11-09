<script lang="ts">
  import { Folder, File, Image, Trash2, RefreshCw, FileArchive, FolderOpen, Home, ChevronLeft, ChevronRight, ChevronUp, CheckSquare, Grid3x3, List, MoreVertical } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { FileSystemAPI } from '$lib/api';
  import type { FsItem } from '$lib/types';
  import { bookStore } from '$lib/stores/book.svelte';
  import * as BookAPI from '$lib/api/book';
  import PathBar from '../ui/PathBar.svelte';
  import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
  import { NavigationHistory } from '$lib/utils/navigationHistory';
  import { Button } from '$lib/components/ui/button';
  import { bookmarkStore } from '$lib/stores/bookmark.svelte';

  // 使用全局状态
  let currentPath = $state('');
  let items = $state<FsItem[]>([]);
  let loading = $state(false);
  let error = $state('');
  let thumbnails = $state<Map<string, string>>(new Map());
  let isArchiveView = $state(false);
  let currentArchivePath = $state('');
  let selectedIndex = $state(-1);
  let fileListContainer = $state<HTMLDivElement | undefined>(undefined);
  let contextMenu = $state<{ x: number; y: number; item: FsItem | null }>({ x: 0, y: 0, item: null });
  let copyToSubmenu = $state<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  let clipboardItem = $state<{ path: string; operation: 'copy' | 'cut' } | null>(null);

  // 导航历史管理器
  let navigationHistory = new NavigationHistory();
  
  // UI 模式状态
  let isCheckMode = $state(false);
  let isDeleteMode = $state(false);
  let viewMode = $state<'list' | 'thumbnails'>('list'); // 列表 or 缩略图视图
  let selectedItems = $state<Set<string>>(new Set());

  // 订阅全局状态 - 使用 Svelte 5 的响应式
  $effect(() => {
    const unsubscribe = fileBrowserStore.subscribe(state => {
      console.log('📊 Store state updated:', {
        currentPath: state.currentPath,
        itemsCount: state.items.length,
        loading: state.loading,
        error: state.error,
        isArchiveView: state.isArchiveView
      });
      
      currentPath = state.currentPath;
      items = state.items;
      loading = state.loading;
      error = state.error;
      isArchiveView = state.isArchiveView;
      currentArchivePath = state.currentArchivePath;
      selectedIndex = state.selectedIndex;
      thumbnails = state.thumbnails;
    });
    
    return unsubscribe;
  });

  // 主页路径的本地存储键
  const HOMEPAGE_STORAGE_KEY = 'neoview-homepage-path';

  /**
   * 设置主页路径
   */
  function setHomepage(path: string) {
    try {
      localStorage.setItem(HOMEPAGE_STORAGE_KEY, path);
      console.log('✅ 主页路径已设置:', path);
      // TODO: 可以添加 toast 通知
    } catch (err) {
      console.error('❌ 保存主页路径失败:', err);
    }
  }

  /**
   * 加载主页路径
   */
  function loadHomepage() {
    try {
      const homepage = localStorage.getItem(HOMEPAGE_STORAGE_KEY);
      if (homepage) {
        console.log('📍 加载主页路径:', homepage);
        navigationHistory.setHomepage(homepage);
        loadDirectory(homepage);
      }
    } catch (err) {
      console.error('❌ 加载主页路径失败:', err);
    }
  }

  /**
   * 导航到主页
   */
  function goHome() {
    const homepage = navigationHistory.getHomepage();
    if (homepage) {
      navigateToDirectory(homepage);
    }
  }

  /**
   * 后退
   */
  function goBackInHistory() {
    const path = navigationHistory.back();
    if (path) {
      loadDirectoryWithoutHistory(path);
    }
  }

  /**
   * 前进
   */
  function goForwardInHistory() {
    const path = navigationHistory.forward();
    if (path) {
      loadDirectoryWithoutHistory(path);
    }
  }

  /**
   * 切换勾选模式
   */
  function toggleCheckMode() {
    isCheckMode = !isCheckMode;
    if (!isCheckMode) {
      selectedItems.clear();
    }
  }

  /**
   * 切换删除模式
   */
  function toggleDeleteMode() {
    isDeleteMode = !isDeleteMode;
  }

  /**
   * 切换视图模式
   */
  function toggleViewMode() {
    viewMode = viewMode === 'list' ? 'thumbnails' : 'list';
  }

  /**
   * 切换项目选中状态
   */
  function toggleItemSelection(path: string) {
    if (selectedItems.has(path)) {
      selectedItems.delete(path);
    } else {
      selectedItems.add(path);
    }
    selectedItems = selectedItems; // 触发响应式更新
  }

  // 组件挂载时添加全局点击事件和加载主页
  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.context-menu')) {
        hideContextMenu();
      }
    };
    
    document.addEventListener('click', handleClick);
    
    // 加载主页
    loadHomepage();
    
    return () => {
      document.removeEventListener('click', handleClick);
    };
  });

  /**
   * 选择文件夹
   */
  async function selectFolder() {
    console.log('📂 selectFolder called');
    try {
      console.log('🔄 Calling FileSystemAPI.selectFolder...');
      const path = await FileSystemAPI.selectFolder();
      console.log('✅ Selected path:', path);
      
      if (path) {
        console.log('📂 Loading selected directory...');
        await loadDirectory(path);
        console.log('✅ Directory loaded successfully');
      } else {
        console.log('⚠️ No folder selected');
      }
    } catch (err) {
      console.error('❌ Error in selectFolder:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 加载目录内容（添加到历史记录）
   */
  async function loadDirectory(path: string) {
    await loadDirectoryWithoutHistory(path);
    navigationHistory.push(path);
  }

  /**
   * 加载目录内容（不添加历史记录，用于前进/后退）
   */
  async function loadDirectoryWithoutHistory(path: string) {
    console.log('📂 loadDirectory called with path:', path);
    
    fileBrowserStore.setLoading(true);
    fileBrowserStore.setError('');
    fileBrowserStore.clearThumbnails();
    fileBrowserStore.setArchiveView(false);
    fileBrowserStore.setSelectedIndex(-1);
    fileBrowserStore.setCurrentPath(path);
    
    // 清空选择
    selectedItems.clear();

    try {
      console.log('🔄 Calling FileSystemAPI.browseDirectory...');
      const loadedItems = await FileSystemAPI.browseDirectory(path);
      console.log('✅ Loaded', loadedItems.length, 'items:', loadedItems.map(i => i.name));
      
      fileBrowserStore.setItems(loadedItems);
      
      // 异步加载缩略图
      for (const item of loadedItems) {
        if (item.isImage) {
          loadThumbnail(item.path);
        }
      }
    } catch (err) {
      console.error('❌ Error loading directory:', err);
      fileBrowserStore.setError(String(err));
      fileBrowserStore.setItems([]);
    } finally {
      fileBrowserStore.setLoading(false);
    }
  }

  /**
   * 加载压缩包内容
   */
  async function loadArchive(path: string) {
    console.log('📦 loadArchive called with path:', path);
    
    fileBrowserStore.setLoading(true);
    fileBrowserStore.setError('');
    fileBrowserStore.clearThumbnails();
    fileBrowserStore.setArchiveView(true, path);
    fileBrowserStore.setSelectedIndex(-1);

    try {
      const loadedItems = await FileSystemAPI.listArchiveContents(path);
      console.log('✅ Loaded', loadedItems.length, 'archive items');
      
      fileBrowserStore.setItems(loadedItems);
      
      // 异步加载压缩包内图片的缩略图
      for (const item of loadedItems) {
        if (item.isImage) {
          loadArchiveThumbnail(item.path);
        }
      }
    } catch (err) {
      console.error('❌ Error loading archive:', err);
      fileBrowserStore.setError(String(err));
      fileBrowserStore.setItems([]);
    } finally {
      fileBrowserStore.setLoading(false);
    }
  }

  /**
   * 加载单个缩略图
   */
  async function loadThumbnail(path: string) {
    try {
      const thumbnail = await FileSystemAPI.generateFileThumbnail(path);
      fileBrowserStore.addThumbnail(path, thumbnail);
    } catch (err) {
      // 不支持的图片格式或其他错误，静默失败
      console.debug('Failed to load thumbnail:', err);
    }
  }

  /**
   * 加载压缩包内图片的缩略图
   */
  async function loadArchiveThumbnail(filePath: string) {
    try {
      const thumbnail = await FileSystemAPI.generateArchiveThumbnail(
        currentArchivePath,
        filePath,
        256
      );
      fileBrowserStore.addThumbnail(filePath, thumbnail);
    } catch (err) {
      // 不支持的图片格式或其他错误，静默失败
      console.debug('Failed to load archive thumbnail:', err);
    }
  }

  /**
   * 显示右键菜单
   */
  function showContextMenu(e: MouseEvent, item: FsItem) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, item };
  }

  /**
   * 隐藏右键菜单
   */
  function hideContextMenu() {
    contextMenu = { x: 0, y: 0, item: null };
    copyToSubmenu.show = false;
  }

  /**
   * 浏览压缩包内容
   */
  async function browseArchive(item: FsItem) {
    console.log('📦 Browsing archive:', item.path);
    await loadArchive(item.path);
    hideContextMenu();
  }

  /**
   * 作为书籍打开压缩包
   */
  async function openArchiveAsBook(item: FsItem) {
    console.log('📦 Opening archive as book:', item.path);
    await bookStore.openBook(item.path);
    hideContextMenu();
  }

  /**
   * 检查并打开文件
   */
  async function openFile(item: FsItem) {
    console.log('=== openFile called ===');
    console.log('Item:', {
      name: item.name,
      isDir: item.isDir,
      isImage: item.isImage,
      path: item.path,
      size: item.size
    });
    
    try {
      if (item.isDir) {
        // 📁 文件夹：浏览或作为 book 打开
        console.log('📁 Folder clicked:', item.path);
        
        // 右键 = 浏览,左键 = 作为 book 打开 (先实现浏览,后续添加上下文菜单)
        // 目前默认行为: 浏览
        await navigateToDirectory(item.path);
        console.log('✅ Directory navigation completed');
      } else {
        // 检查是否为压缩包
        const isArchive = await FileSystemAPI.isSupportedArchive(item.path);
        console.log('Is archive:', isArchive);
        
        if (isArchive) {
          // 📦 压缩包：作为 book 打开
          console.log('📦 Archive clicked as book:', item.path);
          
          // 打开压缩包作为书籍
          await bookStore.openBook(item.path);
          console.log('✅ Archive opened as book');
        } else if (item.isImage) {
          // 🖼️ 图片：打开查看
          console.log('🖼️ Image clicked:', item.path);
          
          if (isArchiveView) {
            // 从压缩包中打开图片
            await openImageFromArchive(item.path);
          } else {
            // 从文件系统打开图片
            await openImage(item.path);
          }
        } else {
          console.log('⚠️ Unknown file type, ignoring');
        }
      }
    } catch (err) {
      console.error('❌ Error in openFile:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 从压缩包打开图片
   */
  async function openImageFromArchive(filePath: string) {
    try {
      console.log('📦 Opening image from archive:', filePath);
      // 打开整个压缩包作为 book
      await bookStore.openArchiveAsBook(currentArchivePath);
      // 跳转到指定图片
      await BookAPI.navigateToImage(filePath);
      console.log('✅ Image opened from archive');
    } catch (err) {
      console.error('❌ Error opening image from archive:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 返回上一级
   */
  async function goBack() {
    if (isArchiveView) {
      // 从压缩包视图返回到文件系统
      isArchiveView = false;
      const lastBackslash = currentArchivePath.lastIndexOf('\\');
      const lastSlash = currentArchivePath.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      const parentDir = lastSeparator > 0 ? currentArchivePath.substring(0, lastSeparator) : currentPath;
      await loadDirectory(parentDir);
    } else if (currentPath) {
      // 文件系统中返回上一级
      const lastBackslash = currentPath.lastIndexOf('\\');
      const lastSlash = currentPath.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      
      if (lastSeparator > 0) {
        const parentDir = currentPath.substring(0, lastSeparator);
        // 确保不是驱动器根目录后面的路径
        if (parentDir && !parentDir.endsWith(':')) {
          await loadDirectory(parentDir);
        }
      }
    }
  }

  

  /**
   * 导航到目录
   */
  async function navigateToDirectory(path: string) {
    console.log('🚀 navigateToDirectory called with path:', path);
    if (!path) {
      console.warn('⚠️ Empty path provided to navigateToDirectory');
      return;
    }
    await loadDirectory(path);
  }

  /**
   * 打开图片文件
   */
  async function openImage(path: string) {
    try {
      console.log('🖼️ Opening image:', path);
      // 获取图片所在的目录
      const lastBackslash = path.lastIndexOf('\\');
      const lastSlash = path.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      const parentDir = lastSeparator > 0 ? path.substring(0, lastSeparator) : path;
      
      console.log('📁 Parent directory:', parentDir);
      // 打开整个文件夹作为 book
      await bookStore.openDirectoryAsBook(parentDir);
      // 跳转到指定图片
      await BookAPI.navigateToImage(path);
      console.log('✅ Image opened');
    } catch (err) {
      console.error('❌ Error opening image:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 删除文件
   */
  async function deleteItem(path: string) {
    if (!confirm('确定要删除此项吗？')) return;

    try {
      await FileSystemAPI.moveToTrash(path);
      await loadDirectory(currentPath);
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 刷新
   */
  async function refresh() {
    if (currentPath) {
      await loadDirectory(currentPath);
    }
  }

  /**
   * 格式化文件大小
   */
  function formatSize(bytes: number, isDir: boolean): string {
    if (isDir) {
      // 对于目录，显示子项数量
      return bytes === 0 ? '空文件夹' : `${bytes} 项`;
    }
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  /**
   * 格式化日期
   */
  function formatDate(timestamp?: number): string {
    if (!timestamp) return '-';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  }

  /**
   * 键盘导航处理
   */
  function handleKeydown(e: KeyboardEvent) {
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(Math.min(selectedIndex + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(Math.max(selectedIndex - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          openFile(items[selectedIndex]);
        }
        break;
      case 'Home':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        fileBrowserStore.setSelectedIndex(items.length - 1);
        break;
      case 'Backspace':
        e.preventDefault();
        goBack();
        break;
      case 'F5':
        e.preventDefault();
        refresh();
        break;
    }
  }

  /**
   * 处理路径栏导航
   */
  async function handlePathNavigate(path: string) {
    if (path) {
      await navigateToDirectory(path);
    } else {
      // 返回根目录/主页
      currentPath = '';
      items = [];
      isArchiveView = false;
    }
  }

  // ===== 右键菜单功能 =====

  /**
   * 添加到书签
   */
  function addToBookmark(item: FsItem) {
    bookmarkStore.add(item);
    hideContextMenu();
  }

  /**
   * 在资源管理器中打开
   */
  async function openInExplorer(item: FsItem) {
    try {
      await FileSystemAPI.showInFileManager(item.path);
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
    hideContextMenu();
  }

  /**
   * 在外部应用中打开
   */
  async function openWithExternalApp(item: FsItem) {
    try {
      await FileSystemAPI.openWithSystem(item.path);
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
    hideContextMenu();
  }

  /**
   * 剪切文件
   */
  function cutItem(item: FsItem) {
    clipboardItem = { path: item.path, operation: 'cut' };
    hideContextMenu();
  }

  /**
   * 复制文件
   */
  function copyItem(item: FsItem) {
    clipboardItem = { path: item.path, operation: 'copy' };
    hideContextMenu();
  }

  /**
   * 粘贴文件
   */
  async function pasteItem() {
    if (!clipboardItem || !currentPath) return;

    try {
      const targetPath = `${currentPath}/${clipboardItem.path.split(/[\\/]/).pop()}`;
      
      if (clipboardItem.operation === 'cut') {
        await FileSystemAPI.movePath(clipboardItem.path, targetPath);
      } else {
        await FileSystemAPI.copyPath(clipboardItem.path, targetPath);
      }
      
      clipboardItem = null;
      await refresh();
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 显示复制到子菜单
   */
  function showCopyToSubmenu(e: MouseEvent) {
    e.stopPropagation();
    copyToSubmenu = { show: true, x: contextMenu.x + 150, y: contextMenu.y };
  }

  /**
   * 复制到指定文件夹
   */
  async function copyToFolder(targetPath: string) {
    if (!contextMenu.item) return;

    try {
      const fileName = contextMenu.item.path.split(/[\\/]/).pop();
      const targetFilePath = `${targetPath}/${fileName}`;
      await FileSystemAPI.copyPath(contextMenu.item.path, targetFilePath);
      await refresh();
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
    hideContextMenu();
    copyToSubmenu.show = false;
  }

  /**
   * 删除文件
   */
  async function deleteItemFromMenu(item: FsItem) {
    if (!confirm(`确定要删除 "${item.name}" 吗？`)) return;

    try {
      await FileSystemAPI.moveToTrash(item.path);
      await refresh();
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
    hideContextMenu();
  }

  /**
   * 移动到文件夹
   */
  async function moveToFolder() {
    if (!contextMenu.item) return;

    try {
      const targetPath = await FileSystemAPI.selectFolder();
      if (targetPath) {
        const fileName = contextMenu.item.path.split(/[\\/]/).pop();
        const targetFilePath = `${targetPath}/${fileName}`;
        await FileSystemAPI.movePath(contextMenu.item.path, targetFilePath);
        await refresh();
      }
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
    hideContextMenu();
  }

  /**
   * 重命名
   */
  async function renameItem(item: FsItem) {
    const newName = prompt('请输入新名称:', item.name);
    if (!newName || newName === item.name) return;

    try {
      const newPath = item.path.replace(item.name, newName);
      await FileSystemAPI.renamePath(item.path, newPath);
      await refresh();
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
    hideContextMenu();
  }
</script>

<div class="flex h-full flex-col">
  <!-- 路径面包屑导航 -->
  <PathBar 
    bind:currentPath={currentPath} 
    isArchive={isArchiveView}
    onNavigate={handlePathNavigate}
    onSetHomepage={setHomepage}
  />

  <!-- 工具栏 -->
  <div class="flex items-center gap-1 border-b px-2 py-1.5 bg-background/50">
    <!-- 左侧：导航按钮 -->
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={goHome}
        disabled={!navigationHistory.getHomepage()}
        title="主页"
      >
        <Home class="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={goBackInHistory}
        disabled={!navigationHistory.canGoBack()}
        title="后退"
      >
        <ChevronLeft class="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={goForwardInHistory}
        disabled={!navigationHistory.canGoForward()}
        title="前进"
      >
        <ChevronRight class="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={goBack}
        disabled={!currentPath && !isArchiveView}
        title="上一级 (Backspace)"
      >
        <ChevronUp class="h-4 w-4" />
      </Button>

      <div class="w-px h-6 bg-border mx-1"></div>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={selectFolder}
        title="选择文件夹"
      >
        <FolderOpen class="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        onclick={refresh}
        disabled={!currentPath && !isArchiveView}
        title="刷新 (F5)"
      >
        <RefreshCw class="h-4 w-4" />
      </Button>
    </div>

    <div class="flex-1"></div>

    <!-- 右侧：操作按钮 -->
    <div class="flex items-center gap-1">
      {#if isArchiveView}
        <div class="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <FileArchive class="h-3.5 w-3.5 text-purple-500" />
          <span>压缩包</span>
        </div>
        <div class="w-px h-6 bg-border mx-1"></div>
      {/if}

      <Button
        variant={isCheckMode ? 'default' : 'ghost'}
        size="icon"
        class="h-8 w-8"
        onclick={toggleCheckMode}
        title={isCheckMode ? '退出勾选模式' : '勾选模式'}
      >
        <CheckSquare class="h-4 w-4" />
      </Button>

      <Button
        variant={isDeleteMode ? 'destructive' : 'ghost'}
        size="icon"
        class="h-8 w-8"
        onclick={toggleDeleteMode}
        title={isDeleteMode ? '退出删除模式' : '删除模式'}
      >
        <Trash2 class="h-4 w-4" />
      </Button>

      <div class="w-px h-6 bg-border mx-1"></div>

      <Button
        variant={viewMode === 'list' ? 'default' : 'ghost'}
        size="icon"
        class="h-8 w-8"
        onclick={toggleViewMode}
        title={viewMode === 'list' ? '切换到缩略图视图' : '切换到列表视图'}
      >
        {#if viewMode === 'list'}
          <List class="h-4 w-4" />
        {:else}
          <Grid3x3 class="h-4 w-4" />
        {/if}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8"
        title="更多选项"
      >
        <MoreVertical class="h-4 w-4" />
      </Button>
    </div>
  </div>

  <!-- 错误提示 -->
  {#if error}
    <div class="m-2 rounded bg-red-50 p-3 text-sm text-red-600">
      {error}
    </div>
  {/if}

  <!-- 加载状态 -->
  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <div class="text-sm text-gray-500">加载中...</div>
      </div>
    </div>
  {:else if items.length === 0 && currentPath}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center text-gray-400">
        <Folder class="mx-auto mb-2 h-16 w-16 opacity-50" />
        <p class="text-sm">此目录为空</p>
      </div>
    </div>
  {:else if items.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center">
        <FolderOpen class="mx-auto mb-4 h-20 w-20 text-gray-300" />
        <p class="text-lg font-medium text-gray-600 mb-2">选择文件夹开始浏览</p>
        <p class="text-sm text-gray-400 mb-6">点击上方的"选择文件夹"按钮</p>
        <button
          onclick={selectFolder}
          class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          选择文件夹
        </button>
      </div>
    </div>
  {:else}
    <!-- 文件列表 -->
    <div 
      bind:this={fileListContainer}
      class="flex-1 overflow-y-auto p-2 focus:outline-none" 
      tabindex="0" 
      onkeydown={handleKeydown}
      onclick={() => fileListContainer?.focus()}
    >
      <div class="grid grid-cols-1 gap-2">
        {#each items as item, index (item.path)}
          <div
            class="group flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors {selectedIndex === index ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50 border-gray-200'}"
            onclick={() => {
              if (!isCheckMode && !isDeleteMode) {
                fileBrowserStore.setSelectedIndex(index);
                openFile(item);
              }
            }}
            oncontextmenu={(e) => showContextMenu(e, item)}
          >
            <!-- 勾选框（勾选模式） -->
            {#if isCheckMode}
              <button
                class="flex-shrink-0"
                onclick={(e) => {
                  e.stopPropagation();
                  toggleItemSelection(item.path);
                }}
              >
                <div class="h-5 w-5 rounded border-2 flex items-center justify-center transition-colors {selectedItems.has(item.path) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}">
                  {#if selectedItems.has(item.path)}
                    <svg class="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                  {/if}
                </div>
              </button>
            {/if}

            <!-- 删除按钮（删除模式） -->
            {#if isDeleteMode && !isArchiveView}
              <button
                class="flex-shrink-0"
                onclick={(e) => {
                  e.stopPropagation();
                  deleteItem(item.path);
                }}
                title="删除"
              >
                <div class="h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors">
                  <Trash2 class="h-3 w-3 text-white" />
                </div>
              </button>
            {/if}

            <!-- 图标/缩略图 -->
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center">
              {#if item.isDir}
                <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
              {:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
                <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
              {:else if item.isImage && thumbnails.has(item.path)}
                <img
                  src={thumbnails.get(item.path)}
                  alt={item.name}
                  class="h-12 w-12 rounded object-cover transition-opacity hover:opacity-80"
                />
              {:else if item.isImage}
                <Image class="h-8 w-8 text-green-500 transition-colors group-hover:text-green-600" />
              {:else}
                <File class="h-8 w-8 text-gray-400 transition-colors group-hover:text-gray-500" />
              {/if}
            </div>

            <!-- 信息 -->
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{item.name}</div>
              <div class="text-xs text-gray-500">
                {formatSize(item.size, item.isDir)} · {formatDate(item.modified)}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 右键菜单 -->
  {#if contextMenu.item}
    <div
      class="context-menu fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
      onmouseleave={hideContextMenu}
    >
      <!-- 添加到书签 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => addToBookmark(contextMenu.item!)}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        添加到书签
      </button>

      <div class="border-t border-gray-200 my-1"></div>

      <!-- 在资源管理器中打开 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => openInExplorer(contextMenu.item!)}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        在资源管理器中打开
      </button>

      <!-- 在外部应用中打开 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => openWithExternalApp(contextMenu.item!)}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        在外部应用中打开
      </button>

      <div class="border-t border-gray-200 my-1"></div>

      <!-- 剪切 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => cutItem(contextMenu.item!)}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
        </svg>
        剪切
      </button>

      <!-- 复制 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => copyItem(contextMenu.item!)}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        复制
      </button>

      <!-- 复制到文件夹（二级菜单） -->
      <div class="relative">
        <button
          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between gap-2"
          onclick={showCopyToSubmenu}
        >
          <div class="flex items-center gap-2">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            复制到文件夹
          </div>
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <!-- 复制到子菜单 -->
        {#if copyToSubmenu.show}
          <div
            class="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[60] min-w-[150px]"
            style="left: {copyToSubmenu.x}px; top: {copyToSubmenu.y}px;"
          >
            <!-- 这里可以添加常用目标文件夹 -->
            <button
              class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
              onclick={() => {
                const targetPath = prompt('请输入目标文件夹路径:');
                if (targetPath) copyToFolder(targetPath);
              }}
            >
              选择文件夹...
            </button>
            <!-- 可以添加更多预设文件夹选项 -->
          </div>
        {/if}
      </div>

      <div class="border-t border-gray-200 my-1"></div>

      <!-- 删除 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
        onclick={() => deleteItemFromMenu(contextMenu.item!)}
      >
        <Trash2 class="h-4 w-4" />
        删除
      </button>

      <!-- 移动到文件夹 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={moveToFolder}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        移动到文件夹(E)
      </button>

      <!-- 重命名 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => renameItem(contextMenu.item!)}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        重命名(M)
      </button>

      {#if contextMenu.item.name.endsWith('.zip') || contextMenu.item.name.endsWith('.cbz') || contextMenu.item.name.endsWith('.rar') || contextMenu.item.name.endsWith('.cbr')}
        <div class="border-t border-gray-200 my-1"></div>
        <!-- 压缩包选项 -->
        <button
          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          onclick={() => openArchiveAsBook(contextMenu.item!)}
        >
          <FolderOpen class="h-4 w-4" />
          作为书籍打开
        </button>
        <button
          class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          onclick={() => browseArchive(contextMenu.item!)}
        >
          <Folder class="h-4 w-4" />
          浏览内容
        </button>
      {/if}

      <div class="border-t border-gray-200 my-1"></div>
      
      <!-- 通用选项 -->
      <button
        class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onclick={() => {
          navigator.clipboard.writeText(contextMenu.item!.path);
          hideContextMenu();
        }}
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        复制路径
      </button>
    </div>
    
    <!-- 点击其他地方关闭菜单 -->
    <div
      class="fixed inset-0 z-40"
      onclick={hideContextMenu}
    ></div>
  {/if}
</div>
