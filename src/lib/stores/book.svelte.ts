/**
 * NeoView - Book Store
 * 书籍状态管理 Store (Svelte 5 Runes)
 */

import type { BookInfo, Page, PageSortMode } from '../types';
import * as bookApi from '../api/book';
import { infoPanelStore } from './infoPanel.svelte';
import { appState, type ViewerJumpSource, type PageWindowState } from '$lib/core/state/appState';
import { emmMetadataStore } from './emmMetadata.svelte';
import { fileBrowserStore } from './fileBrowser.svelte';

const PAGE_WINDOW_PADDING = 8;
const JUMP_HISTORY_LIMIT = 20;

interface BookState {
  currentBook: BookInfo | null;
  loading: boolean;
  error: string;
  viewerOpen: boolean;
  currentImage: Page | null;
  upscaledImageData: string | null; // 保持兼容性，用于显示
  upscaledImageBlob: Blob | null; // 新增：存储二进制数据
  currentPageUpscaled: boolean; // 当前页面是否已超分成功
}

interface OpenBookOptions {
  /** 打开时希望跳转到的页面 */
  initialPage?: number;
}

class BookStore {
  private state = $state<BookState>({
    currentBook: null,
    loading: false,
    error: '',
    viewerOpen: false,
    currentImage: null,
    upscaledImageData: null,
    upscaledImageBlob: null,
    currentPageUpscaled: false,
  });

  // 每页超分状态映射: pageIndex -> 'none' | 'preupscaled' | 'done' | 'failed'
  private upscaleStatusByPage = $state<Map<number, 'none' | 'preupscaled' | 'done' | 'failed'>>(new Map());

  // 超分缓存映射: bookPath -> (hash -> cacheEntry)
  private upscaleCacheMapByBook = $state<Map<string, Map<string, {
    model: string;
    scale: number;
    cachePath: string;
    originalPath: string;
    innerPath?: string;
    timestamp: number;
  }>>>(new Map());

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

  get currentImage() {
    return this.state.currentImage;
  }

  get upscaledImageData() {
    return this.state.upscaledImageData;
  }

  get upscaledImageBlob() {
    return this.state.upscaledImageBlob;
  }

  get currentPageUpscaled() {
    return this.state.currentPageUpscaled;
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
      this.state.currentImage = null;
      this.state.upscaledImageData = null;
      this.state.upscaledImageBlob = null;
      this.state.currentPageUpscaled = false;
      infoPanelStore.resetAll();

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      const targetPage = this.clampInitialPage(book.totalPages, options.initialPage);
      book.currentPage = targetPage;

      this.state.currentBook = book;
      this.syncAppStateBookSlice();
      this.state.viewerOpen = true;
      if (targetPage > 0 && book.totalPages > 0) {
        try {
          await bookApi.navigateToPage(targetPage);
        } catch (navErr) {
          console.error('❌ Error navigating to initial page after open:', navErr);
        }
      }
      await this.syncInfoPanelBookInfo();
      this.syncFileBrowserSelection(path);

      // 添加到历史记录（使用实际起始页）
      const { historyStore } = await import('$lib/stores/history.svelte');
      historyStore.add(path, book.name, targetPage, book.totalPages);

      // 重置所有页面的超分状态
      this.resetAllPageUpscaleStatus();

      // 触发重置预超分进度事件
      window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
    } catch (err) {
      console.error('❌ Error opening book:', err);
      this.state.error = String(err);
      this.state.currentBook = null;
      this.syncAppStateBookSlice();
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
   * 打开压缩包作为 Book
   */
  async openArchiveAsBook(path: string, options: OpenBookOptions = {}) {
    console.log('📦 Opening archive as book:', path);
    await this.openBook(path, options);
  }

  /**
   * 关闭查看器
   */
  closeViewer() {
    this.state.viewerOpen = false;
    this.state.currentBook = null;
    this.syncAppStateBookSlice();
    this.state.currentImage = null;
    this.state.upscaledImageData = null;
    this.state.upscaledImageBlob = null;
    this.state.currentPageUpscaled = false;
    infoPanelStore.resetAll();

    // 重置页面超分状态
    this.resetAllPageUpscaleStatus();

    // 触发重置预超分进度事件
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
  }

  /**
   * 设置当前图片
   */
  setCurrentImage(page: Page | null) {
    this.state.currentImage = page;
    // 切换图片时立即清除超分结果，让系统重新检查缓存
    this.state.upscaledImageData = null;
    this.state.upscaledImageBlob = null;
    this.state.currentPageUpscaled = false;
  }

  /**
   * 设置当前页面超分状态
   */
  setCurrentPageUpscaled(upscaled: boolean) {
    this.state.currentPageUpscaled = upscaled;
  }

  /**
   * 设置超分图片数据
   */
  setUpscaledImage(data: string | null) {
    this.state.upscaledImageData = data;
  }

  /**
   * 设置超分图片二进制数据
   */
  setUpscaledImageBlob(blob: Blob | null) {
    this.state.upscaledImageBlob = blob;
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

      // 更新历史记录的页数
      const { historyStore } = await import('$lib/stores/history.svelte');
      historyStore.update(this.state.currentBook.path, index, this.state.currentBook.totalPages);
    } catch (err) {
      console.error('❌ Error navigating to page:', err);
      this.state.error = String(err);
    }
  }

  async navigateToImage(imagePath: string) {
    if (!this.state.currentBook) return;

    try {
      const index = await bookApi.navigateToImage(imagePath);
      if (!this.state.currentBook) return;

      this.state.currentBook.currentPage = index;
      this.syncAppStateBookSlice('user');
      await this.syncInfoPanelBookInfo();

      const { historyStore } = await import('$lib/stores/history.svelte');
      historyStore.update(this.state.currentBook.path, index, this.state.currentBook.totalPages);
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

        // 更新历史记录的页数
        const { historyStore } = await import('$lib/stores/history.svelte');
        historyStore.update(this.state.currentBook.path, newIndex, this.state.currentBook.totalPages);
      }
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to next page:', err);
      this.state.error = String(err);
    }
  }

  /**
   * 上一页 (别名)
   */
  async prevPage() {
    return await this.previousPage();
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

        // 更新历史记录的页数
        const { historyStore } = await import('$lib/stores/history.svelte');
        historyStore.update(this.state.currentBook.path, newIndex, this.state.currentBook.totalPages);
      }
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to previous page:', err);
      this.state.error = String(err);
    }
  }

  /**
   * 打开当前排序列表的下一/上一部书
   */
  private async openAdjacentBook(direction: 'next' | 'previous') {
    const currentPath = this.state.currentBook?.path ?? null;
    const targetPath = fileBrowserStore.findAdjacentBookPath(currentPath, direction);
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
      this.upscaleCacheMapByBook.set(bookPath, new Map());
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
    const nextMap = new Map(this.upscaleStatusByPage);
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
    this.upscaleStatusByPage = new Map();
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
    const pages = new Set<number>();
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
          raw: {
            id: emmMetadata.id,
            title: emmMetadata.title,
            title_jpn: emmMetadata.title_jpn,
            hash: emmMetadata.hash,
            coverPath: emmMetadata.cover_path,
            filepath: emmMetadata.filepath,
            type: emmMetadata.type,
            pageCount: emmMetadata.page_count,
            bundleSize: emmMetadata.bundle_size,
            mtime: emmMetadata.mtime,
            coverHash: emmMetadata.cover_hash,
            status: emmMetadata.status,
            date: emmMetadata.date,
            filecount: emmMetadata.filecount,
            posted: emmMetadata.posted,
            filesize: emmMetadata.filesize,
            category: emmMetadata.category,
            url: emmMetadata.url,
            mark: emmMetadata.mark,
            hiddenBook: emmMetadata.hidden_book,
            readCount: emmMetadata.read_count,
            exist: emmMetadata.exist,
            createdAt: emmMetadata.created_at,
            updatedAt: emmMetadata.updated_at,
            // rating 和 tags 在外层已有，这里不重复
          },
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
