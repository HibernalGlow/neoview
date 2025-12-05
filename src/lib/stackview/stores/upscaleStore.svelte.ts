/**
 * NeoView - Upscale Store V2
 * 超分状态管理（Svelte 5 Runes）
 *
 * 核心设计：
 * 1. 后端主导，前端只负责发请求和接收事件
 * 2. 超分图进入 imagePool，复用现有缩放/视图功能
 * 3. 使用 convertFileSrc 转换缓存路径为 URL
 * 4. 关闭超分时清除所有超分图，回退到原图
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SvelteMap } from 'svelte/reactivity';
import { imagePool } from './imagePool.svelte';

// ============================================================================
// 类型定义
// ============================================================================

/** 超分状态 */
export type UpscaleStatus =
  | 'pending'    // 等待中
  | 'checking'   // 条件检查中
  | 'processing' // 正在处理
  | 'completed'  // 已完成
  | 'skipped'    // 已跳过（不满足条件）
  | 'failed'     // 失败
  | 'cancelled'; // 已取消

/** 超分结果事件（V2：只有缓存路径，不返回 Blob） */
export interface UpscaleReadyPayload {
  bookPath: string;
  pageIndex: number;
  imageHash: string;
  status: UpscaleStatus;
  /** 缓存文件路径（用 convertFileSrc 转 URL） */
  cachePath: string | null;
  error: string | null;
  originalSize: [number, number] | null;
  upscaledSize: [number, number] | null;
  isPreload: boolean;
}

/** 页面超分状态（简化版） */
export interface PageUpscaleStatus {
  status: UpscaleStatus;
  cachePath: string | null;
}

/** Store 状态（V2：简化，超分图进入 imagePool） */
interface UpscaleStoreState {
  /** 是否启用超分 */
  enabled: boolean;
  /** 当前书籍路径 */
  currentBookPath: string | null;
  /** 当前页面索引 */
  currentPageIndex: number;
  /** 页面状态映射：pageIndex -> status */
  pageStatus: SvelteMap<number, PageUpscaleStatus>;
  /** 是否正在加载当前页超分 */
  loading: boolean;
  /** 服务统计 */
  stats: {
    pendingTasks: number;
    processingTasks: number;
    completedCount: number;
    skippedCount: number;
    failedCount: number;
  };
}

// ============================================================================
// Store 实现（V2：简化，超分图进入 imagePool）
// ============================================================================

class UpscaleStore {
  private state = $state<UpscaleStoreState>({
    enabled: false,
    currentBookPath: null,
    currentPageIndex: 0,
    pageStatus: new SvelteMap(),
    loading: false,
    stats: {
      pendingTasks: 0,
      processingTasks: 0,
      completedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    },
  });

  private unlistenReady: UnlistenFn | null = null;
  private initialized = false;

  // === Getters ===

  get enabled() {
    return this.state.enabled;
  }

  get currentBookPath() {
    return this.state.currentBookPath;
  }

  get currentPageIndex() {
    return this.state.currentPageIndex;
  }

  get loading() {
    return this.state.loading;
  }

  get stats() {
    return this.state.stats;
  }

  /** 获取当前页面的超分状态 */
  get currentStatus(): UpscaleStatus | null {
    return this.state.pageStatus.get(this.state.currentPageIndex)?.status ?? null;
  }

  /** 检查指定页面是否已完成超分 */
  isPageUpscaled(pageIndex: number): boolean {
    return imagePool.hasUpscaled(pageIndex);
  }

  /** 获取指定页面的超分 URL（从 imagePool） */
  getPageUpscaleUrl(pageIndex: number): string | null {
    return imagePool.getUpscaledUrl(pageIndex);
  }

  /** 获取指定页面的状态 */
  getPageStatus(pageIndex: number): UpscaleStatus | null {
    return this.state.pageStatus.get(pageIndex)?.status ?? null;
  }

  // === Actions ===

  /** 初始化（设置事件监听） */
  async init() {
    if (this.initialized) return;

    // 初始化后端服务
    try {
      await invoke('upscale_service_init');
      console.log('✅ 后端 UpscaleService 初始化完成');
    } catch (err) {
      console.error('❌ 后端 UpscaleService 初始化失败:', err);
    }

    // 监听超分结果事件
    this.unlistenReady = await listen<UpscaleReadyPayload>('upscale-ready', (event) => {
      this.handleUpscaleReady(event.payload);
    });

    this.initialized = true;
    console.log('✅ UpscaleStore V2 initialized');
  }

  /** 销毁（清理事件监听） */
  destroy() {
    if (this.unlistenReady) {
      this.unlistenReady();
      this.unlistenReady = null;
    }

    // 清除 imagePool 中的超分图
    imagePool.clearAllUpscaled();

    this.state.pageStatus.clear();
    this.initialized = false;
    console.log('🛑 UpscaleStore destroyed');
  }

  /** 启用/禁用超分 */
  async setEnabled(enabled: boolean) {
    if (this.state.enabled === enabled) return;

    this.state.enabled = enabled;

    try {
      await invoke('upscale_service_set_enabled', { enabled });

      if (!enabled) {
        // 禁用时清除所有超分图，回退到原图
        this.clearAll();
        this.state.loading = false;
      } else {
        // 启用时触发当前页和预加载范围的超分
        console.log('🔄 超分已启用，开始检查当前页和预加载范围...');
        await this.triggerCurrentPageUpscale();
      }

      console.log(`🔄 超分${enabled ? '已启用' : '已禁用'}`);
    } catch (err) {
      console.error('设置超分状态失败:', err);
    }
  }

  /** 触发当前页和预加载范围的超分（启用时或页面变化时调用） */
  async triggerCurrentPageUpscale() {
    if (!this.state.enabled || !this.state.currentBookPath) {
      console.log('⏭️ 跳过超分触发: enabled=', this.state.enabled, 'bookPath=', this.state.currentBookPath);
      return;
    }

    // 动态导入避免循环依赖
    const { bookStore } = await import('$lib/stores/book.svelte');
    
    const book = bookStore.currentBook;
    const pageIndex = this.state.currentPageIndex;
    
    if (!book || !book.pages || pageIndex >= book.pages.length) {
      console.log('⏭️ 跳过超分触发: 无有效书籍或页面');
      return;
    }

    // 获取当前页信息
    const currentPage = book.pages[pageIndex];
    if (!currentPage) return;

    // 构建图片信息列表（当前页 + 预加载范围）
    const preloadRange = 5;
    const imageInfos: Array<{ pageIndex: number; imagePath: string; hash: string }> = [];

    for (let i = Math.max(0, pageIndex - preloadRange); i <= Math.min(book.pages.length - 1, pageIndex + preloadRange); i++) {
      const page = book.pages[i];
      if (page) {
        imageInfos.push({
          pageIndex: i,
          imagePath: page.path,
          // 使用书籍路径+页面路径作为 hash
          hash: `${book.path}_${page.path}`,
        });
      }
    }

    console.log(`📸 触发超分: 当前页 ${pageIndex}, 预加载范围 ${imageInfos.length} 页`);

    // 请求预加载范围的超分
    await this.requestPreloadRange(
      this.state.currentBookPath,
      pageIndex,
      book.pages.length,
      imageInfos,
    );
  }

  /** 切换启用状态 */
  async toggle() {
    await this.setEnabled(!this.state.enabled);
  }

  /** 设置当前书籍 */
  async setCurrentBook(bookPath: string | null) {
    if (this.state.currentBookPath === bookPath) return;

    // 清理旧书籍的超分图
    if (this.state.currentBookPath) {
      this.clearAll();
    }

    this.state.currentBookPath = bookPath;

    try {
      await invoke('upscale_service_set_current_book', { bookPath });
    } catch (err) {
      console.error('设置当前书籍失败:', err);
    }
  }

  /** 设置当前页面 */
  async setCurrentPage(pageIndex: number) {
    if (this.state.currentPageIndex === pageIndex) return;

    this.state.currentPageIndex = pageIndex;

    try {
      await invoke('upscale_service_set_current_page', { pageIndex });

      // 检查是否已有超分结果
      const status = this.state.pageStatus.get(pageIndex);
      this.state.loading = !status || status.status === 'pending' || status.status === 'processing';
    } catch (err) {
      console.error('设置当前页面失败:', err);
      this.state.loading = false;
    }
  }

  /** 请求超分（手动触发） */
  async requestUpscale(
    bookPath: string,
    pageIndex: number,
    imagePath: string,
    imageHash: string,
    priority: 'current' | 'preload' = 'current',
  ) {
    if (!this.state.enabled) return;

    // 从 upscalePanelStore 获取当前模型设置
    const { selectedModel, scale, tileSize, noiseLevel } = await import('$lib/stores/upscale/upscalePanelStore.svelte');

    try {
      await invoke('upscale_service_request', {
        bookPath,
        pageIndex,
        imagePath,
        imageHash,
        priority,
        modelName: selectedModel.value,
        scale: scale.value,
        tileSize: tileSize.value,
        noiseLevel: noiseLevel.value,
      });

      // 更新状态
      this.updatePageStatus(pageIndex, { status: 'pending', cachePath: null });
    } catch (err) {
      console.error('请求超分失败:', err);
    }
  }

  /** 请求预加载范围 */
  async requestPreloadRange(
    bookPath: string,
    centerIndex: number,
    totalPages: number,
    imageInfos: Array<{ pageIndex: number; imagePath: string; hash: string }>,
  ) {
    if (!this.state.enabled) return;

    try {
      await invoke('upscale_service_request_preload_range', {
        bookPath,
        centerIndex,
        totalPages,
        imageInfos,
      });
    } catch (err) {
      console.error('请求预加载范围失败:', err);
    }
  }

  /** 取消指定页面的超分 */
  async cancelPage(bookPath: string, pageIndex: number) {
    try {
      await invoke('upscale_service_cancel_page', { bookPath, pageIndex });
    } catch (err) {
      console.error('取消页面超分失败:', err);
    }
  }

  /** 取消当前书籍的所有超分 */
  async cancelBook(bookPath: string) {
    try {
      await invoke('upscale_service_cancel_book', { bookPath });
      this.clearAll();
    } catch (err) {
      console.error('取消书籍超分失败:', err);
    }
  }

  /** 清除缓存 */
  async clearCache(bookPath?: string) {
    try {
      await invoke('upscale_service_clear_cache', { bookPath: bookPath ?? null });

      if (!bookPath || bookPath === this.state.currentBookPath) {
        this.clearAll();
      }
    } catch (err) {
      console.error('清除缓存失败:', err);
    }
  }

  /** 刷新统计信息 */
  async refreshStats() {
    try {
      const stats = await invoke<{
        memoryCacheCount: number;
        memoryCacheBytes: number;
        pendingTasks: number;
        processingTasks: number;
        completedCount: number;
        skippedCount: number;
        failedCount: number;
        isEnabled: boolean;
      }>('upscale_service_get_stats');

      this.state.stats = {
        pendingTasks: stats.pendingTasks,
        processingTasks: stats.processingTasks,
        completedCount: stats.completedCount,
        skippedCount: stats.skippedCount,
        failedCount: stats.failedCount,
      };
      this.state.enabled = stats.isEnabled;
    } catch (err) {
      console.error('刷新统计失败:', err);
    }
  }

  // === 私有方法 ===

  /** 处理超分结果事件（V2：将超分图放入 imagePool） */
  private handleUpscaleReady(payload: UpscaleReadyPayload) {
    // 检查是否是当前书籍
    if (payload.bookPath !== this.state.currentBookPath) {
      return;
    }

    const { pageIndex, status, cachePath } = payload;

    // 更新状态
    this.updatePageStatus(pageIndex, { status, cachePath });

    // 如果完成且有缓存路径，将超分图放入 imagePool
    if (status === 'completed' && cachePath) {
      // 使用 convertFileSrc 将本地路径转为 URL
      const url = convertFileSrc(cachePath);
      imagePool.setUpscaled(pageIndex, url);
      console.log(`✅ 超分图已加入 imagePool: page ${pageIndex} -> ${url.slice(0, 50)}...`);
    }

    // 更新 loading 状态
    if (pageIndex === this.state.currentPageIndex) {
      this.state.loading = false;
    }

    console.log(`📸 超分结果: page ${pageIndex} -> ${status}`);
  }

  /** 更新页面状态 */
  private updatePageStatus(pageIndex: number, status: PageUpscaleStatus) {
    const newStatus = new SvelteMap(this.state.pageStatus);
    newStatus.set(pageIndex, status);
    this.state.pageStatus = newStatus;
  }

  /** 清除所有超分状态和 imagePool 中的超分图 */
  private clearAll() {
    this.state.pageStatus = new SvelteMap();
    imagePool.clearAllUpscaled();
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const upscaleStore = new UpscaleStore();

/** 获取 upscale store（用于组件内使用） */
export function getUpscaleStore() {
  return upscaleStore;
}
