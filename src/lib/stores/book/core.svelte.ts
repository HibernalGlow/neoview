/**
 * Book Store - 核心模块
 * 整合所有子模块，保持原有 API 兼容性
 */

import type { Page, PageSortMode } from '$lib/types';
import * as bookApi from '$lib/api/book';
import { infoPanelStore } from '../infoPanel.svelte';
import { appState, type ViewerJumpSource } from '$lib/core/state/appState';
import { emmMetadataStore } from '../emmMetadata.svelte';
import { fileBrowserStore } from '../fileBrowser.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { showToast } from '$lib/utils/toast';
import type { EMMMetadata } from '$lib/api/emm';
import { pageNavigationDedup } from '$lib/utils/requestDedup';
import * as dimensionApi from '$lib/api/dimensions';

import { SvelteMap } from 'svelte/reactivity';
import {
  PAGE_WINDOW_PADDING,
  JUMP_HISTORY_LIMIT,
  formatBytesShort,
  formatBookTypeLabel,
  mapEmmToRaw,
  clampInitialPage,
} from './utils';
import type { UpscaleStatus } from './types';
import type {
  BookState,
  OpenBookOptions,
  SwitchToastContext,
  SwitchToastBookContext,
  SwitchToastPageContext,
  ContentRef,
} from './types';
import { isArchivePath } from './streamingLoader.svelte';
import { renderSwitchToastTemplate } from './toast';
import { pageFrameStore } from '../pageFrame.svelte';
import type { PagePosition } from '$lib/core/pageFrame';
import { cleanupBookResources } from '$lib/core/bookCleanup';
import { folderTabActions } from '$lib/components/panels/folderPanel/stores/folderTabStore';
import { folderPanelActions, isBookCandidate, normalizePath as normalizeFolderPath } from '$lib/components/panels/folderPanel/stores/folderPanelStore';

export type { SwitchToastContext };


/** BookStore 核心类 - 第一部分：状态和基础 Getters */
class BookStore {
  private state = $state<BookState>({
    currentBook: null,
    loading: false,
    error: '',
    viewerOpen: false,
    upscaledImageData: null,
    pathStack: [],
    singleFileMode: false,
    originalFilePath: null,
  });

  private lastEmmMetadataForCurrentBook: EMMMetadata | null = null;

  // 超分状态管理：每页超分状态映射 pageIndex -> status
  private upscaleStatusByPage = $state<SvelteMap<number, UpscaleStatus>>(new SvelteMap());

  // Getters
  get currentBook() { return this.state.currentBook; }
  get loading() { return this.state.loading; }
  get error() { return this.state.error; }
  get viewerOpen() { return this.state.viewerOpen; }
  get upscaledImageData() { return this.state.upscaledImageData; }
  get isSingleFileMode() { return this.state.singleFileMode; }
  get originalFilePath() { return this.state.originalFilePath; }
  get pathStack(): ContentRef[] { return this.state.pathStack; }

  get currentPage(): Page | null {
    if (!this.state.currentBook) return null;
    return this.state.currentBook.pages[this.state.currentBook.currentPage] || null;
  }

  get currentPageIndex(): number {
    return this.state.currentBook?.currentPage ?? 0;
  }

  get totalPages(): number {
    return this.state.currentBook?.totalPages ?? 0;
  }

  get hasBook(): boolean {
    return this.state.currentBook !== null;
  }

  get canNextPage(): boolean {
    const book = this.state.currentBook;
    return book !== null && book.currentPage < book.totalPages - 1;
  }

  get canPreviousPage(): boolean {
    const book = this.state.currentBook;
    return book !== null && book.currentPage > 0;
  }

  /** 将 fileBrowserStore 的排序字段映射到 folderPanel 的排序字段 */
  private mapFileBrowserSortField(field: string): 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path' | 'collectTagCount' {
    const mapping: Record<string, 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path'> = {
      'name': 'name',
      'modified': 'date',
      'size': 'size',
      'type': 'type',
      'path': 'path',
      'random': 'random',
      'rating': 'rating'
    };
    return mapping[field] ?? 'name';
  }

  setSingleFileMode(enabled: boolean, filePath: string | null = null) {
    this.state.singleFileMode = enabled;
    this.state.originalFilePath = filePath;
  }

  getHistoryPath(): string | null {
    if (this.state.singleFileMode && this.state.originalFilePath) {
      return this.state.originalFilePath;
    }
    return this.state.currentBook?.path ?? null;
  }

  getHistoryName(): string {
    if (this.state.singleFileMode && this.state.originalFilePath) {
      return this.state.originalFilePath.split(/[\\/]/).pop() || this.state.originalFilePath;
    }
    return this.state.currentBook?.name ?? '';
  }

  buildPathStack(): ContentRef[] {
    const stack: ContentRef[] = [...this.state.pathStack];
    const book = this.state.currentBook;
    const page = this.currentPage;
    
    if (book && (stack.length === 0 || stack[0].path !== book.path)) {
      stack.unshift({ path: book.path });
    }
    
    if (this.state.singleFileMode && page) {
      stack.push({ path: page.path, innerPath: page.innerPath });
    }
    
    return stack;
  }


  // ==================== 书籍操作 ====================

  async openBook(path: string, options: OpenBookOptions = {}) {
    try {
      console.log('📖 Opening book:', path);
      this.state.loading = true;
      this.state.error = '';
      this.state.upscaledImageData = null;
      this.state.singleFileMode = false;
      this.state.originalFilePath = null;
      this.state.pathStack = [{ path }];
      infoPanelStore.resetAll();

      // 【内存泄漏修复】清理上一本书的所有缓存资源
      cleanupBookResources();

      await this.openBookNormal(path, options);
    } catch (err) {
      console.error('❌ Error opening book:', err);
      this.state.error = String(err);
      this.state.currentBook = null;
      this.syncAppStateBookSlice();
      this.lastEmmMetadataForCurrentBook = null;
      infoPanelStore.resetBookInfo();
    } finally {
      this.state.loading = false;
    }
  }

  private async openBookNormal(path: string, options: OpenBookOptions) {
    const book = await bookApi.openBook(path);
    console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

    // 应用锁定的排序模式
    const settings = settingsManager.getSettings();
    const lockedSortMode = settings.book?.lockedSortMode;
    const lockedMediaPriority = settings.book?.lockedMediaPriority;
    
    if (lockedSortMode && book.sortMode !== lockedSortMode) {
      try {
        const updatedBook = await bookApi.setBookSortMode(lockedSortMode as PageSortMode);
        Object.assign(book, updatedBook);
        console.log('🔒 已应用锁定的排序模式:', lockedSortMode);
      } catch (err) {
        console.warn('⚠️ 应用锁定排序模式失败:', err);
      }
    }

    // 应用锁定的媒体优先模式
    if (lockedMediaPriority && book.mediaPriorityMode !== lockedMediaPriority) {
      try {
        const { setMediaPriorityMode } = await import('$lib/api/book');
        const updatedBook = await setMediaPriorityMode(lockedMediaPriority as 'none' | 'videoFirst' | 'imageFirst');
        Object.assign(book, updatedBook);
        console.log('🔒 已应用锁定的媒体优先模式:', lockedMediaPriority);
      } catch (err) {
        console.warn('⚠️ 应用锁定媒体优先模式失败:', err);
      }
    }
    // 计算目标页面：优先使用 initialFilePath 查找，找不到时回退到 initialPage
    let targetPage = clampInitialPage(book.totalPages, options.initialPage);
    
    // 如果提供了 initialFilePath，尝试按路径查找页面索引
    if (options.initialFilePath && Array.isArray(book.pages)) {
      const normalizedTargetPath = options.initialFilePath.replace(/\\/g, '/').toLowerCase();
      const foundIndex = book.pages.findIndex(page => {
        if (!page?.path) return false;
        const normalizedPagePath = page.path.replace(/\\/g, '/').toLowerCase();
        return normalizedPagePath === normalizedTargetPath;
      });
      
      if (foundIndex >= 0) {
        targetPage = foundIndex;
        console.log('📍 [History] Found page by path:', options.initialFilePath, '-> index', foundIndex);
      } else {
        console.log('⚠️ [History] Page not found by path, falling back to index:', options.initialPage);
      }
    }
    
    book.currentPage = targetPage;

    this.state.currentBook = book;
    this.syncAppStateBookSlice();
    this.state.viewerOpen = true;
    
    // 初始化 pageFrameStore 用于本地布局计算（同步调用）
    if (book.pages && book.pages.length > 0) {
      pageFrameStore.initFromBookPages(book.pages);
      // 【修复】reset() 会将 pageMode 重置为 'single'，必须在初始化后重新同步当前视图模式
      const currentViewMode = appState.getSnapshot().viewer.viewMode;
      if (currentViewMode === 'double') {
        pageFrameStore.setPageMode('double');
      }
      console.log('📐 [PageFrame] 已初始化页面帧布局，共', book.pages.length, '页，模式:', currentViewMode);
    }
    
    if (targetPage > 0 && book.totalPages > 0) {
      bookApi.navigateToPage(targetPage).catch(navErr => {
        console.error('❌ Error navigating to initial page after open:', navErr);
      });
    }
    
    this.syncInfoPanelBookInfo().catch(() => {});
    this.syncFileBrowserSelection(path);

    if (!options.skipHistory) {
      import('$lib/stores/unifiedHistory.svelte').then(({ unifiedHistoryStore }) => {
        const pathStack = this.buildPathStack();
        const currentPage = book.pages?.[targetPage];
        const currentFilePath = currentPage?.path;
        unifiedHistoryStore.add(pathStack, targetPage, book.totalPages, { 
          displayName: book.name,
          currentFilePath 
        });
      }).catch(() => {});
    }

    this.showBookSwitchToastIfEnabled();
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));

    // 📐 【性能优化 #6】启动后台尺寸预扫描
    if (book.pages?.length > 0) {
      console.log('📐 [DimensionScan] Starting background scan for', book.pages.length, 'pages');
      dimensionApi.startDimensionScan(book.path, book.type, book.pages).catch(err => {
        console.warn('⚠️ [DimensionScan] Failed to start scan:', err);
      });
    }
  }

  async openDirectoryAsBook(path: string, options: OpenBookOptions = {}) {
    await this.openBook(path, options);
  }

  closeViewer() {
    // 【内存泄漏修复】清理所有缓存资源
    cleanupBookResources();

    this.state.viewerOpen = false;
    this.state.currentBook = null;
    this.syncAppStateBookSlice();
    this.lastEmmMetadataForCurrentBook = null;
    this.state.upscaledImageData = null;
    infoPanelStore.resetAll();
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
    
    // 重置 pageFrameStore（同步调用）
    pageFrameStore.reset();
  }

  async cancelCurrentLoad() {
    try {
      await bookApi.cancelCurrentLoad();
      console.log('🚫 已取消当前加载');
    } catch (err) {
      console.error('❌ 取消加载失败:', err);
    }
  }

  async reloadCurrentBook(options: { keepPage?: boolean } = {}) {
    const current = this.state.currentBook;
    if (!current) return;

    const targetPage = options.keepPage === false ? 0 : current.currentPage;

    try {
      const latest = await bookApi.getCurrentBook();
      if (!latest || latest.totalPages === 0) {
        this.closeViewer();
        return;
      }

      const nextPage = Math.min(targetPage, Math.max(latest.totalPages - 1, 0));
      latest.currentPage = nextPage;
      this.state.currentBook = latest;
      this.syncAppStateBookSlice();
      await bookApi.navigateToPage(nextPage);
      await this.syncInfoPanelBookInfo();
    } catch (err) {
      console.error('❌ Error reloading current book:', err);
      this.state.error = String(err);
    }
  }


  // ==================== 页面导航 ====================

  async navigateToPage(index: number) {
    if (!this.state.currentBook) return;
    const maxIndex = this.state.currentBook.totalPages - 1;
    if (index < 0 || index > maxIndex) return;

    // 【性能优化】快速翻页去重，防止短时间内重复导航到同一页面
    const dedupKey = `nav-${this.state.currentBook.path}-${index}`;
    try {
      await pageNavigationDedup.run(dedupKey, async () => {
        const activeBook = this.state.currentBook;
        if (!activeBook) return;

        // 【IPC优化】先更新本地状态以获得即时 UI 响应
        activeBook.currentPage = index;
        this.syncAppStateBookSlice('user');

        // 更新 pageFrameStore 的当前位置
        // 【修复】直接 buildFrame 避免 framePositionForIndex 错误逆推导致 currentPosition 偏移
        pageFrameStore.buildFrame({ index, part: 0 });

        // 异步通知后端（触发预加载）
        bookApi.navigateToPage(index).catch(err => {
          console.warn('⚠️ 后端导航通知失败:', err);
        });

        // 异步更新面板信息
        this.syncInfoPanelBookInfo();

        if (this.state.singleFileMode) {
          const currentPage = activeBook.pages?.[index];
          if (currentPage) {
            this.state.originalFilePath = currentPage.path;
            const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
            const name = currentPage.name || currentPage.path.split(/[\\/]/).pop() || currentPage.path;
            const pathStack = this.buildPathStack();
            unifiedHistoryStore.add(pathStack, index, activeBook.totalPages, {
              displayName: name,
              currentFilePath: currentPage.path
            });
          }
        } else {
          const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
          const pathStack = this.buildPathStack();
          const currentPage = activeBook.pages?.[index];
          const currentFilePath = currentPage?.path;
          unifiedHistoryStore.updateIndex(pathStack, index, activeBook.totalPages, currentFilePath);
        }

        this.showPageSwitchToastIfEnabled();
      });
    } catch (err) {
      console.error('❌ Error navigating to page:', err);
      this.state.error = String(err);
    }
  }

  async navigateToImage(imagePath: string, options: { skipHistoryUpdate?: boolean } = {}) {
    if (!this.state.currentBook) return;
    try {
      const index = await bookApi.navigateToImage(imagePath);
      if (!this.state.currentBook) return;
      this.state.currentBook.currentPage = index;
      this.syncAppStateBookSlice('user');
      await this.syncInfoPanelBookInfo();

      if (!options.skipHistoryUpdate) {
        const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
        const pathStack = this.buildPathStack();
        unifiedHistoryStore.updateIndex(pathStack, index, this.state.currentBook.totalPages);
      }
    } catch (err) {
      console.error('❌ Error navigating to image:', err);
      this.state.error = String(err);
    }
  }

  // ── 绝对前/后翻页（nextPage / previousPage）──────────────────────────────────
  // 与 ui.svelte.ts 的方向感知翻页（pageLeft/pageRight）并存，职责不同：
  //   nextPage/previousPage：按书本物理顺序「下一帧/上一帧」，不感知阅读方向。
  //   pageLeft/pageRight   ：感知阅读方向和分割页状态，通过 navigateToPage 跳转。
  //
  // ⚠️ 避坑提醒（framePositionForIndex 逆推错误）：
  //   pageFrameStore.gotoPage(n) 内部调用 framePositionForIndex(n)，
  //   该函数会将 n 逆推为所在帧的起始页（如 index=3 判为 [2,3] 帧 → 返回 {index:2}），
  //   导致 state.currentPosition 偏移，下次翻页起点错误（出现 12→23→34 滑窗现象）。
  //   ✅ 正确做法：保存 getNextPosition/getPrevPosition 返回的精确 PagePosition，
  //   直接调用 buildFrame(pos)，跳过逆推逻辑。

  async nextPage() {
    if (!this.canNextPage) {
      // 已在最后一页，检查是否显示边界提示
      const settings = settingsManager.getSettings();
      const enableBoundaryToast = settings.view?.switchToast?.enableBoundaryToast ?? true;
      if (enableBoundaryToast) {
        showToast({ title: '已是最后一页', variant: 'info' });
      }
      return;
    }
    try {
      const book = this.state.currentBook;
      if (!book) return;

      // 从 pageFrameStore 获取下一帧起始位置（已正确考虑双页步长）
      // nextPos 是精确位置，必须用 buildFrame(nextPos) 而非 gotoPage(index) 更新状态
      let newIndex: number;
      let nextPos: PagePosition | null = null;
      if (pageFrameStore.isInitialized()) {
        nextPos = pageFrameStore.getNextPosition();
        if (nextPos) {
          newIndex = nextPos.index;
        } else {
          newIndex = Math.min(book.currentPage + 1, book.totalPages - 1);
        }
      } else {
        newIndex = Math.min(book.currentPage + 1, book.totalPages - 1);
      }

      // 通知后端以触发预加载
      await bookApi.navigateToPage(newIndex);

      book.currentPage = newIndex;
      await this.syncInfoPanelBookInfo();
      this.syncAppStateBookSlice('user');
      await this.updateHistoryAfterNavigation(newIndex);

      // 用精确位置更新 pageFrameStore，避免 framePositionForIndex 逆推错误
      if (nextPos) {
        pageFrameStore.buildFrame(nextPos);
      } else {
        pageFrameStore.gotoPage(newIndex);
      }

      this.showPageSwitchToastIfEnabled();
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to next page:', err);
      this.state.error = String(err);
    }
  }

  async previousPage() {
    if (!this.canPreviousPage) {
      // 已在第一页，检查是否显示边界提示
      const settings = settingsManager.getSettings();
      const enableBoundaryToast = settings.view?.switchToast?.enableBoundaryToast ?? true;
      if (enableBoundaryToast) {
        showToast({ title: '已是第一页', variant: 'info' });
      }
      return;
    }
    try {
      const book = this.state.currentBook;
      if (!book) return;

      // 从 pageFrameStore 获取上一帧起始位置（已正确考虑双页步长）
      // prevPos 是精确位置，必须用 buildFrame(prevPos) 而非 gotoPage(index) 更新状态
      let newIndex: number;
      let prevPos: PagePosition | null = null;
      if (pageFrameStore.isInitialized()) {
        prevPos = pageFrameStore.getPrevPosition();
        if (prevPos) {
          newIndex = prevPos.index;
        } else {
          newIndex = Math.max(book.currentPage - 1, 0);
        }
      } else {
        newIndex = Math.max(book.currentPage - 1, 0);
      }

      // 通知后端以触发预加载
      await bookApi.navigateToPage(newIndex);

      book.currentPage = newIndex;
      await this.syncInfoPanelBookInfo();
      this.syncAppStateBookSlice('user');
      await this.updateHistoryAfterNavigation(newIndex);

      // 用精确位置更新 pageFrameStore，避免 framePositionForIndex 逆推错误
      if (prevPos) {
        pageFrameStore.buildFrame(prevPos);
      } else {
        pageFrameStore.gotoPage(newIndex);
      }

      return newIndex;
    } catch (err) {
      console.error('❌ Error going to previous page:', err);
      this.state.error = String(err);
    }
  }

  async firstPage() { await this.navigateToPage(0); }
  async lastPage() {
    if (!this.state.currentBook) return;
    await this.navigateToPage(this.state.currentBook.totalPages - 1);
  }
  async goToPage(index: number) { await this.navigateToPage(index); }

  setCurrentPageIndexLocal(index: number) {
    if (!this.state.currentBook) return;
    const maxIndex = this.state.currentBook.totalPages - 1;
    if (index < 0 || index > maxIndex) return;
    this.state.currentBook.currentPage = index;
  }

  private async updateHistoryAfterNavigation(newIndex: number) {
    const book = this.state.currentBook;
    if (!book) return;

    if (this.state.singleFileMode) {
      const currentPage = book.pages?.[newIndex];
      if (currentPage) {
        this.state.originalFilePath = currentPage.path;
        const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
        const name = currentPage.name || currentPage.path.split(/[\\/]/).pop() || currentPage.path;
        const pathStack = this.buildPathStack();
        unifiedHistoryStore.add(pathStack, newIndex, book.totalPages, { 
          displayName: name,
          currentFilePath: currentPage.path 
        });
      }
    } else {
      const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
      const pathStack = this.buildPathStack();
      const currentPage = book.pages?.[newIndex];
      const currentFilePath = currentPage?.path;
      unifiedHistoryStore.updateIndex(pathStack, newIndex, book.totalPages, currentFilePath);
    }
  }


  // ==================== 书籍切换 ====================

  private async openAdjacentBook(direction: 'next' | 'previous') {
    const currentPath = this.state.currentBook?.path ?? null;
    
    const activeTab = folderTabActions.getActiveTab();
    
    // 直接读取 UI 已排好序的缓存列表，不做任何二次排序
    const cachedMeta = folderTabActions.getCachedSortedMeta();
    const cachedSorted = folderTabActions.getCachedSortedItems();
    let targetPath: string | null = null;
    const activeTabPath = activeTab?.currentPath || '';
    const canUseCache =
      cachedSorted.length > 0 &&
      !!activeTabPath &&
      normalizeFolderPath(cachedMeta.path) === normalizeFolderPath(activeTabPath);
    
    if (canUseCache) {
      const bookItems = cachedSorted.filter(isBookCandidate);
      
      if (bookItems.length > 0) {
        const normalizedCurrent = currentPath ? normalizeFolderPath(currentPath) : null;
        let currentIndex = bookItems.findIndex(item => 
          normalizedCurrent && normalizeFolderPath(item.path) === normalizedCurrent
        );

        if (currentIndex === -1) {
          currentIndex = direction === 'next' ? -1 : bookItems.length;
        }
        
        const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        if (targetIndex >= 0 && targetIndex < bookItems.length) {
          targetPath = bookItems[targetIndex].path;
        }
      }
    }
    
    // 降级：缓存为空或缓存中无 book 候选时，异步加载
    if (!targetPath) {
      const sortOptions = {
        sortField: (activeTab?.sortField || 'name') as 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path' | 'collectTagCount',
        sortOrder: (activeTab?.sortOrder || 'asc') as 'asc' | 'desc'
      };
      targetPath = await folderPanelActions.findAdjacentBookPathAsync(currentPath, direction, sortOptions);
    }
    
    // 最终回退
    if (!targetPath) {
      targetPath = fileBrowserStore.findAdjacentBookPath(currentPath, direction);
    }
    
    if (!targetPath) return;
    
    await this.openBook(targetPath);

    // ★ 先开书，再异步同步侧栏，降低切换路径上的主线程压力
    setTimeout(() => {
      this.syncFolderPanelToBookParent(targetPath, folderTabActions, normalizeFolderPath);
    }, 0);
  }

  /**
   * 同步文件夹面板到指定书籍的父目录
   * 确保面板显示的是书籍的兄弟列表，而不是书籍内部的文件
   */
  private syncFolderPanelToBookParent(
    bookPath: string,
    folderTabActions: { getActiveTab: () => any; setPath: (path: string, addToHistory?: boolean) => void; selectItem: (path: string) => void; focusOnPath: (path: string) => void },
    normalizePath: (path: string) => string
  ) {
    try {
      const normalized = bookPath.replace(/\\/g, '/');
      const lastSep = normalized.lastIndexOf('/');
      if (lastSep <= 0) return;
      const parentDir = normalized.substring(0, lastSep);
      
      const activeTab = folderTabActions.getActiveTab();
      const currentTabPath = activeTab?.currentPath || '';

      if (normalizePath(currentTabPath) === normalizePath(parentDir)) {
        folderTabActions.selectItem(bookPath);
        folderTabActions.focusOnPath(bookPath);
      } else {
        folderTabActions.setPath(parentDir, false);
        folderTabActions.focusOnPath(bookPath);
      }
    } catch {}
  }

  async openNextBook() {
    if (this.state.singleFileMode) return;
    await this.openAdjacentBook('next');
  }

  async openPreviousBook() {
    if (this.state.singleFileMode) return;
    await this.openAdjacentBook('previous');
  }

  async setSortMode(sortMode: PageSortMode) {
    if (!this.state.currentBook) return;
    if (this.state.currentBook.sortMode === sortMode) return;

    try {
      const updatedBook = await bookApi.setBookSortMode(sortMode);
      this.state.currentBook = updatedBook;
      this.syncAppStateBookSlice('user');
      await this.syncInfoPanelBookInfo();

      // 【Phase 4】排序后重新初始化 pageFrameStore
      if (updatedBook.pages && updatedBook.pages.length > 0) {
        pageFrameStore.initFromBookPages(updatedBook.pages);
        // 【修复】同步当前视图模式，防止 reset 后 pageMode 丢失
        const currentViewMode = appState.getSnapshot().viewer.viewMode;
        if (currentViewMode === 'double') {
          pageFrameStore.setPageMode('double');
        }
        console.log('📐 [PageFrame] 排序后重新初始化，模式:', sortMode);
      }

      const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
      const pathStack = this.buildPathStack();
      unifiedHistoryStore.updateIndex(pathStack, updatedBook.currentPage, updatedBook.totalPages);
    } catch (err) {
      console.error('❌ Error setting sort mode:', err);
      this.state.error = String(err);
    }
  }

  async closeBook() {
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
    await this.closeViewer();
  }

  async closeFile() { await this.closeBook(); }

  async refreshCurrentBook() {
    try {
      const book = await bookApi.getCurrentBook();
      this.state.currentBook = book;
      this.syncInfoPanelBookInfo();
    } catch (err) {
      console.error('❌ Error refreshing book:', err);
      this.state.error = String(err);
    }
  }

  setError(message: string) { this.state.error = message; }
  clearError() { this.state.error = ''; }
  setUpscaledImage(data: string | null) { this.state.upscaledImageData = data; }

  // ==================== 超分状态管理 ====================

  /** 获取指定页面的超分状态 */
  getPageUpscaleStatus(pageIndex: number): UpscaleStatus {
    return this.upscaleStatusByPage.get(pageIndex) ?? 'none';
  }

  /** 设置指定页面的超分状态 */
  setPageUpscaleStatus(pageIndex: number, status: UpscaleStatus): void {
    const nextMap = new SvelteMap(this.upscaleStatusByPage);
    nextMap.set(pageIndex, status);
    this.upscaleStatusByPage = nextMap;
  }

  /** 获取预超分覆盖范围（最远已预超分的页面索引） */
  getFurthestPreUpscaledIndex(): number {
    let furthestIndex = -1;
    for (const [pageIndex, status] of this.upscaleStatusByPage.entries()) {
      if (status === 'preupscaled' || status === 'done') {
        furthestIndex = Math.max(furthestIndex, pageIndex);
      }
    }
    return furthestIndex;
  }

  /** 重置所有页面的超分状态 */
  resetAllUpscaleStatus(): void {
    this.upscaleStatusByPage = new SvelteMap();
  }

  updatePageDimensions(pageIndex: number, dimensions: { width?: number | null; height?: number | null }) {
    const book = this.state.currentBook;
    if (!book || !Array.isArray(book.pages)) return;
    if (pageIndex < 0 || pageIndex >= book.pages.length) return;

    const page = book.pages[pageIndex];
    if (!page) return;

    let updated = false;
    if (typeof dimensions.width === 'number' && dimensions.width > 0 && page.width !== dimensions.width) {
      page.width = dimensions.width;
      updated = true;
    }
    if (typeof dimensions.height === 'number' && dimensions.height > 0 && page.height !== dimensions.height) {
      page.height = dimensions.height;
      updated = true;
    }

    if (updated && pageIndex === book.currentPage) {
      void this.syncInfoPanelBookInfo();
    }
  }

  updatePageDimensionsBatch(updates: Array<{ pageIndex: number; width: number; height: number }>) {
    const book = this.state.currentBook;
    if (!book || !Array.isArray(book.pages)) return;

    let currentPageUpdated = false;
    for (const update of updates) {
      const { pageIndex, width, height } = update;
      if (pageIndex < 0 || pageIndex >= book.pages.length) continue;
      const page = book.pages[pageIndex];
      if (!page) continue;
      if (width > 0 && page.width !== width) page.width = width;
      if (height > 0 && page.height !== height) page.height = height;
      if (pageIndex === book.currentPage) currentPageUpdated = true;
    }

    if (currentPageUpdated) void this.syncInfoPanelBookInfo();
  }


  // ==================== Hash 和 Toast ====================

  getPageHash(pageIndex: number): string | null {
    const book = this.state.currentBook;
    if (!book) return null;
    const page = book.pages[pageIndex];
    return page?.stableHash ?? null;
  }

  getCurrentPageHash(): string | null {
    return this.getPageHash(this.currentPageIndex);
  }

  getCurrentBookPageContext(): SwitchToastContext {
    return this.buildSwitchToastContext();
  }

  private getSwitchToastConfig() {
    const settings = settingsManager.getSettings();
    const view = settings.view;
    return view.switchToast ?? {
      enableBook: view.showBookSwitchToast ?? false,
      enablePage: false,
      showBookPath: true,
      showBookPageProgress: true,
      showBookType: false,
      showPageIndex: true,
      showPageSize: false,
      showPageDimensions: true,
      bookTitleTemplate: '已切换到 {{book.displayName}}（第 {{book.currentPageDisplay}} / {{book.totalPages}} 页）',
      bookDescriptionTemplate: '路径：{{book.path}}',
      pageTitleTemplate: '第 {{page.indexDisplay}} / {{book.totalPages}} 页',
      pageDescriptionTemplate: '{{page.dimensionsFormatted}}  {{page.sizeFormatted}}'
    };
  }

  private buildSwitchToastContext(): SwitchToastContext {
    const book = this.state.currentBook;
    const page = this.currentPage;

    let bookCtx: SwitchToastBookContext | null = null;
    if (book) {
      const emm = this.lastEmmMetadataForCurrentBook;
      const totalPages = book.totalPages ?? 0;
      const currentPageIndex = book.currentPage ?? 0;
      const currentPageDisplay = totalPages === 0 ? 0 : currentPageIndex + 1;
      const safeCurrent = totalPages > 0 ? Math.min(currentPageDisplay, totalPages) : 0;
      const progressPercent = totalPages > 0 ? (safeCurrent / totalPages) * 100 : null;
      const emmRaw = emm ? mapEmmToRaw(emm) : undefined;
      const emmTranslatedTitle = emm?.translated_title;

      bookCtx = {
        name: book.name,
        displayName: emmTranslatedTitle && emmTranslatedTitle !== book.name ? emmTranslatedTitle : book.name,
        path: book.path,
        type: book.type,
        totalPages,
        currentPageIndex,
        currentPageDisplay,
        progressPercent: progressPercent !== null ? Number(progressPercent.toFixed(1)) : null,
        emmTranslatedTitle,
        emmRating: emm?.rating ?? null,
        emmTags: emm?.tags,
        emmRaw
      };
    }

    let pageCtx: SwitchToastPageContext | null = null;
    if (page) {
      const dimensionsFormatted = page.width && page.height ? `${page.width} × ${page.height}` : undefined;
      const sizeFormatted = typeof page.size === 'number' ? formatBytesShort(page.size) ?? undefined : undefined;
      const indexDisplay = page.index + 1;

      pageCtx = {
        name: page.name,
        displayName: page.name || `第 ${indexDisplay} 页`,
        path: page.path,
        innerPath: page.innerPath,
        index: page.index,
        indexDisplay,
        width: page.width,
        height: page.height,
        dimensionsFormatted,
        size: page.size,
        sizeFormatted
      };
    }

    return { book: bookCtx, page: pageCtx };
  }

  private showBookSwitchToastIfEnabled() {
    const book = this.state.currentBook;
    if (!book) return;

    const cfg = this.getSwitchToastConfig();
    if (!cfg.enableBook) return;

    const context = this.buildSwitchToastContext();
    const titleFromTemplate = cfg.bookTitleTemplate
      ? renderSwitchToastTemplate(cfg.bookTitleTemplate, context).trim()
      : '';
    const descriptionFromTemplate = cfg.bookDescriptionTemplate
      ? renderSwitchToastTemplate(cfg.bookDescriptionTemplate, context).trim()
      : '';

    if (titleFromTemplate || descriptionFromTemplate) {
      showToast({
        title: titleFromTemplate || (context.book?.displayName ?? book.name),
        description: descriptionFromTemplate || undefined,
        variant: 'info'
      });
      return;
    }

    const parts: string[] = [];
    if (cfg.showBookPageProgress && book.totalPages > 0) {
      const current = Math.min(book.currentPage + 1, book.totalPages);
      parts.push(`第 ${current} / ${book.totalPages} 页`);
    }
    if (cfg.showBookType && book.type) {
      const label = formatBookTypeLabel(book.type as string);
      if (label) parts.push(label);
    }
    if (cfg.showBookPath && book.path) {
      parts.push(book.path);
    }

    showToast({ title: book.name, description: parts.join(' • ') || undefined, variant: 'info' });
  }

  private showPageSwitchToastIfEnabled() {
    const book = this.state.currentBook;
    const page = this.currentPage;
    if (!book || !page) return;

    const cfg = this.getSwitchToastConfig();
    if (!cfg.enablePage) return;

    const context = this.buildSwitchToastContext();
    const titleFromTemplate = cfg.pageTitleTemplate
      ? renderSwitchToastTemplate(cfg.pageTitleTemplate, context).trim()
      : '';
    const descriptionFromTemplate = cfg.pageDescriptionTemplate
      ? renderSwitchToastTemplate(cfg.pageDescriptionTemplate, context).trim()
      : '';

    if (titleFromTemplate || descriptionFromTemplate) {
      showToast({
        title: titleFromTemplate || (context.page?.displayName || page.name || `第 ${book.currentPage + 1} 页`),
        description: descriptionFromTemplate || undefined,
        variant: 'info'
      });
      return;
    }

    const parts: string[] = [];
    if (cfg.showPageIndex && book.totalPages > 0) {
      parts.push(`第 ${Math.min(book.currentPage + 1, book.totalPages)} / ${book.totalPages} 页`);
    }
    if (cfg.showPageDimensions && page.width && page.height) {
      parts.push(`${page.width} × ${page.height}`);
    }
    if (cfg.showPageSize && typeof page.size === 'number') {
      const sizeStr = formatBytesShort(page.size);
      if (sizeStr) parts.push(sizeStr);
    }

    showToast({
      title: page.name || `第 ${book.currentPage + 1} 页`,
      description: parts.join(' • ') || undefined,
      variant: 'info'
    });
  }


  // ==================== 同步方法 ====================

  private syncFileBrowserSelection(path: string) {
    try {
      fileBrowserStore.selectPath(path);
    } catch (error) {
      console.debug('syncFileBrowserSelection failed:', error);
    }
  }

  private async syncInfoPanelBookInfo() {
    const book = this.state.currentBook;
    if (!book) {
      infoPanelStore.resetBookInfo();
      infoPanelStore.resetImageInfo();
      return;
    }

    const emmMetadata = await emmMetadataStore.loadMetadataByPath(book.path);
    this.lastEmmMetadataForCurrentBook = emmMetadata;

    const bookInfo = {
      path: book.path,
      name: book.name,
      type: book.type,
      totalPages: book.totalPages,
      currentPage: book.totalPages === 0 ? 0 : book.currentPage + 1,
      emmMetadata: emmMetadata ? {
        translatedTitle: emmMetadata.translated_title,
        tags: emmMetadata.tags,
        rating: emmMetadata.rating,
        raw: mapEmmToRaw(emmMetadata),
      } : undefined,
    };

    infoPanelStore.setBookInfo(bookInfo);
    await this.syncCurrentPageImageInfo();
  }

  private async syncCurrentPageImageInfo() {
    const book = this.state.currentBook;
    const page = this.currentPage;

    if (!book || !page) {
      infoPanelStore.resetImageInfo();
      return;
    }

    try {
      const { metadataService } = await import('$lib/services/metadataService');
      metadataService.updateFromPage(page, book.path);
      const isArchive = book.type === 'archive';
      const path = isArchive ? book.path : page.path;
      const innerPath = isArchive ? page.innerPath : undefined;
      await metadataService.syncCurrentPageMetadata(path, innerPath, page.index);
    } catch (error) {
      console.warn('[BookStore] syncCurrentPageImageInfo 失败:', error);
    }
  }

  private computePageWindowState(currentIndex: number, totalPages: number, radius: number) {
    const forward: number[] = [];
    const backward: number[] = [];
    for (let i = 1; i <= radius; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < totalPages) forward.push(nextIndex);
      const prevIndex = currentIndex - i;
      if (prevIndex >= 0) backward.push(prevIndex);
    }
    return { center: currentIndex, forward, backward, stale: false };
  }

  private syncAppStateBookSlice(source: ViewerJumpSource = 'system') {
    const currentBook = this.state.currentBook;
    const snapshot = appState.getSnapshot();

    const bookSlice = {
      currentBookPath: currentBook?.path ?? null,
      currentPageIndex: currentBook?.currentPage ?? 0,
      totalPages: currentBook?.totalPages ?? 0
    };

    if (!currentBook) {
      appState.update({
        book: bookSlice,
        viewer: {
          ...snapshot.viewer,
          pageWindow: { center: 0, forward: [], backward: [], stale: true },
          jumpHistory: [],
          taskCursor: { ...snapshot.viewer.taskCursor, centerIndex: 0, oldestPendingIdx: 0, furthestReadyIdx: 0 }
        }
      });
      return;
    }

    const preloadRadius = snapshot.settings.performance?.preLoadSize ?? PAGE_WINDOW_PADDING;
    const radius = Math.max(1, Math.max(PAGE_WINDOW_PADDING, preloadRadius));
    const pageWindow = this.computePageWindowState(bookSlice.currentPageIndex, bookSlice.totalPages, radius);
    const jumpEntry = { index: bookSlice.currentPageIndex, timestamp: Date.now(), source };
    const jumpHistory = [jumpEntry, ...snapshot.viewer.jumpHistory].slice(0, JUMP_HISTORY_LIMIT);

    appState.update({
      book: bookSlice,
      viewer: {
        ...snapshot.viewer,
        pageWindow,
        jumpHistory,
        taskCursor: { ...snapshot.viewer.taskCursor, centerIndex: bookSlice.currentPageIndex }
      }
    });
  }
}

// 导出单例
export const bookStore = new BookStore();
