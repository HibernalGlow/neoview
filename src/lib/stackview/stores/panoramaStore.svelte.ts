/**
 * 全景模式状态管理
 * 使用后端 Protocol API，直接构建 URL
 */

import { bookStore } from '$lib/stores/book.svelte';
import { getArchiveImageUrl, registerBookPath } from '$lib/api/imageProtocol';
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
// 创建全景 Store（使用后端 Protocol API）
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
  
  // 缓存当前书籍的 Protocol 哈希
  let cachedBookHash: string | null = null;
  let cachedBookPath: string | null = null;
  
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
   * 加载全景视图 - 使用 Protocol URL
   * 支持动态扩展：滚动时会扩展已加载的范围
   */
  async function loadPanorama(centerIndex: number, pageMode: PageMode) {
    if (!state.enabled) return;
    
    const book = bookStore.currentBook;
    if (!book) return;
    
    // 注册书籍路径，获取 Protocol 哈希
    if (cachedBookPath !== book.path) {
      cachedBookHash = await registerBookPath(book.path);
      cachedBookPath = book.path;
    }
    
    const totalPages = book.pages.length;
    const step = pageMode === 'double' ? 2 : 1;
    const range = state.preloadRange;
    
    // 计算以 centerIndex 为中心的新范围
    const centerUnit = Math.floor(centerIndex / step);
    const newStartUnit = Math.max(0, centerUnit - range);
    const newEndUnit = Math.min(Math.ceil(totalPages / step) - 1, centerUnit + range);
    
    // 如果 pageMode 变化，重置
    if (lastBuildParams.pageMode !== pageMode) {
      lastBuildParams = { start: -1, end: -1, pageMode };
    }
    
    // 计算扩展后的范围
    let startUnit: number;
    let endUnit: number;
    
    if (lastBuildParams.start === -1) {
      startUnit = newStartUnit;
      endUnit = newEndUnit;
    } else {
      startUnit = Math.min(lastBuildParams.start, newStartUnit);
      endUnit = Math.max(lastBuildParams.end, newEndUnit);
    }
    
    state.centerIndex = centerIndex;
    
    const rangeChanged = startUnit !== lastBuildParams.start || endUnit !== lastBuildParams.end;
    
    // 构建所有单元（使用 protocol URL，无需预加载）
    if (rangeChanged || state.units.length === 0) {
      const newUnits: PanoramaUnit[] = [];
      for (let unitIdx = startUnit; unitIdx <= endUnit; unitIdx++) {
        const startPageIndex = unitIdx * step;
        const unit = buildUnit(startPageIndex, pageMode, totalPages, book.path);
        if (unit) {
          newUnits.push(unit);
        }
      }
      state.units = newUnits;
    }
    
    // 更新已加载范围
    lastBuildParams = { start: startUnit, end: endUnit, pageMode };
  }
  
  /**
   * 使用 Protocol URL 构建单元
   */
  function buildUnit(startIndex: number, pageMode: PageMode, totalPages: number, bookPath: string): PanoramaUnit | null {
    const images: PanoramaImage[] = [];
    const book = bookStore.currentBook;
    if (!book || !cachedBookHash) return null;
    
    // 主图片 - 使用 protocol URL
    const page = book.pages[startIndex];
    if (page) {
      const entryIndex = page.entryIndex ?? startIndex;
      const url = getArchiveImageUrl(cachedBookHash, entryIndex);
      images.push({
        url,
        pageIndex: startIndex,
        width: page.width || undefined,
        height: page.height || undefined,
      });
    }
    
    // 双页模式副图片
    if (pageMode === 'double' && startIndex + 1 < totalPages) {
      const secondPage = book.pages[startIndex + 1];
      if (secondPage) {
        const entryIndex = secondPage.entryIndex ?? startIndex + 1;
        const url = getArchiveImageUrl(cachedBookHash, entryIndex);
        images.push({
          url,
          pageIndex: startIndex + 1,
          width: secondPage.width || undefined,
          height: secondPage.height || undefined,
        });
      }
    }
    
    if (images.length === 0) return null;
    
    return { id: `unit-${startIndex}`, startIndex, images };
  }
  
  /**
   * 重置状态
   */
  function reset() {
    lastBuildParams = { start: -1, end: -1, pageMode: '' };
    cachedBookHash = null;
    cachedBookPath = null;
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
