/**
 * ImageTransitionManager - 图片过渡管理器
 * 
 * 解决横竖图片切换时的视觉跳动问题：
 * 1. 使用预缓存尺寸在图片加载前计算目标缩放
 * 2. 原子性地同时更新图片源和缩放值
 * 3. 图片加载后验证并微调缩放
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

export interface TransitionState {
    /** 目标页面索引 */
    targetPageIndex: number;
    /** 预计算的目标缩放 */
    targetScale: number;
    /** 预缓存的尺寸 */
    preCachedDimensions: ImageDimensions | null;
    /** 是否正在过渡中 */
    isTransitioning: boolean;
    /** 过渡开始时间 */
    startTime: number;
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
 * 准备图片过渡
 * 在实际切换前调用，预计算目标状态
 * 
 * @param targetPageIndex 目标页面索引
 * @param preCachedDimensions 预缓存的尺寸（来自 bookStore.currentPage）
 * @param viewport 视口尺寸
 * @param zoomMode 缩放模式
 * @returns 过渡状态对象
 */
export function prepareTransition(
    targetPageIndex: number,
    preCachedDimensions: ImageDimensions | null,
    viewport: ViewportSize,
    zoomMode: ZoomMode
): TransitionState {
    let targetScale = 1;

    // 如果有预缓存尺寸，使用它计算目标缩放
    if (preCachedDimensions && preCachedDimensions.width > 0 && preCachedDimensions.height > 0) {
        targetScale = calculateTargetScale(preCachedDimensions, viewport, zoomMode);
    }

    return {
        targetPageIndex,
        targetScale,
        preCachedDimensions,
        isTransitioning: true,
        startTime: performance.now()
    };
}

/**
 * 完成过渡
 * 图片加载完成后调用，返回更新后的状态
 * 
 * @param state 当前过渡状态
 * @returns 完成后的过渡状态
 */
export function completeTransition(state: TransitionState): TransitionState {
    return {
        ...state,
        isTransitioning: false
    };
}

/**
 * 检查尺寸是否匹配
 * 比较预缓存尺寸与实际加载尺寸，判断是否需要调整
 * 
 * @param preCached 预缓存尺寸
 * @param actual 实际加载尺寸
 * @param threshold 差异阈值（默认 5%）
 * @returns 是否匹配
 */
export function checkDimensionsMatch(
    preCached: ImageDimensions | null,
    actual: ImageDimensions,
    threshold: number = 0.05
): boolean {
    if (!preCached) {
        return false;
    }

    const widthDiff = Math.abs(preCached.width - actual.width) / actual.width;
    const heightDiff = Math.abs(preCached.height - actual.height) / actual.height;

    return widthDiff <= threshold && heightDiff <= threshold;
}

/**
 * 获取最佳可用尺寸
 * 按优先级返回最佳的尺寸来源
 * 
 * @param loadedSize 加载后的尺寸
 * @param storeSize imageStore 中的尺寸
 * @param pageSize bookStore.currentPage 中的尺寸
 * @returns 最佳可用尺寸
 */
export function getBestAvailableDimensions(
    loadedSize: ImageDimensions | null,
    storeSize: ImageDimensions | null,
    pageSize: ImageDimensions | null
): ImageDimensions | null {
    // 优先级：loadedSize > storeSize > pageSize
    if (loadedSize && loadedSize.width > 0 && loadedSize.height > 0) {
        return loadedSize;
    }
    if (storeSize && storeSize.width > 0 && storeSize.height > 0) {
        return storeSize;
    }
    if (pageSize && pageSize.width > 0 && pageSize.height > 0) {
        return pageSize;
    }
    return null;
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

/**
 * 判断宽高比是否发生显著变化
 * 用于检测横竖图片切换
 * 
 * @param oldDims 旧图片尺寸
 * @param newDims 新图片尺寸
 * @returns 是否发生显著变化
 */
export function hasSignificantAspectRatioChange(
    oldDims: ImageDimensions | null,
    newDims: ImageDimensions | null
): boolean {
    if (!oldDims || !newDims) {
        return false;
    }

    const oldAspect = oldDims.width / oldDims.height;
    const newAspect = newDims.width / newDims.height;

    // 如果一个是横向一个是竖向，认为是显著变化
    const oldIsLandscape = oldAspect > 1;
    const newIsLandscape = newAspect > 1;

    return oldIsLandscape !== newIsLandscape;
}
