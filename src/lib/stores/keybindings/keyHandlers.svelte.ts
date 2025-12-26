/**
 * 快捷键绑定系统 - 键盘事件处理模块
 * 处理键盘事件和快捷键执行逻辑
 */

import type {
	InputBinding,
	KeyBinding,
	MouseGesture,
	TouchGesture,
	AreaClick,
	BindingContext,
	ActionBinding,
	ViewArea,
	MatchResult
} from './types';
import { getContextPriority } from './constants';

/** 输入匹配函数类型 */
export type InputMatcher = (input: InputBinding) => boolean;

/** 规范化按键字符串 */
export function normalizeKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/←/g, 'arrowleft')
		.replace(/→/g, 'arrowright')
		.replace(/↑/g, 'arrowup')
		.replace(/↓/g, 'arrowdown');
}


/** 上下文感知的通用查找方法 */
export function findActionByInputWithContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	matcher: InputMatcher
): string | null {
	const matches: MatchResult[] = [];

	for (const ab of bindings) {
		if (ab.contextBindings) {
			for (const cb of ab.contextBindings) {
				if (activeContexts.includes(cb.context)) {
					if (matcher(cb.input)) {
						const priority = cb.priority ?? getContextPriority(cb.context);
						matches.push({ action: ab.action, priority });
					}
				}
			}
		}

		if (ab.bindings && activeContexts.includes('global')) {
			for (const b of ab.bindings) {
				if (matcher(b)) {
					matches.push({ action: ab.action, priority: 0 });
				}
			}
		}
	}

	matches.sort((a, b) => b.priority - a.priority);
	return matches.length > 0 ? matches[0].action : null;
}

/** 上下文感知的按键查找 */
export function findActionByKeyInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	key: string
): string | null {
	const normalizedKey = normalizeKey(key);
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'keyboard') return false;
		return normalizeKey((input as KeyBinding).key) === normalizedKey;
	});
}

/** 根据键盘按键查找操作（全局） */
export function findActionByKey(
	bindings: ActionBinding[],
	key: string
): string | null {
	for (const binding of bindings) {
		if (!binding.bindings) continue;
		const keyBinding = binding.bindings.find(
			b => b.type === 'keyboard' && (b as KeyBinding).key === key
		);
		if (keyBinding) return binding.action;
	}
	return null;
}


/** 上下文感知的鼠标手势查找 */
export function findActionByMouseGestureInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	gesture: string,
	button: 'left' | 'right' | 'middle' = 'left',
	action?: string
): string | null {
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'mouse') return false;
		const m = input as MouseGesture;
		return (
			m.gesture === gesture &&
			(m.button || 'left') === button &&
			(!action || m.action === action)
		);
	});
}

/** 上下文感知的滚轮查找 */
export function findActionByMouseWheelInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	direction: 'up' | 'down'
): string | null {
	return findActionByMouseGestureInContext(
		bindings, activeContexts, `wheel-${direction}`, 'middle', 'wheel'
	);
}

/** 上下文感知的鼠标点击查找 */
export function findActionByMouseClickInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	button: 'left' | 'right' | 'middle',
	clickType: 'click' | 'double-click' = 'click'
): string | null {
	return findActionByMouseGestureInContext(
		bindings, activeContexts, clickType, button, clickType
	);
}

/** 上下文感知的触摸手势查找 */
export function findActionByTouchGestureInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	gesture: string
): string | null {
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'touch') return false;
		return (input as TouchGesture).gesture === gesture;
	});
}

/** 根据触摸手势查找操作（全局） */
export function findActionByTouchGesture(
	bindings: ActionBinding[],
	gesture: string
): string | null {
	for (const binding of bindings) {
		if (!binding.bindings) continue;
		const touchBinding = binding.bindings.find(
			b => b.type === 'touch' && (b as TouchGesture).gesture === gesture
		);
		if (touchBinding) return binding.action;
	}
	return null;
}


/** 上下文感知的区域点击查找 */
export function findActionByAreaClickInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	area: ViewArea,
	button: 'left' | 'right' | 'middle' = 'left',
	action: 'click' | 'double-click' | 'press' = 'click'
): string | null {
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'area') return false;
		const a = input as AreaClick;
		return (
			a.area === area &&
			(a.button || 'left') === button &&
			(a.action || 'click') === action
		);
	});
}

/** 根据坐标计算点击区域 */
export function calculateClickArea(
	x: number,
	y: number,
	width: number,
	height: number
): ViewArea {
	const topThird = height / 3;
	const bottomThird = (height * 2) / 3;
	const isTop = y < topThird;
	const isMiddle = y >= topThird && y < bottomThird;
	const isBottom = y >= bottomThird;

	const leftThird = width / 3;
	const rightThird = (width * 2) / 3;
	const isLeft = x < leftThird;
	const isCenter = x >= leftThird && x < rightThird;
	const isRight = x >= rightThird;

	if (isTop && isLeft) return 'top-left';
	if (isTop && isCenter) return 'top-center';
	if (isTop && isRight) return 'top-right';
	if (isMiddle && isLeft) return 'middle-left';
	if (isMiddle && isCenter) return 'middle-center';
	if (isMiddle && isRight) return 'middle-right';
	if (isBottom && isLeft) return 'bottom-left';
	if (isBottom && isCenter) return 'bottom-center';
	if (isBottom && isRight) return 'bottom-right';

	return 'middle-center';
}
