/**
 * StackView 模块导出
 * 
 * 层叠式图片查看器（独立模式）
 * 使用 imageStore 管理图片加载，复用现有手势和缩放
 */

// 缩放工具导出
export {
	calculateZoomIn,
	calculateZoomOut,
	clampScale,
	createDefaultViewState,
	resetViewState,
	rotateClockwise,
	rotateCounterClockwise,
	resetRotation,
	isValidViewport,
	isLandscapeImage,
	isLandscapeViewport,
	cycleZoomMode,
	getZoomModeName,
	type ViewState,
	type ViewportSize
} from './zoomUtils';

// 类型导出
export interface DisplaySize {
  width: number;
  height: number;
}

// 对齐模式
export type AlignMode = 'center' | 'left' | 'right';
