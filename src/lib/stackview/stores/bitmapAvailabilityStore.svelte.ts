/**
 * BitmapAvailabilityStore - 追踪 ImageBitmap 就绪状态（Svelte 5 响应式）
 * 
 * 用于通知渲染组件（如 FrameImage）何时可以切换到 Canvas 模式
 */

class BitmapAvailabilityStore {
  /** 响应式版本号 */
  version = $state(0);
  
  /** 已就绪的页面索引集合 */
  private readyPages = new Set<number>();
  
  /** 当前书籍路径 */
  private currentBookPath: string | null = null;
  
  /**
   * 标记页面 Bitmap 已就绪
   */
  markReady(pageIndex: number) {
    if (!this.readyPages.has(pageIndex)) {
      this.readyPages.add(pageIndex);
      this.version++;
    }
  }
  
  /**
   * 检查页面是否就绪
   */
  isReady(pageIndex: number): boolean {
    // 访问 version 建立依赖
    void this.version;
    return this.readyPages.has(pageIndex);
  }
  
  /**
   * 设置当前书籍（清空状态）
   */
  setCurrentBook(bookPath: string) {
    if (this.currentBookPath !== bookPath) {
      this.currentBookPath = bookPath;
      this.clear();
    }
  }
  
  /**
   * 清空状态
   */
  clear() {
    this.readyPages.clear();
    this.version++;
  }
}

export const bitmapAvailabilityStore = new BitmapAvailabilityStore();
