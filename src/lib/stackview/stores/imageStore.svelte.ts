/**
 * StackView 图片状态管理
 * 使用独立的 imagePool 加载图片
 */

import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from './imagePool.svelte';
import { infoPanelStore, type LatencyTrace } from '$lib/stores/infoPanel.svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';

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
    
    lastLoadedIndex = currentIndex;
    
    // 优先使用缓存
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
      updateCacheHitLatencyTrace(cached.blob, currentIndex);
    } else {
      state.loading = true;
    }
    
    // 双页模式：获取第二张（同步尝试）
    let secondCached: ReturnType<typeof imagePool.getSync> = null;
    if (pageMode === 'double') {
      const secondIndex = currentIndex + 1;
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
        console.log(`🖼️ ImageStore: 异步加载完成 page=${currentIndex} url=${image?.url?.substring(0, 60)}...`);
        if (image && lastLoadedIndex === currentIndex) {
          state.currentUrl = image.url;
          state.dimensions = image.width && image.height 
            ? { width: image.width, height: image.height } 
            : null;
          // 获取背景色（可能已在加载时计算好）
          state.backgroundColor = imagePool.getBackgroundColor(currentIndex) ?? null;
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
    if (pageMode === 'double' && !secondCached && lastLoadedIndex === currentIndex) {
      const secondIndex = currentIndex + 1;
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
    
    // 后台预加载
    imagePool.preloadRange(currentIndex, 4);
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
  
  return {
    get state() { return state; },
    loadCurrentPage,
    setUpscaledUrl,
    reset,
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
