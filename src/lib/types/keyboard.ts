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

// 触摸手势绑定
export interface GestureBinding {
	/** 手势类型 */
	gesture: TouchGestureType;
	/** 命令 ID */
	command: string;
	/** 描述 */
	description: string;
	/** 分类 */
	category: string;
}

// 鼠标手势绑定
export interface MouseGestureBinding {
	/** 手势模式 */
	pattern: string; // 例如: "RL" (右左), "RU" (右上), "RDL" (右下左)
	/** 命令 ID */
	command: string;
	/** 描述 */
	description: string;
	/** 分类 */
	category: string;
}

// 鼠标按键配置
export interface MouseButtonBinding {
	/** 按键 */
	button: 'left' | 'middle' | 'right' | 'back' | 'forward';
	/** 修饰键 */
	modifiers?: {
		ctrl?: boolean;
		shift?: boolean;
		alt?: boolean;
	};
	/** 命令 ID */
	command: string;
	/** 描述 */
	description: string;
}

// 鼠标滚轮配置
export interface MouseWheelBinding {
	/** 方向 */
	direction: 'up' | 'down';
	/** 修饰键 */
	modifiers?: {
		ctrl?: boolean;
		shift?: boolean;
		alt?: boolean;
	};
	/** 命令 ID */
	command: string;
	/** 描述 */
	description: string;
}

// 触摸手势类型
export type TouchGestureType =
	| 'swipe-left'
	| 'swipe-right'
	| 'swipe-up'
	| 'swipe-down'
	| 'pinch-in'
	| 'pinch-out'
	| 'rotate-clockwise'
	| 'rotate-counter-clockwise'
	| 'two-finger-swipe-left'
	| 'two-finger-swipe-right'
	| 'two-finger-swipe-up'
	| 'two-finger-swipe-down'
	| 'three-finger-swipe-left'
	| 'three-finger-swipe-right'
	| 'three-finger-swipe-up'
	| 'three-finger-swipe-down'
	| 'tap'
	| 'double-tap'
	| 'long-press';

// 鼠标手势方向
export type MouseGestureDirection = 'U' | 'D' | 'L' | 'R' | 'UL' | 'UR' | 'DL' | 'DR';

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

// 鼠标手势状态
export interface MouseGestureState {
	isRecording: boolean;
	startPoint: Point | null;
	lastPoint: Point | null;
	pattern: MouseGestureDirection[];
	minDistance: number; // 最小识别距离
}
