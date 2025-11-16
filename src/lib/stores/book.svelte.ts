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
  currentPageUpscaled: boolean; // 当前页面是否已超分成功
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

  // 超分缓存映射: hash -> { model, cachePath, originalPath, innerPath }
  private upscaleCacheMap = $state<Map<string, {
    model: string;
    scale: number;
    cachePath: string;
    originalPath: string;
    innerPath?: string;
    timestamp: number;
  }>>(new Map());

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
  async openBook(path: string) {
    try {
      console.log('📖 Opening book:', path);
      this.state.loading = true;
      this.state.error = '';

      // 清除旧书的状态
      this.state.currentImage = null;
      this.state.upscaledImageData = null;
      this.state.upscaledImageBlob = null;
      this.state.currentPageUpscaled = false;

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      // 重置页码到第一页
      book.currentPage = 0;
      
      this.state.currentBook = book;
      this.state.viewerOpen = true;
      
      // 重置所有页面的超分状态
      this.resetAllPageUpscaleStatus();
      
      // 触发重置预超分进度事件
      window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
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

      // 清除旧书的状态
      this.state.currentImage = null;
      this.state.upscaledImageData = null;
      this.state.upscaledImageBlob = null;
      this.state.currentPageUpscaled = false;

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      // 重置页码到第一页
      book.currentPage = 0;
      
      this.state.currentBook = book;
      this.state.viewerOpen = true;
      
      // 重置所有页面的超分状态
      this.resetAllPageUpscaleStatus();
      
      // 触发重置预超分进度事件
      window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
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

      // 清除旧书的状态
      this.state.currentImage = null;
      this.state.upscaledImageData = null;
      this.state.upscaledImageBlob = null;
      this.state.currentPageUpscaled = false;

      // 使用通用的 openBook API (它会自动检测类型)
      const book = await bookApi.openBook(path);
      console.log('✅ Book opened:', book.name, 'with', book.totalPages, 'pages');

      // 重置页码到第一页
      book.currentPage = 0;
      
      this.state.currentBook = book;
      this.state.viewerOpen = true;
      
      // 重置所有页面的超分状态
      this.resetAllPageUpscaleStatus();
      
      // 触发重置预超分进度事件
      window.dispatchEvent(new CustomEvent('reset-pre-upscale-progress'));
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
    this.state.currentPageUpscaled = false;
    
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
    this.upscaleCacheMap.set(hash, {
      model,
      scale,
      cachePath,
      originalPath,
      innerPath,
      timestamp: Date.now()
    });
    console.log('💾 记录超分缓存:', hash, '->', cachePath);
  }

  /**
   * 检查是否有超分缓存
   */
  getUpscaleCache(hash: string, model: string, scale: number) {
    const cache = this.upscaleCacheMap.get(hash);
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
    return Array.from(this.upscaleCacheMap.entries());
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCaches(maxAge: number = 30 * 24 * 60 * 60 * 1000) { // 默认30天
    const now = Date.now();
    let cleaned = 0;
    
    for (const [hash, cache] of this.upscaleCacheMap.entries()) {
      if (now - cache.timestamp > maxAge) {
        this.upscaleCacheMap.delete(hash);
        cleaned++;
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
    this.upscaleStatusByPage.set(pageIndex, status);
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
    this.upscaleStatusByPage.clear();
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
}

// 导出单例
export const bookStore = new BookStore();
