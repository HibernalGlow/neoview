/**
 * PageFrame 模块入口
 * 
 * 前端本地的页面帧布局计算系统
 * 完全翻译自 Rust 后端的 page_frame 模块
 * 消除 IPC 延迟，提升窗口缩放和翻页响应速度
 */

// 核心类型
export type {
	Size,
	PageMode,
	ReadOrder,
	WidePageStretch,
	StretchMode,
	AutoRotateType,
	PagePosition,
	PageRange,
	CropRect,
	Page,
	PageFrameElement,
	PageFrame
} from './types';

export {
	Size as SizeUtils,
	ReadOrder as ReadOrderUtils,
	PagePosition as PagePositionUtils,
	PageRange as PageRangeUtils,
	CropRect as CropRectUtils,
	Page as PageUtils,
	PageFrameElement as PageFrameElementUtils,
	PageFrame as PageFrameUtils,
	WidePageScaleCalculator
} from './types';

// 上下文配置
export type { PageFrameContext } from './context';
export { defaultPageFrameContext, PageFrameContextUtils } from './context';

// 构建器
export { PageFrameBuilder } from './builder';

// 计算器
export { 
	ContentSizeCalculator,
	calculateUniformScale,
	calculateFillScale,
	fitToViewport,
	fillViewport
} from './calculator';
