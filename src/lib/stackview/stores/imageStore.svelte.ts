/**
 * StackView 图片状态管理
 * 复刻 ImageViewer 的核心加载逻辑
 */

import { bookStore } from '$lib/stores/book.svelte';
import { SvelteMap } from 'svelte/reactivity';
import { readPageBlob } from '../utils/imageReader';
import type { Page } from '$lib/types';

// ============================================================================
// 类型定义
// ============================================================================

export interface PanoramaImage {
  url: string;
  pageIndex: number;
  width?: number;
  height?: number;
}

export interface ImageState {
  /** 当前图片 URL */
  currentUrl: string | null;
  /** 第二张图片 URL（双页模式） */
  secondUrl: string | null;
  /** 全景模式图片列表 */
  panoramaImages: PanoramaImage[];
  /** 超分图片 URL */
  upscaledUrl: string | null;
  /** 前一页图片 URL（预加载） */
  prevUrl: string | null;
  /** 后一页图片 URL（预加载） */
  nextUrl: string | null;
  /** 当前图片尺寸 */
  dimensions: { width: number; height: number } | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

export interface ImageCache {
  url: string;
  blob?: Blob;
  pageIndex: number;
}

// ============================================================================
// 图片加载函数
// ============================================================================

/**
 * 从页面索引加载图片（复用 imageReader）
 */
export async function loadImageByIndex(pageIndex: number): Promise<{ url: string; blob: Blob } | null> {
  try {
    const { blob } = await readPageBlob(pageIndex);
    const url = URL.createObjectURL(blob);
    return { url, blob };
  } catch (err) {
    console.error('[ImageStore] Load error:', err);
    return null;
  }
}

/**
 * 获取图片尺寸
 */
export function getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * 释放 Blob URL
 */
export function revokeUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// 创建图片 Store
// ============================================================================

export function createImageStore() {
  // 状态
  const state = $state<ImageState>({
    currentUrl: null,
    secondUrl: null,
    panoramaImages: [],
    upscaledUrl: null,
    prevUrl: null,
    nextUrl: null,
    dimensions: null,
    loading: false,
    error: null,
  });
  
  // 缓存
  const cache = new SvelteMap<number, ImageCache>();
  let lastLoadedIndex = -1;
  
  let lastViewMode: 'single' | 'double' | 'panorama' = 'single';
  
  /**
   * 加载当前页面
   */
  async function loadCurrentPage(viewMode: 'single' | 'double' | 'panorama' = 'single') {
    const currentIndex = bookStore.currentPageIndex;
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;
    
    
    if (!book || !page) {
      state.currentUrl = null;
      state.secondUrl = null;
      state.panoramaImages = [];
      state.dimensions = null;
      return;
    }
    
    // 视图模式改变时强制重新加载
    const viewModeChanged = viewMode !== lastViewMode;
    lastViewMode = viewMode;
    
    // 避免重复加载（但视图模式改变时强制加载）
    if (!viewModeChanged && currentIndex === lastLoadedIndex && state.currentUrl) {
      return;
    }
    
    state.loading = true;
    state.error = null;
    lastLoadedIndex = currentIndex;
    
    try {
      // 检查缓存
      const cached = cache.get(currentIndex);
      if (cached) {
        state.currentUrl = cached.url;
      } else {
        // 加载当前页
        const result = await loadImageByIndex(currentIndex);
        if (result) {
          state.currentUrl = result.url;
          cache.set(currentIndex, { url: result.url, blob: result.blob, pageIndex: currentIndex });
        } else {
          state.currentUrl = null;
        }
      }
      
      // 获取尺寸
      if (state.currentUrl) {
        state.dimensions = await getImageDimensions(state.currentUrl);
      }
      
      // 双页模式：加载第二张
      if (viewMode === 'double') {
        state.panoramaImages = []; // 清空全景
        const nextPage = book.pages[currentIndex + 1];
        if (nextPage) {
          const cachedNext = cache.get(currentIndex + 1);
          if (cachedNext) {
            state.secondUrl = cachedNext.url;
          } else {
            const result2 = await loadImageByIndex(currentIndex + 1);
            if (result2) {
              state.secondUrl = result2.url;
              cache.set(currentIndex + 1, { url: result2.url, blob: result2.blob, pageIndex: currentIndex + 1 });
            } else {
              state.secondUrl = null;
            }
          }
        } else {
          state.secondUrl = null;
        }
      } else if (viewMode === 'panorama') {
        // 全景模式：加载当前页周围的多张图片
        state.secondUrl = null;
        const panoramaCount = 5; // 显示5张图
        const half = Math.floor(panoramaCount / 2);
        const startIndex = Math.max(0, currentIndex - half);
        const endIndex = Math.min(book.pages.length - 1, currentIndex + half);
        
        const panoramaImages: PanoramaImage[] = [];
        
        for (let i = startIndex; i <= endIndex; i++) {
          const cached = cache.get(i);
          if (cached) {
            panoramaImages.push({ url: cached.url, pageIndex: i });
          } else {
            const result = await loadImageByIndex(i);
            if (result) {
              cache.set(i, { url: result.url, blob: result.blob, pageIndex: i });
              panoramaImages.push({ url: result.url, pageIndex: i });
            }
          }
        }
        
        state.panoramaImages = panoramaImages;
      } else {
        state.secondUrl = null;
        state.panoramaImages = [];
      }
      
      // 预加载前后页
      await preloadAdjacentPages(currentIndex, book.pages);
      
    } catch (err) {
      state.error = String(err);
      console.error('[ImageStore] Load error:', err);
    } finally {
      state.loading = false;
    }
  }
  
  /**
   * 预加载前后页
   */
  async function preloadAdjacentPages(currentIndex: number, pages: Page[]) {
    const prevIndex = currentIndex - 1;
    const nextIndex = currentIndex + 1;
    
    // 预加载前一页
    if (prevIndex >= 0 && !cache.has(prevIndex)) {
      const result = await loadImageByIndex(prevIndex);
      if (result) {
        cache.set(prevIndex, { url: result.url, blob: result.blob, pageIndex: prevIndex });
        state.prevUrl = result.url;
      }
    } else if (cache.has(prevIndex)) {
      state.prevUrl = cache.get(prevIndex)!.url;
    }
    
    // 预加载后一页
    if (nextIndex < pages.length && !cache.has(nextIndex)) {
      const result = await loadImageByIndex(nextIndex);
      if (result) {
        cache.set(nextIndex, { url: result.url, blob: result.blob, pageIndex: nextIndex });
        state.nextUrl = result.url;
      }
    } else if (cache.has(nextIndex)) {
      state.nextUrl = cache.get(nextIndex)!.url;
    }
  }
  
  /**
   * 设置超分图片
   */
  function setUpscaledUrl(url: string | null) {
    state.upscaledUrl = url;
  }
  
  /**
   * 清理缓存
   */
  function clearCache() {
    cache.forEach((entry) => revokeUrl(entry.url));
    cache.clear();
    lastLoadedIndex = -1;
  }
  
  /**
   * 重置状态
   */
  function reset() {
    revokeUrl(state.currentUrl);
    revokeUrl(state.secondUrl);
    revokeUrl(state.prevUrl);
    revokeUrl(state.nextUrl);
    
    // 直接修改属性而不是重新赋值，保持响应性
    state.currentUrl = null;
    state.secondUrl = null;
    state.panoramaImages = [];
    state.upscaledUrl = null;
    state.prevUrl = null;
    state.nextUrl = null;
    state.dimensions = null;
    state.loading = false;
    state.error = null;
    
    // 清除缓存和最后加载索引
    cache.forEach((entry) => revokeUrl(entry.url));
    cache.clear();
    lastLoadedIndex = -1;
  }
  
  return {
    get state() { return state; },
    loadCurrentPage,
    setUpscaledUrl,
    clearCache,
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
