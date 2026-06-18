/**
 * StackView 图片状态管理
 * 【后端主导架构】展示态 store
 * 
 * 职责：
 * - 请求后端 frame snapshot
 * - 在 ready 时替换 currentFrame
 * - 保留 previousFrame 直到新 frame ready（双缓冲）
 * - 向 UI 暴露状态
 * 
 * 不再负责：
 * - 预解码
 * - ImageBitmap 缓存调度
 * - Blob 缓存调度
 * - dimensions 探测主链
 * - preload 策略
 * - frame 组合逻辑
 * - second page 判断
 * - 后台背景色计算
 */

import { bookStore } from '$lib/stores/book.svelte';
import { getFrameSnapshot, getReaderWindow, reportViewport, triggerPreload, type FrameSnapshot, type FrameImageInfo, type GetFrameSnapshotParams, type ReaderWindow } from '$lib/api/frameApi';
import { settingsManager } from '$lib/settings/settingsManager';
import type { Frame, FrameImage, FrameLayout } from '../types/frame';
import { emptyFrame } from '../types/frame';


// ============================================================================
// URL 平台适配（Windows 需要 http://neoview.localhost）
// ============================================================================

const PROTOCOL_BASE = (() => {
  if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) {
    return 'http://neoview.localhost';
  }
  return 'neoview://localhost';
})();

function fixUrl(url: string): string {
  if (!url) return url;
  if (PROTOCOL_BASE !== 'neoview://localhost' && url.startsWith('neoview://localhost')) {
    return PROTOCOL_BASE + url.slice('neoview://localhost'.length);
  }
  return url;
}

const PRELOAD_URL_CACHE_LIMIT = 512;
const PRELOAD_WINDOW_CACHE_LIMIT = 96;
const preloadedUrlSet = new Set<string>();
const preloadedUrlQueue: string[] = [];
const preloadedWindowSet = new Set<string>();
const preloadedWindowQueue: string[] = [];
const activePreloadImages = new Set<HTMLImageElement>();

function rememberLimited(set: Set<string>, queue: string[], value: string, limit: number): boolean {
  if (set.has(value)) return false;
  set.add(value);
  queue.push(value);

  while (queue.length > limit) {
    const oldValue = queue.shift();
    if (oldValue) set.delete(oldValue);
  }

  return true;
}

function makeWindowPreloadKey(bookPath: string, centerPage: number, radius: number, params: GetFrameSnapshotParams): string {
  return JSON.stringify({
    bookPath,
    centerPage,
    radius,
    pageMode: params.pageMode,
    readOrder: params.readOrder,
    splitHorizontal: params.splitHorizontal,
    widePage: params.widePage,
    singleFirst: params.singleFirst,
    singleLast: params.singleLast,
    divideRate: params.divideRate,
    splitHalf: params.splitHalf ?? null,
  });
}

function getPreloadRadius(): number {
  const configured = settingsManager.getSettings().performance?.preLoadSize ?? 3;
  return Math.min(8, Math.max(1, Math.round(configured)));
}

function collectPreloadUrls(window: ReaderWindow, currentFrameId: string): string[] {
  const urls: string[] = [];

  for (const frame of window.frames) {
    if (frame.frameId === currentFrameId) continue;

    for (const img of frame.images) {
      if (img.isDummy || !img.url) continue;
      urls.push(fixUrl(img.url));
    }
  }

  return urls;
}

function preloadImageUrl(url: string): void {
  if (typeof Image === 'undefined') return;
  if (!rememberLimited(preloadedUrlSet, preloadedUrlQueue, url, PRELOAD_URL_CACHE_LIMIT)) return;

  const image = new Image();
  image.decoding = 'async';
  image.onload = image.onerror = () => {
    activePreloadImages.delete(image);
  };
  activePreloadImages.add(image);
  image.src = url;
}


// ============================================================================
// 类型定义
// ============================================================================

export interface ImageState {
  /** 当前帧快照（后端输出） */
  currentFrame: FrameSnapshot | null;
  /** 上一帧快照（双缓冲，翻页时保留直到新帧 ready） */
  previousFrame: FrameSnapshot | null;
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
    currentFrame: null,
    previousFrame: null,
    loading: false,
    error: null,
  });

  let lastBookPath: string | null = null;
  let pendingRequestToken = 0;

  function resolvePageDimensions(pageIndex: number): { width: number; height: number } | null {
    const page = bookStore.currentBook?.pages?.[pageIndex];
    const width = page?.width;
    const height = page?.height;
    if (
      typeof width === 'number' &&
      typeof height === 'number' &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return { width, height };
    }
    return null;
  }

  function resolveImageDimensions(img: FrameImageInfo): { width: number; height: number } | null {
    if (
      typeof img.width === 'number' &&
      typeof img.height === 'number' &&
      Number.isFinite(img.width) &&
      Number.isFinite(img.height) &&
      img.width > 0 &&
      img.height > 0
    ) {
      return { width: img.width, height: img.height };
    }
    return resolvePageDimensions(img.pageIndex);
  }

  function fillSnapshotDimensions(snapshot: FrameSnapshot): FrameSnapshot {
    let changed = false;
    const images = snapshot.images.map((img) => {
      if (img.isDummy) return img;
      const dimensions = resolveImageDimensions(img);
      if (!dimensions || (img.width === dimensions.width && img.height === dimensions.height)) {
        return img;
      }
      changed = true;
      return {
        ...img,
        width: dimensions.width,
        height: dimensions.height,
      };
    });

    return changed ? { ...snapshot, images } : snapshot;
  }

  function hasMissingImageDimensions(snapshot: FrameSnapshot): boolean {
    return snapshot.images.some((img) => !img.isDummy && !resolveImageDimensions(img));
  }

  async function preloadReaderWindow(params: GetFrameSnapshotParams, snapshot: FrameSnapshot, token: number): Promise<void> {
    const book = bookStore.currentBook;
    if (!book) return;

    const radius = getPreloadRadius();
    const preloadKey = makeWindowPreloadKey(book.path, snapshot.pageIndex, radius, params);
    if (!rememberLimited(preloadedWindowSet, preloadedWindowQueue, preloadKey, PRELOAD_WINDOW_CACHE_LIMIT)) {
      return;
    }

    try {
      const window = await getReaderWindow(snapshot.pageIndex, radius, params);
      if (token !== pendingRequestToken || bookStore.currentBook?.path !== book.path) {
        return;
      }

      for (const url of collectPreloadUrls(window, snapshot.frameId)) {
        preloadImageUrl(url);
      }
    } catch (err) {
      console.warn('[imageStore] preload reader window failed:', err);
    }
  }

  function schedulePreload(params: GetFrameSnapshotParams, snapshot: FrameSnapshot, token: number): void {
    const run = () => {
      void triggerPreload().catch((err) => {
        console.warn('[imageStore] backend preload failed:', err);
      });
      void preloadReaderWindow(params, snapshot, token);
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      setTimeout(run, 0);
    }
  }

  /**
   * 请求当前帧快照
   * 【双缓冲】旧帧保留直到新帧 ready
   */
  async function loadCurrentPage(params: GetFrameSnapshotParams, force = false) {
    const book = bookStore.currentBook;
    const page = bookStore.currentPage;

    // 场景：关闭 viewer / 无书 / 无页 → 允许清空
    if (!book || !page) {
      state.currentFrame = null;
      state.previousFrame = null;
      state.loading = false;
      return;
    }

    // 检测书本变化 → 切书时必须清空旧帧
    const bookChanged = lastBookPath !== book.path;
    if (bookChanged) {
      lastBookPath = book.path;
      state.currentFrame = null;
      state.previousFrame = null;
      state.loading = false;
    }

    // 避免重复加载
    if (!force && !bookChanged && state.currentFrame && state.currentFrame.pageIndex === bookStore.currentPageIndex) {
      return;
    }

    // 递增 token，用于丢弃过期的异步结果
    const myToken = ++pendingRequestToken;
    const flipStartTime = performance.now();

    // 异步请求：旧帧保留，loading=true
    state.loading = true;

    try {
      const rawSnapshot = await getFrameSnapshot(params);
      const resourceReadyMs = performance.now() - flipStartTime;

      if (myToken !== pendingRequestToken || bookStore.currentPageIndex !== rawSnapshot.pageIndex) {
        console.log(`[imageStore] page=${params.pageMode} DROPPED (stale) resourceReadyMs=${resourceReadyMs.toFixed(1)}`);
        return;
      }

      // Fix URLs (platform adaptation only, no more per-page IPC registration)
      // Fallback for missing dimensions (backend usually provides them now)
      const snapshot = fillSnapshotDimensions({
        ...rawSnapshot,
        images: rawSnapshot.images.map(img => ({ ...img, url: fixUrl(img.url) }))
      });

      // 【关键】只有 token 匹配且页码未变时才提交新帧
      if (myToken !== pendingRequestToken || bookStore.currentPageIndex !== snapshot.pageIndex) {
        console.log(`[imageStore] page=${params.pageMode} DROPPED (stale) resourceReadyMs=${resourceReadyMs.toFixed(1)}`);
        return;
      }

      if (state.currentFrame && hasMissingImageDimensions(snapshot)) {
        console.warn(`[imageStore] page=${snapshot.pageIndex} DROPPED (missing dimensions)`);
        state.loading = false;
        return;
      }

      console.log(`[imageStore] page=${snapshot.pageIndex} layout=${snapshot.layout} images=${snapshot.images.length} resourceReadyMs=${resourceReadyMs.toFixed(1)}`);

      // 双缓冲：旧帧移到 previousFrame，新帧设为 currentFrame
      if (state.currentFrame && state.currentFrame.frameId !== snapshot.frameId) {
        state.previousFrame = state.currentFrame;
      }
      state.currentFrame = snapshot;
      state.loading = false;
      schedulePreload(params, snapshot, myToken);

    } catch (err) {
      if (myToken === pendingRequestToken) {
        state.error = String(err);
        state.loading = false;
      }
    }
  }

  /**
   * 上报视口尺寸
   */
  function reportViewportSize(width: number, height: number, dpr: number, viewMode: 'single' | 'double' | 'panorama') {
    // Rust 端期望 u32，必须取整
    const safeWidth = Math.max(0, Math.round(width));
    const safeHeight = Math.max(0, Math.round(height));
    reportViewport(safeWidth, safeHeight, dpr, viewMode).catch(err => {
      console.warn('[imageStore] 上报视口失败:', err);
    });
  }

  /**
   * 将 FrameSnapshot 转换为前端 Frame（兼容现有渲染层）
   */
  function snapshotToFrame(snapshot: FrameSnapshot | null): Frame {
    if (!snapshot || snapshot.images.length === 0) {
      return emptyFrame;
    }

    const images: FrameImage[] = snapshot.images
      .filter(img => !img.isDummy && img.url)
      .map((img: FrameImageInfo): FrameImage => {
        const dimensions = resolveImageDimensions(img);
        return {
          url: img.url,
          physicalIndex: img.pageIndex,
          virtualIndex: img.pageIndex,
          width: dimensions?.width,
          height: dimensions?.height,
          splitHalf: img.splitHalf ?? undefined,
          cropRect: img.cropRect ?? undefined,
          scale: img.scale !== 1.0 ? img.scale : undefined,
          rotation: img.rotation || undefined,
        };
      });

    if (images.length === 0) {
      return emptyFrame;
    }

    const layout: FrameLayout = snapshot.layout === 'double' ? 'double' : 'single';

    return {
      id: snapshot.frameId,
      images,
      layout,
    };
  }

  /**
   * 获取当前帧（转换为前端 Frame 格式）
   */
  function getCurrentFrame(): Frame {
    return snapshotToFrame(state.currentFrame);
  }

  /**
   * 获取上一帧（双缓冲，用于过渡动画）
   */
  function getPreviousFrame(): Frame {
    return snapshotToFrame(state.previousFrame);
  }

  /**
   * 获取当前帧的主图尺寸
   */
  function getMainImageSize(): { width: number; height: number } {
    const snapshot = state.currentFrame;
    if (!snapshot || snapshot.images.length === 0) {
      return { width: 0, height: 0 };
    }
    const mainImage = snapshot.images[0];
    if (!mainImage || mainImage.isDummy) {
      return { width: 0, height: 0 };
    }
    // 考虑裁剪区域
    const dimensions = resolveImageDimensions(mainImage);
    if (!dimensions) {
      return { width: 0, height: 0 };
    }

    let width = dimensions.width;
    let height = dimensions.height;
    if (mainImage.cropRect) {
      width = Math.round(width * mainImage.cropRect.width);
    }
    return { width, height };
  }

  /**
   * 重置状态
   */
  function reset() {
    state.currentFrame = null;
    state.previousFrame = null;
    state.loading = false;
    state.error = null;
    lastBookPath = null;
    pendingRequestToken++;
  }

  return {
    get state() { return state; },
    loadCurrentPage,
    reportViewportSize,
    getCurrentFrame,
    getPreviousFrame,
    getMainImageSize,
    snapshotToFrame,
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
