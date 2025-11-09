/**
 * NeoView - Keyboard Types
 * 快捷键相关类型定义
 */

export interface KeyBinding {
	/** 命令 ID */
	command: string;
	/** 按键组合 */
	keys: string;
	/** 描述 */
	description: string;
	/** 分类 */
	category: string;
}

export interface KeyCombo {
	key: string;
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;
}

export interface GestureBinding {
	/** 手势类型 */
	gesture: string;
	/** 命令 ID */
	command: string;
	/** 描述 */
	description: string;
}

export type GestureType =
	| 'swipe-left'
	| 'swipe-right'
	| 'swipe-up'
	| 'swipe-down'
	| 'pinch-in'
	| 'pinch-out'
	| 'rotate-clockwise'
	| 'rotate-counter-clockwise';

export interface Point {
	x: number;
	y: number;
}

export interface GestureState {
	startPoint: Point | null;
	currentPoint: Point | null;
	path: Point[];
	isActive: boolean;
}
