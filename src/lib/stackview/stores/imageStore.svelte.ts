/**
 * StackView 图片状态管理
 * 使用独立的 imagePool 加载图片
 */

import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from './imagePool.svelte';

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
      state.currentUrl = cached.url;
      state.dimensions = cached.width && cached.height 
        ? { width: cached.width, height: cached.height } 
        : null;
      state.loading = false;
    } else {
      state.loading = true;
    }
    
    // 双页模式：获取第二张
    if (pageMode === 'double') {
      const secondIndex = currentIndex + 1;
      if (secondIndex < book.pages.length) {
        const secondCached = imagePool.getSync(secondIndex);
        state.secondUrl = secondCached?.url ?? null;
      } else {
        state.secondUrl = null;
      }
    } else {
      state.secondUrl = null;
    }
    
    // 异步加载
    if (!cached) {
      try {
        const image = await imagePool.get(currentIndex);
        if (image && lastLoadedIndex === currentIndex) {
          state.currentUrl = image.url;
          state.dimensions = image.width && image.height 
            ? { width: image.width, height: image.height } 
            : null;
        }
        
        // 双页异步加载
        if (pageMode === 'double' && lastLoadedIndex === currentIndex) {
          const secondIndex = currentIndex + 1;
          if (secondIndex < book.pages.length) {
            const secondImage = await imagePool.get(secondIndex);
            if (lastLoadedIndex === currentIndex) {
              state.secondUrl = secondImage?.url ?? null;
            }
          }
        }
      } catch (err) {
        state.error = String(err);
      } finally {
        if (lastLoadedIndex === currentIndex) {
          state.loading = false;
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
