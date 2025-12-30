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

    const targetPage = clampInitialPage(book.totalPages, options.initialPage);
    book.currentPage = targetPage;

    this.state.currentBook = book;
    this.syncAppStateBookSlice();
    this.state.viewerOpen = true;
    
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
        unifiedHistoryStore.add(pathStack, targetPage, book.totalPages, { displayName: book.name });
      }).catch(() => {});
    }

    this.showBookSwitchToastIfEnabled();
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
  }

  async openDirectoryAsBook(path: string, options: OpenBookOptions = {}) {
    await this.openBook(path, options);
  }

  closeViewer() {
    this.state.viewerOpen = false;
    this.state.currentBook = null;
    this.syncAppStateBookSlice();
    this.lastEmmMetadataForCurrentBook = null;
    this.state.upscaledImageData = null;
    infoPanelStore.resetAll();
    window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
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

    try {
      await bookApi.navigateToPage(index);
      this.state.currentBook.currentPage = index;
      this.syncAppStateBookSlice('user');
      this.syncInfoPanelBookInfo();

      if (this.state.singleFileMode) {
        const currentPage = this.state.currentBook.pages?.[index];
        if (currentPage) {
          this.state.originalFilePath = currentPage.path;
          const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
          const name = currentPage.name || currentPage.path.split(/[\\/]/).pop() || currentPage.path;
          const pathStack = this.buildPathStack();
          unifiedHistoryStore.add(pathStack, index, this.state.currentBook.totalPages, { displayName: name });
        }
      } else {
        const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
        const pathStack = this.buildPathStack();
        unifiedHistoryStore.updateIndex(pathStack, index, this.state.currentBook.totalPages);
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

  async nextPage() {
    if (!this.canNextPage) return;
    try {
      const newIndex = await bookApi.nextPage();
      if (this.state.currentBook) {
        this.state.currentBook.currentPage = newIndex;
        await this.syncInfoPanelBookInfo();
        this.syncAppStateBookSlice('user');
        await this.updateHistoryAfterNavigation(newIndex);
      }
      this.showPageSwitchToastIfEnabled();
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to next page:', err);
      this.state.error = String(err);
    }
  }

  async previousPage() {
    if (!this.canPreviousPage) return;
    try {
      const newIndex = await bookApi.previousPage();
      if (this.state.currentBook) {
        this.state.currentBook.currentPage = newIndex;
        await this.syncInfoPanelBookInfo();
        this.syncAppStateBookSlice('user');
        await this.updateHistoryAfterNavigation(newIndex);
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
        unifiedHistoryStore.add(pathStack, newIndex, book.totalPages, { displayName: name });
      }
    } else {
      const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
      const pathStack = this.buildPathStack();
      unifiedHistoryStore.updateIndex(pathStack, newIndex, book.totalPages);
    }
  }


  // ==================== 书籍切换 ====================

  private async openAdjacentBook(direction: 'next' | 'previous') {
    const currentPath = this.state.currentBook?.path ?? null;
    const { folderPanelActions } = await import('$lib/components/panels/folderPanel/stores/folderPanelStore');
    const { folderTabActions } = await import('$lib/components/panels/folderPanel/stores/folderTabStore');
    
    // 从 folderTabStore 获取当前活动标签页的排序设置
    const activeTab = folderTabActions.getActiveTab();
    const sortOptions = {
      sortField: (activeTab?.sortField || 'name') as 'name' | 'date' | 'size' | 'type' | 'random' | 'rating' | 'path' | 'collectTagCount',
      sortOrder: (activeTab?.sortOrder || 'asc') as 'asc' | 'desc'
    };
    console.log('[openAdjacentBook] 使用排序设置（来自 folderTabStore）', sortOptions);
    
    let targetPath = await folderPanelActions.findAdjacentBookPathAsync(currentPath, direction, sortOptions);
    
    if (!targetPath) {
      targetPath = fileBrowserStore.findAdjacentBookPath(currentPath, direction);
    }
    
    if (!targetPath) return;
    await this.openBook(targetPath);
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
