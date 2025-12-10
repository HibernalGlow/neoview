/**
 * NeoView - Book Store
 * 书籍状态管理 Store (Svelte 5 Runes)
 */

import type { BookInfo, Page, PageSortMode } from '../types';
import * as bookApi from '../api/book';
import { infoPanelStore } from './infoPanel.svelte';
import { appState, type ViewerJumpSource } from '$lib/core/state/appState';
import { emmMetadataStore } from './emmMetadata.svelte';
import { fileBrowserStore } from './fileBrowser.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { showToast } from '$lib/utils/toast';
import type { EMMMetadata } from '$lib/api/emm';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

const PAGE_WINDOW_PADDING = 8;
const JUMP_HISTORY_LIMIT = 20;

interface BookState {
  currentBook: BookInfo | null;
  loading: boolean;
  error: string;
  viewerOpen: boolean;
  upscaledImageData: string | null; // 保持兼容性，用于显示
  // 【视频/图片单文件模式】用于正确记录历史
  singleFileMode: boolean;
  originalFilePath: string | null; // 原始文件路径（视频/图片）
}

interface OpenBookOptions {
  /** 打开时希望跳转到的页面 */
  initialPage?: number;
  /** 跳过添加历史记录（用于视频/图片单独记录场景） */
  skipHistory?: boolean;
}

interface SwitchToastBookContext {
  name: string;
  displayName: string;
  path: string;
  type: string;
  totalPages: number;
  currentPageIndex: number;
  currentPageDisplay: number;
  progressPercent: number | null;
  emmTranslatedTitle?: string;
  emmRating?: number | null;
  emmTags?: Record<string, string[]> | undefined;
  emmRaw?: Record<string, unknown> | undefined;
}

interface SwitchToastPageContext {
  name: string;
  displayName: string;
  path: string;
  innerPath?: string;
  index: number;
  indexDisplay: number;
  width?: number;
  height?: number;
  dimensionsFormatted?: string;
  size?: number;
  sizeFormatted?: string;
}

export interface SwitchToastContext {
  book: SwitchToastBookContext | null;
  page: SwitchToastPageContext | null;
}

class BookStore {
  private state = $state<BookState>({
    currentBook: null,
    loading: false,
    error: '',
    viewerOpen: false,
    upscaledImageData: null,
    singleFileMode: false,
    originalFilePath: null,
  });

  // 每页超分状态映射: pageIndex -> 'none' | 'preupscaled' | 'done' | 'failed'
  private upscaleStatusByPage = $state<SvelteMap<number, 'none' | 'preupscaled' | 'done' | 'failed'>>(new SvelteMap());

  // 超分缓存映射: bookPath -> (hash -> cacheEntry)
  private upscaleCacheMapByBook = $state<SvelteMap<string, SvelteMap<string, {
    model: string;
    scale: number;
    cachePath: string;
    originalPath: string;
    innerPath?: string;
    timestamp: number;
  }>>>(new SvelteMap());

  private lastEmmMetadataForCurrentBook: EMMMetadata | null = null;

  // === Getters ===
  get currentBook() {
    return this.state.currentBook;
  }

  async reloadCurrentBook(options: { keepPage?: boolean } = {}) {
    const current = this.state.currentBook;
    if (!current) return;

    const targetPage = options.keepPage === false ? 0 : current.currentPage;

    try {
      const latest = await bookApi.getCurrentBook();
      if (!latest) {
        this.closeViewer();
        return;
      }

      const nextPage = Math.min(targetPage, Math.max(latest.totalPages - 1, 0));
      if (latest.totalPages === 0) {
        this.closeViewer();
        return;
      }

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

  get loading() {
    return this.state.loading;
  }

  get error() {
    return this.state.error;
  }

  get viewerOpen() {
    return this.state.viewerOpen;
  }

  get upscaledImageData() {
    return this.state.upscaledImageData;
  }

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

  /** 是否为单文件模式（视频/图片直接打开） */
  get isSingleFileMode(): boolean {
    return this.state.singleFileMode;
  }

  /** 原始文件路径（单文件模式下使用） */
  get originalFilePath(): string | null {
    return this.state.originalFilePath;
  }

  /**
   * 设置单文件模式
   * 用于视频/图片打开时正确记录历史
   */
  setSingleFileMode(enabled: boolean, filePath: string | null = null) {
    this.state.singleFileMode = enabled;
    this.state.originalFilePath = filePath;
  }

  /**
   * 获取历史记录应该使用的路径
   * 单文件模式返回原始文件路径，否则返回 book 路径
   */
  getHistoryPath(): string | null {
    if (this.state.singleFileMode && this.state.originalFilePath) {
      return this.state.originalFilePath;
    }
    return this.state.currentBook?.path ?? null;
  }

  /**
   * 获取历史记录应该使用的名称
   */
  getHistoryName(): string {
    if (this.state.singleFileMode && this.state.originalFilePath) {
      return this.state.originalFilePath.split(/[\\/]/).pop() || this.state.originalFilePath;
    }
    return this.state.currentBook?.name ?? '';
  }

  // === Actions ===

  /**
   * 打开 Book (自动检测类型)
   */
  async openBook(path: string, options: OpenBookOptions = {}) {
    try {
      console.log('📖 Opening book:', path);
      this.state.loading = true;
      this.state.error = '';

      // 清除旧书的状态
      this.state.upscaledImageData = null;
      // 【重要】正常打开 book 时重置单文件模式（由调用方决定是否设置）
      this.state.singleFileMode = false;
      this.state.originalFilePath = null;
      infoPanelStore.resetAll();

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      const targetPage = this.clampInitialPage(book.totalPages, options.initialPage);
      book.currentPage = targetPage;

      this.state.currentBook = book;
      this.syncAppStateBookSlice();
      this.state.viewerOpen = true;
      
      // 【优化】异步执行非阻塞操作，不等待
      if (targetPage > 0 && book.totalPages > 0) {
        bookApi.navigateToPage(targetPage).catch(navErr => {
          console.error('❌ Error navigating to initial page after open:', navErr);
        });
      }
      
      // 【优化】异步同步信息面板，不阻塞
      this.syncInfoPanelBookInfo().catch(() => {});
      this.syncFileBrowserSelection(path);

      // 【优化】异步添加历史记录，不阻塞（如果 skipHistory 为 true 则跳过）
      if (!options.skipHistory) {
        import('$lib/stores/history.svelte').then(({ historyStore }) => {
          historyStore.add(path, book.name, targetPage, book.totalPages);
        }).catch(() => {});
      }

      this.showBookSwitchToastIfEnabled();

      // 重置所有页面的超分状态
      this.resetAllPageUpscaleStatus();

      // 触发重置预超分进度事件
      window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
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

  /**
   * 打开文件夹作为 Book
   */
  async openDirectoryAsBook(path: string, options: OpenBookOptions = {}) {
    console.log('📖 Opening directory as book:', path);
    await this.openBook(path, options);
  }

  /**
   * 关闭查看器
   */
  closeViewer() {
    this.state.viewerOpen = false;
    this.state.currentBook = null;
    this.syncAppStateBookSlice();
    this.lastEmmMetadataForCurrentBook = null;
    this.state.upscaledImageData = null;
    infoPanelStore.resetAll();

    // 重置页面超分状态
    this.resetAllPageUpscaleStatus();

    // 触发重置预超分进度事件
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
  }

  /**
   * 设置超分图片数据
   * @deprecated 旧系统已弃用，超分图由 upscaleStore 写入 imagePool
   */
  setUpscaledImage(data: string | null) {
    this.state.upscaledImageData = data;
  }

  /**
   * 更新页面的宽高信息
   */
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

  /**
   * 翻到指定页
   */
  async navigateToPage(index: number) {
    if (!this.state.currentBook) return;

    const maxIndex = this.state.currentBook.totalPages - 1;
    if (index < 0 || index > maxIndex) {
      console.warn('⚠️ Page index out of range:', index);
      return;
    }

    try {
      console.log(`📄 Navigating to page ${index + 1}/${this.state.currentBook.totalPages}`);
      await bookApi.navigateToPage(index);

      // 更新本地状态
      this.state.currentBook.currentPage = index;
      this.syncAppStateBookSlice('user');
      this.syncInfoPanelBookInfo();

      // 【单文件模式】更新当前文件路径
      if (this.state.singleFileMode) {
        const currentPage = this.state.currentBook.pages?.[index];
        if (currentPage) {
          this.state.originalFilePath = currentPage.path;
        }
      }

      // 【优化】更新历史记录（支持单文件模式）
      const historyPath = this.getHistoryPath();
      if (historyPath) {
        const { historyStore } = await import('$lib/stores/history.svelte');
        historyStore.update(historyPath, index, this.state.currentBook.totalPages);
      }

      this.showPageSwitchToastIfEnabled();
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

      // 【优化】允许调用方跳过历史更新（用于视频/图片单独记录场景）
      if (!options.skipHistoryUpdate) {
        const { historyStore } = await import('$lib/stores/history.svelte');
        historyStore.update(this.state.currentBook.path, index, this.state.currentBook.totalPages);
      }
    } catch (err) {
      console.error('❌ Error navigating to image:', err);
      this.state.error = String(err);
    }
  }

  /**
   * 下一页
   */
  async nextPage() {
    if (!this.canNextPage) {
      console.log('📘 Already on last page');
      return;
    }

    try {
      const newIndex = await bookApi.nextPage();
      if (this.state.currentBook) {
        this.state.currentBook.currentPage = newIndex;
        await this.syncInfoPanelBookInfo();
        this.syncAppStateBookSlice('user');

        // 【单文件模式】更新当前文件路径
        if (this.state.singleFileMode) {
          const currentPage = this.state.currentBook.pages?.[newIndex];
          if (currentPage) {
            this.state.originalFilePath = currentPage.path;
          }
        }

        // 【优化】更新历史记录（支持单文件模式）
        const historyPath = this.getHistoryPath();
        if (historyPath) {
          const { historyStore } = await import('$lib/stores/history.svelte');
          historyStore.update(historyPath, newIndex, this.state.currentBook.totalPages);
        }
      }

      this.showPageSwitchToastIfEnabled();
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to next page:', err);
      this.state.error = String(err);
    }
  }

  /**
   * 上一页
   */
  async previousPage() {
    if (!this.canPreviousPage) {
      console.log('📘 Already on first page');
      return;
    }

    try {
      const newIndex = await bookApi.previousPage();
      if (this.state.currentBook) {
        this.state.currentBook.currentPage = newIndex;
        await this.syncInfoPanelBookInfo();
        this.syncAppStateBookSlice('user');

        // 【单文件模式】更新当前文件路径
        if (this.state.singleFileMode) {
          const currentPage = this.state.currentBook.pages?.[newIndex];
          if (currentPage) {
            this.state.originalFilePath = currentPage.path;
          }
        }

        // 【优化】更新历史记录（支持单文件模式）
        const historyPath = this.getHistoryPath();
        if (historyPath) {
          const { historyStore } = await import('$lib/stores/history.svelte');
          historyStore.update(historyPath, newIndex, this.state.currentBook.totalPages);
        }
      }
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to previous page:', err);
      this.state.error = String(err);
    }
  }

  /**
   * 打开当前排序列表的下一/上一部书
   * 优先使用 FolderPanel 的排序（异步加载），回退到 FileBrowser
   */
  private async openAdjacentBook(direction: 'next' | 'previous') {
    const currentPath = this.state.currentBook?.path ?? null;
    
    // 使用 FolderPanel 的异步版本，会自动从文件系统加载
    const { folderPanelActions } = await import('$lib/components/panels/folderPanel/stores/folderPanelStore.svelte');
    let targetPath = await folderPanelActions.findAdjacentBookPathAsync(currentPath, direction);
    
    // 如果 FolderPanel 没有数据，回退到 FileBrowser
    if (!targetPath) {
      targetPath = fileBrowserStore.findAdjacentBookPath(currentPath, direction);
    }
    
    if (!targetPath) {
      console.warn(`⚠️ No ${direction} book found from`, currentPath);
      return;
    }
    await this.openBook(targetPath);
  }

  private syncFileBrowserSelection(path: string) {
    try {
      fileBrowserStore.selectPath(path);
    } catch (error) {
      console.debug('syncFileBrowserSelection failed:', error);
    }
  }

  private clampInitialPage(totalPages: number, requested?: number): number {
    if (!totalPages || totalPages <= 0) {
      return 0;
    }
    if (requested === undefined || requested === null || Number.isNaN(requested)) {
      return 0;
    }
    const safeValue = Math.trunc(requested);
    const maxIndex = Math.max(totalPages - 1, 0);
    return Math.min(Math.max(safeValue, 0), maxIndex);
  }

  async openNextBook() {
    await this.openAdjacentBook('next');
  }

  async openPreviousBook() {
    await this.openAdjacentBook('previous');
  }

  /**
   * 第一页
   */
  async firstPage() {
    await this.navigateToPage(0);
  }

  /**
   * 最后一页
   */
  async lastPage() {
    if (!this.state.currentBook) return;
    await this.navigateToPage(this.state.currentBook.totalPages - 1);
  }

  /**
   * 跳转到指定页 (别名)
   */
  async goToPage(index: number) {
    await this.navigateToPage(index);
  }

  /**
   * 切换页面排序模式
   */
  async setSortMode(sortMode: PageSortMode) {
    if (!this.state.currentBook) return;
    if (this.state.currentBook.sortMode === sortMode) return;

    try {
      const updatedBook = await bookApi.setBookSortMode(sortMode);
      this.state.currentBook = updatedBook;
      this.syncAppStateBookSlice('user');
      await this.syncInfoPanelBookInfo();

      const { historyStore } = await import('$lib/stores/history.svelte');
      historyStore.update(updatedBook.path, updatedBook.currentPage, updatedBook.totalPages);
    } catch (err) {
      console.error('❌ Error setting sort mode:', err);
      this.state.error = String(err);
    }
  }

  /**
   * 关闭书籍
   */
  async closeBook() {
    // 触发重置预超分进度事件
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
    await this.closeViewer();
  }

  /**
   * 关闭书籍 (别名)
   */
  async closeFile() {
    await this.closeBook();
  }

  /**
   * 刷新当前书籍信息
   */
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

  /**
   * 设置错误信息
   */
  setError(message: string) {
    this.state.error = message;
  }

  /**
   * 清除错误信息
   */
  clearError() {
    this.state.error = '';
  }

  // === 超分缓存管理 ===

  private getCurrentBookCacheKey(): string {
    return this.state.currentBook?.path ?? '__global__';
  }

  private getOrCreateBookCache(bookPath: string) {
    if (!this.upscaleCacheMapByBook.has(bookPath)) {
      this.upscaleCacheMapByBook.set(bookPath, new SvelteMap());
    }
    return this.upscaleCacheMapByBook.get(bookPath)!;
  }

  /**
   * 记录超分缓存关系
   */
  recordUpscaleCache(
    hash: string,
    model: string,
    scale: number,
    cachePath: string,
    originalPath: string,
    innerPath?: string
  ) {
    const bookPath = this.state.currentBook?.path ?? originalPath ?? this.getCurrentBookCacheKey();
    const bookCache = this.getOrCreateBookCache(bookPath);
    bookCache.set(hash, {
      model,
      scale,
      cachePath,
      originalPath,
      innerPath,
      timestamp: Date.now()
    });
    console.log('💾 记录超分缓存:', hash, '->', cachePath, `(book: ${bookPath})`);
  }

  /**
   * 检查是否有超分缓存
   */
  getUpscaleCache(hash: string, model: string, scale: number) {
    const bookPath = this.state.currentBook?.path ?? this.getCurrentBookCacheKey();
    const bookCache = this.upscaleCacheMapByBook.get(bookPath);
    if (!bookCache) {
      return null;
    }
    const cache = bookCache.get(hash);
    if (cache && cache.model === model && cache.scale === scale) {
      // 检查缓存文件是否仍然存在
      return cache;
    }
    return null;
  }

  /**
   * 获取所有超分缓存
   */
  getAllUpscaleCaches() {
    const allEntries: Array<[string, Map<string, {
      model: string;
      scale: number;
      cachePath: string;
      originalPath: string;
      innerPath?: string;
      timestamp: number;
    }>]> = [];
    for (const [bookPath, cacheMap] of this.upscaleCacheMapByBook.entries()) {
      allEntries.push([bookPath, new Map(cacheMap)]);
    }
    return allEntries;
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCaches(maxAge: number = 30 * 24 * 60 * 60 * 1000) { // 默认30天
    const now = Date.now();
    let cleaned = 0;

    for (const [bookPath, cacheMap] of this.upscaleCacheMapByBook.entries()) {
      for (const [hash, cache] of cacheMap.entries()) {
        if (now - cache.timestamp > maxAge) {
          cacheMap.delete(hash);
          cleaned++;
        }
      }
      if (cacheMap.size === 0) {
        this.upscaleCacheMapByBook.delete(bookPath);
      }
    }

    console.log('🧹 清理过期缓存:', cleaned, '个');
    return cleaned;
  }

  // === 每页超分状态管理 ===

  /**
   * 获取指定页面的超分状态
   */
  getPageUpscaleStatus(pageIndex: number): 'none' | 'preupscaled' | 'done' | 'failed' {
    return this.upscaleStatusByPage.get(pageIndex) || 'none';
  }

  /**
   * 设置指定页面的超分状态
   */
  setPageUpscaleStatus(pageIndex: number, status: 'none' | 'preupscaled' | 'done' | 'failed') {
    const nextMap = new SvelteMap(this.upscaleStatusByPage);
    nextMap.set(pageIndex, status);
    this.upscaleStatusByPage = nextMap;
    console.log(`📄 页面 ${pageIndex + 1} 超分状态更新为:`, status);
  }

  /**
   * 获取所有页面的超分状态
   */
  getAllPageUpscaleStatus(): Map<number, 'none' | 'preupscaled' | 'done' | 'failed'> {
    return new Map(this.upscaleStatusByPage);
  }

  /**
   * 重置所有页面的超分状态（书籍切换时调用）
   */
  resetAllPageUpscaleStatus() {
    this.upscaleStatusByPage = new SvelteMap();
    console.log('🔄 已重置所有页面超分状态');
  }

  /**
   * 获取预超分覆盖范围（最远已预超分的页面索引）
   */
  getFurthestPreUpscaledIndex(): number {
    let furthestIndex = -1;
    for (const [pageIndex, status] of this.upscaleStatusByPage.entries()) {
      if (status === 'preupscaled' || status === 'done') {
        furthestIndex = Math.max(furthestIndex, pageIndex);
      }
    }
    return furthestIndex;
  }

  /**
   * 获取已预超分的页面集合
   */
  getPreUpscaledPages(): Set<number> {
    const pages = new SvelteSet<number>();
    for (const [pageIndex, status] of this.upscaleStatusByPage.entries()) {
      if (status === 'preupscaled' || status === 'done') {
        pages.add(pageIndex);
      }
    }
    return pages;
  }

  // === 统一的 hash 获取 API ===

  /**
   * 获取指定页面的稳定哈希值
   */
  getPageHash(pageIndex: number): string | null {
    const book = this.state.currentBook;
    if (!book) return null;
    const page = book.pages[pageIndex];
    return page?.stableHash ?? null;
  }

  /**
   * 获取当前页面的稳定哈希值
   */
  getCurrentPageHash(): string | null {
    return this.getPageHash(this.currentPageIndex);
  }

  getCurrentBookPageContext(): SwitchToastContext {
    return this.buildSwitchToastContext();
  }

  private getSwitchToastConfig() {
    const settings = settingsManager.getSettings();
    const view = settings.view;
    const base = view.switchToast ?? {
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
    return base;
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
      const progressPercent =
        totalPages > 0 ? (safeCurrent / totalPages) * 100 : null;

      const emmRaw: Record<string, unknown> | undefined = emm
        ? this.mapEmmToRaw(emm)
        : undefined;

      const emmTranslatedTitle = emm?.translated_title;

      bookCtx = {
        name: book.name,
        displayName:
          emmTranslatedTitle && emmTranslatedTitle !== book.name
            ? emmTranslatedTitle
            : book.name,
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
      const dimensionsFormatted =
        page.width && page.height ? `${page.width} × ${page.height}` : undefined;
      const sizeFormatted =
        typeof page.size === 'number'
          ? this.formatBytesShort(page.size) ?? undefined
          : undefined;
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

  private renderSwitchToastTemplate(template: string | undefined, context: SwitchToastContext): string {
    if (!template) return '';

    return template.replace(/{{\s*([^}]+?)\s*}}/g, (match, expr) => {
      const path = String(expr || '');
      if (!path.startsWith('book.') && !path.startsWith('page.')) {
        return match;
      }

      const [root, ...segments] = path.split('.');
      let value: unknown =
        root === 'book' ? context.book : root === 'page' ? context.page : undefined;

      for (const segment of segments) {
        if (value == null || typeof value !== 'object') {
          value = undefined;
          break;
        }
        const obj = value as Record<string, unknown>;
        value = obj[segment];
      }

      if (value === undefined || value === null) {
        return '';
      }
      if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : '';
      }
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      return String(value);
    });
  }

  private showBookSwitchToastIfEnabled() {
    const book = this.state.currentBook;
    if (!book) return;

    const cfg = this.getSwitchToastConfig();
    if (!cfg.enableBook) return;

    const context = this.buildSwitchToastContext();
    const titleFromTemplate = cfg.bookTitleTemplate
      ? this.renderSwitchToastTemplate(cfg.bookTitleTemplate, context).trim()
      : '';
    const descriptionFromTemplate = cfg.bookDescriptionTemplate
      ? this.renderSwitchToastTemplate(cfg.bookDescriptionTemplate, context).trim()
      : '';

    if (titleFromTemplate || descriptionFromTemplate) {
      const effectiveTitle =
        titleFromTemplate || (context.book?.displayName ?? book.name);

      showToast({
        title: effectiveTitle,
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
      const label = this.formatBookTypeLabel(book.type as string);
      if (label) parts.push(label);
    }

    if (cfg.showBookPath && book.path) {
      parts.push(book.path);
    }

    const description = parts.join(' • ') || undefined;

    showToast({
      title: book.name,
      description,
      variant: 'info'
    });
  }

  private showPageSwitchToastIfEnabled() {
    const book = this.state.currentBook;
    const page = this.currentPage;
    if (!book || !page) return;

    const cfg = this.getSwitchToastConfig();
    if (!cfg.enablePage) return;

    const context = this.buildSwitchToastContext();
    const titleFromTemplate = cfg.pageTitleTemplate
      ? this.renderSwitchToastTemplate(cfg.pageTitleTemplate, context).trim()
      : '';
    const descriptionFromTemplate = cfg.pageDescriptionTemplate
      ? this.renderSwitchToastTemplate(cfg.pageDescriptionTemplate, context).trim()
      : '';

    if (titleFromTemplate || descriptionFromTemplate) {
      const effectiveTitle =
        titleFromTemplate ||
        (context.page?.displayName || page.name || `第 ${book.currentPage + 1} 页`);

      showToast({
        title: effectiveTitle,
        description: descriptionFromTemplate || undefined,
        variant: 'info'
      });
      return;
    }

    const parts: string[] = [];

    if (cfg.showPageIndex && book.totalPages > 0) {
      const current = Math.min(book.currentPage + 1, book.totalPages);
      parts.push(`第 ${current} / ${book.totalPages} 页`);
    }

    if (cfg.showPageDimensions && page.width && page.height) {
      parts.push(`${page.width} × ${page.height}`);
    }

    if (cfg.showPageSize && typeof page.size === 'number') {
      const sizeStr = this.formatBytesShort(page.size);
      if (sizeStr) parts.push(sizeStr);
    }

    const description = parts.join(' • ') || undefined;

    showToast({
      title: page.name || `第 ${book.currentPage + 1} 页`,
      description,
      variant: 'info'
    });
  }

  private formatBytesShort(bytes?: number): string | null {
    if (bytes === undefined || bytes === null) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private formatBookTypeLabel(type?: string): string | null {
    if (!type) return null;
    switch (type.toLowerCase()) {
      case 'folder':
        return '文件夹';
      case 'archive':
        return '压缩包';
      case 'pdf':
        return 'PDF';
      case 'media':
        return '媒体';
      default:
        return type;
    }
  }

  /**
   * 将 EMM 元数据转换为原始记录对象
   */
  private mapEmmToRaw(emm: EMMMetadata): Record<string, unknown> {
    return {
      id: emm.id,
      title: emm.title,
      title_jpn: emm.title_jpn,
      hash: emm.hash,
      coverPath: emm.cover_path,
      filepath: emm.filepath,
      type: emm.type,
      pageCount: emm.page_count,
      bundleSize: emm.bundle_size,
      mtime: emm.mtime,
      coverHash: emm.cover_hash,
      status: emm.status,
      date: emm.date,
      filecount: emm.filecount,
      posted: emm.posted,
      filesize: emm.filesize,
      category: emm.category,
      url: emm.url,
      mark: emm.mark,
      hiddenBook: emm.hidden_book,
      readCount: emm.read_count,
      exist: emm.exist,
      createdAt: emm.created_at,
      updatedAt: emm.updated_at
    };
  }

  private async syncInfoPanelBookInfo() {
    const book = this.state.currentBook;
    if (!book) {
      console.debug('[BookStore] syncInfoPanelBookInfo: 没有当前书籍');
      infoPanelStore.resetBookInfo();
      return;
    }

    console.debug('[BookStore] syncInfoPanelBookInfo: 开始加载 EMM 元数据，book:', book.name, 'path:', book.path);

    // 加载 EMM 元数据
    const emmMetadata = await emmMetadataStore.loadMetadataByPath(book.path);
    this.lastEmmMetadataForCurrentBook = emmMetadata;
    console.debug('[BookStore] syncInfoPanelBookInfo: EMM 元数据加载完成，metadata:', emmMetadata);

    const bookInfo = {
      path: book.path,
      name: book.name,
      type: book.type,
      totalPages: book.totalPages,
      currentPage: book.totalPages === 0 ? 0 : book.currentPage + 1,
      emmMetadata: emmMetadata
        ? {
          translatedTitle: emmMetadata.translated_title,
          tags: emmMetadata.tags,
          rating: emmMetadata.rating,
          raw: this.mapEmmToRaw(emmMetadata),
        }
        : undefined,
    };

    console.debug('[BookStore] syncInfoPanelBookInfo: 设置书籍信息到 InfoPanel，bookInfo:', bookInfo);
    infoPanelStore.setBookInfo(bookInfo);
  }

  private computePageWindowState(currentIndex: number, totalPages: number, radius: number) {
    const forward: number[] = [];
    const backward: number[] = [];
    for (let i = 1; i <= radius; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex < totalPages) {
        forward.push(nextIndex);
      }
      const prevIndex = currentIndex - i;
      if (prevIndex >= 0) {
        backward.push(prevIndex);
      }
    }
    return {
      center: currentIndex,
      forward,
      backward,
      stale: false
    };
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
          pageWindow: {
            center: 0,
            forward: [],
            backward: [],
            stale: true
          },
          jumpHistory: [],
          taskCursor: {
            ...snapshot.viewer.taskCursor,
            centerIndex: 0,
            oldestPendingIdx: 0,
            furthestReadyIdx: 0,
            activeBuckets: snapshot.viewer.taskCursor.activeBuckets
          }
        }
      });
      return;
    }

    const preloadRadius =
      snapshot.settings.performance?.preLoadSize ?? PAGE_WINDOW_PADDING;
    const radius = Math.max(1, Math.max(PAGE_WINDOW_PADDING, preloadRadius));
    const pageWindow = this.computePageWindowState(bookSlice.currentPageIndex, bookSlice.totalPages, radius);
    const jumpEntry = {
      index: bookSlice.currentPageIndex,
      timestamp: Date.now(),
      source
    };
    const jumpHistory = [jumpEntry, ...snapshot.viewer.jumpHistory].slice(0, JUMP_HISTORY_LIMIT);

    appState.update({
      book: bookSlice,
      viewer: {
        ...snapshot.viewer,
        pageWindow,
        jumpHistory,
        taskCursor: {
          ...snapshot.viewer.taskCursor,
          centerIndex: bookSlice.currentPageIndex
        }
      }
    });
  }
}

// 导出单例
export const bookStore = new BookStore();
