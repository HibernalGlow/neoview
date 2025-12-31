/**
 * TopToolbar 常量定义
 * 包含排序选项、缩放模式选项等配置
 */

import {
	FileText,
	HardDrive,
	Clock,
	List,
	Shuffle,
	Maximize,
	Expand,
	StretchHorizontal,
	StretchVertical,
	Frame,
	AlignLeft,
	AlignRight
} from '@lucide/svelte';
import type { ZoomMode } from '$lib/settings/settingsManager';
import type { SortCategory, ZoomModeOption } from './types';

/**
 * 排序分类选项列表
 */
export const SORT_CATEGORIES: SortCategory[] = [
	{ value: 'fileName', label: '文件名', icon: FileText },
	{ value: 'fileSize', label: '文件大小', icon: HardDrive },
	{ value: 'timeStamp', label: '修改时间', icon: Clock },
	{ value: 'entry', label: 'Entry 顺序', icon: List },
	{ value: 'random', label: '随机', icon: Shuffle }
];

/**
 * 缩放模式选项列表
 */
export const ZOOM_MODE_OPTIONS: ZoomModeOption[] = [
	{ mode: 'fit', label: '适应窗口' },
	{ mode: 'fill', label: '铺满整个窗口' },
	{ mode: 'fitWidth', label: '适应宽度' },
	{ mode: 'fitHeight', label: '适应高度' },
	{ mode: 'original', label: '原始大小' },
	{ mode: 'fitLeftAlign', label: '居左适应窗口' },
	{ mode: 'fitRightAlign', label: '居右适应窗口' }
];

/**
 * 缩放模式图标映射
 */
export const ZOOM_MODE_ICON_MAP = {
	fit: Maximize,
	fill: Expand,
	fitWidth: StretchHorizontal,
	fitHeight: StretchVertical,
	original: Frame,
	fitLeftAlign: AlignLeft,
	fitRightAlign: AlignRight
} as const satisfies Record<ZoomMode, typeof Maximize>;

/**
 * 获取缩放模式对应的图标组件
 */
export function getZoomModeIcon(mode: ZoomMode) {
	return ZOOM_MODE_ICON_MAP[mode] ?? Frame;
}

/**
 * 获取缩放模式的中文标签
 */
export function getZoomModeLabel(mode: ZoomMode): string {
	const option = ZOOM_MODE_OPTIONS.find(o => o.mode === mode);
	return option?.label ?? '原始大小';
}

/**
 * 获取自动旋转模式的中文标签
 */
export function getAutoRotateLabel(mode: string): string {
	switch (mode) {
		case 'left':
			return '纵向左旋';
		case 'right':
			return '纵向右旋';
		case 'horizontalLeft':
			return '横屏左旋';
		case 'horizontalRight':
			return '横屏右旋';
		case 'forcedLeft':
			return '始终左旋';
		case 'forcedRight':
			return '始终右旋';
		default:
			return '关闭';
	}
}
