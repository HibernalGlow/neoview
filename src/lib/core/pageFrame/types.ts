/**
 * PageFrame 核心类型定义
 * 
 * 翻译自 Rust 后端的 page_frame 模块，实现前端本地布局计算
 * 消除 IPC 延迟，提升窗口缩放和翻页响应速度
 */

// ============================================================================
// 基础类型
// ============================================================================

/** 尺寸 */
export interface Size {
	width: number;
	height: number;
}

export const Size = {
	zero(): Size {
		return { width: 0, height: 0 };
	},
	
	new(width: number, height: number): Size {
		return { width, height };
	},
	
	/** 是否为横向 */
	isLandscape(size: Size): boolean {
		return size.width > size.height;
	},
	
	/** 宽高比 */
	aspectRatio(size: Size): number {
		return size.height > 0 ? size.width / size.height : 1.0;
	}
};

/** 页面模式 */
export type PageMode = 'single' | 'double';

/** 阅读顺序 */
export type ReadOrder = 'ltr' | 'rtl';

export const ReadOrder = {
	/** 获取方向值 (1=LTR, -1=RTL) */
	direction(order: ReadOrder): number {
		return order === 'ltr' ? 1 : -1;
	}
};

/** 宽页拉伸模式 */
export type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

/** 拉伸模式 */
export type StretchMode = 
	| 'none'
	| 'uniform'
	| 'uniformToFill'
	| 'uniformToVertical'
	| 'uniformToHorizontal'
	| 'fill';

/** 自动旋转类型 */
export type AutoRotateType = 'none' | 'left' | 'right' | 'auto';

// ============================================================================
// 页面位置
// ============================================================================

/**
 * 页面位置
 * 
 * 表示一个页面的位置，支持分割页面
 * - index: 物理页面索引
 * - part: 分割部分 (0=左/完整, 1=右)
 */
export interface PagePosition {
	/** 物理页面索引 */
	index: number;
	/** 分割部分 (0=左/完整, 1=右) */
	part: number;
}

export const PagePosition = {
	new(index: number, part: number = 0): PagePosition {
		return { index, part: Math.min(part, 1) };
	},
	
	full(index: number): PagePosition {
		return { index, part: 0 };
	},
	
	left(index: number): PagePosition {
		return { index, part: 0 };
	},
	
	right(index: number): PagePosition {
		return { index, part: 1 };
	},
	
	isLeft(pos: PagePosition): boolean {
		return pos.part === 0;
	},
	
	isRight(pos: PagePosition): boolean {
		return pos.part === 1;
	},
	
	/** 比较两个位置 */
	compare(a: PagePosition, b: PagePosition): number {
		if (a.index !== b.index) {
			return a.index - b.index;
		}
		return a.part - b.part;
	},
	
	equals(a: PagePosition, b: PagePosition): boolean {
		return a.index === b.index && a.part === b.part;
	},
	
	/** 获取下一个位置 */
	next(pos: PagePosition, isSplit: boolean): PagePosition {
		if (isSplit && pos.part === 0) {
			return { index: pos.index, part: 1 };
		}
		return { index: pos.index + 1, part: 0 };
	},
	
	/** 获取上一个位置 */
	prev(pos: PagePosition, isSplit: boolean, prevIsSplit: boolean): PagePosition | null {
		if (isSplit && pos.part === 1) {
			return { index: pos.index, part: 0 };
		}
		if (pos.index > 0) {
			return { index: pos.index - 1, part: prevIsSplit ? 1 : 0 };
		}
		return null;
	},
	
	toVirtualIndex(pos: PagePosition): number {
		return pos.index * 2 + pos.part;
	},
	
	fromVirtualIndex(virtualIndex: number): PagePosition {
		return {
			index: Math.floor(virtualIndex / 2),
			part: virtualIndex % 2
		};
	}
};

// ============================================================================
// 页面范围
// ============================================================================

/**
 * 页面范围
 * 
 * 表示一个页面帧覆盖的范围，从 min 到 max
 */
export interface PageRange {
	min: PagePosition;
	max: PagePosition;
}

export const PageRange = {
	new(min: PagePosition, max: PagePosition): PageRange {
		return { min, max };
	},
	
	single(position: PagePosition): PageRange {
		return { min: position, max: position };
	},
	
	fullPage(index: number): PageRange {
		return {
			min: PagePosition.left(index),
			max: PagePosition.right(index)
		};
	},
	
	leftHalf(index: number): PageRange {
		return PageRange.single(PagePosition.left(index));
	},
	
	rightHalf(index: number): PageRange {
		return PageRange.single(PagePosition.right(index));
	},
	
	isOnePage(range: PageRange): boolean {
		return range.min.index === range.max.index;
	},
	
	isEmpty(range: PageRange): boolean {
		return PagePosition.compare(range.min, range.max) > 0;
	},
	
	pageCount(range: PageRange): number {
		if (PageRange.isEmpty(range)) return 0;
		return range.max.index - range.min.index + 1;
	},
	
	containsIndex(range: PageRange, index: number): boolean {
		return index >= range.min.index && index <= range.max.index;
	},
	
	contains(range: PageRange, position: PagePosition): boolean {
		return PagePosition.compare(position, range.min) >= 0 &&
			   PagePosition.compare(position, range.max) <= 0;
	},
	
	startIndex(range: PageRange): number {
		return range.min.index;
	},
	
	endIndex(range: PageRange): number {
		return range.max.index;
	},
	
	merge(ranges: PageRange[]): PageRange | null {
		let min: PagePosition | null = null;
		let max: PagePosition | null = null;
		
		for (const range of ranges) {
			if (PageRange.isEmpty(range)) continue;
			
			if (!min || PagePosition.compare(range.min, min) < 0) {
				min = range.min;
			}
			if (!max || PagePosition.compare(range.max, max) > 0) {
				max = range.max;
			}
		}
		
		if (min && max) {
			return { min, max };
		}
		return null;
	}
};

// ============================================================================
// 裁剪区域
// ============================================================================

/**
 * 裁剪区域
 * 
 * 用于分割页面时指定显示区域，坐标为 0-1 归一化值
 */
export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const CropRect = {
	new(x: number, y: number, width: number, height: number): CropRect {
		return { x, y, width, height };
	},
	
	full(): CropRect {
		return { x: 0, y: 0, width: 1, height: 1 };
	},
	
	leftHalf(): CropRect {
		return { x: 0, y: 0, width: 0.5, height: 1 };
	},
	
	rightHalf(): CropRect {
		return { x: 0.5, y: 0, width: 0.5, height: 1 };
	},
	
	isFull(rect: CropRect): boolean {
		return Math.abs(rect.x) < 0.001 &&
			   Math.abs(rect.y) < 0.001 &&
			   Math.abs(rect.width - 1) < 0.001 &&
			   Math.abs(rect.height - 1) < 0.001;
	},
	
	/** 转换为 CSS clip-path 值 */
	toCssClipPath(rect: CropRect): string {
		const top = rect.y * 100;
		const right = (1 - rect.x - rect.width) * 100;
		const bottom = (1 - rect.y - rect.height) * 100;
		const left = rect.x * 100;
		return `inset(${top.toFixed(1)}% ${right.toFixed(1)}% ${bottom.toFixed(1)}% ${left.toFixed(1)}%)`;
	}
};

// ============================================================================
// 物理页面
// ============================================================================

/**
 * 物理页面
 * 
 * 表示一个实际的图片文件，包含路径、尺寸等元数据
 */
export interface Page {
	/** 页面索引 */
	index: number;
	/** 文件路径（压缩包路径或文件夹路径） */
	path: string;
	/** 内部路径（压缩包内的路径，文件夹时为完整路径） */
	innerPath: string;
	/** 文件名 */
	name: string;
	/** 文件大小（字节） */
	size: number;
	/** 图片宽度 */
	width: number;
	/** 图片高度 */
	height: number;
	/** 宽高比 */
	aspectRatio: number;
}

export const Page = {
	new(
		index: number,
		path: string,
		innerPath: string,
		name: string,
		size: number,
		width: number,
		height: number
	): Page {
		const aspectRatio = height > 0 ? width / height : 1.0;
		return { index, path, innerPath, name, size, width, height, aspectRatio };
	},
	
	placeholder(index: number, path: string, innerPath: string, name: string): Page {
		return {
			index, path, innerPath, name,
			size: 0, width: 0, height: 0, aspectRatio: 1.0
		};
	},
	
	/** 是否为横向页面 */
	isLandscape(page: Page): boolean {
		return page.width > page.height;
	},
	
	/** 是否为竖向页面 */
	isPortrait(page: Page): boolean {
		return page.height >= page.width;
	},
	
	/** 获取尺寸 */
	sizeStruct(page: Page): Size {
		return { width: page.width, height: page.height };
	},
	
	/** 是否有有效尺寸 */
	hasValidSize(page: Page): boolean {
		return page.width > 0 && page.height > 0;
	},
	
	/** 检查是否应该分割 */
	shouldSplit(page: Page, dividePageRate: number): boolean {
		return page.aspectRatio > dividePageRate;
	}
};

// ============================================================================
// 页面帧元素
// ============================================================================

/**
 * 页面帧元素
 * 
 * 表示页面在帧中的表示，可能是完整页面或分割后的半页
 */
export interface PageFrameElement {
	/** 引用的页面 */
	page: Page;
	/** 页面范围 */
	pageRange: PageRange;
	/** 是否为占位元素（空白页） */
	isDummy: boolean;
	/** 裁剪区域（分割页面时使用） */
	cropRect?: CropRect;
	/** 缩放比例（用于双页模式下高度对齐） */
	scale: number;
}

export const PageFrameElement = {
	full(page: Page, pageRange: PageRange): PageFrameElement {
		return { page, pageRange, isDummy: false, scale: 1.0 };
	},
	
	leftHalf(page: Page, pageRange: PageRange): PageFrameElement {
		return {
			page, pageRange, isDummy: false,
			cropRect: CropRect.leftHalf(),
			scale: 1.0
		};
	},
	
	rightHalf(page: Page, pageRange: PageRange): PageFrameElement {
		return {
			page, pageRange, isDummy: false,
			cropRect: CropRect.rightHalf(),
			scale: 1.0
		};
	},
	
	dummy(pageRange: PageRange): PageFrameElement {
		return {
			page: Page.placeholder(0, '', '', ''),
			pageRange,
			isDummy: true,
			scale: 1.0
		};
	},
	
	/** 是否为横向页面 */
	isLandscape(elem: PageFrameElement): boolean {
		return Page.isLandscape(elem.page);
	},
	
	/** 获取显示宽度（考虑裁剪和缩放） */
	width(elem: PageFrameElement): number {
		const baseWidth = elem.page.width;
		const cropFactor = elem.cropRect?.width ?? 1.0;
		return baseWidth * cropFactor * elem.scale;
	},
	
	/** 获取显示高度（考虑裁剪和缩放） */
	height(elem: PageFrameElement): number {
		const baseHeight = elem.page.height;
		const cropFactor = elem.cropRect?.height ?? 1.0;
		return baseHeight * cropFactor * elem.scale;
	},
	
	/** 获取显示尺寸 */
	size(elem: PageFrameElement): Size {
		return {
			width: PageFrameElement.width(elem),
			height: PageFrameElement.height(elem)
		};
	},
	
	/** 获取原始尺寸（不考虑缩放） */
	rawSize(elem: PageFrameElement): Size {
		const baseWidth = elem.page.width;
		const baseHeight = elem.page.height;
		const cropWidth = elem.cropRect?.width ?? 1.0;
		const cropHeight = elem.cropRect?.height ?? 1.0;
		return {
			width: baseWidth * cropWidth,
			height: baseHeight * cropHeight
		};
	},
	
	/** 获取页面索引 */
	pageIndex(elem: PageFrameElement): number {
		return elem.page.index;
	}
};

// ============================================================================
// 页面帧
// ============================================================================

/**
 * 页面帧
 * 
 * 当前显示的内容单位，可包含 1-2 个 PageFrameElement
 */
export interface PageFrame {
	/** 帧内的元素列表 */
	elements: PageFrameElement[];
	/** 帧覆盖的页面范围 */
	frameRange: PageRange;
	/** 阅读方向 (1=LTR, -1=RTL) */
	direction: number;
	/** 自动旋转角度 */
	angle: number;
	/** 拉伸缩放 */
	scale: number;
	/** 最终显示尺寸 */
	size: Size;
}

export const PageFrame = {
	/** 创建单页帧 */
	single(element: PageFrameElement, direction: number): PageFrame {
		const size = PageFrameElement.size(element);
		return {
			elements: [element],
			frameRange: element.pageRange,
			direction,
			angle: 0,
			scale: 1,
			size
		};
	},
	
	/** 创建双页帧 */
	double(e1: PageFrameElement, e2: PageFrameElement, direction: number): PageFrame {
		const frameRange = PageRange.merge([e1.pageRange, e2.pageRange]) ?? e1.pageRange;
		
		const width = PageFrameElement.width(e1) + PageFrameElement.width(e2);
		const height = Math.max(PageFrameElement.height(e1), PageFrameElement.height(e2));
		const size = { width, height };
		
		// 根据方向排列元素
		const elements = direction < 0 ? [e2, e1] : [e1, e2];
		
		return {
			elements,
			frameRange,
			direction,
			angle: 0,
			scale: 1,
			size
		};
	},
	
	/** 创建带对齐的双页帧 */
	doubleAligned(
		e1: PageFrameElement,
		e2: PageFrameElement,
		direction: number,
		stretchMode: WidePageStretch
	): PageFrame {
		const sizes = [PageFrameElement.rawSize(e1), PageFrameElement.rawSize(e2)];
		const scales = WidePageScaleCalculator.calculate(sizes, stretchMode);
		
		if (scales.length >= 2) {
			e1 = { ...e1, scale: scales[0] };
			e2 = { ...e2, scale: scales[1] };
		}
		
		return PageFrame.double(e1, e2, direction);
	},
	
	/** 是否为单页帧 */
	isSingle(frame: PageFrame): boolean {
		return frame.elements.length === 1;
	},
	
	/** 是否为双页帧 */
	isDouble(frame: PageFrame): boolean {
		return frame.elements.length === 2;
	},
	
	/** 是否包含指定页面索引 */
	containsIndex(frame: PageFrame, index: number): boolean {
		return PageRange.containsIndex(frame.frameRange, index);
	},
	
	/** 获取起始页面索引 */
	startIndex(frame: PageFrame): number {
		return PageRange.startIndex(frame.frameRange);
	},
	
	/** 获取结束页面索引 */
	endIndex(frame: PageFrame): number {
		return PageRange.endIndex(frame.frameRange);
	},
	
	/** 获取帧内的所有页面索引 */
	pageIndices(frame: PageFrame): number[] {
		return frame.elements
			.filter(e => !e.isDummy)
			.map(e => PageFrameElement.pageIndex(e));
	}
};

// ============================================================================
// 宽页缩放计算器
// ============================================================================

export const WidePageScaleCalculator = {
	/**
	 * 计算双页帧中每个元素的缩放比例
	 */
	calculate(sizes: Size[], mode: WidePageStretch): number[] {
		if (sizes.length < 2) {
			return sizes.map(() => 1.0);
		}
		
		const [size1, size2] = sizes;
		
		switch (mode) {
			case 'uniformHeight': {
				// 统一高度：以较大高度为基准
				const maxHeight = Math.max(size1.height, size2.height);
				if (maxHeight <= 0) return [1.0, 1.0];
				return [
					maxHeight / size1.height,
					maxHeight / size2.height
				];
			}
			case 'uniformWidth': {
				// 统一宽度：以较大宽度为基准
				const maxWidth = Math.max(size1.width, size2.width);
				if (maxWidth <= 0) return [1.0, 1.0];
				return [
					maxWidth / size1.width,
					maxWidth / size2.width
				];
			}
			case 'none':
			default:
				return [1.0, 1.0];
		}
	}
};
