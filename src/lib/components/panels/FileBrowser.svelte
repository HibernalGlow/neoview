<script lang="ts">
  import { Folder, File, Image, Trash2, RefreshCw, FileArchive, FolderOpen, Home, ChevronLeft, ChevronRight, ChevronUp, CheckSquare, Grid3x3, List, MoreVertical, Search, ChevronDown, Settings, Database, Trash, AlertCircle } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import { FileSystemAPI, IndexAPI } from '$lib/api';
  import type { FsItem } from '$lib/types';
  import { bookStore } from '$lib/stores/book.svelte';
  import * as BookAPI from '$lib/api/book';
  import PathBar from '../ui/PathBar.svelte';
  import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
  import { NavigationHistory } from '$lib/utils/navigationHistory';
  import { Button } from '$lib/components/ui/button';
  import { bookmarkStore } from '$lib/stores/bookmark.svelte';
  import type { IndexStats } from '$lib/api/file_index';

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
  let contextMenu = $state<{ x: number; y: number; item: FsItem | null; direction: 'up' | 'down' }>({ x: 0, y: 0, item: null, direction: 'down' });
  let copyToSubmenu = $state<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  let clipboardItem = $state<{ path: string; operation: 'copy' | 'cut' } | null>(null);

  // 导航历史管理器
  let navigationHistory = new NavigationHistory();
  
  // UI 模式状态
  let isCheckMode = $state(false);
  let isDeleteMode = $state(false);
  let viewMode = $state<'list' | 'thumbnails'>('list'); // 列表 or 缩略图视图
  let selectedItems = $state<Set<string>>(new Set());

  // 搜索功能状态
  let searchQuery = $state('');
  let searchHistory = $state<string[]>([]);
  let showSearchHistory = $state(false);
  let showSearchSettings = $state(false);
  let searchSettings = $state({
    includeSubfolders: false,
    showHistoryOnFocus: true
  });
  let searchResults = $state<FsItem[]>([]);
  let isSearching = $state(false);

  // 索引功能状态
  let indexStats = $state<IndexStats | null>(null);
  let showIndexSettings = $state(false);
  let isBuildingIndex = $state(false);
  let indexEnabled = $state(true);
  let indexProgress = $state<IndexProgress | null>(null);
  
  // 索引搜索选项
  let indexSearchOptions = $state({
    includeSubfolders: true,
    imagesOnly: false,
    foldersOnly: false,
    minSize: undefined as number | undefined,
    maxSize: undefined as number | undefined,
    modifiedAfter: undefined as number | undefined,
    modifiedBefore: undefined as number | undefined,
  });
  
  // 是否使用索引搜索
  let useIndexSearch = $state(true);

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

  // 初始化索引
  onMount(async () => {
    try {
      await IndexAPI.initializeFileIndex();
      await updateIndexStats();
    } catch (err) {
      console.error('初始化索引失败:', err);
    }
  });

  /**
   * 更新索引统计信息
   */
  async function updateIndexStats() {
    try {
      indexStats = await IndexAPI.getIndexStats();
    } catch (err) {
      console.error('获取索引统计失败:', err);
      indexStats = null;
    }
  }

  /**
   * 构建索引
   */
  async function buildIndex(recursive: boolean = true) {
    if (!currentPath) return;
    
    isBuildingIndex = true;
    let progressInterval: number;
    
    try {
      // 开始监控进度
      progressInterval = setInterval(async () => {
        try {
          indexProgress = await IndexAPI.getIndexProgress();
        } catch (err) {
          console.error('获取索引进度失败:', err);
        }
      }, 500);
      
      await IndexAPI.buildFileIndex(currentPath, recursive);
      await updateIndexStats();
      console.log('✅ 索引构建完成');
    } catch (err) {
      console.error('❌ 构建索引失败:', err);
      fileBrowserStore.setError(String(err));
    } finally {
      isBuildingIndex = false;
      clearInterval(progressInterval);
      // 最后更新一次进度
      try {
        indexProgress = await IndexAPI.getIndexProgress();
      } catch (err) {
        console.error('获取最终进度失败:', err);
      }
    }
  }

  /**
   * 清除索引
   */
  async function clearIndex() {
    try {
      await IndexAPI.clearFileIndex();
      await updateIndexStats();
      console.log('✅ 索引已清除');
    } catch (err) {
      console.error('❌ 清除索引失败:', err);
      fileBrowserStore.setError(String(err));
    }
  }
  
  /**
   * 使用索引执行搜索
   */
  async function performIndexSearch(query: string) {
    if (!query.trim()) {
      searchResults = [];
      return;
    }
    
    isSearching = true;
    try {
      const options = {
        includeSubfolders: indexSearchOptions.includeSubfolders,
        imagesOnly: indexSearchOptions.imagesOnly,
        foldersOnly: indexSearchOptions.foldersOnly,
        minSize: indexSearchOptions.minSize,
        maxSize: indexSearchOptions.maxSize,
        modifiedAfter: indexSearchOptions.modifiedAfter,
        modifiedBefore: indexSearchOptions.modifiedBefore,
      };
      
      searchResults = await IndexAPI.searchInIndex(query, 100, options);
      console.log(`✅ 索引搜索完成，找到 ${searchResults.length} 个结果`);
    } catch (err) {
      console.error('❌ 索引搜索失败:', err);
      fileBrowserStore.setError(String(err));
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }
  
  /**
   * 打开搜索结果中的项目
   */
  async function openSearchResult(item: FsItem) {
    if (item.is_dir) {
      // 如果是文件夹，导航到该文件夹
      await loadDirectory(item.path);
      // 清空搜索
      searchQuery = '';
      searchResults = [];
    } else if (item.is_image) {
      // 如果是图片，打开查看
      await openImage(item.path);
    } else {
      // 其他文件类型，尝试用系统默认程序打开
      try {
        await FileSystemAPI.openWithSystem(item.path);
      } catch (err) {
        console.error('无法打开文件:', err);
        fileBrowserStore.setError(String(err));
      }
    }
  }
  
  /**
   * 执行搜索（根据设置选择使用索引或文件系统搜索）
   */
  async function performSearch(query: string) {
    if (useIndexSearch && indexStats && (indexStats.totalFiles > 0 || indexStats.totalDirs > 0)) {
      await performIndexSearch(query);
    } else {
      // 回退到文件系统搜索
      await performFileSystemSearch(query);
    }
  }
  
  /**
   * 文件系统搜索（原有方法）
   */
  async function performFileSystemSearch(query: string) {
    if (!query.trim()) {
      searchResults = [];
      return;
    }

    isSearching = true;
    try {
      // 获取所有已索引的路径进行搜索
      const indexedPaths = await IndexAPI.getIndexedPaths(undefined, true);
      let allResults: FsItem[] = [];
      
      // 搜索所有已索引的路径
      for (const path of indexedPaths) {
        try {
          const options = {
            includeSubfolders: searchSettings.includeSubfolders,
            maxResults: 100,
          };
          
          const results = await FileSystemAPI.searchFiles(path, query, options);
          allResults = allResults.concat(results);
        } catch (err) {
          console.error(`搜索路径 ${path} 失败:`, err);
        }
      }
      
      // 如果没有索引路径，使用当前路径
      if (indexedPaths.length === 0 && currentPath) {
        const options = {
          includeSubfolders: searchSettings.includeSubfolders,
          maxResults: 100,
        };
        
        allResults = await FileSystemAPI.searchFiles(currentPath, query, options);
      }
      
      // 去重并排序
      const uniqueResults = new Map<string, FsItem>();
      allResults.forEach(item => {
        if (!uniqueResults.has(item.path)) {
          uniqueResults.set(item.path, item);
        }
      });
      
      searchResults = Array.from(uniqueResults.values());
      
      // 排序：目录优先，然后按名称
      searchResults.sort((a, b) => {
        if (a.is_dir !== b.is_dir) {
          return a.is_dir ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      console.log(`✅ 文件系统搜索完成，找到 ${searchResults.length} 个结果`);
    } catch (err) {
      console.error('❌ 文件系统搜索失败:', err);
      fileBrowserStore.setError(String(err));
      searchResults = [];
    } finally {
      isSearching = false;
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
      if (!target.closest('.search-history') && !target.closest('.search-settings')) {
        showSearchHistory = false;
        showSearchSettings = false;
      }
    };
    
    document.addEventListener('click', handleClick);
    
    // 加载主页
    loadHomepage();
    
    // 加载搜索历史
    loadSearchHistory();
    
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
   * 加载压缩包内图片的缩略图 - 完全使用单张图片逻辑
   */
  async function loadArchiveThumbnail(filePath: string) {
    try {
      // 从压缩包中提取图片数据
      const imageData = await FileSystemAPI.loadImageFromArchive(currentArchivePath, filePath);
      // 使用新的API从图片数据生成缩略图
      const thumbnail = await FileSystemAPI.generateThumbnailFromData(imageData);
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
    
    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const viewportMiddle = viewportHeight / 2;
    
    let menuX = e.clientX;
    let menuY = e.clientY;
    let menuDirection = 'down'; // 默认向下展开
    
    // 确保菜单不超出视口右侧
    const menuWidth = 180; // 预估菜单宽度
    if (e.clientX + menuWidth > viewportWidth) {
      menuX = viewportWidth - menuWidth - 10; // 留10px边距
    }
    
    // 确保菜单不超出视口左侧
    if (menuX < 10) {
      menuX = 10;
    }
    
    // 如果点击位置在视口中线以下，则向上翻转菜单
    if (e.clientY > viewportMiddle) {
      menuDirection = 'up';
      // 向上翻转时，需要调整Y坐标，让菜单底部对齐点击位置
      // 使用70vh的最大高度来计算位置
      const maxMenuHeight = viewportHeight * 0.7;
      menuY = e.clientY - Math.min(250, maxMenuHeight); // 预估菜单高度或最大高度
    }
    
    // 确保菜单不超出视口顶部或底部
    const maxMenuHeight = viewportHeight * 0.7;
    if (menuDirection === 'down' && menuY + maxMenuHeight > viewportHeight) {
      menuY = viewportHeight - maxMenuHeight - 10;
    }
    if (menuDirection === 'up' && menuY < 10) {
      menuY = 10;
    }
    
    contextMenu = { 
      x: menuX, 
      y: menuY, 
      item,
      direction: menuDirection
    };
  }

  /**
   * 隐藏右键菜单
   */
  function hideContextMenu() {
    contextMenu = { x: 0, y: 0, item: null, direction: 'down' };
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
   * 清理缩略图缓存
   */
  async function clearThumbnailCache() {
    if (!confirm('确定要清理所有缩略图缓存吗？这将重新生成所有缩略图。')) return;

    try {
      const count = await FileSystemAPI.clearThumbnailCache();
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
    
    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let submenuX = contextMenu.x + 150; // 子菜单在主菜单右侧
    let submenuY = contextMenu.y;
    
    // 确保子菜单不超出视口右侧
    const submenuWidth = 150;
    if (submenuX + submenuWidth > viewportWidth) {
      // 如果右侧放不下，放在左侧
      submenuX = contextMenu.x - submenuWidth - 10;
    }
    
    // 确保子菜单不超出视口左侧
    if (submenuX < 10) {
      submenuX = 10;
    }
    
    // 如果主菜单是向上展开的，子菜单也需要相应调整位置
    if (contextMenu.direction === 'up') {
      submenuY = contextMenu.y + 200; // 调整子菜单位置，使其与主菜单项对齐
    }
    
    // 确保子菜单不超出视口底部
    const maxSubmenuHeight = viewportHeight * 0.5;
    if (submenuY + maxSubmenuHeight > viewportHeight) {
      submenuY = viewportHeight - maxSubmenuHeight - 10;
    }
    
    // 确保子菜单不超出视口顶部
    if (submenuY < 10) {
      submenuY = 10;
    }
    
    copyToSubmenu = { show: true, x: submenuX, y: submenuY };
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

  // ===== 搜索功能 =====

  /**
   * 加载搜索历史
   */
  function loadSearchHistory() {
    try {
      const saved = localStorage.getItem('neoview-search-history');
      if (saved) {
        searchHistory = JSON.parse(saved);
      }
    } catch (err) {
      console.error('加载搜索历史失败:', err);
    }
  }

  /**
   * 保存搜索历史
   */
  function saveSearchHistory() {
    try {
      localStorage.setItem('neoview-search-history', JSON.stringify(searchHistory));
    } catch (err) {
      console.error('保存搜索历史失败:', err);
    }
  }

  /**
   * 添加搜索历史
   */
  function addSearchHistory(query: string) {
    if (!query.trim()) return;
    
    // 移除已存在的相同查询
    searchHistory = searchHistory.filter(item => item !== query);
    // 添加到开头
    searchHistory.unshift(query);
    // 限制历史记录数量
    searchHistory = searchHistory.slice(0, 20);
    
    saveSearchHistory();
  }

  /**
   * 清除搜索历史
   */
  function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory();
    showSearchHistory = false;
  }

  /**
   * 搜索文件
   */
  async function searchFiles(query: string) {
    if (!query.trim()) {
      searchResults = [];
      return;
    }

    addSearchHistory(query);
    await performSearch(query);
  }

  /**
   * 处理搜索输入
   */
  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    searchQuery = target.value;
    
    // 实时搜索
    if (searchQuery.trim()) {
      const timeout = setTimeout(() => {
        searchFiles(searchQuery);
      }, 300);
      
      // 清除之前的超时
      return () => clearTimeout(timeout);
    } else {
      searchResults = [];
    }
  }

  /**
   * 选择搜索历史
   */
  function selectSearchHistory(query: string) {
    searchQuery = query;
    showSearchHistory = false;
    searchFiles(query);
  }
  
  /**
   * 处理搜索框聚焦
   */
  function handleSearchFocus() {
    if (searchSettings.showHistoryOnFocus && searchHistory.length > 0) {
      showSearchHistory = true;
    }
    showSearchSettings = false;
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
        onclick={clearThumbnailCache}
        title="清理缩略图缓存"
      >
        <Trash2 class="h-4 w-4" />
      </Button>
    </div>
  </div>

  <!-- 搜索栏 -->
  <div class="flex items-center gap-2 border-b px-2 py-2 bg-background/30">
    <div class="relative flex-1">
      <!-- 搜索输入框 -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="搜索当前目录下的文件..."
          bind:value={searchQuery}
          oninput={handleSearchInput}
          onfocus={handleSearchFocus}
          class="w-full pl-10 pr-20 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          disabled={!currentPath || isArchiveView}
        />
        
        <!-- 搜索历史按钮 -->
        <button
          class="absolute right-8 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
          onclick={() => {
            showSearchHistory = !showSearchHistory;
            showSearchSettings = false;
          }}
          disabled={searchHistory.length === 0}
          title="搜索历史"
        >
          <ChevronDown class="h-4 w-4 text-gray-500" />
        </button>
        
        <!-- 搜索设置按钮 -->
        <button
          class="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
          onclick={(e) => {
            e.stopPropagation();
            console.log('搜索设置按钮被点击');
            showSearchSettings = !showSearchSettings;
            showSearchHistory = false;
          }}
          title="搜索设置"
        >
          <MoreVertical class="h-4 w-4 text-gray-500" />
        </button>
      </div>
      
      <!-- 搜索历史下拉 -->
      {#if showSearchHistory}
        <div class="search-history absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {#each searchHistory as query (query)}
            <div
              class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between group cursor-pointer"
              onclick={() => selectSearchHistory(query)}
            >
              <div class="flex items-center gap-2">
                <Search class="h-4 w-4 text-gray-400" />
                <span>{query}</span>
              </div>
              <button
                class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded"
                onclick={(e) => {
                  e.stopPropagation();
                  searchHistory = searchHistory.filter(item => item !== query);
                  saveSearchHistory();
                }}
                title="删除"
              >
                <svg class="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
          {#if searchHistory.length > 0}
            <div class="border-t border-gray-200 p-2">
              <button
                class="w-full px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                onclick={clearSearchHistory}
              >
                清除搜索历史
              </button>
            </div>
          {:else}
            <div class="p-3 text-center text-sm text-gray-500">
              暂无搜索历史
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- 搜索设置下拉 -->
      {#if showSearchSettings}
        <div class="search-settings absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[250px] p-2">
          <div class="space-y-3">
            <div class="border-b pb-2">
              <h4 class="text-xs font-semibold text-gray-700 mb-2">搜索选项</h4>
              
              <!-- 索引搜索开关 -->
              <label class="flex items-center gap-2 text-sm mb-2">
                <input
                  type="checkbox"
                  bind:checked={useIndexSearch}
                  disabled={!indexStats || (indexStats.totalFiles === 0 && indexStats.totalDirs === 0)}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                />
                <span class="flex items-center gap-1">
                  <Database class="h-3 w-3" />
                  使用索引搜索
                </span>
              </label>
              
              {#if useIndexSearch && indexStats}
                <div class="ml-6 space-y-1 mb-2">
                  <label class="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      bind:checked={indexSearchOptions.includeSubfolders}
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>包含子文件夹</span>
                  </label>
                  <label class="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      bind:checked={indexSearchOptions.imagesOnly}
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>仅图片</span>
                  </label>
                  <label class="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      bind:checked={indexSearchOptions.foldersOnly}
                      class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>仅文件夹</span>
                  </label>
                </div>
              {:else if !useIndexSearch}
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    bind:checked={searchSettings.includeSubfolders}
                    class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>搜索子文件夹</span>
                </label>
              {/if}
              
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  bind:checked={searchSettings.showHistoryOnFocus}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>聚焦时显示历史</span>
              </label>
            </div>
            
            <div class="border-b pb-2">
              <h4 class="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Database class="h-3 w-3" />
                索引设置
              </h4>
              
              {#if indexStats}
                <div class="text-xs text-gray-600 mb-2 space-y-1">
                  <div>文件: {indexStats.totalFiles}</div>
                  <div>目录: {indexStats.totalDirs}</div>
                  <div>图片: {indexStats.totalImages}</div>
                  <div class="text-xs text-gray-400">
                    更新: {new Date(indexStats.lastUpdated * 1000).toLocaleString()}
                  </div>
                </div>
              {:else}
                <div class="text-xs text-gray-500 mb-2">无索引数据</div>
              {/if}
              
              <div class="space-y-1">
                <button
                  class="w-full px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1"
                  onclick={() => buildIndex(true)}
                  disabled={isBuildingIndex || !currentPath}
                >
                  {#if isBuildingIndex}
                    <RefreshCw class="h-3 w-3 animate-spin" />
                    {#if indexProgress?.isRunning}
                      {indexProgress.processedFiles}/{indexProgress.totalFiles || '?'}
                    {:else}
                      构建中...
                    {/if}
                  {:else}
                    <Database class="h-3 w-3" />
                    构建索引
                  {/if}
                </button>
                
                <button
                  class="w-full px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1"
                  onclick={clearIndex}
                  disabled={!indexStats || indexStats.totalFiles === 0}
                >
                  <Trash class="h-3 w-3" />
                  清除索引
                </button>
              
              <!-- 索引进度详情 -->
              {#if isBuildingIndex && indexProgress}
                <div class="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <div class="font-medium text-gray-700 mb-1">索引进度</div>
                  <div class="space-y-1">
                    <div>已处理: {indexProgress.processedFiles} 个文件</div>
                    {#if indexProgress.totalFiles > 0}
                      <div>总计: 约 {indexProgress.totalFiles} 个文件</div>
                      <div class="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div 
                          class="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style="width: {Math.round((indexProgress.processedFiles / indexProgress.totalFiles) * 100)}%"
                        ></div>
                      </div>
                    {/if}
                    <div class="text-gray-500 truncate">
                      当前: {indexProgress.currentPath}
                    </div>
                  </div>
                </div>
              {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}
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
  {:else if isSearching}
    <div class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <div class="text-sm text-gray-500">搜索中...</div>
      </div>
    </div>
  {:else if searchQuery && searchResults.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <div class="text-center text-gray-400">
        <Search class="mx-auto mb-2 h-16 w-16 opacity-50" />
        <p class="text-sm">未找到匹配的文件</p>
        <p class="text-xs text-gray-500 mt-1">搜索词: "{searchQuery}"</p>
      </div>
    </div>
  {:else if searchQuery && searchResults.length > 0}
    <!-- 搜索结果列表 -->
    <div 
      bind:this={fileListContainer}
      class="flex-1 overflow-y-auto p-2 focus:outline-none" 
      tabindex="0" 
      onkeydown={handleKeydown}
      onclick={() => fileListContainer?.focus()}
    >
      <div class="mb-3 text-sm text-gray-600 px-2">
        找到 {searchResults.length} 个结果 (搜索: "{searchQuery}")
      </div>
      <div class="grid grid-cols-1 gap-2">
        {#each searchResults as item, index (item.path)}
          <div
            class="group flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors hover:bg-gray-50 border-gray-200"
            onclick={() => openSearchResult(item)}
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
                {item.path}
              </div>
              <div class="text-xs text-gray-500">
                {formatSize(item.size, item.isDir)} · {formatDate(item.modified)}
              </div>
            </div>
          </div>
        {/each}
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
      class="context-menu fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px] max-h-[70vh] overflow-y-auto"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px; transform-origin: {contextMenu.direction === 'up' ? 'bottom' : 'top'};"
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
            class="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[60] min-w-[150px] max-h-[50vh] overflow-y-auto"
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
      onclick={(e) => {
        // 确保点击的不是搜索设置按钮或其子元素
        if (!e.target.closest('.search-settings') && 
            !e.target.closest('button[title="搜索设置"]') &&
            !e.target.closest('.search-history')) {
          hideContextMenu();
        }
      }}
    ></div>
  {/if}
</div>
