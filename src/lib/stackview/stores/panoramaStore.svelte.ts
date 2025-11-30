/**
 * 全景模式状态管理
 * 独立于基础图片加载，专门处理全景滚动视图
 */

import { bookStore } from '$lib/stores/book.svelte';
import { SvelteMap } from 'svelte/reactivity';
import { readPageBlob } from '../utils/imageReader';
import type { PageMode } from '$lib/stores/viewState.svelte';

// ============================================================================
// 类型定义
// ============================================================================

/** 全景帧单元 */
export interface PanoramaUnit {
  /** 帧 ID */
  id: string;
  /** 起始页面索引 */
  startIndex: number;
  /** 图片列表 */
  images: PanoramaImage[];
}

/** 全景图片 */
export interface PanoramaImage {
  url: string;
  pageIndex: number;
  width?: number;
  height?: number;
}

/** 全景状态 */
export interface PanoramaState {
  /** 是否启用全景模式 */
  enabled: boolean;
  /** 全景帧单元列表 */
  units: PanoramaUnit[];
  /** 当前中心索引 */
  centerIndex: number;
  /** 是否正在加载 */
  loading: boolean;
  /** 预加载范围（每侧） */
  preloadRange: number;
}

// ============================================================================
// 工具函数
// ============================================================================

async function loadImageByIndex(pageIndex: number): Promise<{ url: string; blob: Blob } | null> {
  try {
    const { blob } = await readPageBlob(pageIndex);
    const url = URL.createObjectURL(blob);
    return { url, blob };
  } catch {
    return null;
  }
}

function revokeUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// 创建全景 Store
// ============================================================================

export function createPanoramaStore() {
  const state = $state<PanoramaState>({
    enabled: false,
    units: [],
    centerIndex: 0,
    loading: false,
    preloadRange: 2, // 每侧预加载2个单元（减少以提升性能）
  });
  
  // 图片缓存
  const imageCache = new SvelteMap<number, { url: string; blob?: Blob }>();
  
  /**
   * 启用/禁用全景模式
   */
  function setEnabled(enabled: boolean) {
    state.enabled = enabled;
    if (!enabled) {
      // 禁用时清空单元（但保留缓存）
      state.units = [];
    }
  }
  
  // 追踪上次加载的范围，避免重复加载
  let lastLoadedRange = { start: -1, end: -1, pageMode: '' as string };
  
  /**
   * 加载全景视图
   * @param centerIndex 中心页面索引
   * @param pageMode 页面模式（单页/双页）
   */
  async function loadPanorama(centerIndex: number, pageMode: PageMode) {
    if (!state.enabled) return;
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    const totalPages = book.pages.length;
    const step = pageMode === 'double' ? 2 : 1;
    const range = state.preloadRange;
    
    // 计算需要加载的单元范围
    const startUnit = Math.max(0, Math.floor(centerIndex / step) - range);
    const endUnit = Math.min(Math.ceil(totalPages / step) - 1, Math.floor(centerIndex / step) + range);
    
    // 检查是否需要重新加载（范围变化或模式变化）
    if (lastLoadedRange.start === startUnit && 
        lastLoadedRange.end === endUnit && 
        lastLoadedRange.pageMode === pageMode) {
      // 范围相同，只更新中心索引
      state.centerIndex = centerIndex;
      return;
    }
    
    state.loading = true;
    state.centerIndex = centerIndex;
    
    // 记录已有的单元（可复用）
    const existingUnits = new Map(state.units.map(u => [u.startIndex, u]));
    const newUnits: PanoramaUnit[] = [];
    const unitPromises: Promise<PanoramaUnit | null>[] = [];
    
    for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
      const startPageIndex = unitIdx * step;
      
      // 如果已存在且模式相同，复用
      const existing = existingUnits.get(startPageIndex);
      if (existing && lastLoadedRange.pageMode === pageMode) {
        newUnits.push(existing);
      } else {
        unitPromises.push(loadUnit(startPageIndex, pageMode, totalPages));
      }
    }
    
    // 只加载新的单元
    if (unitPromises.length > 0) {
      const results = await Promise.all(unitPromises);
      for (const unit of results) {
        if (unit) {
          newUnits.push(unit);
        }
      }
    }
    
    // 更新范围记录
    lastLoadedRange = { start: startUnit, end: endUnit, pageMode };
    
    // 按索引排序
    newUnits.sort((a, b) => a.startIndex - b.startIndex);
    state.units = newUnits;
    state.loading = false;
  }
  
  /**
   * 加载单个单元
   */
  async function loadUnit(startIndex: number, pageMode: PageMode, totalPages: number): Promise<PanoramaUnit | null> {
    const images: PanoramaImage[] = [];
    
    // 加载主图片
    const primaryImage = await loadSingleImage(startIndex);
    if (primaryImage) {
      images.push(primaryImage);
    }
    
    // 双页模式加载副图片
    if (pageMode === 'double' && startIndex + 1 < totalPages) {
      const secondaryImage = await loadSingleImage(startIndex + 1);
      if (secondaryImage) {
        images.push(secondaryImage);
      }
    }
    
    if (images.length === 0) return null;
    
    return {
      id: `unit-${startIndex}`,
      startIndex,
      images,
    };
  }
  
  /**
   * 加载单张图片（带缓存）
   */
  async function loadSingleImage(pageIndex: number): Promise<PanoramaImage | null> {
    // 检查缓存
    const cached = imageCache.get(pageIndex);
    if (cached) {
      return { url: cached.url, pageIndex };
    }
    
    // 加载新图片
    const result = await loadImageByIndex(pageIndex);
    if (result) {
      imageCache.set(pageIndex, { url: result.url, blob: result.blob });
      return { url: result.url, pageIndex };
    }
    
    return null;
  }
  
  /**
   * 滚动时更新（预加载更多）
   */
  async function onScroll(visibleStartIndex: number, visibleEndIndex: number, pageMode: PageMode) {
    if (!state.enabled) return;
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    // 计算是否需要加载更多
    const currentUnits = state.units;
    if (currentUnits.length === 0) return;
    
    const firstLoadedIndex = currentUnits[0].startIndex;
    const lastLoadedIndex = currentUnits[currentUnits.length - 1].startIndex;
    
    // 如果接近边界，加载更多
    const step = pageMode === 'double' ? 2 : 1;
    const threshold = step * 2;
    
    if (visibleStartIndex - firstLoadedIndex < threshold || lastLoadedIndex - visibleEndIndex < threshold) {
      await loadPanorama(Math.floor((visibleStartIndex + visibleEndIndex) / 2), pageMode);
    }
  }
  
  /**
   * 重置状态
   */
  function reset() {
    // 释放所有 URL
    imageCache.forEach((entry) => revokeUrl(entry.url));
    imageCache.clear();
    
    state.units = [];
    state.centerIndex = 0;
    state.loading = false;
  }
  
  /**
   * 清除缓存
   */
  function clearCache() {
    imageCache.forEach((entry) => revokeUrl(entry.url));
    imageCache.clear();
  }
  
  return {
    get state() { return state; },
    setEnabled,
    loadPanorama,
    onScroll,
    reset,
    clearCache,
  };
}

// 单例
let panoramaStore: ReturnType<typeof createPanoramaStore> | null = null;

export function getPanoramaStore() {
  if (!panoramaStore) {
    panoramaStore = createPanoramaStore();
  }
  return panoramaStore;
}
