/**
 * StackView 缩放和视图控制工具函数
 */
import type { ZoomMode } from '$lib/settings/settingsManager';

// ============ 缩放操作 ============

/**
 * 增加缩放比例
 */
export function calculateZoomIn(currentScale: number, step: number = 0.1, max: number = 5): number {
	return Math.min(max, currentScale + step);
}

/**
 * 减小缩放比例
 */
export function calculateZoomOut(currentScale: number, step: number = 0.1, min: number = 0.1): number {
	return Math.max(min, currentScale - step);
}

/**
 * 限制缩放范围
 */
export function clampScale(scale: number, min: number = 0.1, max: number = 5): number {
	return Math.min(max, Math.max(min, scale));
}

// ============ 视图状态 ============

export interface ViewState {
	scale: number;
	rotation: number;
	offsetX: number;
	offsetY: number;
}

/**
 * 创建默认视图状态
 */
export function createDefaultViewState(): ViewState {
	return {
		scale: 1.0,
		rotation: 0,
		offsetX: 0,
		offsetY: 0
	};
}

/**
 * 重置视图状态
 */
export function resetViewState(state: ViewState): ViewState {
	return {
		...state,
		scale: 1.0,
		rotation: 0,
		offsetX: 0,
		offsetY: 0
	};
}

// ============ 旋转操作 ============

/**
 * 顺时针旋转 90 度
 */
export function rotateClockwise(currentRotation: number): number {
	return (currentRotation + 90) % 360;
}

/**
 * 逆时针旋转 90 度
 */
export function rotateCounterClockwise(currentRotation: number): number {
	return (currentRotation - 90 + 360) % 360;
}

/**
 * 重置旋转角度
 */
export function resetRotation(): number {
	return 0;
}

// ============ 视口尺寸 ============

export interface ViewportSize {
	width: number;
	height: number;
}

/**
 * 检查视口尺寸是否有效
 */
export function isValidViewport(viewport: ViewportSize): boolean {
	return viewport.width > 0 && viewport.height > 0;
}

/**
 * 计算图片是否为横向
 */
export function isLandscapeImage(width: number, height: number): boolean {
	return width > height;
}

/**
 * 计算视口是否为横向
 */
export function isLandscapeViewport(viewport: ViewportSize): boolean {
	return viewport.width > viewport.height;
}

// ============ 缩放模式 ============

/**
 * 切换到下一个缩放模式
 */
export function cycleZoomMode(current: ZoomMode): ZoomMode {
	const modes: ZoomMode[] = ['fit', 'fitWidth', 'fitHeight', 'original'];
	const currentIndex = modes.indexOf(current);
	const nextIndex = (currentIndex + 1) % modes.length;
	return modes[nextIndex];
}

/**
 * 获取缩放模式显示名称
 */
export function getZoomModeName(mode: ZoomMode): string {
	switch (mode) {
		case 'fit': return '适应';
		case 'fitWidth': return '适宽';
		case 'fitHeight': return '适高';
		case 'fill': return '填充';
		case 'fitLeftAlign': return '左对齐适应';
		case 'fitRightAlign': return '右对齐适应';
		case 'original': return '原始';
		default: return mode;
	}
}
