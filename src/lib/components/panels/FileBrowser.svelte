<script lang="ts">
  import { Folder, File, Image, Trash2, RefreshCw, FileArchive, FolderOpen, Home, ChevronLeft, ChevronRight, ChevronUp, CheckSquare, Grid3x3, List, MoreVertical, Search, ChevronDown, Settings, AlertCircle, Bookmark, Star } from '@lucide/svelte';
  import BookmarkSortPanel from '$lib/components/ui/sort/BookmarkSortPanel.svelte';
  import { onMount } from 'svelte';
  import { fileBrowserService, navigationHistory } from './file/services/fileBrowserService';
  import type { FsItem } from '$lib/types';
  import { bookStore } from '$lib/stores/book.svelte';
  import PathBar from '../ui/PathBar.svelte';
  import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Input from '$lib/components/ui/input';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import { bookmarkStore } from '$lib/stores/bookmark.svelte';
  import { homeDir } from '@tauri-apps/api/path';
  import FileBrowserToolbar from './file/components/FileBrowserToolbar.svelte';
  import FileBrowserSearch from './file/components/FileBrowserSearch.svelte';
  import FileBrowserList from './file/components/FileBrowserList.svelte';
  import FileBrowserEmptyState from './file/components/FileBrowserEmptyState.svelte';
  import {
    calculateContextMenuPosition,
    setClipboardItem,
    pasteClipboardItem,
  } from './file/services/contextMenuService';
  import {
    addBookmarkAction,
    openInExplorerAction,
    openWithExternalAppAction,
    deleteItemAction,
    moveItemToFolderAction,
    renameItemAction,
    openArchiveAsBookAction,
    copyPathAction,
  } from './file/services/fileActionService';
  import {
    sortFsItems,
    getSortConfig,
    setSortConfig,
    type SortConfig,
  } from './file/services/sortService';
  import {
    loadSearchHistoryEntries,
    addSearchHistoryEntry,
    removeSearchHistoryEntry,
    clearSearchHistoryEntries,
    searchFilesInPath,
    type SearchHistoryEntry,
    type SearchSettings,
  } from './file/services/searchService';
  import {
    loadDirectory as loadDirectoryService,
    loadDirectoryWithoutHistory as loadDirectoryWithoutHistoryService,
    navigateToDirectory as navigateToDirectoryService,
    loadArchive as loadArchiveService,
    goBack as goBackService,
    goBackInHistory as goBackInHistoryService,
    goForwardInHistory as goForwardInHistoryService,
    refreshDirectory as refreshDirectoryService,
    type NavigationOptions,
    type NavigationContext,
  } from './file/services/navigationService';


  // 使用全局状态
  let currentPath = $state('');
  let items = $state<FsItem[]>([]);
  let loading = $state(false);
  let error = $state('');
  let thumbnails = $state<Map<string, string>>(new Map());
  // 缩略图由外部 thumbnailManager 管理（队列、并发、archive 支持）
  let isArchiveView = $state(false);
  let currentArchivePath = $state('');
  let selectedIndex = $state(-1);
  let fileListContainer = $state<HTMLDivElement | undefined>(undefined);
  let contextMenu = $state<{ x: number; y: number; item: FsItem | null; direction: 'up' | 'down' }>({ x: 0, y: 0, item: null, direction: 'down' });
  let bookmarkContextMenu = $state<{ x: number; y: number; bookmark: any | null }>({ x: 0, y: 0, bookmark: null });

  // UI 模式状态
  let isCheckMode = $state(false);
  let isDeleteMode = $state(false);
  let viewMode = $state<'list' | 'thumbnails'>('list'); // 列表 or 缩略图视图
  let selectedItems = $state<Set<string>>(new Set());
  let hasHomepage = $state(false);
  let canNavigateBack = $state(false);
  let sortConfig = $state<SortConfig>(getSortConfig());

  function clearSelectedItems() {
    selectedItems = new Set();
  }

  function createNavigationOptions(): NavigationOptions {
    return {
      sortConfig,
      thumbnails,
      clearSelection: clearSelectedItems,
    };
  }

  function createNavigationContext(): NavigationContext {
    return {
      ...createNavigationOptions(),
      currentPath,
      currentArchivePath,
      isArchiveView,
    };
  }

  

  // 搜索功能状态
  let searchQuery = $state('');
  type SearchHistoryEntry = { query: string; timestamp: number };

  let searchHistory = $state<SearchHistoryEntry[]>([]);
  let showSearchHistory = $state(false);
  let showSearchSettings = $state(false);
  let searchSettings = $state<SearchSettings>({
    includeSubfolders: true,
    showHistoryOnFocus: true,
  });
  let searchResults = $state<FsItem[]>([]);
  let isSearching = $state(false);
  let searchInputTimeout: ReturnType<typeof setTimeout> | null = null;

  // 书签相关 - 使用 bookmarkStore
  function loadBookmarks() {
    // 空函数，因为书签功能已迁移到独立 tab
  }

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
      canNavigateBack = state.isArchiveView || Boolean(state.currentPath);
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
  async function loadHomepage() {
    try {
      let homepage = localStorage.getItem(HOMEPAGE_STORAGE_KEY);
      if (!homepage) {
        // 如果本地没有保存主页，尝试使用系统 Home 目录作为默认主页
        try {
          const hd = await homeDir();
          if (hd) {
            homepage = hd;
            console.log('📍 未设置主页，本次使用系统 Home 目录作为主页:', homepage);
            // 将该值保存为主页以便下次启动使用
            setHomepage(homepage);
            hasHomepage = true;
          }
        } catch (e) {
          console.warn('⚠️ 无法获取系统 Home 目录:', e);
        }
      }

      if (homepage) {
        console.log('📍 加载主页路径:', homepage);
        navigationHistory.setHomepage(homepage);
        hasHomepage = true;
        // 注意：不在此处 await 阻塞 UI，如果需要可以等待
        await loadDirectoryService(homepage, createNavigationOptions());
      } else {
        console.warn('⚠️ 没有可用的主页路径，跳过加载主页');
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
   * 执行搜索（使用fd）
   */
  async function performSearch(query: string) {
    if (!query.trim()) {
      searchResults = [];
      return;
    }

    isSearching = true;
    try {
      const results = await searchFilesInPath(currentPath, query, searchSettings, {
        maxResults: 100,
      });
      console.log(`✅ 搜索完成，找到 ${results.length} 个结果`);
      console.log('搜索结果详情:', results);
      
      // 显示每个结果的详细信息
      results.forEach((item, index) => {
        console.log(`[${index + 1}] ${item.isDir ? '📁' : '📄'} ${item.name}`);
        console.log(`    路径: ${item.path}`);
        console.log(`    大小: ${formatFileSize(item.size, item.isDir)}`);
        console.log(`    修改时间: ${item.modified ? new Date(item.modified * 1000).toLocaleString() : '未知'}`);
        console.log(`    是否图片: ${item.isImage ? '是' : '否'}`);
      });

      // 搜索完成后自动应用默认排序（路径升序）
      if (results.length > 0) {
        searchResults = sortFsItems(results, sortConfig);
      } else {
        searchResults = [];
      }
    } catch (err) {
      console.error('❌ 搜索失败:', err);
      console.error('错误详情:', err);
      fileBrowserStore.setError(String(err));
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }
  
  /**
   * 格式化文件大小
   */
  function formatFileSize(bytes: number, isDir: boolean): string {
    if (isDir) {
      return `${bytes} 项`;
    }
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  

  /**
   * 后退
   */
  function goBackInHistory() {
    goBackInHistoryService(createNavigationOptions());
  }

  /**
   * 前进
   */
  function goForwardInHistory() {
    goForwardInHistoryService(createNavigationOptions());
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
      // 只有当点击的不是搜索框、搜索历史或搜索设置时才隐藏
      if (!target.closest('.search-history') && 
          !target.closest('.search-settings') && 
          !target.closest('input[placeholder*="搜索"]')) {
        showSearchHistory = false;
        showSearchSettings = false;
      }
    };
    
    document.addEventListener('click', handleClick);
    
    // 加载主页
    loadHomepage();

    searchHistory = loadSearchHistoryEntries();

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
      console.log('🔄 Selecting folder...');
      const path = await fileBrowserService.selectFolder();
      console.log('✅ Selected path:', path);
      
      if (path) {
        console.log('📂 Loading selected directory...');
        await loadDirectoryService(path, createNavigationOptions());
        console.log('✅ Directory loaded successfully');
      } else {
        console.log('⚠️ No folder selected');
      }
    } catch (err) {
      console.error('❌ Error in selectFolder:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  function loadDirectory(path: string) {
    return loadDirectoryService(path, createNavigationOptions());
  }

  function loadDirectoryWithoutHistory(path: string) {
    return loadDirectoryWithoutHistoryService(path, createNavigationOptions());
  }

  function navigateToDirectory(path: string) {
    if (!path) {
      console.warn('⚠️ Empty path provided to navigateToDirectory');
      return Promise.resolve();
    }
    return navigateToDirectoryService(path, createNavigationOptions());
  }

  function loadArchive(path: string) {
    return loadArchiveService(path, createNavigationOptions());
  }

  
  

  /**
   * 显示右键菜单
   */
  function showContextMenu(e: MouseEvent, item: FsItem) {
    e.preventDefault();
    const position = calculateContextMenuPosition(e);
    contextMenu = { ...position, item };
  }

  /**
   * 显示书签右键菜单
   */
  function showBookmarkContextMenu(e: MouseEvent, bookmark: any) {
    e.preventDefault();
    e.stopPropagation();
    
    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let menuX = e.clientX;
    let menuY = e.clientY;
    
    // 确保菜单不超出视口右侧
    const menuWidth = 180;
    if (e.clientX + menuWidth > viewportWidth) {
      menuX = viewportWidth - menuWidth - 10;
    }
    
    // 确保菜单不超出视口左侧
    if (menuX < 10) {
      menuX = 10;
    }
    
    // 确保菜单不超出视口底部
    const maxMenuHeight = viewportHeight * 0.7;
    if (menuY + maxMenuHeight > viewportHeight) {
      menuY = viewportHeight - maxMenuHeight - 10;
    }
    
    bookmarkContextMenu = { x: menuX, y: menuY, bookmark };
  }

  /**
   * 隐藏右键菜单
   */
  function hideContextMenu() {
    contextMenu = { x: 0, y: 0, item: null, direction: 'down' };
    bookmarkContextMenu = { x: 0, y: 0, bookmark: null };
  }

  async function openSearchResult(item: FsItem) {
    await openFile(item);
  }

  /**
   * 浏览压缩包内容
   */
  async function browseArchive(item: FsItem) {
    console.log('📦 Browsing archive:', item.path);
    await loadArchive(item.path);
    hideContextMenu();
  }

  const contextMenuHandlers = {
    addBookmark: addToBookmark,
    openInExplorer,
    openWithExternalApp,
    cutItem,
    copyItem,
    deleteItem: deleteItemFromMenu,
    moveToFolder,
    renameItem,
    openArchiveAsBook,
    browseArchive,
    copyPath: (item: FsItem) => {
      navigator.clipboard.writeText(item.path);
    }
  };

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
        const isArchive = await fileBrowserService.isSupportedArchive(item.path);
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
      await fileBrowserService.navigateToImage(filePath);
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
    await goBackService(createNavigationContext());
  }

  

  
  async function openImage(path: string) {
    try {
      console.log('🖼️ Opening image:', path);
      const lastBackslash = path.lastIndexOf('\\');
      const lastSlash = path.lastIndexOf('/');
      const lastSeparator = Math.max(lastBackslash, lastSlash);
      const parentDir = lastSeparator > 0 ? path.substring(0, lastSeparator) : path;
      
      console.log('📁 Parent directory:', parentDir);
      await bookStore.openDirectoryAsBook(parentDir);
      await fileBrowserService.navigateToImage(path);
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
      await fileBrowserService.moveToTrash(path);
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
   * 清理缩略图缓存
   */
  async function clearThumbnailCache() {
    if (!confirm('确定要清理所有缩略图缓存吗？这将重新生成所有缩略图。')) return;

    try {
      const count = await fileBrowserService.clearThumbnailCache();
      console.log(`✅ 已清理 ${count} 个缓存文件`);
      // 刷新当前目录以重新生成缩略图
      if (currentPath) {
        await loadDirectory(currentPath);
      }
    } catch (err) {
      console.error('❌ 清理缓存失败:', err);
      fileBrowserStore.setError(String(err));
    }
  }

  function applySortingToCurrentData() {
    if (searchQuery && searchResults.length > 0) {
      searchResults = sortFsItems(searchResults, sortConfig);
    } else {
      fileBrowserStore.setItems(sortFsItems(items, sortConfig));
    }
  }

  /**
   * 处理排序配置变更
   */
  function handleSortConfig(config: SortConfig) {
    sortConfig = config;
    setSortConfig(config);
    applySortingToCurrentData();
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
   * 格式化搜索历史时间戳
   */
  function formatSearchHistoryTime(timestamp: number): string {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    
    return `${month}月${day}日 ${hours}:${minutes}:${seconds}`;
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
    addBookmarkAction(item);
    loadBookmarks();
    hideContextMenu();
  }

  /**
   * 在资源管理器中打开
   */
  async function openInExplorer(item: FsItem) {
    await openInExplorerAction(item);
    hideContextMenu();
  }

  /**
   * 在外部应用中打开
   */
  async function openWithExternalApp(item: FsItem) {
    await openWithExternalAppAction(item);
    hideContextMenu();
  }

  /**
   * 剪切文件
   */
  function cutItem(item: FsItem) {
    setClipboardItem(item, 'cut');
    hideContextMenu();
  }

  /**
   * 复制文件
   */
  function copyItem(item: FsItem) {
    setClipboardItem(item, 'copy');
    hideContextMenu();
  }

  /**
   * 粘贴文件
   */
  async function pasteItem() {
    if (!currentPath) return;
    try {
      await pasteClipboardItem(currentPath, async () => {
        await refresh();
      });
    } catch (err) {
      fileBrowserStore.setError(String(err));
    }
  }

  /**
   * 删除文件
   */
  async function deleteItemFromMenu(item: FsItem) {
    const success = await deleteItemAction(item);
    if (success) {
      await refresh();
    }
    hideContextMenu();
  }

  /**
   * 移动到文件夹
   */
  async function moveToFolder(item: FsItem) {
    const success = await moveItemToFolderAction(item);
    if (success) {
      await refresh();
    }
    hideContextMenu();
  }

  /**
   * 重命名
   */
  async function renameItem(item: FsItem) {
    const success = await renameItemAction(item);
    if (success) {
      await refresh();
    }
    hideContextMenu();
  }

  // ===== 搜索功能 =====

  /**
   * 加载搜索历史
   */
  function addSearchHistory(query: string) {
    searchHistory = addSearchHistoryEntry(searchHistory, query);
  }

  function clearSearchHistory() {
    searchHistory = clearSearchHistoryEntries();
    showSearchHistory = false;
  }

  function removeSearchHistoryItem(item: SearchHistoryEntry) {
    searchHistory = removeSearchHistoryEntry(searchHistory, item);
    if (searchHistory.length === 0) {
      showSearchHistory = false;
    }
  }

  /**
   * 搜索文件
   */
  async function searchFiles(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      searchResults = [];
      return;
    }

    addSearchHistory(trimmed);
    await performSearch(trimmed);
  }

  /**
   * 处理搜索输入
   */
  function handleSearchInput(value: string) {
    searchQuery = value;

    if (searchInputTimeout) {
      clearTimeout(searchInputTimeout);
    }

    if (searchQuery.trim()) {
      searchInputTimeout = setTimeout(() => {
        searchFiles(searchQuery);
      }, 300);
    } else {
      searchResults = [];
    }
  }

  /**
   * 选择搜索历史
   */
  function selectSearchHistory(item: { query: string; timestamp: number }) {
    searchQuery = item.query;
    showSearchHistory = false;
    searchFiles(item.query);
  }
  
  /**
   * 处理搜索框聚焦
   */
  function handleSearchFocus() {
    // 添加一个小延迟，确保点击事件不会立即隐藏历史记录
    setTimeout(() => {
      if (searchSettings.showHistoryOnFocus && searchHistory.length > 0) {
        showSearchHistory = true;
      }
    }, 10);
    showSearchSettings = false;
  }

  function toggleSearchHistoryDropdown() {
    showSearchHistory = !showSearchHistory;
    if (showSearchHistory) {
      showSearchSettings = false;
    }
  }

  function toggleSearchSettingsDropdown(event: MouseEvent) {
    event.stopPropagation();
    showSearchSettings = !showSearchSettings;
    if (showSearchSettings) {
      showSearchHistory = false;
    }
  }

  function clearSearchField() {
    if (searchInputTimeout) {
      clearTimeout(searchInputTimeout);
      searchInputTimeout = null;
    }
    handleSearchInput('');
    searchResults = [];
  }

  function updateSearchSetting(
    key: 'includeSubfolders' | 'showHistoryOnFocus',
    value: boolean
  ) {
    searchSettings = { ...searchSettings, [key]: value };
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
  <FileBrowserToolbar
    isArchiveView={isArchiveView}
    hasHomepage={hasHomepage}
    canGoBackInHistory={navigationHistory.canGoBack()}
    canGoForwardInHistory={navigationHistory.canGoForward()}
    canNavigateBack={canNavigateBack}
    isCheckMode={isCheckMode}
    isDeleteMode={isDeleteMode}
    viewMode={viewMode}
    sortConfig={sortConfig}
    onGoHome={goHome}
    onGoBackInHistory={goBackInHistory}
    onGoForwardInHistory={goForwardInHistory}
    onGoBack={goBack}
    onSelectFolder={selectFolder}
    onRefresh={refresh}
    onToggleCheckMode={toggleCheckMode}
    onToggleDeleteMode={toggleDeleteMode}
    onToggleViewMode={toggleViewMode}
    onClearThumbnailCache={clearThumbnailCache}
    onSort={handleSortConfig}
  />

  <!-- 搜索栏 -->
  <FileBrowserSearch
    searchQuery={searchQuery}
    searchHistory={searchHistory}
    searchSettings={searchSettings}
    showSearchHistory={showSearchHistory}
    showSearchSettings={showSearchSettings}
    isArchiveView={isArchiveView}
    currentPath={currentPath}
    onSearchInput={handleSearchInput}
    onSearchFocus={handleSearchFocus}
    onSearchHistoryToggle={toggleSearchHistoryDropdown}
    onSearchSettingsToggle={toggleSearchSettingsDropdown}
    onClearSearch={clearSearchField}
    onSelectSearchHistory={selectSearchHistory}
    onRemoveSearchHistoryItem={removeSearchHistoryItem}
    onClearSearchHistory={clearSearchHistory}
    onSearchSettingChange={updateSearchSetting}
  />

  <!-- 错误提示 -->
  {#if error}
    <div class="m-2 rounded bg-red-50 p-3 text-sm text-red-600">
      {error}
    </div>
  {:else}
    {#if loading || isSearching || (searchQuery && searchResults.length === 0) || items.length === 0}
      <FileBrowserEmptyState
        {loading}
        {isSearching}
        {searchQuery}
        hasSearchResults={searchResults.length > 0}
        itemsCount={items.length}
        currentPath={currentPath}
        onSelectFolder={selectFolder}
      />
    {:else if searchQuery && searchResults.length > 0}
      <FileBrowserList
        listLabel="搜索结果列表"
        items={searchResults}
        isSearchResults={true}
        isCheckMode={isCheckMode}
        isDeleteMode={isDeleteMode}
        isArchiveView={isArchiveView}
        selectedIndex={selectedIndex}
        {selectedItems}
        {thumbnails}
        containerRef={fileListContainer}
        onKeydown={handleKeydown}
        onRowClick={(item) => openSearchResult(item)}
        onRowKeyboardActivate={(item) => openSearchResult(item)}
        onToggleSelection={toggleItemSelection}
        onInlineDelete={(item) => deleteItem(item.path)}
      >
        <div slot="header" class="mb-3 text-sm text-gray-600 px-2">
          找到 {searchResults.length} 个结果 (搜索: "{searchQuery}")
        </div>
      </FileBrowserList>
    {:else}
      <FileBrowserList
        listLabel="文件列表"
        items={items}
        isSearchResults={false}
        isCheckMode={isCheckMode}
        isDeleteMode={isDeleteMode}
        isArchiveView={isArchiveView}
        {selectedIndex}
        {selectedItems}
        {thumbnails}
        containerRef={fileListContainer}
        onKeydown={handleKeydown}
        onRowClick={(item, index) => {
          if (!isCheckMode && !isDeleteMode) {
            fileBrowserStore.setSelectedIndex(index);
            openFile(item);
          }
        }}
        onRowKeyboardActivate={(item, index) => {
          if (!isCheckMode && !isDeleteMode) {
            fileBrowserStore.setSelectedIndex(index);
            openFile(item);
          }
        }}
        onToggleSelection={toggleItemSelection}
        onInlineDelete={(item) => deleteItem(item.path)}
      />
    {/if}
  {/if}
</div>
