/**
 * 工具栏溢出检测与自动折叠管理
 * 当工具栏过长导致折行时，自动将未激活的按钮收入展开设置区
 */

export interface ToolbarButton {
	id: string;
	priority: number; // 优先级，数字越小越优先保留
	isActive: boolean; // 是否处于激活状态
	width: number; // 按钮宽度
}

export interface OverflowState {
	visibleIds: Set<string>;
	overflowIds: Set<string>;
	isOverflowing: boolean;
}

/**
 * 检测容器内容是否溢出
 * 通过比较 scrollWidth 和 clientWidth 来判断
 */
export function detectOverflow(container: HTMLElement): boolean {
	if (!container) return false;
	// 如果内容宽度超过可见宽度，说明发生了溢出
	return container.scrollWidth > container.clientWidth + 2;
}

/**
 * 检测容器是否发生折行（备用方法）
 * 通过比较容器高度和单行高度来判断
 */
export function detectWrap(container: HTMLElement, singleRowHeight: number = 36): boolean {
	if (!container) return false;
	// 如果容器高度超过单行高度 + 容差，说明发生了折行
	return container.scrollHeight > singleRowHeight + 4;
}

/**
 * 计算哪些按钮需要被折叠到溢出区
 * 策略：优先折叠未激活且优先级低的按钮
 */
export function calculateOverflow(
	buttons: ToolbarButton[],
	availableWidth: number,
	minVisibleCount: number = 3
): OverflowState {
	// 按优先级排序，激活的按钮优先级更高
	const sorted = [...buttons].sort((a, b) => {
		// 激活的按钮优先保留
		if (a.isActive !== b.isActive) {
			return a.isActive ? -1 : 1;
		}
		// 然后按优先级排序
		return a.priority - b.priority;
	});

	const visibleIds = new Set<string>();
	const overflowIds = new Set<string>();
	let usedWidth = 0;
	let visibleCount = 0;

	for (const button of sorted) {
		// 确保至少显示 minVisibleCount 个按钮
		if (visibleCount < minVisibleCount || usedWidth + button.width <= availableWidth) {
			visibleIds.add(button.id);
			usedWidth += button.width;
			visibleCount++;
		} else {
			overflowIds.add(button.id);
		}
	}

	return {
		visibleIds,
		overflowIds,
		isOverflowing: overflowIds.size > 0
	};
}

/**
 * 工具栏按钮配置
 * 定义所有可折叠按钮的 ID 和默认优先级
 */
export const TOOLBAR_BUTTONS = {
	// 导航按钮组 - 高优先级，通常不折叠
	home: { id: 'home', priority: 1, width: 28 },
	back: { id: 'back', priority: 2, width: 28 },
	forward: { id: 'forward', priority: 3, width: 28 },
	up: { id: 'up', priority: 4, width: 28 },
	refresh: { id: 'refresh', priority: 5, width: 28 },
	
	// 排序 - 中等优先级
	sort: { id: 'sort', priority: 10, width: 40 },
	
	// 功能按钮组 - 可折叠
	multiSelect: { id: 'multiSelect', priority: 20, width: 28 },
	deleteMode: { id: 'deleteMode', priority: 21, width: 28 },
	folderTree: { id: 'folderTree', priority: 22, width: 28 },
	search: { id: 'search', priority: 23, width: 28 },
	migration: { id: 'migration', priority: 24, width: 28 },
	randomTag: { id: 'randomTag', priority: 25, width: 28 },
	penetrate: { id: 'penetrate', priority: 26, width: 28 },
	viewStyle: { id: 'viewStyle', priority: 30, width: 28 },
	moreSettings: { id: 'moreSettings', priority: 100, width: 28 } // 始终显示
} as const;

export type ToolbarButtonId = keyof typeof TOOLBAR_BUTTONS;
