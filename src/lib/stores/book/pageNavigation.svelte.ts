/**
 * Book Store - 页面导航模块
 * 负责翻页逻辑和页面索引管理
 */

import type { BookInfo, Page } from '$lib/types';
import * as bookApi from '$lib/api/book';
import type { ContentRef } from './types';

/** 页面导航状态 */
export interface PageNavigationState {
  currentPageIndex: number;
  totalPages: number;
  canNextPage: boolean;
  canPreviousPage: boolean;
}

/** 页面导航回调 */
export interface PageNavigationCallbacks {
  onPageChanged?: (index: number, page: Page | null) => void | Promise<void>;
  getCurrentBook: () => BookInfo | null;
  updateCurrentPage: (index: number) => void;
  syncAppState: (source?: 'user' | 'system') => void;
  syncInfoPanel: () => void | Promise<void>;
  buildPathStack: () => ContentRef[];
  isSingleFileMode: () => boolean;
  getOriginalFilePath: () => string | null;
  setOriginalFilePath: (path: string | null) => void;
}

/** 页面导航管理器 */
export class PageNavigationManager {
  private callbacks: PageNavigationCallbacks;

  constructor(callbacks: PageNavigationCallbacks) {
    this.callbacks = callbacks;
  }

  getCurrentPage(): Page | null {
    const book = this.callbacks.getCurrentBook();
    if (!book) return null;
    return book.pages[book.currentPage] || null;
  }

  getCurrentPageIndex(): number {
    return this.callbacks.getCurrentBook()?.currentPage ?? 0;
  }

  getTotalPages(): number {
    return this.callbacks.getCurrentBook()?.totalPages ?? 0;
  }

  canGoNext(): boolean {
    const book = this.callbacks.getCurrentBook();
    return book !== null && book.currentPage < book.totalPages - 1;
  }

  canGoPrevious(): boolean {
    const book = this.callbacks.getCurrentBook();
    return book !== null && book.currentPage > 0;
  }

  getNavigationState(): PageNavigationState {
    const book = this.callbacks.getCurrentBook();
    return {
      currentPageIndex: book?.currentPage ?? 0,
      totalPages: book?.totalPages ?? 0,
      canNextPage: this.canGoNext(),
      canPreviousPage: this.canGoPrevious(),
    };
  }


  /** 翻到指定页 */
  async navigateToPage(index: number): Promise<void> {
    const book = this.callbacks.getCurrentBook();
    if (!book) return;

    const maxIndex = book.totalPages - 1;
    if (index < 0 || index > maxIndex) {
      console.warn('⚠️ Page index out of range:', index);
      return;
    }

    try {
      console.log(`📄 Navigating to page ${index + 1}/${book.totalPages}`);
      await bookApi.navigateToPage(index);
      this.callbacks.updateCurrentPage(index);
      this.callbacks.syncAppState('user');
      this.callbacks.syncInfoPanel();
      await this.updateHistoryAfterNavigation(index);

      if (this.callbacks.onPageChanged) {
        const page = this.getCurrentPage();
        await this.callbacks.onPageChanged(index, page);
      }
    } catch (err) {
      console.error('❌ Error navigating to page:', err);
      throw err;
    }
  }

  /** 通过图片路径导航 */
  async navigateToImage(
    imagePath: string,
    options: { skipHistoryUpdate?: boolean } = {}
  ): Promise<void> {
    const book = this.callbacks.getCurrentBook();
    if (!book) return;

    try {
      const index = await bookApi.navigateToImage(imagePath);
      const currentBook = this.callbacks.getCurrentBook();
      if (!currentBook) return;

      this.callbacks.updateCurrentPage(index);
      this.callbacks.syncAppState('user');
      await this.callbacks.syncInfoPanel();

      if (!options.skipHistoryUpdate) {
        const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
        const pathStack = this.callbacks.buildPathStack();
        unifiedHistoryStore.updateIndex(pathStack, index, currentBook.totalPages);
      }
    } catch (err) {
      console.error('❌ Error navigating to image:', err);
      throw err;
    }
  }

  /** 下一页 */
  async nextPage(): Promise<number | undefined> {
    if (!this.canGoNext()) {
      console.log('📘 Already on last page');
      return;
    }

    try {
      const newIndex = await bookApi.nextPage();
      const book = this.callbacks.getCurrentBook();
      
      if (book) {
        this.callbacks.updateCurrentPage(newIndex);
        await this.callbacks.syncInfoPanel();
        this.callbacks.syncAppState('user');
        await this.updateHistoryAfterNavigation(newIndex);

        if (this.callbacks.onPageChanged) {
          const page = this.getCurrentPage();
          await this.callbacks.onPageChanged(newIndex, page);
        }
      }
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to next page:', err);
      throw err;
    }
  }

  /** 上一页 */
  async previousPage(): Promise<number | undefined> {
    if (!this.canGoPrevious()) {
      console.log('📘 Already on first page');
      return;
    }

    try {
      const newIndex = await bookApi.previousPage();
      const book = this.callbacks.getCurrentBook();
      
      if (book) {
        this.callbacks.updateCurrentPage(newIndex);
        await this.callbacks.syncInfoPanel();
        this.callbacks.syncAppState('user');
        await this.updateHistoryAfterNavigation(newIndex);

        if (this.callbacks.onPageChanged) {
          const page = this.getCurrentPage();
          await this.callbacks.onPageChanged(newIndex, page);
        }
      }
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to previous page:', err);
      throw err;
    }
  }

  /** 第一页 */
  async firstPage(): Promise<void> {
    await this.navigateToPage(0);
  }

  /** 最后一页 */
  async lastPage(): Promise<void> {
    const book = this.callbacks.getCurrentBook();
    if (!book) return;
    await this.navigateToPage(book.totalPages - 1);
  }

  /** 跳转到指定页（别名） */
  async goToPage(index: number): Promise<void> {
    await this.navigateToPage(index);
  }

  /** 仅更新本地页码状态（不调用后端 API） */
  setCurrentPageIndexLocal(index: number): void {
    const book = this.callbacks.getCurrentBook();
    if (!book) return;
    const maxIndex = book.totalPages - 1;
    if (index < 0 || index > maxIndex) return;
    this.callbacks.updateCurrentPage(index);
  }

  /** 导航后更新历史记录 */
  private async updateHistoryAfterNavigation(newIndex: number): Promise<void> {
    const book = this.callbacks.getCurrentBook();
    if (!book) return;

    const isSingleFile = this.callbacks.isSingleFileMode();

    if (isSingleFile) {
      const currentPage = book.pages?.[newIndex];
      if (currentPage) {
        this.callbacks.setOriginalFilePath(currentPage.path);
        const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
        const name = currentPage.name || currentPage.path.split(/[\\/]/).pop() || currentPage.path;
        const pathStack = this.callbacks.buildPathStack();
        unifiedHistoryStore.add(pathStack, newIndex, book.totalPages, { displayName: name });
      }
    } else {
      const { unifiedHistoryStore } = await import('$lib/stores/unifiedHistory.svelte');
      const pathStack = this.callbacks.buildPathStack();
      unifiedHistoryStore.updateIndex(pathStack, newIndex, book.totalPages);
    }
  }
}


// ==================== 工具函数 ====================

/** 验证页面索引是否有效 */
export function isValidPageIndex(index: number, totalPages: number): boolean {
  return index >= 0 && index < totalPages;
}

/** 限制页面索引到有效范围 */
export function clampPageIndex(index: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.max(0, Math.min(index, totalPages - 1));
}

/** 计算页面窗口（用于预加载） */
export function calculatePageWindow(
  currentIndex: number,
  totalPages: number,
  windowSize: number
): { start: number; end: number; pages: number[] } {
  const halfWindow = Math.floor(windowSize / 2);
  let start = Math.max(0, currentIndex - halfWindow);
  let end = Math.min(totalPages - 1, currentIndex + halfWindow);

  if (end - start + 1 < windowSize) {
    if (start === 0) {
      end = Math.min(totalPages - 1, windowSize - 1);
    } else if (end === totalPages - 1) {
      start = Math.max(0, totalPages - windowSize);
    }
  }

  const pages: number[] = [];
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return { start, end, pages };
}
