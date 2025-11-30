/**
 * StackView 图片状态管理
 * 接收从 ImageViewer 传入的图片数据
 */

import { bookStore } from '$lib/stores/book.svelte';

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
  
  let currentBookPath: string | null = null;
  
  /**
   * 设置图片数据（从 ImageViewer 传入）
   */
  function setImageData(
    url: string | null,
    url2: string | null,
    dims: { width: number; height: number } | null,
    pageMode: 'single' | 'double' = 'single'
  ) {
    const book = bookStore.currentBook;
    
    // 检测书本变化
    if (book && currentBookPath !== book.path) {
      currentBookPath = book.path;
    }
    
    state.currentUrl = url;
    state.dimensions = dims;
    state.loading = !url;
    
    if (pageMode === 'double') {
      state.secondUrl = url2;
    } else {
      state.secondUrl = null;
    }
  }
  
  /**
   * 加载当前页面（兼容旧 API，现在是空操作）
   */
  function loadCurrentPage(pageMode: 'single' | 'double' = 'single', force = false) {
    // 图片加载由 ImageViewer 通过 setImageData 驱动
    void pageMode;
    void force;
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
    currentBookPath = null;
  }
  
  return {
    get state() { return state; },
    setImageData,
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
