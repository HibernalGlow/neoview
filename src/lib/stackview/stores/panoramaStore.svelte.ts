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
    
    // 计算新的范围
    const newStartUnit = Math.max(0, Math.floor(centerIndex / step) - range);
    const newEndUnit = Math.min(Math.ceil(totalPages / step) - 1, Math.floor(centerIndex / step) + range);
    
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
      // 扩展范围：取并集
      startUnit = Math.min(lastBuildParams.start, newStartUnit);
      endUnit = Math.max(lastBuildParams.end, newEndUnit);
    }
    
    // 检查是否需要加载新内容
    const needsExpansion = startUnit < lastBuildParams.start || 
                           endUnit > lastBuildParams.end ||
                           lastBuildParams.start === -1;
    
    if (!needsExpansion) {
      // 范围没有扩展，只更新中心索引
      state.centerIndex = centerIndex;
      return;
    }
    
    state.centerIndex = centerIndex;
    
    // 先用已缓存的构建单元（即时显示）
    const cachedUnits: PanoramaUnit[] = [];
    const missingPages: number[] = [];
    
    for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
      const startPageIndex = unitIdx * step;
      const unit = buildUnit(startPageIndex, pageMode, totalPages);
      if (unit && unit.images.length > 0) {
        cachedUnits.push(unit);
      } else {
        // 记录缺失的页面
        missingPages.push(startPageIndex);
        if (pageMode === 'double' && startPageIndex + 1 < totalPages) {
          missingPages.push(startPageIndex + 1);
        }
      }
    }
    
    // 即时显示已缓存的
    if (cachedUnits.length > 0) {
      state.units = cachedUnits;
    }
    
    // 如果有缺失，异步加载
    if (missingPages.length > 0) {
      state.loading = true;
      await imagePool.preload(missingPages);
      
      // 重新构建所有单元
      const newUnits: PanoramaUnit[] = [];
      for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
        const startPageIndex = unitIdx * step;
        const unit = buildUnit(startPageIndex, pageMode, totalPages);
        if (unit) {
          newUnits.push(unit);
        }
      }
      state.units = newUnits;
      state.loading = false;
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
