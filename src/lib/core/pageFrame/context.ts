/**
 * PageFrameContext - 页面帧上下文配置
 * 
 * 翻译自 Rust 后端的 context.rs
 * 控制页面帧的构建行为
 */

import type { 
	PageMode, 
	ReadOrder, 
	Size, 
	AutoRotateType, 
	StretchMode,
	WidePageStretch 
} from './types';
import { ReadOrder as ReadOrderUtils } from './types';

/**
 * 页面帧上下文配置
 * 
 * 控制页面帧的构建行为，包括：
 * - 单页/双页模式
 * - 阅读方向
 * - 横向页面分割
 * - 横向页面独占
 * - 首页/末页单独显示
 */
export interface PageFrameContext {
	/** 页面模式（单页/双页） */
	pageMode: PageMode;
	/** 阅读顺序（LTR/RTL） */
	readOrder: ReadOrder;
	/** 是否分割横向页面（单页模式下） */
	isSupportedDividePage: boolean;
	/** 横向页面是否独占（双页模式下） */
	isSupportedWidePage: boolean;
	/** 首页是否单独显示（双页模式下） */
	isSupportedSingleFirst: boolean;
	/** 末页是否单独显示（双页模式下） */
	isSupportedSingleLast: boolean;
	/** 分割阈值（宽高比大于此值时分割） */
	dividePageRate: number;
	/** 自动旋转模式 */
	autoRotate: AutoRotateType;
	/** 拉伸模式 */
	stretchMode: StretchMode;
	/** 画布尺寸 */
	canvasSize: Size;
	/** 宽页拉伸模式（双页模式下的对齐方式） */
	widePageStretch: WidePageStretch;
}

/** 默认上下文配置 */
export const defaultPageFrameContext: PageFrameContext = {
	pageMode: 'single',
	readOrder: 'ltr',
	isSupportedDividePage: false,
	isSupportedWidePage: true,
	isSupportedSingleFirst: true,
	isSupportedSingleLast: false,
	dividePageRate: 1.0,
	autoRotate: 'none',
	stretchMode: 'uniform',
	canvasSize: { width: 0, height: 0 },
	widePageStretch: 'uniformHeight'
};

export const PageFrameContextUtils = {
	/** 创建默认上下文 */
	create(): PageFrameContext {
		return { ...defaultPageFrameContext };
	},
	
	/** 获取方向值 (1=LTR, -1=RTL) */
	direction(ctx: PageFrameContext): number {
		return ReadOrderUtils.direction(ctx.readOrder);
	},
	
	/** 是否为单页模式 */
	isSingleMode(ctx: PageFrameContext): boolean {
		return ctx.pageMode === 'single';
	},
	
	/** 是否为双页模式 */
	isDoubleMode(ctx: PageFrameContext): boolean {
		return ctx.pageMode === 'double';
	},
	
	/** 是否为 RTL 模式 */
	isRtl(ctx: PageFrameContext): boolean {
		return ctx.readOrder === 'rtl';
	},
	
	/** 是否为 LTR 模式 */
	isLtr(ctx: PageFrameContext): boolean {
		return ctx.readOrder === 'ltr';
	}
};
