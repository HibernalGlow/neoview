/**
 * StackView 图片状态管理
 * 使用共享 ImagePool 管理图片缓存
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
// 创建图片 Store（使用共享 ImagePool）
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
      return;
    }
    
    // 设置书本路径（切换时自动清理旧缓存）
    imagePool.setCurrentBook(book.path);
    
    // 避免重复加载（除非强制）
    if (!force && currentIndex === lastLoadedIndex && state.currentUrl) {
      return;
    }
    
    state.loading = true;
    state.error = null;
    lastLoadedIndex = currentIndex;
    
    try {
      // 从共享池获取当前页
      const image = await imagePool.get(currentIndex);
      if (image) {
        state.currentUrl = image.url;
        state.dimensions = image.width && image.height 
          ? { width: image.width, height: image.height } 
          : null;
      } else {
        state.currentUrl = null;
        state.dimensions = null;
      }
      
      // 双页模式：加载第二张
      if (pageMode === 'double') {
        const secondIndex = currentIndex + 1;
        if (secondIndex < book.pages.length) {
          const secondImage = await imagePool.get(secondIndex);
          state.secondUrl = secondImage?.url ?? null;
        } else {
          state.secondUrl = null;
        }
      } else {
        state.secondUrl = null;
      }
      
      // 后台预加载前后页（不阻塞）
      imagePool.preloadRange(currentIndex, 2);
      
    } catch (err) {
      state.error = String(err);
    } finally {
      state.loading = false;
    }
  }
  
  /**
   * 设置超分图片
   */
  function setUpscaledUrl(url: string | null) {
    state.upscaledUrl = url;
  }
  
  /**
   * 重置状态（不清理共享池）
   */
  function reset() {
    state.currentUrl = null;
    state.secondUrl = null;
    state.upscaledUrl = null;
    state.dimensions = null;
    state.loading = false;
    state.error = null;
    lastLoadedIndex = -1;
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
