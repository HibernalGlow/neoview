/**
 * StackView 缩放模式处理
 * 复刻 ImageViewer 的缩放模式逻辑
 */

import { setZoomLevel } from '$lib/stores';
import type { ZoomMode } from '$lib/settings/settingsManager';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * 计算缩放比例
 */
export function calculateZoomScale(
  mode: ZoomMode,
  dims: ImageDimensions,
  viewport: ViewportSize
): number {
  const iw = Math.max(dims.width || 0, 1);
  const ih = Math.max(dims.height || 0, 1);
  const vw = Math.max(viewport.width || 0, 1);
  const vh = Math.max(viewport.height || 0, 1);

  // 基准：fit 模式下的缩放
  const baseScale = Math.min(vw / iw, vh / ih);

  let targetScale: number;
  switch (mode) {
    case 'fit':
    case 'fitLeftAlign':
    case 'fitRightAlign':
      // 这三种模式使用相同的缩放计算，区别在于对齐方式
      targetScale = baseScale;
      break;
    case 'fill':
      targetScale = Math.max(vw / iw, vh / ih);
      break;
    case 'fitWidth':
      targetScale = vw / iw;
      break;
    case 'fitHeight':
      targetScale = vh / ih;
      break;
    case 'original':
      targetScale = 1;
      break;
    default:
      targetScale = baseScale;
  }

  // 返回相对于 fit 模式的比例
  return targetScale / baseScale;
}

/**
 * 应用缩放模式
 */
export function applyZoomMode(
  mode: ZoomMode,
  dims: ImageDimensions | null,
  viewport: ViewportSize
): void {
  if (!dims) return;
  if (viewport.width <= 0 || viewport.height <= 0) return;

  const scale = calculateZoomScale(mode, dims, viewport);
  setZoomLevel(scale);
}

/**
 * 创建缩放模式管理器
 */
export function createZoomModeManager() {
  let lastContext: {
    mode: ZoomMode;
    dimsKey: string;
    viewportKey: string;
  } | null = null;

  /**
   * 应用当前缩放模式
   */
  function apply(
    mode: ZoomMode,
    dims: ImageDimensions | null,
    viewport: ViewportSize,
    force = false
  ): void {
    if (!dims) return;
    if (viewport.width <= 0 || viewport.height <= 0) return;

    const dimsKey = `${dims.width}x${dims.height}`;
    const viewportKey = `${viewport.width}x${viewport.height}`;

    // 避免重复应用
    if (
      !force &&
      lastContext &&
      lastContext.mode === mode &&
      lastContext.dimsKey === dimsKey &&
      lastContext.viewportKey === viewportKey
    ) {
      return;
    }

    lastContext = { mode, dimsKey, viewportKey };
    const scale = calculateZoomScale(mode, dims, viewport);
    setZoomLevel(scale);
  }

  /**
   * 重置上下文
   */
  function reset(): void {
    lastContext = null;
  }

  return {
    apply,
    reset,
  };
}
