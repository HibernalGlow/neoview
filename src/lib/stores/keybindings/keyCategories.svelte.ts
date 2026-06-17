/**
 * Keybinding presentation helpers.
 */

import type {
	InputBinding,
	KeyBinding,
	MouseGesture,
	TouchGesture,
	AreaClick,
	BindingContext,
	ActionBinding,
	BindingWithContext,
	ActionWithBinding,
} from './types';
import { CONTEXT_NAMES, AREA_NAMES, BUTTON_NAMES, ACTION_NAMES } from './constants';

export function getCategories(bindings: ActionBinding[]): string[] {
	return [...new Set(bindings.map((b) => b.category))];
}

export function getBindingsByCategory(bindings: ActionBinding[], category: string): ActionBinding[] {
	return bindings.filter((b) => b.category === category);
}

export function formatBinding(binding: InputBinding): string {
	if (!binding) return '';

	switch (binding.type) {
		case 'keyboard': {
			const kb = binding as KeyBinding;
			const suffix = kb.trigger === 'hold' ? ` 长按 ${kb.durationMs ?? 450}ms` : '';
			return `${kb.key || ''}${suffix}`;
		}
		case 'mouse': {
			const mouse = binding as MouseGesture;
			const buttonText = BUTTON_NAMES[mouse.button || 'left'] || '左键';
			let gestureText = '';
			if (mouse.gesture?.startsWith('wheel-')) {
				gestureText = mouse.gesture === 'wheel-up' ? '滚轮上' : '滚轮下';
			} else if (mouse.gesture === 'click') {
				gestureText = '单击';
			} else if (mouse.gesture === 'double-click') {
				gestureText = '双击';
			} else if (mouse.gesture === 'press') {
				gestureText = '按下';
			} else if (mouse.gesture) {
				gestureText = mouse.gesture;
			}
			const suffix = mouse.trigger === 'hold' ? ` 长按 ${mouse.durationMs ?? 450}ms` : '';
			return `${buttonText} ${gestureText}${suffix}`;
		}
		case 'touch': {
			const touch = binding as TouchGesture;
			const suffix = touch.trigger === 'hold' ? ` 长按 ${touch.durationMs ?? 450}ms` : '';
			return `${touch.gesture || ''}${suffix}`;
		}
		case 'area': {
			const area = binding as AreaClick;
			const areaButtonText = BUTTON_NAMES[area.button || 'left'] || '左键';
			const areaText = AREA_NAMES[area.area] || area.area;
			const actionText = ACTION_NAMES[area.action || 'click'] || '点击';
			return `${areaButtonText} ${areaText} ${actionText}`;
		}
		default:
			return '';
	}
}

export function formatContext(context: BindingContext): string {
	return CONTEXT_NAMES[context] ?? context;
}

export function getAvailableContexts(): BindingContext[] {
	return ['global', 'viewer', 'videoPlayer'];
}

export function getAllBindingsForAction(
	bindings: ActionBinding[],
	action: string
): BindingWithContext[] {
	const ab = bindings.find((b) => b.action === action);
	if (!ab) return [];

	const result: BindingWithContext[] = [];
	if (ab.bindings) {
		for (const b of ab.bindings) {
			result.push({ binding: b, context: 'global' });
		}
	}
	if (ab.contextBindings) {
		for (const cb of ab.contextBindings) {
			result.push({ binding: cb.input, context: cb.context });
		}
	}
	return result;
}

export function getBindingsForContext(
	bindings: ActionBinding[],
	context: BindingContext
): ActionWithBinding[] {
	const result: ActionWithBinding[] = [];
	for (const ab of bindings) {
		if (context === 'global' && ab.bindings) {
			for (const b of ab.bindings) {
				result.push({ action: ab.action, binding: b });
			}
		}
		if (ab.contextBindings) {
			for (const cb of ab.contextBindings) {
				if (cb.context === context) {
					result.push({ action: ab.action, binding: cb.input });
				}
			}
		}
	}
	return result;
}
