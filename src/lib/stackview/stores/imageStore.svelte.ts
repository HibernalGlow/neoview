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

  // 【双缓冲】翻页时旧帧保留直到新帧 ready
  let pendingPageToken = 0;
  let currentDisplayPageIndex: number | null = null;
  let secondDisplayPageIndex: number | null = null;
  // 诊断计数
  let tokenMismatchDrops = 0;
  
  /**
   * 加载当前页面
   * 【双缓冲语义】翻页时旧帧保留直到新帧 ready，不出现空帧
   */
  async function loadCurrentPage(pageMode: 'single' | 'double' = 'single', force = false) {
    const currentIndex = bookStore.currentPageIndex;
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;

    // 场景：关闭 viewer / 无书 / 无页 → 允许清空
    if (!book || !page) {
      state.currentUrl = null;
      state.secondUrl = null;
      state.dimensions = null;
      state.secondDimensions = null;
      state.backgroundColor = null;
      state.loading = false;
      currentDisplayPageIndex = null;
      secondDisplayPageIndex = null;
      return;
    }

    // 检测书本变化 → 切书时必须清空旧帧
    const bookChanged = currentBookPath !== book.path;
    if (bookChanged) {
      currentBookPath = book.path;
      state.currentUrl = null;
      state.secondUrl = null;
      state.dimensions = null;
      state.secondDimensions = null;
      state.backgroundColor = null;
      lastLoadedIndex = -1;
      currentDisplayPageIndex = null;
      secondDisplayPageIndex = null;
      imagePool.setCurrentBook(book.path);
    }

    // 避免重复加载
    if (!force && !bookChanged && currentIndex === lastLoadedIndex && state.currentUrl) {
      return;
    }

    // 【关键】翻页时不再清空 dimensions / currentUrl
    // 旧图必须保留，直到新图 ready 后再原子替换
    lastLoadedIndex = currentIndex;

    // 递增 token，用于丢弃过期的异步结果
    const myToken = ++pendingPageToken;

    // 记录翻页开始时间
    const flipStartTime = performance.now();

    // 【翻页优化】优先检查预解码缓存
    const preDecodedUrl = stackImageLoader.getPreDecodedUrl(currentIndex);
    if (preDecodedUrl) {
      const resourceReadyMs = performance.now() - flipStartTime;
      console.log(`[imageStore] page=${currentIndex} source=predecoded resourceReadyMs=${resourceReadyMs.toFixed(1)} tokenDrops=${tokenMismatchDrops}`);
      // 原子替换：新图 ready，一次性更新
      state.currentUrl = preDecodedUrl;
      state.dimensions = stackImageLoader.getCachedDimensions(currentIndex) ?? null;
      state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
      state.loading = false;
      currentDisplayPageIndex = currentIndex;
      // 更新延迟追踪（预解码命中）
      const cached = imagePool.getSync(currentIndex);
      if (cached?.blob) {
        updateCacheHitLatencyTrace(cached.blob, currentIndex);
      }
      thumbnailService.notifyMainImageReady();
      // 【唯一预加载入口】只保留分层预加载
      stackImageLoader.triggerLayeredPreload(currentIndex);
      // 处理双页模式
      await loadSecondPageIfNeeded(pageMode, currentIndex, book, myToken);
      return;
    }

    // 优先使用 Blob 缓存
    const cached = imagePool.getSync(currentIndex);
    if (cached) {
      const resourceReadyMs = performance.now() - flipStartTime;
      console.log(`[imageStore] page=${currentIndex} source=cache resourceReadyMs=${resourceReadyMs.toFixed(1)} tokenDrops=${tokenMismatchDrops}`);
      // 原子替换
      state.currentUrl = cached.url;
      state.dimensions = cached.width && cached.height
        ? { width: cached.width, height: cached.height }
        : null;
      state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
      state.loading = false;
      currentDisplayPageIndex = currentIndex;
      if (cached.blob) {
        updateCacheHitLatencyTrace(cached.blob, currentIndex);
      }
      thumbnailService.notifyMainImageReady();
      // 【唯一预加载入口】只保留分层预加载
      stackImageLoader.triggerLayeredPreload(currentIndex);
    } else {
      // 异步加载：旧帧保留，loading=true 但不清空 currentUrl
      state.loading = true;
    }

    // 双页模式：获取第二张（同步尝试）
    let secondCached: ReturnType<typeof imagePool.getSync> = null;
    const secondIndex = currentIndex + 1;
    const shouldLoadSecond = pageMode === 'double' && shouldLoadSecondPage(currentIndex, secondIndex);

    if (shouldLoadSecond) {
      if (secondIndex < book.pages.length) {
        secondCached = imagePool.getSync(secondIndex);
        if (secondCached) {
          // 第二张也 ready，原子替换
          state.secondUrl = secondCached.url;
          state.secondDimensions = secondCached?.width && secondCached?.height
            ? { width: secondCached.width, height: secondCached.height }
            : null;
          secondDisplayPageIndex = secondIndex;
        }
        // 如果第二张未缓存，不先清空旧的 secondUrl，等异步加载完再替换
      }
      // 不再在 shouldLoadSecond=false 时清空 secondUrl
      // secondUrl 只在切书/reset/双页模式关闭时清空
    }

    // 异步加载当前图片
    if (!cached) {
      try {
        const image = await imagePool.get(currentIndex);
        const resourceReadyMs = performance.now() - flipStartTime;

        // 【关键】只有 token 匹配且页码未变时才提交新图
        if (myToken !== pendingPageToken || currentIndex !== bookStore.currentPageIndex) {
          tokenMismatchDrops++;
          console.log(`[imageStore] page=${currentIndex} source=async DROPPED (stale) resourceReadyMs=${resourceReadyMs.toFixed(1)} tokenDrops=${tokenMismatchDrops}`);
          return;
        }

        console.log(`[imageStore] page=${currentIndex} source=async resourceReadyMs=${resourceReadyMs.toFixed(1)} tokenDrops=${tokenMismatchDrops}`);

        if (resourceReadyMs > 100) {
          console.warn(`⚠️ 翻页延迟过高: ${resourceReadyMs.toFixed(1)}ms (目标 <50ms)`);
        }

        if (image) {
          // 原子替换：新图 ready，一次性更新
          state.currentUrl = image.url;
          state.dimensions = image.width && image.height
            ? { width: image.width, height: image.height }
            : null;
          state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
          currentDisplayPageIndex = currentIndex;
          thumbnailService.notifyMainImageReady();
          // 【唯一预加载入口】只保留分层预加载
          stackImageLoader.triggerLayeredPreload(currentIndex);
        }
      } catch (err) {
        state.error = String(err);
      } finally {
        if (currentIndex === bookStore.currentPageIndex) {
          state.loading = false;
        }
      }
    }

    // 双页模式：异步加载第二张（独立于当前图片是否缓存）
    if (shouldLoadSecond && !secondCached && currentIndex === bookStore.currentPageIndex) {
      if (secondIndex < book.pages.length) {
        try {
          const secondImage = await imagePool.get(secondIndex);
          // 只有页码未变且 token 匹配时才提交
          if (myToken === pendingPageToken && currentIndex === bookStore.currentPageIndex) {
            state.secondUrl = secondImage?.url ?? null;
            state.secondDimensions = secondImage?.width && secondImage?.height
              ? { width: secondImage.width, height: secondImage.height }
              : null;
            if (secondImage) {
              secondDisplayPageIndex = secondIndex;
            }
          }
        } catch (err) {
          console.warn('Failed to load second page:', err);
        }
      }
    }
    // 【已删除】imagePool.preloadRange(currentIndex, 4) — 重复预加载，由 triggerLayeredPreload 统一调度
  }
  
  /**
   * 加载双页模式的第二张图片（辅助函数）
   * 【双缓冲】第二张未 ready 时不先清空旧帧
   */
  async function loadSecondPageIfNeeded(
    pageMode: 'single' | 'double',
    currentIndex: number,
    book: NonNullable<typeof bookStore.currentBook>,
    token?: number
  ) {
    const secondIndex = currentIndex + 1;
    const shouldLoadSecond = pageMode === 'double' && shouldLoadSecondPage(currentIndex, secondIndex);

    if (!shouldLoadSecond || secondIndex >= book.pages.length) {
      // 只在明确不需要双页时才清空 secondUrl
      if (pageMode !== 'double') {
        state.secondUrl = null;
        state.secondDimensions = null;
        secondDisplayPageIndex = null;
      }
      return;
    }

    // 优先使用预解码缓存
    const preDecodedUrl = stackImageLoader.getPreDecodedUrl(secondIndex);
    if (preDecodedUrl) {
      state.secondUrl = preDecodedUrl;
      state.secondDimensions = stackImageLoader.getCachedDimensions(secondIndex) ?? null;
      secondDisplayPageIndex = secondIndex;
      return;
    }

    // 使用 Blob 缓存
    const secondCached = imagePool.getSync(secondIndex);
    if (secondCached) {
      state.secondUrl = secondCached.url;
      state.secondDimensions = secondCached.width && secondCached.height
        ? { width: secondCached.width, height: secondCached.height }
        : null;
      secondDisplayPageIndex = secondIndex;
      return;
    }

    // 异步加载：不清空旧 secondUrl，等 ready 后再替换
    try {
      const secondImage = await imagePool.get(secondIndex);
      // token 检查：确保页码未变
      if (currentIndex === bookStore.currentPageIndex && (token === undefined || token === pendingPageToken)) {
        state.secondUrl = secondImage?.url ?? null;
        state.secondDimensions = secondImage?.width && secondImage?.height
          ? { width: secondImage.width, height: secondImage.height }
          : null;
        if (secondImage) {
          secondDisplayPageIndex = secondIndex;
        }
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
    currentDisplayPageIndex = null;
    secondDisplayPageIndex = null;
    pendingPageToken++;
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
