/**
 * TopToolbar 子组件共享类型定义
 * 用于各面板组件之间的类型共享
 */

import type { ZoomMode, WidePageStretch } from '$lib/settings/settingsManager';
import type { PageSortMode } from '$lib/types/book';

/**
 * 排序分类选项
 */
export interface SortCategory {
	value: string;
	label: string;
	icon: typeof import('@lucide/svelte').FileText;
}

/**
 * 缩放模式选项
 */
export interface ZoomModeOption {
	mode: ZoomMode;
	label: string;
}

/**
 * 自动旋转模式类型
 */
export type AutoRotateMode = 'none' | 'left' | 'right' | 'horizontalLeft' | 'horizontalRight' | 'forcedLeft' | 'forcedRight';

/**
 * 排序面板属性
 */
export interface SortPanelProps {
	expanded: boolean;
	currentSortCategory: string;
	isDescending: boolean;
	onToggleSortDirection: (categoryValue: string) => void;
	onSortModeChange: (mode: PageSortMode) => void;
}

/**
 * 缩放面板属性
 */
export interface ZoomPanelProps {
	expanded: boolean;
	currentZoomMode: ZoomMode;
	lockedZoomMode: ZoomMode | null;
	splitHorizontalPages: boolean;
	treatHorizontalAsDoublePage: boolean;
	singleFirstPage: boolean;
	singleLastPage: boolean;
	widePageStretch: WidePageStretch;
	onZoomModeChange: (mode: ZoomMode) => void;
	onToggleSplitHorizontalPages: () => void;
	onToggleTreatHorizontalAsDoublePage: () => void;
	onToggleSingleFirstPage: () => void;
	onToggleSingleLastPage: () => void;
	onSetWidePageStretch: (mode: WidePageStretch) => void;
}

/**
 * 旋转面板属性
 */
export interface RotatePanelProps {
	expanded: boolean;
	autoRotateMode: AutoRotateMode;
	onRotateClockwise: () => void;
	onSetAutoRotateMode: (mode: AutoRotateMode) => void;
}
