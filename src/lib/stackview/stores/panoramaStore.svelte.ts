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
   * 支持动态扩展：滚动时会扩展已加载的范围
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
    
    // 计算以 centerIndex 为中心的新范围
    const centerUnit = Math.floor(centerIndex / step);
    const newStartUnit = Math.max(0, centerUnit - range);
    const newEndUnit = Math.min(Math.ceil(totalPages / step) - 1, centerUnit + range);
    
    console.log(`🎯 loadPanorama: centerIndex=${centerIndex}, centerUnit=${centerUnit}, newRange=[${newStartUnit}, ${newEndUnit}], lastRange=[${lastBuildParams.start}, ${lastBuildParams.end}]`);
    
    // 如果 pageMode 变化，重置
    if (lastBuildParams.pageMode !== pageMode) {
      lastBuildParams = { start: -1, end: -1, pageMode };
    }
    
    // 计算扩展后的范围（合并旧范围和新范围）
    let startUnit: number;
    let endUnit: number;
    
    if (lastBuildParams.start === -1) {
      // 首次加载
      startUnit = newStartUnit;
      endUnit = newEndUnit;
    } else {
      // 扩展范围：取并集，确保新范围被包含
      startUnit = Math.min(lastBuildParams.start, newStartUnit);
      endUnit = Math.max(lastBuildParams.end, newEndUnit);
    }
    
    state.centerIndex = centerIndex;
    
    // 检查范围是否有变化
    const rangeChanged = startUnit !== lastBuildParams.start || endUnit !== lastBuildParams.end;
    
    // 构建所有单元，收集缺失的页面
    const missingPages: number[] = [];
    
    for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
      const startPageIndex = unitIdx * step;
      const unit = buildUnit(startPageIndex, pageMode, totalPages);
      if (!unit || unit.images.length === 0) {
        // 记录缺失的页面
        missingPages.push(startPageIndex);
        if (pageMode === 'double' && startPageIndex + 1 < totalPages) {
          missingPages.push(startPageIndex + 1);
        }
      }
    }
    
    // 如果有缺失，异步加载
    if (missingPages.length > 0) {
      state.loading = true;
      await imagePool.preload(missingPages);
      state.loading = false;
    }
    
    // 范围有变化或有新加载的页面时，重新构建所有单元
    if (rangeChanged || missingPages.length > 0) {
      const newUnits: PanoramaUnit[] = [];
      for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
        const startPageIndex = unitIdx * step;
        const unit = buildUnit(startPageIndex, pageMode, totalPages);
        if (unit) {
          newUnits.push(unit);
        }
      }
      state.units = newUnits;
    }
    
    // 更新已加载范围
    lastBuildParams = { start: startUnit, end: endUnit, pageMode };
    
    // 后台预加载更多
    imagePool.preloadRange(centerIndex, 5);
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
