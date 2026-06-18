/**
 * Keybinding lookup helpers.
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

export type InputMatcher = (input: InputBinding) => boolean;

export function normalizeKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/←/g, 'arrowleft')
		.replace(/→/g, 'arrowright')
		.replace(/↑/g, 'arrowup')
		.replace(/↓/g, 'arrowdown');
}

export function findActionByInputWithContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	matcher: InputMatcher
): string | null {
	const matches: MatchResult[] = [];

	for (const ab of bindings) {
		if (ab.contextBindings) {
			for (const cb of ab.contextBindings) {
				if (!activeContexts.includes(cb.context)) continue;
				if (!matcher(cb.input)) continue;
				const priority = cb.priority ?? getContextPriority(cb.context);
				matches.push({ action: ab.action, priority });
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

export function findActionByKeyInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	key: string,
	trigger: 'down' | 'hold' = 'down'
): string | null {
	const normalizedKey = normalizeKey(key);
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'keyboard') return false;
		const kb = input as KeyBinding;
		return normalizeKey(kb.key) === normalizedKey && (kb.trigger ?? 'down') === trigger;
	});
}

export function findActionByKey(bindings: ActionBinding[], key: string): string | null {
	for (const binding of bindings) {
		if (!binding.bindings) continue;
		const keyBinding = binding.bindings.find((b) => {
			if (b.type !== 'keyboard') return false;
			const kb = b as KeyBinding;
			return kb.key === key && (kb.trigger ?? 'down') === 'down';
		});
		if (keyBinding) return binding.action;
	}
	return null;
}

export function findActionByMouseGestureInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	gesture: string,
	button: 'left' | 'right' | 'middle' = 'left',
	action?: string,
	trigger: 'instant' | 'hold' = 'instant'
): string | null {
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'mouse') return false;
		const m = input as MouseGesture;
		return (
			m.gesture === gesture &&
			(m.button || 'left') === button &&
			(!action || m.action === action) &&
			(m.trigger ?? 'instant') === trigger
		);
	});
}

export function findActionByMouseWheelInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	direction: 'up' | 'down'
): string | null {
	return findActionByMouseGestureInContext(
		bindings,
		activeContexts,
		`wheel-${direction}`,
		'middle',
		'wheel',
		'instant'
	);
}

export function findActionByMouseClickInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	button: 'left' | 'right' | 'middle',
	clickType: 'click' | 'double-click' = 'click'
): string | null {
	return findActionByMouseGestureInContext(
		bindings,
		activeContexts,
		clickType,
		button,
		clickType,
		'instant'
	);
}

export function findActionByTouchGestureInContext(
	bindings: ActionBinding[],
	activeContexts: BindingContext[],
	gesture: string,
	trigger: 'instant' | 'hold' = 'instant'
): string | null {
	return findActionByInputWithContext(bindings, activeContexts, (input) => {
		if (input.type !== 'touch') return false;
		const t = input as TouchGesture;
		return t.gesture === gesture && (t.trigger ?? 'instant') === trigger;
	});
}

export function findActionByTouchGesture(
	bindings: ActionBinding[],
	gesture: string
): string | null {
	for (const binding of bindings) {
		if (!binding.bindings) continue;
		const touchBinding = binding.bindings.find((b) => {
			if (b.type !== 'touch') return false;
			const t = b as TouchGesture;
			return t.gesture === gesture && (t.trigger ?? 'instant') === 'instant';
		});
		if (touchBinding) return binding.action;
	}
	return null;
}

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
		return a.area === area && (a.button || 'left') === button && (a.action || 'click') === action;
	});
}

export function calculateClickArea(x: number, y: number, width: number, height: number): ViewArea {
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
