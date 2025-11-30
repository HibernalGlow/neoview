/**
 * 全景模式状态管理
 * 使用共享 ImagePool，避免重复加载
 */

import { bookStore } from '$lib/stores/book.svelte';
import { imagePool } from './imagePool.svelte';
import type { PageMode } from '$lib/stores/bookContext.svelte';

// ============================================================================
// 类型定义
// ============================================================================

/** 全景帧单元 */
export interface PanoramaUnit {
  id: string;
  startIndex: number;
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
  enabled: boolean;
  units: PanoramaUnit[];
  centerIndex: number;
  loading: boolean;
  preloadRange: number;
}

// ============================================================================
// 创建全景 Store（使用共享 ImagePool）
// ============================================================================

export function createPanoramaStore() {
  const state = $state<PanoramaState>({
    enabled: false,
    units: [],
    centerIndex: 0,
    loading: false,
    preloadRange: 3,
  });
  
  // 追踪已构建的单元
  let lastBuildParams = { start: -1, end: -1, pageMode: '' as string };
  
  /**
   * 启用/禁用全景模式
   */
  function setEnabled(enabled: boolean) {
    state.enabled = enabled;
    if (!enabled) {
      state.units = [];
      lastBuildParams = { start: -1, end: -1, pageMode: '' };
    }
  }
  
  /**
   * 加载全景视图 - 使用共享池
   */
  async function loadPanorama(centerIndex: number, pageMode: PageMode) {
    if (!state.enabled) return;
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    // 设置书本路径
    imagePool.setCurrentBook(book.path);
    
    const totalPages = book.pages.length;
    const step = pageMode === 'double' ? 2 : 1;
    const range = state.preloadRange;
    
    const startUnit = Math.max(0, Math.floor(centerIndex / step) - range);
    const endUnit = Math.min(Math.ceil(totalPages / step) - 1, Math.floor(centerIndex / step) + range);
    
    // 只更新中心索引（如果范围相同）
    if (lastBuildParams.start === startUnit && 
        lastBuildParams.end === endUnit && 
        lastBuildParams.pageMode === pageMode) {
      state.centerIndex = centerIndex;
      return;
    }
    
    state.loading = true;
    state.centerIndex = centerIndex;
    
    // 预加载所有需要的页面到共享池
    const pageIndices: number[] = [];
    for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
      const startPageIndex = unitIdx * step;
      pageIndices.push(startPageIndex);
      if (pageMode === 'double' && startPageIndex + 1 < totalPages) {
        pageIndices.push(startPageIndex + 1);
      }
    }
    
    // 并行预加载到共享池
    await imagePool.preload(pageIndices);
    
    // 从共享池构建单元
    const newUnits: PanoramaUnit[] = [];
    for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
      const startPageIndex = unitIdx * step;
      const unit = buildUnit(startPageIndex, pageMode, totalPages);
      if (unit) {
        newUnits.push(unit);
      }
    }
    
    lastBuildParams = { start: startUnit, end: endUnit, pageMode };
    state.units = newUnits;
    state.loading = false;
  }
  
  /**
   * 从共享池构建单元（同步）
   */
  function buildUnit(startIndex: number, pageMode: PageMode, totalPages: number): PanoramaUnit | null {
    const images: PanoramaImage[] = [];
    
    // 主图片
    const primary = imagePool.getSync(startIndex);
    if (primary) {
      images.push({
        url: primary.url,
        pageIndex: startIndex,
        width: primary.width,
        height: primary.height,
      });
    }
    
    // 双页模式副图片
    if (pageMode === 'double' && startIndex + 1 < totalPages) {
      const secondary = imagePool.getSync(startIndex + 1);
      if (secondary) {
        images.push({
          url: secondary.url,
          pageIndex: startIndex + 1,
          width: secondary.width,
          height: secondary.height,
        });
      }
    }
    
    if (images.length === 0) return null;
    
    return { id: `unit-${startIndex}`, startIndex, images };
  }
  
  /**
   * 重置状态（不清理共享池）
   */
  function reset() {
    lastBuildParams = { start: -1, end: -1, pageMode: '' };
    state.units = [];
    state.centerIndex = 0;
    state.loading = false;
  }
  
  return {
    get state() { return state; },
    setEnabled,
    loadPanorama,
    reset,
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
