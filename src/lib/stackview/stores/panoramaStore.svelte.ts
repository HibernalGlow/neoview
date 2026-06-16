/**
 * Panorama store.
 *
 * Panorama is a presentation layer: it controls continuous scrolling only.
 * Page grouping is delegated to the backend (pm_get_reader_window) so
 * single/double/split/wide page rules stay identical to the normal reader.
 */

import { invoke } from '@tauri-apps/api/core';
import { bookStore } from '$lib/stores/book.svelte';
import type { PageMode } from '$lib/stores/bookContext.svelte';
import type { CropRect, FrameSnapshot, SplitHalf } from '$lib/api/frameApi';

// ============================================================================
// 类型定义
// ============================================================================

/** 页面位置（与 PageFrame.PagePosition 对齐） */
interface PagePosition {
  /** 物理页面索引 */
  index: number;
  /** 分割部分 (0=左/完整, 1=右) */
  part: number;
}

/** 阅读顺序 */
type ReadOrder = 'ltr' | 'rtl';

/** 宽页拉伸模式 */
type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

/** 阅读窗口 - 多帧快照（与后端 ReaderWindow 对齐） */
interface ReaderWindow {
  centerPage: number;
  frames: FrameSnapshot[];
  preloadAhead: number[];
  preloadBehind: number[];
}

export interface PanoramaUnit {
  id: string;
  startIndex: number;
  position: PagePosition;
  images: PanoramaImage[];
  width?: number;
  height?: number;
}

export interface PanoramaImage {
  url: string;
  pageIndex: number;
  width?: number;
  height?: number;
  cropRect?: CropRect;
  splitHalf?: SplitHalf | null;
  scale?: number;
}

export interface PanoramaState {
  enabled: boolean;
  units: PanoramaUnit[];
  centerIndex: number;
  loading: boolean;
  preloadRange: number;
}

export interface PanoramaLoadOptions {
  pageMode: PageMode;
  readOrder: ReadOrder;
  splitHorizontal: boolean;
  widePage: boolean;
  singleFirst: boolean;
  singleLast: boolean;
  divideRate: number;
  widePageStretch: WidePageStretch;
}

// ============================================================================
// URL 基地址处理
// ============================================================================

/** Windows 需要 http://neoview.localhost，其他平台用 neoview://localhost */
const PROTOCOL_BASE = (() => {
  if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) {
    return 'http://neoview.localhost';
  }
  return 'neoview://localhost';
})();

/**
 * 将后端返回的 neoview://localhost URL 转换为当前平台的正确格式
 * 后端统一生成 neoview://localhost/...，前端只需做基地址替换
 */
function fixUrl(url: string): string {
  if (!url) return url;
  if (PROTOCOL_BASE !== 'neoview://localhost' && url.startsWith('neoview://localhost')) {
    return PROTOCOL_BASE + url.slice('neoview://localhost'.length);
  }
  return url;
}

// ============================================================================
// Store
// ============================================================================

export function createPanoramaStore() {
  const state = $state<PanoramaState>({
    enabled: false,
    units: [],
    centerIndex: 0,
    loading: false,
    preloadRange: 4,
  });

  let pendingLoadToken = 0;

  function setEnabled(enabled: boolean) {
    state.enabled = enabled;
    if (!enabled) {
      pendingLoadToken += 1;
      state.units = [];
    }
  }

  async function loadPanorama(centerIndex: number, options: PanoramaLoadOptions): Promise<void> {
    // Clamp center index
    const book = bookStore.currentBook;
    if (!book) return;
    const clampedCenter = clamp(centerIndex, 0, book.totalPages - 1);

    // Check if we can reuse the current window
    if (canReuseLoadedWindow(clampedCenter)) {
      state.centerIndex = clampedCenter;
      return;
    }

    const token = ++pendingLoadToken;
    state.loading = true;

    try {
      const window = await invoke<ReaderWindow>('pm_get_reader_window', {
        centerPage: clampedCenter,
        radius: state.preloadRange,
        pageMode: options.pageMode,
        readOrder: options.readOrder,
        splitHorizontal: options.splitHorizontal,
        widePage: options.widePage,
        singleFirst: options.singleFirst,
        singleLast: options.singleLast,
        divideRate: options.divideRate ?? 1.0,
        splitHalf: null,
      });

      if (token !== pendingLoadToken) return; // stale

      // Convert backend frames to panorama units
      const units = window.frames.map((snapshot) => snapshotToUnit(snapshot));
      state.units = units;
      state.centerIndex = clampedCenter;
      state.loading = false;
    } catch (err) {
      if (token !== pendingLoadToken) return;
      console.error('[PanoramaStore] loadPanorama failed:', err);
      state.loading = false;
    }
  }

  /** Convert a backend FrameSnapshot to a PanoramaUnit */
  function snapshotToUnit(snapshot: FrameSnapshot): PanoramaUnit {
    const images: PanoramaImage[] = snapshot.images
      .filter((img) => !img.isDummy && img.url)
      .map((img) => ({
        url: fixUrl(img.url),
        pageIndex: img.pageIndex,
        width: img.width,
        height: img.height,
        cropRect: img.cropRect,
        splitHalf: img.splitHalf ?? null,
        scale: img.scale,
      }));

    return {
      id: snapshot.frameId,
      startIndex: snapshot.pageIndex,
      position: { index: snapshot.pageIndex, part: 0 },
      images,
      width: 0, // will be calculated by layout
      height: 0,
    };
  }

  function canReuseLoadedWindow(pageIndex: number): boolean {
    if (state.units.length === 0) return false;

    const unitIndex = state.units.findIndex((unit) =>
      unit.startIndex === pageIndex || unit.images.some((image) => image.pageIndex === pageIndex)
    );
    if (unitIndex < 0) return false;

    // Keep the existing DOM stable while scrolling through the middle of the window.
    // Rebuild only near the edges so the window can extend in the scroll direction.
    const edgeMargin = Math.min(2, Math.floor(state.units.length / 2));
    return unitIndex >= edgeMargin && unitIndex < state.units.length - edgeMargin;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function reset() {
    pendingLoadToken += 1;
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

let panoramaStore: ReturnType<typeof createPanoramaStore> | null = null;

export function getPanoramaStore() {
  if (!panoramaStore) {
    panoramaStore = createPanoramaStore();
  }
  return panoramaStore;
}
