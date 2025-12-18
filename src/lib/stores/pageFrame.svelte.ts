/**
 * PageFrameStore - 页面帧状态管理
 * 
 * 基于 NeeView 架构的页面帧管理
 * 支持单页/双页模式、横向页面分割、RTL 阅读方向
 */

import { invoke } from '$lib/api/adapter';

// ===== 类型定义 =====

/** 页面模式 */
export type PageMode = 'single' | 'double';

/** 阅读顺序 */
export type ReadOrder = 'ltr' | 'rtl';

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

/** 裁剪区域 */
export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** 宽页拉伸模式 */
export type WidePageStretch = 'none' | 'uniformHeight' | 'uniformWidth';

/** 页面帧元素信息 */
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

/** 页面帧信息 */
export interface PageFrameInfo {
	elements: PageFrameElementInfo[];
	frameRange: PageRangeInfo;
	size: SizeInfo;
	angle: number;
	scale: number;
	startIndex: number;
	endIndex: number;
}

/** 页面帧上下文配置 */
export interface PageFrameContext {
	pageMode: PageMode;
	readOrder: ReadOrder;
	isSupportedDividePage: boolean;
	isSupportedWidePage: boolean;
	isSupportedSingleFirst: boolean;
	isSupportedSingleLast: boolean;
	dividePageRate: number;
	autoRotate: AutoRotateType;
	stretchMode: StretchMode;
	canvasSize: SizeInfo;
	/** 宽页拉伸模式（双页模式下的对齐方式） */
	widePageStretch: WidePageStretch;
}

/** 页面位置 */
export interface PagePosition {
	index: number;
	part: number;
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
}

// ===== 默认值 =====

const defaultContext: PageFrameContext = {
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

const defaultState: PageFrameState = {
	currentFrame: null,
	currentPosition: { index: 0, part: 0 },
	context: { ...defaultContext },
	totalVirtualPages: 0,
	loading: false,
	error: null
};

// ===== Store 实现 =====

function createPageFrameStore() {
	let state = $state<PageFrameState>({ ...defaultState });

	return {
		/** 获取状态 */
		get state() {
			return state;
		},

		/** 重置状态 */
		reset() {
			state = { ...defaultState };
		},

		/** 更新上下文配置 */
		async updateContext(updates: Partial<PageFrameContext>): Promise<void> {
			try {
				await invoke('pf_update_context', {
					pageMode: updates.pageMode,
					readOrder: updates.readOrder,
					dividePage: updates.isSupportedDividePage,
					widePage: updates.isSupportedWidePage,
					singleFirst: updates.isSupportedSingleFirst,
					singleLast: updates.isSupportedSingleLast,
					divideRate: updates.dividePageRate,
					canvasWidth: updates.canvasSize?.width,
					canvasHeight: updates.canvasSize?.height,
					widePageStretch: updates.widePageStretch
				});

				// 更新本地状态
				state.context = { ...state.context, ...updates };

				// 重新获取总虚拟页数
				await this.refreshTotalPages();

				// 重新构建当前帧
				await this.buildCurrentFrame();
			} catch (error) {
				console.error('[PageFrameStore] 更新上下文失败:', error);
				state.error = String(error);
			}
		},

		/** 获取上下文配置 */
		async getContext(): Promise<PageFrameContext> {
			try {
				const ctx = await invoke<PageFrameContext>('pf_get_context');
				state.context = ctx;
				return ctx;
			} catch (error) {
				console.error('[PageFrameStore] 获取上下文失败:', error);
				return state.context;
			}
		},

		/** 构建指定位置的帧 */
		async buildFrame(position: PagePosition): Promise<PageFrameInfo | null> {
			try {
				state.loading = true;
				state.error = null;

				const frame = await invoke<PageFrameInfo | null>('pf_build_frame', {
					index: position.index,
					part: position.part
				});

				if (frame) {
					state.currentFrame = frame;
					state.currentPosition = position;
				}

				return frame;
			} catch (error) {
				console.error('[PageFrameStore] 构建帧失败:', error);
				state.error = String(error);
				return null;
			} finally {
				state.loading = false;
			}
		},

		/** 构建当前位置的帧 */
		async buildCurrentFrame(): Promise<PageFrameInfo | null> {
			return this.buildFrame(state.currentPosition);
		},

		/** 跳转到指定页面 */
		async gotoPage(pageIndex: number): Promise<PageFrameInfo | null> {
			try {
				// 获取包含该页面的帧位置
				const [index, part] = await invoke<[number, number]>('pf_frame_position_for_index', {
					pageIndex
				});

				return this.buildFrame({ index, part });
			} catch (error) {
				console.error('[PageFrameStore] 跳转页面失败:', error);
				state.error = String(error);
				return null;
			}
		},

		/** 下一帧 */
		async nextFrame(): Promise<PageFrameInfo | null> {
			try {
				const result = await invoke<[number, number] | null>('pf_next_position', {
					index: state.currentPosition.index,
					part: state.currentPosition.part
				});

				if (result) {
					const [index, part] = result;
					return this.buildFrame({ index, part });
				}

				return null;
			} catch (error) {
				console.error('[PageFrameStore] 下一帧失败:', error);
				state.error = String(error);
				return null;
			}
		},

		/** 上一帧 */
		async prevFrame(): Promise<PageFrameInfo | null> {
			try {
				const result = await invoke<[number, number] | null>('pf_prev_position', {
					index: state.currentPosition.index,
					part: state.currentPosition.part
				});

				if (result) {
					const [index, part] = result;
					return this.buildFrame({ index, part });
				}

				return null;
			} catch (error) {
				console.error('[PageFrameStore] 上一帧失败:', error);
				state.error = String(error);
				return null;
			}
		},

		/** 刷新总虚拟页数 */
		async refreshTotalPages(): Promise<number> {
			try {
				const total = await invoke<number>('pf_total_virtual_pages');
				state.totalVirtualPages = total;
				return total;
			} catch (error) {
				console.error('[PageFrameStore] 获取总页数失败:', error);
				return 0;
			}
		},

		/** 检查页面是否分割 */
		async isPageSplit(index: number): Promise<boolean> {
			try {
				return await invoke<boolean>('pf_is_page_split', { index });
			} catch (error) {
				console.error('[PageFrameStore] 检查分割失败:', error);
				return false;
			}
		},

		/** 从虚拟索引获取位置 */
		async positionFromVirtual(virtualIndex: number): Promise<PagePosition> {
			try {
				const [index, part] = await invoke<[number, number]>('pf_position_from_virtual', {
					virtualIndex
				});
				return { index, part };
			} catch (error) {
				console.error('[PageFrameStore] 转换虚拟索引失败:', error);
				return { index: 0, part: 0 };
			}
		},

		/** 设置页面模式 */
		async setPageMode(mode: PageMode): Promise<void> {
			await this.updateContext({ pageMode: mode });
		},

		/** 设置阅读顺序 */
		async setReadOrder(order: ReadOrder): Promise<void> {
			await this.updateContext({ readOrder: order });
		},

		/** 设置是否分割横向页面 */
		async setDividePage(enabled: boolean): Promise<void> {
			await this.updateContext({ isSupportedDividePage: enabled });
		},

		/** 设置画布尺寸 */
		async setCanvasSize(width: number, height: number): Promise<void> {
			await this.updateContext({ canvasSize: { width, height } });
		},

		/** 切换页面模式 */
		async togglePageMode(): Promise<void> {
			const newMode = state.context.pageMode === 'single' ? 'double' : 'single';
			await this.setPageMode(newMode);
		},

		/** 切换分割模式 */
		async toggleDividePage(): Promise<void> {
			await this.setDividePage(!state.context.isSupportedDividePage);
		},

		/** 设置宽页拉伸模式 */
		async setWidePageStretch(mode: WidePageStretch): Promise<void> {
			await this.updateContext({ widePageStretch: mode });
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
	const top = crop.y * 100;
	const right = (1 - crop.x - crop.width) * 100;
	const bottom = (1 - crop.y - crop.height) * 100;
	const left = crop.x * 100;
	return `inset(${top.toFixed(1)}% ${right.toFixed(1)}% ${bottom.toFixed(1)}% ${left.toFixed(1)}%)`;
}

/**
 * 检查帧是否包含指定页面
 */
export function frameContainsPage(frame: PageFrameInfo, pageIndex: number): boolean {
	return pageIndex >= frame.startIndex && pageIndex <= frame.endIndex;
}
