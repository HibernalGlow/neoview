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
import { getFrameSnapshot, reportViewport, type FrameSnapshot, type FrameImageInfo, type GetFrameSnapshotParams } from '$lib/api/frameApi';
import { getArchiveImageUrl, getFileImageUrl, registerBookPath, resolveProtocolBaseUrl } from '$lib/api/imageProtocol';
import type { Frame, FrameImage, FrameLayout } from '../types/frame';
import { emptyFrame } from '../types/frame';
import { thumbnailService } from '$lib/services/thumbnailService';

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

  async function normalizeSnapshotUrls(snapshot: FrameSnapshot): Promise<FrameSnapshot> {
    const book = bookStore.currentBook;
    if (!book || snapshot.images.length === 0) {
      return snapshot;
    }

    const needsNormalization = snapshot.images.some((img) =>
      typeof img.url === 'string' &&
      (img.url.includes('://localhost/archive?') || img.url.includes('://localhost/image?'))
    );

    if (!needsNormalization) {
      return snapshot;
    }

    await resolveProtocolBaseUrl().catch(() => null);

    const isArchiveLike = book.type === 'archive' || book.type === 'epub';
    const bookHash = isArchiveLike ? await registerBookPath(book.path).catch(() => null) : null;

    const normalizedImages = await Promise.all(
      snapshot.images.map(async (img) => {
        if (!img.url || img.isDummy) {
          return img;
        }

        const page = book.pages[img.pageIndex];
        if (!page) {
          return img;
        }

        try {
          if (isArchiveLike) {
            if (bookHash == null) {
              return img;
            }
            return {
              ...img,
              url: getArchiveImageUrl(bookHash, page.entryIndex),
            };
          }

          const pathHash = await registerBookPath(page.path);
          return {
            ...img,
            url: getFileImageUrl(pathHash),
          };
        } catch {
          return img;
        }
      })
    );

    return {
      ...snapshot,
      images: normalizedImages,
    };
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

      const snapshot = await normalizeSnapshotUrls(rawSnapshot);

      // 【关键】只有 token 匹配且页码未变时才提交新帧
      if (myToken !== pendingRequestToken || bookStore.currentPageIndex !== snapshot.pageIndex) {
        console.log(`[imageStore] page=${params.pageMode} DROPPED (stale) resourceReadyMs=${resourceReadyMs.toFixed(1)}`);
        return;
      }

      console.log(`[imageStore] page=${snapshot.pageIndex} layout=${snapshot.layout} images=${snapshot.images.length} resourceReadyMs=${resourceReadyMs.toFixed(1)}`);

      // 双缓冲：旧帧移到 previousFrame，新帧设为 currentFrame
      if (state.currentFrame && state.currentFrame.frameId !== snapshot.frameId) {
        state.previousFrame = state.currentFrame;
      }
      state.currentFrame = snapshot;
      state.loading = false;
      if (snapshot.ready && snapshot.images.length > 0) {
        thumbnailService.notifyMainImageReady();
      }
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
      .map((img: FrameImageInfo): FrameImage => ({
        url: img.url,
        physicalIndex: img.pageIndex,
        virtualIndex: img.pageIndex,
        width: img.width || undefined,
        height: img.height || undefined,
        splitHalf: img.splitHalf ?? undefined,
        cropRect: img.cropRect ?? undefined,
        scale: img.scale !== 1.0 ? img.scale : undefined,
        rotation: img.rotation || undefined,
      }));

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
    let width = mainImage.width;
    let height = mainImage.height;
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
