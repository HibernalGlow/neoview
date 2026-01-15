/**
 * StackView 图片状态管理
 * 使用独立的 imagePool 加载图片
 */

import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from './imagePool.svelte';
import { stackImageLoader } from '../utils/stackImageLoader';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { calculateTargetScale } from '../utils/imageTransitionManager';
import { thumbnailService } from '$lib/services/thumbnailService';
import type { ZoomMode } from '$lib/settings/settingsManager';

/**
 * 检查是否应该加载第二张图片（双页模式）
 * 
 * 按照 NeeView 的逻辑：
 * 1. 当前页横向 → 不加载第二张（当前页独占）
 * 2. 下一页横向 → 不加载第二张（当前页独占，下一页将独占）
 * 3. 首页/尾页单独显示 → 不加载第二张
 * 4. 正常双页 → 加载第二张
 */
function shouldLoadSecondPage(currentIndex: number, nextIndex: number): boolean {
  const book = bookStore.currentBook;
  if (!book || !book.pages) return false;
  if (nextIndex >= book.pages.length) return false;

  const settings = settingsManager.getSettings();
  const treatHorizontalAsDoublePage = settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false;
  const singleFirstPageMode = settings.view.pageLayout?.singleFirstPageMode ?? 'restoreOrDefault';
  const singleLastPageMode = settings.view.pageLayout?.singleLastPageMode ?? 'restoreOrDefault';
  
  // 解析首页/尾页设置
  const singleFirstPage = singleFirstPageMode !== 'continue';
  const singleLastPage = singleLastPageMode === 'continue';

  // 获取当前页尺寸
  const currentPage = book.pages[currentIndex];
  const currentWidth = currentPage?.width ?? 0;
  const currentHeight = currentPage?.height ?? 0;
  const hasCurrentSize = currentWidth > 0 && currentHeight > 0;
  const isCurrentLandscape = hasCurrentSize && currentWidth > currentHeight;

  // 1. 当前页横向 → 不加载第二张
  if (treatHorizontalAsDoublePage && isCurrentLandscape) {
    return false;
  }

  // 获取下一页尺寸
  const nextPage = book.pages[nextIndex];
  const nextWidth = nextPage?.width ?? 0;
  const nextHeight = nextPage?.height ?? 0;
  const hasNextSize = nextWidth > 0 && nextHeight > 0;
  const isNextLandscape = hasNextSize && nextWidth > nextHeight;

  // 2. 下一页横向 → 不加载第二张
  if (treatHorizontalAsDoublePage && isNextLandscape) {
    return false;
  }

  // 3. 首页/尾页单独显示
  const totalPages = book.pages.length;
  const isFirst = currentIndex === 0 || nextIndex === 0;
  const isLast = currentIndex === totalPages - 1 || nextIndex === totalPages - 1;
  
  if ((singleFirstPage && isFirst) || (singleLastPage && isLast)) {
    return false;
  }

  // 4. 正常双页 → 加载第二张
  return true;
}

/**
 * 更新缓存命中时的延迟追踪
 */
function updateCacheHitLatencyTrace(blob: Blob | undefined, pageIndex: number): void {
  const latencyTrace: LatencyTrace = {
    dataSource: loadModeStore.isTempfileMode ? 'tempfile' : 'blob',
    renderMode: loadModeStore.isImgMode ? 'img' : 'canvas',
    loadMs: 0,
    totalMs: 0,
    cacheHit: true,
    dataSize: blob?.size ?? 0,
    traceId: `stackview-cache-${pageIndex}`
  };
  infoPanelStore.setLatencyTrace(latencyTrace);
}

// ============================================================================
// 类型定义
// ============================================================================

export interface ImageState {
  /** 当前图片 URL */
  currentUrl: string | null;
  /** 第二张图片 URL（双页模式） */
  secondUrl: string | null;
  /** 超分图片 URL */
  upscaledUrl: string | null;
  /** 当前图片尺寸 */
  dimensions: { width: number; height: number } | null;
  /** 第二张图片尺寸（双页模式） */
  secondDimensions: { width: number; height: number } | null;
  /** 预加载的背景色 */
  backgroundColor: string | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

// ============================================================================
// 创建图片 Store
// ============================================================================

export function createImageStore() {
  const state = $state<ImageState>({
    currentUrl: null,
    secondUrl: null,
    upscaledUrl: null,
    dimensions: null,
    secondDimensions: null,
    backgroundColor: null,
    loading: false,
    error: null,
  });
  
  let lastLoadedIndex = -1;
  let currentBookPath: string | null = null;
  
  /**
   * 加载当前页面
   * 【翻页性能优化】优先使用预解码缓存
   */
  async function loadCurrentPage(pageMode: 'single' | 'double' = 'single', force = false) {
    const currentIndex = bookStore.currentPageIndex;
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;
    
    if (!book || !page) {
      state.currentUrl = null;
      state.secondUrl = null;
      state.dimensions = null;
      state.secondDimensions = null;
      state.backgroundColor = null;
      state.loading = false;
      return;
    }
    
    // 检测书本变化
    const bookChanged = currentBookPath !== book.path;
    if (bookChanged) {
      currentBookPath = book.path;
      state.currentUrl = null;
      state.secondUrl = null;
      state.dimensions = null;
      state.secondDimensions = null;
      state.backgroundColor = null;
      lastLoadedIndex = -1;
      imagePool.setCurrentBook(book.path);
    }
    
    // 避免重复加载
    if (!force && !bookChanged && currentIndex === lastLoadedIndex && state.currentUrl) {
      return;
    }
    
    // 【性能优化】页面切换时立即清除旧尺寸
    // 这确保了不会使用旧页面的尺寸渲染新页面
    if (currentIndex !== lastLoadedIndex) {
      state.dimensions = null;
      state.secondDimensions = null;
    }
    
    lastLoadedIndex = currentIndex;
    
    // 记录翻页开始时间
    const flipStartTime = performance.now();
    
    // 【翻页优化】优先检查预解码缓存
    const preDecodedUrl = stackImageLoader.getPreDecodedUrl(currentIndex);
    if (preDecodedUrl) {
      const flipLatency = performance.now() - flipStartTime;
      console.log(`⚡ 使用预解码缓存: 页码 ${currentIndex + 1}, 延迟 ${flipLatency.toFixed(1)}ms`);
      state.currentUrl = preDecodedUrl;
      state.dimensions = stackImageLoader.getCachedDimensions(currentIndex) ?? null;
      state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
      state.loading = false;
      // 更新延迟追踪（预解码命中）
      const cached = imagePool.getSync(currentIndex);
      if (cached?.blob) {
        updateCacheHitLatencyTrace(cached.blob, currentIndex);
      }
      // 【关键】通知缩略图服务主图已就绪
      thumbnailService.notifyMainImageReady();
      // 【翻页优化】触发分层预加载
      stackImageLoader.triggerLayeredPreload(currentIndex);
      // 处理双页模式
      await loadSecondPageIfNeeded(pageMode, currentIndex, book);
      return;
    }
    
    // 优先使用 Blob 缓存
    const cached = imagePool.getSync(currentIndex);
    if (cached) {
      console.log(`🖼️ ImageStore: 使用缓存 page=${currentIndex} url=${cached.url?.substring(0, 60)}...`);
      state.currentUrl = cached.url;
      state.dimensions = cached.width && cached.height 
        ? { width: cached.width, height: cached.height } 
        : null;
      // 获取预加载的背景色
      state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
      state.loading = false;
      // 更新延迟追踪（缓存命中）
      if (cached.blob) {
        updateCacheHitLatencyTrace(cached.blob, currentIndex);
      }
      // 【关键】通知缩略图服务主图已就绪
      thumbnailService.notifyMainImageReady();
      // 【翻页优化】触发分层预加载
      stackImageLoader.triggerLayeredPreload(currentIndex);
    } else {
      state.loading = true;
    }
    
    // 双页模式：获取第二张（同步尝试）
    // 先检查是否应该加载第二张图片（考虑横向页面等情况）
    let secondCached: ReturnType<typeof imagePool.getSync> = null;
    const secondIndex = currentIndex + 1;
    const shouldLoadSecond = pageMode === 'double' && shouldLoadSecondPage(currentIndex, secondIndex);
    
    if (shouldLoadSecond) {
      if (secondIndex < book.pages.length) {
        secondCached = imagePool.getSync(secondIndex);
        state.secondUrl = secondCached?.url ?? null;
        state.secondDimensions = secondCached?.width && secondCached?.height 
          ? { width: secondCached.width, height: secondCached.height } 
          : null;
      } else {
        state.secondUrl = null;
        state.secondDimensions = null;
      }
    } else {
      state.secondUrl = null;
      state.secondDimensions = null;
    }
    
    // 异步加载当前图片
    if (!cached) {
      try {
        const image = await imagePool.get(currentIndex);
        const flipLatency = performance.now() - flipStartTime;
        console.log(`🖼️ ImageStore: 异步加载完成 page=${currentIndex} url=${image?.url?.substring(0, 60)}... 延迟=${flipLatency.toFixed(1)}ms`);
        
        // 【性能监控】延迟超过 100ms 打印警告
        if (flipLatency > 100) {
          console.warn(`⚠️ 翻页延迟过高: ${flipLatency.toFixed(1)}ms (目标 <50ms)`);
        }
        
        if (image && lastLoadedIndex === currentIndex) {
          state.currentUrl = image.url;
          state.dimensions = image.width && image.height 
            ? { width: image.width, height: image.height } 
            : null;
          // 获取背景色（可能已在加载时计算好）
          state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
          // 【关键】主图加载完成，通知缩略图服务开始加载
          thumbnailService.notifyMainImageReady();
          // 【翻页优化】触发分层预加载
          stackImageLoader.triggerLayeredPreload(currentIndex);
        }
      } catch (err) {
        state.error = String(err);
      } finally {
        if (lastLoadedIndex === currentIndex) {
          state.loading = false;
        }
      }
    }
    
    // 双页模式：异步加载第二张（独立于当前图片是否缓存）
    // 使用之前计算的 shouldLoadSecond 来决定是否加载
    if (shouldLoadSecond && !secondCached && lastLoadedIndex === currentIndex) {
      if (secondIndex < book.pages.length) {
        try {
          const secondImage = await imagePool.get(secondIndex);
          if (lastLoadedIndex === currentIndex) {
            state.secondUrl = secondImage?.url ?? null;
            state.secondDimensions = secondImage?.width && secondImage?.height 
              ? { width: secondImage.width, height: secondImage.height } 
              : null;
          }
        } catch (err) {
          console.warn('Failed to load second page:', err);
        }
      }
    }
    
    // 后台预加载（旧逻辑，保留兼容）
    imagePool.preloadRange(currentIndex, 4);
  }
  
  /**
   * 加载双页模式的第二张图片（辅助函数）
   */
  async function loadSecondPageIfNeeded(
    pageMode: 'single' | 'double',
    currentIndex: number,
    book: NonNullable<typeof bookStore.currentBook>
  ) {
    const secondIndex = currentIndex + 1;
    const shouldLoadSecond = pageMode === 'double' && shouldLoadSecondPage(currentIndex, secondIndex);
    
    if (!shouldLoadSecond || secondIndex >= book.pages.length) {
      state.secondUrl = null;
      state.secondDimensions = null;
      return;
    }
    
    // 优先使用预解码缓存
    const preDecodedUrl = stackImageLoader.getPreDecodedUrl(secondIndex);
    if (preDecodedUrl) {
      state.secondUrl = preDecodedUrl;
      state.secondDimensions = stackImageLoader.getCachedDimensions(secondIndex) ?? null;
      return;
    }
    
    // 使用 Blob 缓存
    const secondCached = imagePool.getSync(secondIndex);
    if (secondCached) {
      state.secondUrl = secondCached.url;
      state.secondDimensions = secondCached.width && secondCached.height 
        ? { width: secondCached.width, height: secondCached.height } 
        : null;
      return;
    }
    
    // 异步加载
    try {
      const secondImage = await imagePool.get(secondIndex);
      if (lastLoadedIndex === currentIndex) {
        state.secondUrl = secondImage?.url ?? null;
        state.secondDimensions = secondImage?.width && secondImage?.height 
          ? { width: secondImage.width, height: secondImage.height } 
          : null;
      }
    } catch (err) {
      console.warn('Failed to load second page:', err);
    }
  }
  
  /**
   * 设置超分图片
   */
  function setUpscaledUrl(url: string | null) {
    state.upscaledUrl = url;
  }
  
  /**
   * 重置状态
   */
  function reset() {
    state.currentUrl = null;
    state.secondUrl = null;
    state.upscaledUrl = null;
    state.dimensions = null;
    state.secondDimensions = null;
    state.backgroundColor = null;
    state.loading = false;
    state.error = null;
    lastLoadedIndex = -1;
    currentBookPath = null;
    imagePool.clear();
  }
  
  /**
   * 【新增】获取指定页面的尺寸（按索引读取缓存）
   * 优先级：stackImageLoader 缓存 > bookStore 元数据
   */
  function getDimensionsForPage(pageIndex: number): { width: number; height: number } | null {
    // 1. 优先从 stackImageLoader 缓存读取
    const cached = stackImageLoader.getCachedDimensions(pageIndex);
    if (cached && cached.width > 0 && cached.height > 0) {
      return cached;
    }
    
    // 2. 降级：从 bookStore 元数据读取
    const book = bookStore.currentBook;
    if (book?.pages?.[pageIndex]) {
      const page = book.pages[pageIndex];
      if (page.width && page.height && page.width > 0 && page.height > 0) {
        return { width: page.width, height: page.height };
      }
    }
    
    return null;
  }
  
  /**
   * 【新增】获取指定页面的预计算缩放值
   * 优先级：预计算缓存 > 实时计算
   */
  function getScaleForPage(
    pageIndex: number, 
    zoomMode: ZoomMode, 
    viewport: { width: number; height: number }
  ): number {
    if (!viewport.width || !viewport.height) {
      return 1;
    }
    
    // 1. 优先使用预计算的缩放值
    const cachedScale = stackImageLoader.getCachedScale(pageIndex, zoomMode);
    if (cachedScale !== null && cachedScale > 0) {
      return cachedScale;
    }
    
    // 2. 尝试预计算并缓存
    const precomputed = stackImageLoader.precomputeScale(pageIndex, zoomMode);
    if (precomputed !== null && precomputed > 0) {
      return precomputed;
    }
    
    // 3. 使用尺寸实时计算
    const dims = getDimensionsForPage(pageIndex);
    if (dims) {
      return calculateTargetScale(dims, viewport, zoomMode);
    }
    
    // 4. 最终降级
    return 1;
  }
  
  /**
   * 【新增】设置视口尺寸（用于预计算缩放）
   */
  function setViewportSize(width: number, height: number): void {
    stackImageLoader.setViewportSize(width, height);
  }
  
  return {
    get state() { return state; },
    loadCurrentPage,
    setUpscaledUrl,
    reset,
    getDimensionsForPage,
    getScaleForPage,
    setViewportSize,
  };
}

// 单例
let imageStore: ReturnType<typeof createImageStore> | null = null;

export function getImageStore() {
  if (!imageStore) {
    imageStore = createImageStore();
  }
  return imageStore;
}
