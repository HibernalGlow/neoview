// useFileBrowser.ts - 文件浏览器业务逻辑
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { NavigationHistory } from '$lib/utils/navigationHistory';
import { fileBrowserService } from '../services/fileBrowserService';
import type { FsItem } from '$lib/types';

export function useFileBrowser() {
  const navigation = new NavigationHistory();
  const store = fileBrowserStore;
  
  // 响应式状态
  const state = $derived(store.state);
  
  // 加载目录
  async function loadDirectory(path: string, options = { pushHistory: true }) {
    store.setLoading(true);
    store.clearThumbnails();
    
    if (options.pushHistory) {
      navigation.push(path);
    }
    
    try {
      const items = await fileBrowserService.browse(path);
      store.setItems(items);
      store.setCurrentPath(path);
      return items;
    } catch (error) {
      console.error('加载目录失败:', error);
      store.setError(error.message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }
  
  // 选择文件夹
  async function selectFolder() {
    const path = await fileBrowserService.pickFolder();
    if (path) {
      await loadDirectory(path);
    }
    return path;
  }
  
  // 搜索文件
  async function performSearch(query: string) {
    if (!query.trim()) {
      store.clearSearch();
      return;
    }
    
    store.setSearching(true);
    try {
      const results = await fileBrowserService.search(
        state.currentPath, 
        query, 
        state.searchSettings
      );
      store.setSearchResults(results);
    } catch (error) {
      console.error('搜索失败:', error);
      store.setError(error.message);
    } finally {
      store.setSearching(false);
    }
  }
  
  // 切换视图模式
  function toggleViewMode() {
    const newMode = state.viewMode === 'list' ? 'thumbnails' : 'list';
    store.setViewMode(newMode);
  }
  
  // 切换选择模式
  function toggleCheckMode() {
    store.toggleCheckMode();
  }
  
  // 切换删除模式
  function toggleDeleteMode() {
    store.toggleDeleteMode();
  }
  
  // 切换项目选择
  function toggleItemSelection(path: string) {
    store.toggleSelection(path);
  }
  
  // 选择所有
  function selectAll() {
    store.selectAll();
  }
  
  // 取消选择所有
  function deselectAll() {
    store.deselectAll();
  }
  
  // 打开文件夹
  function openFolder(item: FsItem) {
    if (item.is_dir) {
      loadDirectory(item.path);
    }
  }
  
  // 打开文件
  function openFile(item: FsItem) {
    fileBrowserService.openFile(item);
  }
  
  // 导航操作
  function goBack() {
    const prev = navigation.back();
    if (prev) {
      loadDirectory(prev, { pushHistory: false });
    }
  }
  
  function goForward() {
    const next = navigation.forward();
    if (next) {
      loadDirectory(next, { pushHistory: false });
    }
  }
  
  function goHome() {
    const home = navigation.getHomepage();
    if (home) {
      loadDirectory(home);
    }
  }
  
  // 刷新当前目录
  async function refresh() {
    await loadDirectory(state.currentPath, { pushHistory: false });
  }
  
  // 书签操作
  function openBookmark(bookmark: { path: string; name: string }) {
    loadDirectory(bookmark.path);
  }
  
  // 历史记录操作
  function openHistoryItem(entry: { path: string; timestamp: number }) {
    loadDirectory(entry.path);
  }
  
  // 右键菜单
  function showContextMenu(event: MouseEvent, item: FsItem) {
    store.showContextMenu(event, item);
  }
  
  function handleContextAction(action: { type: string; data?: any }) {
    switch (action.type) {
      case 'open':
        if (state.contextMenuItem?.is_dir) {
          openFolder(state.contextMenuItem);
        } else {
          openFile(state.contextMenuItem);
        }
        break;
      case 'openExternal':
        fileBrowserService.openWithSystem(state.contextMenuItem.path);
        break;
      case 'rename':
        store.startRename(state.contextMenuItem);
        break;
      case 'delete':
        store.startDelete(state.contextMenuItem);
        break;
      // 更多操作...
    }
    store.hideContextMenu();
  }
  
  return {
    // Store
    store,
    
    // 状态访问器
    get currentPath() { return state.currentPath; },
    get visibleItems() { return state.searchMode ? state.searchResults : state.items; },
    get latestItems() { return state.items; },
    get thumbnails() { return state.thumbnails; },
    get loading() { return state.loading; },
    get searching() { return state.searching; },
    get viewMode() { return state.viewMode; },
    get selectedItems() { return state.selectedItems; },
    get isCheckMode() { return state.isCheckMode; },
    get isDeleteMode() { return state.isDeleteMode; },
    get bookmarks() { return state.bookmarks; },
    get history() { return navigation.getHistory(); },
    get searchState() { 
      return { 
        query: state.searchQuery, 
        active: state.searchMode 
      }; 
    },
    get contextMenuState() {
      return {
        visible: state.contextMenuVisible,
        position: state.contextMenuPosition,
        item: state.contextMenuItem
      };
    },
    
    // 方法
    selectFolder,
    loadDirectory,
    loadDirectoryWithoutHistory: (path: string) => loadDirectory(path, { pushHistory: false }),
    performSearch,
    toggleViewMode,
    toggleCheckMode,
    toggleDeleteMode,
    toggleItemSelection,
    selectAll,
    deselectAll,
    openFolder,
    openFile,
    goBack,
    goForward,
    goHome,
    refresh,
    openBookmark,
    openHistoryItem,
    showContextMenu,
    handleContextAction
  };
}