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
import { isVideoFile } from '$lib/utils/videoUtils';
import { animatedVideoModeStore } from '$lib/stores/animatedVideoMode.svelte';
import { isAnimatedImageVideoCandidate } from '$lib/utils/animatedVideoModeUtils';

// 全局标记防止 HMR 导致多次监听
let globalListenerInitialized = false;
let globalUnlistenReady: UnlistenFn | null = null;

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
  /** 匹配的条件ID */
  conditionId?: string | null;
  /** 匹配的条件名称 */
  conditionName?: string | null;
  /** 实际使用的模型名称 */
  modelName?: string | null;
  /** 实际使用的放大倍率 */
  scale?: number | null;
}

/** 页面超分状态（简化版） */
export interface PageUpscaleStatus {
  status: UpscaleStatus;
  cachePath: string | null;
  /** 匹配的条件ID */
  conditionId?: string | null;
  /** 匹配的条件名称 */
  conditionName?: string | null;
  /** 实际使用的模型名称 */
  modelName?: string | null;
  /** 实际使用的放大倍率 */
  scale?: number | null;
  /** 原始尺寸 */
  originalSize?: [number, number] | null;
  /** 超分后尺寸 */
  upscaledSize?: [number, number] | null;
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
    queueWaitSampleCount: number;
    queueWaitAvgMs: number;
    queueWaitMaxMs: number;
    dedupeRequestCount: number;
    dedupeHitCount: number;
    dedupeHitRate: number;
    regexCacheHitCount: number;
    regexCacheMissCount: number;
    regexCacheHitRate: number;
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
      queueWaitSampleCount: 0,
      queueWaitAvgMs: 0,
      queueWaitMaxMs: 0,
      dedupeRequestCount: 0,
      dedupeHitCount: 0,
      dedupeHitRate: 0,
      regexCacheHitCount: 0,
      regexCacheMissCount: 0,
      regexCacheHitRate: 0,
    },
  });

  // 版本计数器，用于触发响应式更新
  private _version = $state(0);

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

  /** 版本号，用于触发响应式更新 */
  get version(): number {
    return this._version;
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

  /** 获取指定页面的完整状态信息 */
  getPageFullStatus(pageIndex: number): PageUpscaleStatus | null {
    return this.state.pageStatus.get(pageIndex) ?? null;
  }

  /** 获取指定页面匹配的条件名称 */
  getPageConditionName(pageIndex: number): string | null {
    return this.state.pageStatus.get(pageIndex)?.conditionName ?? null;
  }

  // === Actions ===

  /** 初始化（设置事件监听） */
  async init() {
    if (this.initialized) return;

    // 先同步缓存目录到 startup_config.json（确保后端使用正确的缓存路径）
    try {
      const { settingsManager } = await import('$lib/settings/settingsManager');
      const { syncSettingsToStartupConfig } = await import('$lib/config/startupConfig');
      const globalSettings = settingsManager.getSettings();
      const thumbnailDir = globalSettings.system?.thumbnailDirectory;
      
      if (thumbnailDir) {
        await syncSettingsToStartupConfig({ thumbnailDirectory: thumbnailDir });
        console.log('✅ 已同步缓存目录到 startup_config.json:', thumbnailDir);
      }
    } catch (err) {
      console.warn('⚠️ 同步缓存目录失败:', err);
    }

    // 初始化后端服务（后端从 config.json 读取缓存目录）
    try {
      await invoke('upscale_service_init');
      console.log('✅ 后端 UpscaleService 初始化完成');
    } catch (err) {
      console.error('❌ 后端 UpscaleService 初始化失败:', err);
    }

    // 监听超分结果事件（使用全局标记防止 HMR 重复监听）
    if (!globalListenerInitialized) {
      // 清理可能存在的旧监听器
      if (globalUnlistenReady) {
        globalUnlistenReady();
        globalUnlistenReady = null;
      }
      
      globalUnlistenReady = await listen<UpscaleReadyPayload>('upscale-ready', (event) => {
        // 使用单例的 handleUpscaleReady
        upscaleStore.handleUpscaleReadyPublic(event.payload);
      });
      globalListenerInitialized = true;
      console.log('✅ 全局超分事件监听器已注册');
    }
    
    this.unlistenReady = globalUnlistenReady;

    // 同步旧系统的设置（开关 + 条件）
    try {
      const { loadUpscalePanelSettings } = await import('$lib/components/panels/UpscalePanel');
      const panelSettings = loadUpscalePanelSettings();
      console.log('📋 [upscaleStore] 加载面板设置:', {
        autoUpscaleEnabled: panelSettings.autoUpscaleEnabled,
        conditionalUpscaleEnabled: panelSettings.conditionalUpscaleEnabled,
        conditionsCount: panelSettings.conditionsList?.length ?? 0,
      });
      
      // 1. 同步超分开关
      if (typeof panelSettings.autoUpscaleEnabled === 'boolean') {
        this.state.enabled = panelSettings.autoUpscaleEnabled;
        await invoke('upscale_service_set_enabled', { enabled: panelSettings.autoUpscaleEnabled });
        console.log('✅ 同步超分开关:', panelSettings.autoUpscaleEnabled);
      } else {
        console.log('⚠️ autoUpscaleEnabled 未定义，使用默认值 false');
      }
      
      // 2. 同步条件超分设置（包括条件列表）
      // 条件列表会被序列化传给后端，后端根据条件判断使用哪个模型
      await this.syncConditionSettings(panelSettings);
      
    } catch (err) {
      console.warn('⚠️ 同步旧系统设置失败:', err);
    }

    this.initialized = true;
    console.log('✅ UpscaleStore V2 initialized');
  }
  
  /** 同步条件设置到后端（初始化时调用，或运行时条件变动） */
  async syncConditionSettings(panelSettings?: {
    conditionalUpscaleEnabled?: boolean;
    conditionsList?: Array<{
      id: string;
      name: string;
      enabled: boolean;
      priority: number;
      match: {
        minWidth?: number;
        minHeight?: number;
        maxWidth?: number;
        maxHeight?: number;
        minPixels?: number;
        maxPixels?: number;
        regexBookPath?: string;
        regexImagePath?: string;
        matchInnerPath?: boolean;
      };
      action: {
        model: string;
        scale: number;
        tileSize: number;
        noiseLevel: number;
        skip?: boolean;
      };
    }>;
  }) {
    try {
      // 如果没传 panelSettings，重新读取
      if (!panelSettings) {
        const { loadUpscalePanelSettings } = await import('$lib/components/panels/UpscalePanel');
        panelSettings = loadUpscalePanelSettings();
      }
      
      // 使用统一同步服务，仅同步到后端（不重复保存 localStorage/config.json）
      const { syncConditionsToBackend } = await import('$lib/services/upscaleConditionSync');
      await syncConditionsToBackend(
        panelSettings.conditionalUpscaleEnabled ?? false,
        panelSettings.conditionsList as any ?? []
      );
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes('未初始化')) {
        console.log('ℹ️ UpscaleService 未初始化，条件设置将在下次打开书籍时生效');
      } else {
        console.warn('⚠️ 同步条件设置失败:', err);
      }
    }
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

      // 同步到 upscalePanelStore 并持久化到 localStorage
      const { autoUpscaleEnabled, saveSettings } = await import('$lib/stores/upscale/upscalePanelStore.svelte');
      autoUpscaleEnabled.value = enabled;
      saveSettings();

      if (!enabled) {
        // 禁用时清除所有超分图，回退到原图
        this.clearAll();
        this.state.loading = false;
      } else {
        // 启用时触发当前页和预加载范围的超分
        console.log('🔄 超分已启用，开始检查当前页和预加载范围...');
        await this.triggerCurrentPageUpscale();
      }

      console.log(`🔄 超分${enabled ? '已启用' : '已禁用'}（已持久化）`);
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
    
    // 判断是否是压缩包（zip/cbz/rar 等）
    const bookPath = book.path ?? '';
    const isArchive = /\.(zip|cbz|rar|cbr|7z)$/i.test(bookPath);

    for (let i = Math.max(0, pageIndex - preloadRange); i <= Math.min(book.pages.length - 1, pageIndex + preloadRange); i++) {
      const page = book.pages[i];
      if (page) {
        // 【关键】跳过视频文件，视频不支持超分
        const filename = page.name || page.innerPath || page.path || '';
        const isAnimatedVideoPage =
          animatedVideoModeStore.canUse && isAnimatedImageVideoCandidate(filename);
        if (isVideoFile(filename) || isAnimatedVideoPage) {
          continue;
        }

        // 构造 imagePath：压缩包格式 "xxx.zip inner=内部路径"，普通文件直接用完整路径
        const imagePath = isArchive 
          ? `${bookPath} inner=${page.path}`
          : page.path; // 如果是文件夹模式，page.path 应该是完整路径
        
        imageInfos.push({
          pageIndex: i,
          imagePath,
          // 使用书籍路径+页面路径作为 hash
          hash: `${bookPath}_${page.path}`,
        });
      }
    }

    console.log(`📸 触发超分: 当前页 ${pageIndex}, 预加载范围 ${imageInfos.length} 页`);

    // 请求预加载范围的超分
    console.log(`📸 调用 requestPreloadRange: bookPath=${this.state.currentBookPath}, enabled=${this.state.enabled}`);
    await this.requestPreloadRange(
      this.state.currentBookPath,
      pageIndex,
      book.pages.length,
      imageInfos,
    );
  }

  /** 触发递进超分（从已超分的最后一页向后扩展） */
  async triggerProgressiveUpscale(currentPageIndex: number, maxPages: number) {
    if (!this.state.enabled || !this.state.currentBookPath) {
      console.log('⏭️ 跳过递进超分: enabled=', this.state.enabled, 'bookPath=', this.state.currentBookPath);
      return;
    }

    // 动态导入避免循环依赖
    const { bookStore } = await import('$lib/stores/book.svelte');
    
    const book = bookStore.currentBook;
    if (!book || !book.pages) {
      console.log('⏭️ 跳过递进超分: 无有效书籍');
      return;
    }

    // 找到已超分的最后一页（从当前页开始向后查找）
    let lastUpscaledIndex = currentPageIndex - 1;
    for (let i = currentPageIndex; i < book.pages.length; i++) {
      if (imagePool.hasUpscaled(i)) {
        lastUpscaledIndex = i;
      } else {
        break; // 遇到未超分的页面就停止
      }
    }

    // 从已超分的最后一页的下一页开始
    const startPage = lastUpscaledIndex + 1;
    
    if (startPage >= book.pages.length) {
      console.log('📸 递进超分: 已到达书籍末尾');
      return;
    }

    // 构建图片信息列表
    const imageInfos: Array<{ pageIndex: number; imagePath: string; hash: string }> = [];
    
    // 判断是否是压缩包
    const bookPath = book.path ?? '';
    const isArchive = /\.(zip|cbz|rar|cbr|7z)$/i.test(bookPath);

    // 从起始页向后扩展，最多 maxPages 页
    const endPage = Math.min(startPage + maxPages, book.pages.length);
    for (let i = startPage; i < endPage; i++) {
      // 跳过已超分的页面
      if (imagePool.hasUpscaled(i)) continue;
      
      const page = book.pages[i];
      if (page) {
        // 【关键】跳过视频文件，视频不支持超分
        const filename = page.name || page.innerPath || page.path || '';
        const isAnimatedVideoPage =
          animatedVideoModeStore.canUse && isAnimatedImageVideoCandidate(filename);
        if (isVideoFile(filename) || isAnimatedVideoPage) {
          continue;
        }

        const imagePath = isArchive 
          ? `${bookPath} inner=${page.path}`
          : page.path;
        
        imageInfos.push({
          pageIndex: i,
          imagePath,
          hash: `${bookPath}_${page.path}`,
        });
      }
    }

    if (imageInfos.length === 0) {
      console.log('📸 递进超分: 范围内所有页面已超分');
      return;
    }

    console.log(`📸 递进超分: 从第 ${startPage + 1} 页开始，共 ${imageInfos.length} 页待处理`);

    // 请求超分
    await this.requestPreloadRange(
      this.state.currentBookPath,
      startPage,
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
    console.log('📚 [upscaleStore] setCurrentBook 调用:', { 
      newPath: bookPath, 
      oldPath: this.state.currentBookPath,
      enabled: this.state.enabled 
    });
    
    if (this.state.currentBookPath === bookPath) {
      console.log('📚 [upscaleStore] 书籍路径未变化，跳过');
      return;
    }

    // 清理旧书籍的超分图
    if (this.state.currentBookPath) {
      this.clearAll();
    }

    this.state.currentBookPath = bookPath;
    console.log('📚 [upscaleStore] 已更新 currentBookPath:', bookPath);

    try {
      await invoke('upscale_service_set_current_book', { bookPath });
      console.log('📚 [upscaleStore] 后端 set_current_book 成功');
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

    // 从 upscalePanelStore 获取当前模型设置和条件超分开关
    const { selectedModel, scale, tileSize, noiseLevel, conditionalUpscaleEnabled } = await import('$lib/stores/upscale/upscalePanelStore.svelte');

    try {
      // 如果条件超分启用，不传模型参数，让后端条件匹配决定
      // 否则使用默认模型设置
      const useConditionMatch = conditionalUpscaleEnabled.value;
      
      await invoke('upscale_service_request', {
        bookPath,
        pageIndex,
        imagePath,
        imageHash,
        priority,
        modelName: useConditionMatch ? null : selectedModel.value,
        scale: useConditionMatch ? null : scale.value,
        tileSize: useConditionMatch ? null : tileSize.value,
        noiseLevel: useConditionMatch ? null : noiseLevel.value,
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
    console.log(`📸 requestPreloadRange: enabled=${this.state.enabled}, bookPath=${bookPath}, imageInfos.length=${imageInfos.length}`);
    if (!this.state.enabled) {
      console.log('📸 requestPreloadRange: 跳过，超分未启用');
      return;
    }

    try {
      // 后端期望 request 对象，字段使用 camelCase
      // 不传递模型配置，由后端根据条件匹配决定
      await invoke('upscale_service_request_preload_range', {
        request: {
          bookPath,
          centerIndex,
          totalPages,
          imageInfos: imageInfos.map(info => ({
            pageIndex: info.pageIndex,
            imagePath: info.imagePath,
            hash: info.hash,
          })),
          // 模型配置由后端条件匹配决定，不传默认值
          modelName: null,
          scale: null,
          tileSize: null,
          noiseLevel: null,
        },
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
        queueWaitSampleCount: number;
        queueWaitAvgMs: number;
        queueWaitMaxMs: number;
        dedupeRequestCount: number;
        dedupeHitCount: number;
        dedupeHitRate: number;
        regexCacheHitCount: number;
        regexCacheMissCount: number;
        regexCacheHitRate: number;
        isEnabled: boolean;
      }>('upscale_service_get_stats');

      this.state.stats = {
        pendingTasks: stats.pendingTasks,
        processingTasks: stats.processingTasks,
        completedCount: stats.completedCount,
        skippedCount: stats.skippedCount,
        failedCount: stats.failedCount,
        queueWaitSampleCount: stats.queueWaitSampleCount,
        queueWaitAvgMs: stats.queueWaitAvgMs,
        queueWaitMaxMs: stats.queueWaitMaxMs,
        dedupeRequestCount: stats.dedupeRequestCount,
        dedupeHitCount: stats.dedupeHitCount,
        dedupeHitRate: stats.dedupeHitRate,
        regexCacheHitCount: stats.regexCacheHitCount,
        regexCacheMissCount: stats.regexCacheMissCount,
        regexCacheHitRate: stats.regexCacheHitRate,
      };
      this.state.enabled = stats.isEnabled;
    } catch (err) {
      console.error('刷新统计失败:', err);
    }
  }

  // === 事件处理 ===

  /** 处理超分结果事件（V2：将超分图放入 imagePool） */
  handleUpscaleReadyPublic(payload: UpscaleReadyPayload) {
    console.log(`📦 收到超分事件:`, {
      bookPath: payload.bookPath?.slice(-30),
      currentBookPath: this.state.currentBookPath?.slice(-30),
      pageIndex: payload.pageIndex,
      status: payload.status,
      cachePath: payload.cachePath?.slice(-50),
      error: payload.error,
      modelName: payload.modelName,
      scale: payload.scale,
    });

    // 检查是否是当前书籍
    if (payload.bookPath !== this.state.currentBookPath) {
      console.log(`⚠️ 书籍路径不匹配，忽略事件`);
      return;
    }

    const { pageIndex, status, cachePath, conditionId, conditionName, modelName, scale, originalSize, upscaledSize } = payload;

    // 如果失败，打印详细错误
    if (status === 'failed' && payload.error) {
      console.error(`❌ 超分失败 page ${pageIndex}:`, payload.error);
    }

    // 更新状态（包含条件信息和模型信息）
    this.updatePageStatus(pageIndex, { 
      status, 
      cachePath, 
      conditionId, 
      conditionName,
      modelName,
      scale,
      originalSize,
      upscaledSize,
    });

    // 如果完成且有缓存路径，将超分图放入 imagePool
    if (status === 'completed' && cachePath) {
      // 使用 convertFileSrc 将本地路径转为 URL
      const url = convertFileSrc(cachePath);
      imagePool.setUpscaled(pageIndex, url);
      console.log(`✅ 超分图已加入 imagePool: page ${pageIndex} -> ${url}`);
      
      // 【关键优化】对超分图进行预解码，替换原图缓存
      // 后台执行，不阻塞事件处理
      this.preDecodeUpscaledImage(pageIndex, url);
    } else {
      console.log(`⏭️ 未加入 imagePool: status=${status}, cachePath=${cachePath ? 'yes' : 'no'}`);
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
    // 增加版本号触发响应式更新
    this._version++;
  }

  /** 清除所有超分状态和 imagePool 中的超分图 */
  private clearAll() {
    this.state.pageStatus = new SvelteMap();
    imagePool.clearAllUpscaled();
  }

  /** 
   * 对超分图进行预解码（后台执行）
   * 替换 preDecodeCache 中的原图缓存为超分图
   */
  private async preDecodeUpscaledImage(pageIndex: number, upscaledUrl: string): Promise<void> {
    try {
      // 动态导入避免循环依赖
      const { preDecodeCache } = await import('./preDecodeCache.svelte');
      
      // 使用新方法替换原图缓存
      const entry = await preDecodeCache.replaceWithUpscaled(pageIndex, upscaledUrl);
      
      if (entry) {
        console.log(`✨ 超分图已预解码并替换缓存: page ${pageIndex + 1}, 尺寸 ${entry.width}x${entry.height}`);
      }
    } catch (error) {
      console.warn(`⚠️ 超分图预解码失败: page ${pageIndex + 1}`, error);
    }
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
