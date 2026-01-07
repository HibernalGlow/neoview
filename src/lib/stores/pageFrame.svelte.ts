/**
 * PageFrameStore - 页面帧状态管理
 * 
 * 基于 NeeView 架构的页面帧管理
 * 支持单页/双页模式、横向页面分割、RTL 阅读方向
 * 
 * v2.0: 重构为前端本地计算，消除 IPC 延迟
 */

import { 
	PageFrameBuilder,
	type Page,
	type PagePosition,
	type PageFrame,
	type PageFrameContext,
	type PageMode,
	type ReadOrder,
	type WidePageStretch,
	type CropRect,
	defaultPageFrameContext,
	PagePositionUtils,
	PageFrameUtils,
	CropRectUtils
} from '$lib/core/pageFrame';

// ===== 类型定义 (兼容原有接口) =====

/** 页面帧元素信息 (兼容后端格式) */
export interface PageFrameElementInfo {
	pageIndex: number;
	part: number;
	cropRect?: CropRect;
	isLandscape: boolean;
	isDummy: boolean;
	/** 内容缩放比例（用于双页对齐） */
	scale: number;
	/** 显示宽度 */
	width: number;
	/** 显示高度 */
	height: number;
}

/** 页面范围信息 */
export interface PageRangeInfo {
	minIndex: number;
	minPart: number;
	maxIndex: number;
	maxPart: number;
}

/** 尺寸信息 */
export interface SizeInfo {
	width: number;
	height: number;
}

/** 页面帧信息 (兼容后端格式) */
export interface PageFrameInfo {
	elements: PageFrameElementInfo[];
	frameRange: PageRangeInfo;
	size: SizeInfo;
	angle: number;
	scale: number;
	startIndex: number;
	endIndex: number;
}

// Re-export types for consumers
export type { PageMode, ReadOrder, CropRect, WidePageStretch, PageFrameContext };

// ===== 转换函数 =====

/** 将内部 PageFrame 转换为兼容格式 */
function toPageFrameInfo(frame: PageFrame): PageFrameInfo {
	return {
		elements: frame.elements.map(e => ({
			pageIndex: e.page.index,
			part: e.pageRange.min.part,
			cropRect: e.cropRect,
			isLandscape: e.page.width > e.page.height,
			isDummy: e.isDummy,
			scale: e.scale,
			width: e.page.width * (e.cropRect?.width ?? 1) * e.scale,
			height: e.page.height * (e.cropRect?.height ?? 1) * e.scale
		})),
		frameRange: {
			minIndex: frame.frameRange.min.index,
			minPart: frame.frameRange.min.part,
			maxIndex: frame.frameRange.max.index,
			maxPart: frame.frameRange.max.part
		},
		size: frame.size,
		angle: frame.angle,
		scale: frame.scale,
		startIndex: frame.frameRange.min.index,
		endIndex: frame.frameRange.max.index
	};
}

// ===== 状态定义 =====

interface PageFrameState {
	/** 当前帧信息 */
	currentFrame: PageFrameInfo | null;
	/** 当前位置 */
	currentPosition: PagePosition;
	/** 上下文配置 */
	context: PageFrameContext;
	/** 总虚拟页数 */
	totalVirtualPages: number;
	/** 是否正在加载 */
	loading: boolean;
	/** 错误信息 */
	error: string | null;
	/** 页面列表是否已初始化 */
	initialized: boolean;
}

// ===== 默认值 =====

const defaultState: PageFrameState = {
	currentFrame: null,
	currentPosition: { index: 0, part: 0 },
	context: { ...defaultPageFrameContext },
	totalVirtualPages: 0,
	loading: false,
	error: null,
	initialized: false
};

// ===== Store 实现 =====

function createPageFrameStore() {
	let state = $state<PageFrameState>({ ...defaultState });
	
	// 本地 PageFrameBuilder 实例
	let builder: PageFrameBuilder | null = null;

	return {
		/** 获取状态 */
		get state() {
			return state;
		},

		/** 重置状态 */
		reset() {
			state = { ...defaultState };
			builder = null;
		},

		/**
		 * 初始化页面列表
		 * 
		 * 必须在使用其他方法前调用，设置页面数据
		 */
		setPages(pages: Page[]): void {
			builder = new PageFrameBuilder(pages, state.context);
			state.totalVirtualPages = builder.totalVirtualPages();
			state.initialized = true;
			console.log(`[PageFrameStore] 初始化 ${pages.length} 页, 虚拟页数: ${state.totalVirtualPages}`);
		},

		/**
		 * 从 BookInfo 的 pages 初始化
		 * 
		 * 兼容层：将 BookInfo.pages 转换为 Page[]
		 */
		initFromBookPages(pages: Array<{
			index?: number;
			path?: string;
			innerPath?: string;
			name?: string;
			size?: number;
			width?: number;
			height?: number;
		}>): void {
			const convertedPages: Page[] = pages.map((p, i) => ({
				index: p.index ?? i,
				path: p.path ?? '',
				innerPath: p.innerPath ?? p.name ?? '',
				name: p.name ?? '',
				size: p.size ?? 0,
				width: p.width ?? 0,
				height: p.height ?? 0,
				aspectRatio: (p.height && p.height > 0) ? (p.width ?? 0) / p.height : 1.0
			}));
			this.setPages(convertedPages);
		},

		/**
		 * 更新页面尺寸
		 * 
		 * 当异步加载图片后获取到真实尺寸时调用
		 */
		updatePageSize(pageIndex: number, width: number, height: number): void {
			if (!builder) return;
			
			const page = builder.getPage(pageIndex);
			if (page) {
				// 更新页面尺寸
				page.width = width;
				page.height = height;
				page.aspectRatio = height > 0 ? width / height : 1.0;
				
				// 重新设置页面列表以更新分割缓存
				const pages: Page[] = [];
				for (let i = 0; i < builder.pageCount(); i++) {
					const p = builder.getPage(i);
					if (p) pages.push(p);
				}
				builder.setPages(pages);
			}
		},

		/** 更新上下文配置 (本地，无 IPC) */
		updateContext(updates: Partial<PageFrameContext>): void {
			// 更新本地状态
			state.context = { ...state.context, ...updates };
			
			// 更新 builder 的上下文
			if (builder) {
				builder.setContext(state.context);
				state.totalVirtualPages = builder.totalVirtualPages();
			}

			// 重新构建当前帧
			this.buildCurrentFrame();
		},

		/** 获取上下文配置 */
		getContext(): PageFrameContext {
			return state.context;
		},

		/** 构建指定位置的帧 (本地，无 IPC) */
		buildFrame(position: PagePosition): PageFrameInfo | null {
			if (!builder) {
				console.warn('[PageFrameStore] Builder 未初始化');
				return null;
			}

			state.loading = true;
			state.error = null;

			try {
				const frame = builder.buildFrame(position);
				
				if (frame) {
					const frameInfo = toPageFrameInfo(frame);
					state.currentFrame = frameInfo;
					state.currentPosition = position;
					return frameInfo;
				}
				
				return null;
			} catch (error) {
				console.error('[PageFrameStore] 构建帧失败:', error);
				state.error = String(error);
				return null;
			} finally {
				state.loading = false;
			}
		},

		/** 构建当前位置的帧 */
		buildCurrentFrame(): PageFrameInfo | null {
			return this.buildFrame(state.currentPosition);
		},

		/** 跳转到指定页面 (本地，无 IPC) */
		gotoPage(pageIndex: number): PageFrameInfo | null {
			if (!builder) {
				console.warn('[PageFrameStore] Builder 未初始化');
				return null;
			}

			// 获取包含该页面的帧位置
			const position = builder.framePositionForIndex(pageIndex);
			return this.buildFrame(position);
		},

		/** 下一帧 (本地，无 IPC) */
		nextFrame(): PageFrameInfo | null {
			if (!builder) return null;

			const next = builder.nextFramePosition(state.currentPosition);
			if (next) {
				return this.buildFrame(next);
			}
			return null;
		},

		/** 上一帧 (本地，无 IPC) */
		prevFrame(): PageFrameInfo | null {
			if (!builder) return null;

			const prev = builder.prevFramePosition(state.currentPosition);
			if (prev) {
				return this.buildFrame(prev);
			}
			return null;
		},

		/** 获取总虚拟页数 (本地，无 IPC) */
		refreshTotalPages(): number {
			if (!builder) return 0;
			state.totalVirtualPages = builder.totalVirtualPages();
			return state.totalVirtualPages;
		},

		/** 检查页面是否分割 (本地，无 IPC) */
		isPageSplit(index: number): boolean {
			if (!builder) return false;
			return builder.isPageSplit(index);
		},

		/** 从虚拟索引获取位置 (本地，无 IPC) */
		positionFromVirtual(virtualIndex: number): PagePosition {
			if (!builder) return { index: 0, part: 0 };
			return builder.positionFromVirtual(virtualIndex);
		},

		/** 获取包含指定页面的帧位置 (本地，无 IPC) */
		framePositionForIndex(pageIndex: number): PagePosition {
			if (!builder) return { index: pageIndex, part: 0 };
			return builder.framePositionForIndex(pageIndex);
		},

		/** 获取下一帧位置 (不构建帧) */
		getNextPosition(): PagePosition | null {
			if (!builder) return null;
			return builder.nextFramePosition(state.currentPosition);
		},

		/** 获取上一帧位置 (不构建帧) */
		getPrevPosition(): PagePosition | null {
			if (!builder) return null;
			return builder.prevFramePosition(state.currentPosition);
		},

		/** 设置页面模式 */
		setPageMode(mode: PageMode): void {
			this.updateContext({ pageMode: mode });
		},

		/** 设置阅读顺序 */
		setReadOrder(order: ReadOrder): void {
			this.updateContext({ readOrder: order });
		},

		/** 设置是否分割横向页面 */
		setDividePage(enabled: boolean): void {
			this.updateContext({ isSupportedDividePage: enabled });
		},

		/** 设置画布尺寸 */
		setCanvasSize(width: number, height: number): void {
			this.updateContext({ canvasSize: { width, height } });
		},

		/** 切换页面模式 */
		togglePageMode(): void {
			const newMode = state.context.pageMode === 'single' ? 'double' : 'single';
			this.setPageMode(newMode);
		},

		/** 切换分割模式 */
		toggleDividePage(): void {
			this.setDividePage(!state.context.isSupportedDividePage);
		},

		/** 设置宽页拉伸模式 */
		setWidePageStretch(mode: WidePageStretch): void {
			this.updateContext({ widePageStretch: mode });
		},

		/** 检查是否已初始化 */
		isInitialized(): boolean {
			return state.initialized && builder !== null;
		},

		/** 获取页面数量 */
		pageCount(): number {
			return builder?.pageCount() ?? 0;
		}
	};
}

// ===== 导出单例 =====

export const pageFrameStore = createPageFrameStore();

// ===== 辅助函数 =====

/**
 * 将裁剪区域转换为 CSS clip-path
 */
export function cropRectToClipPath(crop: CropRect): string {
	return CropRectUtils.toCssClipPath(crop);
}

/**
 * 检查帧是否包含指定页面
 */
export function frameContainsPage(frame: PageFrameInfo, pageIndex: number): boolean {
	return pageIndex >= frame.startIndex && pageIndex <= frame.endIndex;
}
