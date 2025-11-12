/**
 * NeoView - Book Store
 * 书籍状态管理 Store (Svelte 5 Runes)
 */

import type { BookInfo, Page } from '../types';
import * as bookApi from '../api/book';

interface BookState {
  currentBook: BookInfo | null;
  loading: boolean;
  error: string;
  viewerOpen: boolean;
  currentImage: Page | null;
  upscaledImageData: string | null; // 保持兼容性，用于显示
  upscaledImageBlob: Blob | null; // 新增：存储二进制数据
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
  });

  // === Getters ===
  get currentBook() {
    return this.state.currentBook;
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
  async openBook(path: string) {
    try {
      console.log('📖 Opening book:', path);
      this.state.loading = true;
      this.state.error = '';

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      this.state.currentBook = book;
      this.state.viewerOpen = true;
    } catch (err) {
      console.error('❌ Error opening book:', err);
      this.state.error = String(err);
      this.state.currentBook = null;
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * 打开文件夹作为 Book
   */
  async openDirectoryAsBook(path: string) {
    try {
      console.log('📖 Opening directory as book:', path);
      this.state.loading = true;
      this.state.error = '';

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      this.state.currentBook = book;
      this.state.viewerOpen = true;
    } catch (err) {
      console.error('❌ Error opening directory as book:', err);
      this.state.error = String(err);
      this.state.currentBook = null;
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * 打开压缩包作为 Book
   */
  async openArchiveAsBook(path: string) {
    try {
      console.log('📦 Opening archive as book:', path);
      this.state.loading = true;
      this.state.error = '';

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      this.state.currentBook = book;
      this.state.viewerOpen = true;
    } catch (err) {
      console.error('❌ Error opening archive as book:', err);
      this.state.error = String(err);
      this.state.currentBook = null;
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * 关闭查看器
   */
  closeViewer() {
    this.state.viewerOpen = false;
    this.state.currentBook = null;
    this.state.currentImage = null;
    this.state.upscaledImageData = null;
    this.state.upscaledImageBlob = null;
  }

  /**
   * 设置当前图片
   */
  setCurrentImage(page: Page | null) {
    this.state.currentImage = page;
    // 切换图片时不立即清除超分结果，让系统检查缓存
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
    } catch (err) {
      console.error('❌ Error navigating to page:', err);
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
      }
      return newIndex;
    } catch (err) {
      console.error('❌ Error going to previous page:', err);
      this.state.error = String(err);
    }
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
}

// 导出单例
export const bookStore = new BookStore();
