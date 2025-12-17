/**
 * ImageTransitionManager - 图片缩放计算工具
 * 
 * 提供缩放计算函数，用于根据图片尺寸、视口尺寸和缩放模式计算适合的缩放比例
 */

import type { ZoomMode } from '$lib/settings/settingsManager';

// ============================================================================
// 类型定义
// ============================================================================

export interface ImageDimensions {
    width: number;
    height: number;
}

export interface ViewportSize {
    width: number;
    height: number;
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 计算目标缩放值
 * 根据图片尺寸、视口尺寸和缩放模式计算适合的缩放比例
 * 
 * @param dimensions 图片尺寸
 * @param viewport 视口尺寸
 * @param zoomMode 缩放模式
 * @returns 计算出的缩放比例
 */
export function calculateTargetScale(
    dimensions: ImageDimensions,
    viewport: ViewportSize,
    zoomMode: ZoomMode
): number {
    // 验证输入
    if (!dimensions.width || !dimensions.height) {
        return 1;
    }
    if (!viewport.width || !viewport.height) {
        return 1;
    }

    const ratioW = viewport.width / dimensions.width;
    const ratioH = viewport.height / dimensions.height;

    switch (zoomMode) {
        case 'original':
            return 1;
        case 'fit':
        case 'fitLeftAlign':
        case 'fitRightAlign':
            return Math.min(ratioW, ratioH);
        case 'fill':
            return Math.max(ratioW, ratioH);
        case 'fitWidth':
            return ratioW;
        case 'fitHeight':
            return ratioH;
        default:
            return Math.min(ratioW, ratioH);
    }
}

/**
 * 判断是否为横向图片
 * 
 * @param dimensions 图片尺寸
 * @returns 是否为横向图片
 */
export function isLandscapeImage(dimensions: ImageDimensions): boolean {
    return dimensions.width > dimensions.height;
}
