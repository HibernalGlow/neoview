<script lang="ts">
  import { Folder, File, Image, Trash2, RefreshCw, FileArchive, FolderOpen, Home, ChevronLeft, ChevronRight, ChevronUp, CheckSquare, Grid3x3, List, MoreVertical, Search, ChevronDown, Settings, AlertCircle, Bookmark, Star } from '@lucide/svelte';
  import VirtualizedFileList from './file/components/VirtualizedFileList.svelte';
  import SortPanel from '$lib/components/ui/sort/SortPanel.svelte';
  import BookmarkSortPanel from '$lib/components/ui/sort/BookmarkSortPanel.svelte';
  import { onMount } from 'svelte';
  import { FileSystemAPI } from '$lib/api';
  import type { FsItem } from '$lib/types';
  import { bookStore } from '$lib/stores/book.svelte';
  import * as BookAPI from '$lib/api/book';
  import PathBar from '../ui/PathBar.svelte';
  import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
  import { NavigationHistory } from '$lib/utils/navigationHistory';
  import { Button } from '$lib/components/ui/button';
  import * as Input from '$lib/components/ui/input';
  import * as ContextMenu from '$lib/components/ui/context-menu';
  import { bookmarkStore } from '$lib/stores/bookmark.svelte';
  import { homeDir } from '@tauri-apps/api/path';
  import { configureThumbnailManager, itemIsDirectory, itemIsImage, toRelativeKey, enqueueDirectoryThumbnails, cancelBySource, enqueueVisible } from '$lib/utils/thumbnailManager';
  import { cancelFolderTasks } from '$lib/api';
import { runPerformanceOptimizationTests } from '$lib/utils/performanceTests';
import ThumbnailsPanel from './ThumbnailsPanel.svelte';
import { getPerformanceSettings } from '$lib/api/performance';


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
  let copyToSubmenu = $state<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  let clipboardItem = $state<{ path: string; operation: 'copy' | 'cut' } | null>(null);

  // 导航历史管理器
  let navigationHistory = new NavigationHistory();
  
  // UI 模式状态
  let isCheckMode = $state(false);
  let isDeleteMode = $state(false);
  let viewMode = $state<'list' | 'thumbnails'>('list'); // 列表 or 缩略图视图
  let selectedItems = $state<Set<string>>(new Set());

  // 缩略图入队管理
  let lastEnqueueTimeout: ReturnType<typeof setTimeout> | null = null;  // 用于取消上一个入队任务
  let currentEpoch = 0;  // 用于设置检查

  

  // 搜索功能状态
  let searchQuery = $state('');
  let searchHistory = $state<{ query: string; timestamp: number }[]>([]);
  let showSearchHistory = $state(false);
  let showSearchSettings = $state(false);
  let searchSettings = $state({
    includeSubfolders: true,
    showHistoryOnFocus: true
  });
  let searchResults = $state<FsItem[]>([]);
  let isSearching = $state(false);

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
          }
        } catch (e) {
          console.warn('⚠️ 无法获取系统 Home 目录:', e);
        }
      }

      if (homepage) {
        console.log('📍 加载主页路径:', homepage);
        navigationHistory.setHomepage(homepage);
        // 注意：不在此处 await 阻塞 UI，如果需要可以等待
        await loadDirectory(homepage);
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
   * 执行搜索（使用 ripgrep）
   */
  async function performSearch(query: string) {
    if (!query.trim()) {
      searchResults = [];
      return;
    }

    isSearching = true;
    try {
      const options = {
        includeSubfolders: searchSettings.includeSubfolders,
        maxResults: 100,
      };
      
      searchResults = await FileSystemAPI.searchFiles(currentPath, query, options);
      console.log(`✅ 搜索完成，找到 ${searchResults.length} 个结果`);
      console.log('搜索结果详情:', searchResults);
      
      // 显示每个结果的详细信息
      searchResults.forEach((item, index) => {
        console.log(`[${index + 1}] ${item.is_dir ? '📁' : '📄'} ${item.name}`);
        console.log(`    路径: ${item.path}`);
        console.log(`    大小: ${formatFileSize(item.size, item.is_dir)}`);
        console.log(`    修改时间: ${item.modified ? new Date(item.modified * 1000).toLocaleString() : '未知'}`);
        console.log(`    是否图片: ${item.is_image ? '是' : '否'}`);
      });

      // 搜索完成后自动应用默认排序（路径升序）
      if (searchResults.length > 0) {
        const sorted = [...searchResults].sort((a, b) => {
          // 文件夹始终在前面
          if (a.is_dir !== b.is_dir) {
            return a.is_dir ? -1 : 1;
          }
          // 按路径升序排序
          return a.path.localeCompare(b.path, undefined, { numeric: true });
        });
        searchResults = sorted;
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

    // 加载搜索历史
    loadSearchHistory();

    // 注册缩略图生成回调 - 从设置读取配置
    const applyThumbnailSettings = async () => {
      try {
        const settings = await getPerformanceSettings();
        const maxLocal = settings.thumbnail_concurrent_local || 6;
        const maxArchive = settings.thumbnail_concurrent_archive || 3;
        console.log(`📊 应用缩略图设置: 本地=${maxLocal}, 压缩包=${maxArchive}`);
        configureThumbnailManager({
          addThumbnail: (path: string, url: string) => fileBrowserStore.addThumbnail(path, url),
          maxConcurrentLocal: maxLocal,
          maxConcurrentArchive: maxArchive
        });
      } catch (e) {
        console.debug('读取缩略图设置失败，使用默认值:', e);
        configureThumbnailManager({
          addThumbnail: (path: string, url: string) => fileBrowserStore.addThumbnail(path, url),
          maxConcurrentLocal: 6,
          maxConcurrentArchive: 3
        });
      }
    };
    
    // 初始化
    applyThumbnailSettings();
    
    // 每 5 秒检查一次设置是否变化
    let settingsCheckInterval: ReturnType<typeof setInterval> | null = null;
    
    settingsCheckInterval = setInterval(() => {
      currentEpoch++;
      applyThumbnailSettings();
    }, 5000);

    // 开发模式下运行性能测试
    if (import.meta.env.DEV) {
      console.log('🚀 性能优化已启用，可在控制台运行 runPerformanceTests() 进行测试');
      // 延迟运行测试，避免影响初始加载
      setTimeout(() => {
        // runPerformanceOptimizationTests();
      }, 2000);
    }
    
    return () => {
      document.removeEventListener('click', handleClick);
      clearInterval(settingsCheckInterval);
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
    
    // 取消之前的任务
    cancelBySource(currentPath);
    
    fileBrowserStore.setLoading(true);
    fileBrowserStore.setError('');
    fileBrowserStore.clearThumbnails();
    fileBrowserStore.setArchiveView(false);
    fileBrowserStore.setSelectedIndex(-1);
    fileBrowserStore.setCurrentPath(path);
    
    // 清空选择
    selectedItems.clear();

    try {
      // 首先检查缓存
      const cachedData = navigationHistory.getCachedDirectory(path);
      
      let loadedItems: FsItem[] = [];
      let cachedThumbnails = new Map<string, string>();
      
      if (cachedData) {
        // 使用缓存数据
        console.log('📋 使用缓存数据:', path);
        loadedItems = cachedData.items;
        cachedThumbnails = cachedData.thumbnails;
        
        // 设置缓存数据
        fileBrowserStore.setItems(loadedItems);
        thumbnails = new Map(cachedThumbnails);
        
        // 后台验证缓存是否仍然有效
        navigationHistory.validateCache(path).then(async (isValid) => {
          if (!isValid) {
            console.log('🔄 缓存失效，重新加载:', path);
            await reloadDirectoryFromBackend(path);
          } else {
            // 缓存有效，预加载缩略图
            await loadThumbnailsForItems(loadedItems, path, cachedThumbnails);
          }
        });
      } else {
        // 没有缓存，从后端加载
        console.log('🔄 从后端加载:', path);
        await reloadDirectoryFromBackend(path);
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
   * 从后端重新加载目录数据
   */
  async function reloadDirectoryFromBackend(path: string) {
    console.log('🔄 Calling FileSystemAPI.browseDirectory...');
    const loadedItems = await FileSystemAPI.browseDirectory(path);
    console.log('✅ Loaded', loadedItems.length, 'items:', loadedItems.map(i => i.name));
    
    // 获取目录修改时间用于缓存验证
    let mtime: number | undefined;
    try {
      const fileInfo = await FileSystemAPI.getFileMetadata(path);
      mtime = fileInfo.modified ? new Date(fileInfo.modified).getTime() : undefined;
    } catch (e) {
      console.debug('Failed to get directory mtime:', e);
    }
    
    // 设置数据
    fileBrowserStore.setItems(loadedItems);
    
    // 加载缩略图
    await loadThumbnailsForItems(loadedItems, path);
    
    // 缓存目录数据
    navigationHistory.cacheDirectory(path, loadedItems, thumbnails, mtime);
    
    // 🚀 使用前端调度器入队首屏文件为最高优先级
    // 取消之前的入队任务
    if (lastEnqueueTimeout) {
      clearTimeout(lastEnqueueTimeout);
    }
    
    lastEnqueueTimeout = () => {
      // 过滤出需要缩略图的项目
      const itemsNeedingThumbnails = items.filter(item => {
        const name = item.name.toLowerCase();
        const isDir = item.is_dir;
        
        // 支持的图片扩展名
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
        // 支持的压缩包扩展名
        const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
        
        const ext = name.substring(name.lastIndexOf('.'));
        
        // 文件夹或支持的文件类型
        return isDir || imageExts.includes(ext) || archiveExts.includes(ext);
      });
      
      // 使用前端调度器入队
      enqueueDirectoryThumbnails(path, itemsNeedingThumbnails);
      console.log(`⚡ 已将 ${itemsNeedingThumbnails.length} 个项目入队（前端调度）`);
    };
    
    // 延迟执行，避免阻塞目录加载
    setTimeout(lastEnqueueTimeout, 100);
    
    // 预加载相邻目录
    navigationHistory.prefetchAdjacentPaths(path);
  }

  /**
   * 为项目加载缩略图 - 优化版本，当前文件夹优先加载
   */
  async function loadThumbnailsForItems(
    items: FsItem[], 
    path: string, 
    existingThumbnails: Map<string, string> = new Map()
  ) {
    console.log('🖼️ 缩略图扫描：项目总数', items.length);

    const cachedKeys = new Set<string>();
    for (const key of existingThumbnails.keys()) cachedKeys.add(key);
    for (const key of thumbnails?.keys?.() ?? []) cachedKeys.add(key);

    const thumbnailItems: FsItem[] = [];
    const archiveItems: FsItem[] = [];

    for (const item of items) {
      let key: string | null = null;
      try {
        key = toRelativeKey(item.path);
      } catch (e) {
        key = null;
      }

      const alreadyCached = key ? cachedKeys.has(key) : false;
      if (alreadyCached) continue;

      if (itemIsDirectory(item) || itemIsImage(item)) {
        thumbnailItems.push(item);
        if (key) cachedKeys.add(key);
      } else {
        // 异步检查压缩包，但先收集起来
        (async () => {
          try {
            if (await FileSystemAPI.isSupportedArchive(item.path)) {
              archiveItems.push(item);
            }
          } catch (e) {
            console.debug('Archive check failed for', item.path, e);
          }
        })();
      }
    }

    // 🔥 关键优化：当前文件夹的所有项目使用 immediate 优先级
    if (thumbnailItems.length > 0) {
      console.log('🚀 [优先级提升] 当前文件夹项目立即加载:', thumbnailItems.length);
      // 所有项目都用 immediate 优先级，确保当前文件夹快速显示
      const { immediate, high, normal } = {
        immediate: thumbnailItems,
        high: [],
        normal: []
      };
      
      enqueueVisible(path, immediate, { priority: 'immediate' });
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
        if (itemIsImage(item)) {
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
  

  /**
   * 加载文件夹缩略图
   */
  

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
   * 显示书签右键菜单
   */
  function showBookmarkContextMenu(e: MouseEvent, bookmark: any) {
    e.preventDefault();
    e.stopPropagation();
    
    // 获取视口尺寸
    const viewportWidth = window.innerWidth;
    
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
   * 返回上一级（优化响应性）
   */
  async function goBack() {
    // 立即设置加载状态，提供即时反馈
    fileBrowserStore.setLoading(true);
    
    // 使用 requestIdleCallback 确保UI更新优先
    requestIdleCallback(async () => {
      try {
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
      } catch (error) {
        console.error('❌ 返回上一级失败:', error);
        fileBrowserStore.setError(String(error));
      } finally {
        fileBrowserStore.setLoading(false);
      }
    });
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
    
    // 取消当前目录的所有缩略图任务
    if (currentPath && currentPath !== path) {
      try {
        const cancelled = await cancelFolderTasks(currentPath);
        if (cancelled > 0) {
          console.log(`🚫 已取消旧目录 ${currentPath} 的 ${cancelled} 个缩略图任务`);
        }
        
        // 清空前端队列
        cancelBySource(currentPath);
      } catch (e) {
        console.debug('取消任务失败:', e);
      }
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
   * 处理排序
   */
  function handleSort(sortedItems: FsItem[]) {
    if (searchQuery && searchResults.length > 0) {
      // 如果正在显示搜索结果，则排序搜索结果
      searchResults = sortedItems;
    } else {
      // 否则排序普通文件列表
      fileBrowserStore.setItems(sortedItems);
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
    bookmarkStore.add(item);
    loadBookmarks(); // 立即刷新书签列表
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
        const parsed = JSON.parse(saved);
        // 兼容旧版本数据结构
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
          // 旧版本：字符串数组，转换为新格式
          searchHistory = (parsed as string[]).map(query => ({ query, timestamp: Date.now() - 86400000 })); // 默认昨天
        } else {
          // 新版本：对象数组
          searchHistory = parsed;
        }
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
    searchHistory = searchHistory.filter(item => item.query !== query);
    // 添加到开头
    searchHistory.unshift({ query, timestamp: Date.now() });
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
  function selectSearchHistory(item: { query: string; timestamp: number }) {
    searchQuery = item.query;
    showSearchHistory = false;
    searchFiles(item.query);
  }

  /**
   * 打开搜索结果
   */
  async function openSearchResult(item: FsItem) {
    await openFile(item);
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

      <div class="w-px h-6 bg-border mx-1"></div>

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

      <!-- 排序面板 -->
      <SortPanel 
        items={searchQuery && searchResults.length > 0 ? searchResults : items} 
        onSort={handleSort}
      />

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
        <Input.Root
          placeholder="搜索当前目录下的文件..."
          bind:value={searchQuery}
          oninput={handleSearchInput}
          onfocus={handleSearchFocus}
          class="pl-10 pr-24"
          disabled={!currentPath || isArchiveView}
        />
        
        <!-- 清空按钮 -->
        {#if searchQuery}
          <button
            class="absolute right-16 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
            onclick={() => {
              searchQuery = '';
              searchResults = [];
            }}
            title="清空搜索"
          >
            <svg class="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
        
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
          {#each searchHistory as item (item.query)}
            <div
              class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between group cursor-pointer"
              onclick={() => selectSearchHistory(item)}
            >
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <Search class="h-4 w-4 text-gray-400 flex-shrink-0" />
                <span class="truncate">{item.query}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">{formatSearchHistoryTime(item.timestamp)}</span>
                <button
                  class="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded flex-shrink-0"
                  onclick={(e) => {
                    e.stopPropagation();
                    searchHistory = searchHistory.filter(historyItem => historyItem.query !== item.query);
                    saveSearchHistory();
                  }}
                  title="删除"
                >
                  <svg class="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
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
        <div class="search-settings absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] p-2">
          <div class="space-y-3">
            <div class="pb-2">
              <h4 class="text-xs font-semibold text-gray-700 mb-2">搜索选项</h4>
              
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  bind:checked={searchSettings.includeSubfolders}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>搜索子文件夹</span>
              </label>
              
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  bind:checked={searchSettings.showHistoryOnFocus}
                  class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>聚焦时显示历史</span>
              </label>
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
          <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
              <div
                class="group flex items-center gap-3 rounded border p-2 cursor-pointer transition-colors hover:bg-gray-50 border-gray-200"
                onclick={() => openSearchResult(item)}
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

            <!-- 图标或缩略图 -->
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded">
              {#if thumbnails.has(toRelativeKey(item.path))}
                <!-- 显示缩略图 -->
                <img 
                  src={thumbnails.get(toRelativeKey(item.path))} 
                  alt={item.name}
                  class="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              {:else if item.isDir}
                <Folder class="h-8 w-8 text-blue-500 transition-colors group-hover:text-blue-600" />
              {:else if item.name.endsWith('.zip') || item.name.endsWith('.cbz')}
                <FileArchive class="h-8 w-8 text-purple-500 transition-colors group-hover:text-purple-600" />
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
              </ContextMenu.Trigger>
              <ContextMenu.Content>
                <ContextMenu.Item onclick={() => addToBookmark(item)}>
                  <Bookmark class="h-4 w-4 mr-2" />
                  添加到书签
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item onclick={() => openInExplorer(item)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  在资源管理器中打开
                </ContextMenu.Item>
                <ContextMenu.Item onclick={() => openWithExternalApp(item)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  在外部应用中打开
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item onclick={() => cutItem(item)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                  </svg>
                  剪切
                </ContextMenu.Item>
                <ContextMenu.Item onclick={() => copyItem(item)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制
                </ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item onclick={() => deleteItemFromMenu(item)} class="text-red-600 focus:text-red-600">
                  <Trash2 class="h-4 w-4 mr-2" />
                  删除
                </ContextMenu.Item>
                <ContextMenu.Item onclick={moveToFolder}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  移动到文件夹(E)
                </ContextMenu.Item>
                <ContextMenu.Item onclick={() => renameItem(item)}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  重命名(M)
                </ContextMenu.Item>
                {#if item.name.endsWith('.zip') || item.name.endsWith('.cbz') || item.name.endsWith('.rar') || item.name.endsWith('.cbr')}
                  <ContextMenu.Separator />
                  <ContextMenu.Item onclick={() => openArchiveAsBook(item)}>
                    <FolderOpen class="h-4 w-4 mr-2" />
                    作为书籍打开
                  </ContextMenu.Item>
                  <ContextMenu.Item onclick={() => browseArchive(item)}>
                    <Folder class="h-4 w-4 mr-2" />
                    浏览内容
                  </ContextMenu.Item>
                {/if}
                <ContextMenu.Separator />
                <ContextMenu.Item onclick={() => {
                  navigator.clipboard.writeText(item.path);
                }}>
                  <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  复制路径
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Root>
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
    <VirtualizedFileList 
      {items}
      {currentPath}
      {thumbnails}
      {selectedIndex}
      {isCheckMode}
      {isDeleteMode}
      {selectedItems}
      {viewMode}
      on:itemClick={(e) => {
        const { item, index } = e.detail;
        if (!isCheckMode && !isDeleteMode) {
          fileBrowserStore.setSelectedIndex(index);
          openFile(item);
        }
      }}
      on:itemDoubleClick={(e) => {
        const { item, index } = e.detail;
        // 双击直接打开，无需检查模式
        fileBrowserStore.setSelectedIndex(index);
        openFile(item);
      }}
      on:itemSelect={(e) => {
        const { item, index, multiSelect } = e.detail;
        if (isCheckMode) {
          toggleItemSelection(item.path);
        } else {
          fileBrowserStore.setSelectedIndex(index);
        }
      }}
      on:itemContextMenu={(e) => {
        const { event, item } = e.detail;
        showContextMenu(event, item);
      }}
      on:deleteItem={(e) => {
        deleteItem(e.detail.item.path);
      }}
      on:selectionChange={(e) => {
        selectedItems = new Set(e.detail.selectedItems);
      }}
      on:selectedIndexChange={(e) => {
        fileBrowserStore.setSelectedIndex(e.detail.index);
      }}
    />
  {/if}
</div>
