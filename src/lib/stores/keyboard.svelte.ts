/**
 * NeoView - Keyboard Store
 * 快捷键绑定状态管理
 */

import { writable, derived } from 'svelte/store';
import type {
	KeyBinding,
	GestureBinding,
	MouseGestureBinding,
	MouseWheelBinding
} from '../types/keyboard';

// 默认键盘快捷键绑定
const defaultKeyBindings: KeyBinding[] = [];

// 默认触摸手势绑定
const defaultGestureBindings: GestureBinding[] = [];

// 默认鼠标手势绑定 (右键拖拽)
const defaultMouseGestureBindings: MouseGestureBinding[] = [];

// 默认鼠标滚轮绑定
const defaultMouseWheelBindings: MouseWheelBinding[] = [];

// Store
export const keyBindings = writable<KeyBinding[]>(defaultKeyBindings);
export const gestureBindings = writable<GestureBinding[]>(defaultGestureBindings);
export const mouseGestureBindings = writable<MouseGestureBinding[]>(defaultMouseGestureBindings);
export const mouseWheelBindings = writable<MouseWheelBinding[]>(defaultMouseWheelBindings);

// 当前正在录制的快捷键
export const recordingCommand = writable<string | null>(null);

// 按分类分组的快捷键
export const keyBindingsByCategory = derived(keyBindings, ($bindings) => {
	const grouped: Record<string, KeyBinding[]> = {};

	$bindings.forEach((binding) => {
		if (!grouped[binding.category]) {
			grouped[binding.category] = [];
		}
		grouped[binding.category].push(binding);
	});

	return grouped;
});

/**
 * 更新快捷键绑定
 */
export function updateKeyBinding(command: string, keys: string) {
	keyBindings.update((bindings) => {
		const index = bindings.findIndex((b) => b.command === command);
		if (index !== -1) {
			bindings[index] = { ...bindings[index], keys };
		}
		return bindings;
	});
}

/**
 * 重置为默认快捷键
 */
export function resetKeyBindings() {
	keyBindings.set(defaultKeyBindings);
}

/**
 * 从按键事件生成按键组合字符串
 */
export function generateKeyCombo(event: KeyboardEvent): string {
	const parts: string[] = [];

	if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
	if (event.shiftKey) parts.push('Shift');
	if (event.altKey) parts.push('Alt');

	// 处理特殊键
	let key = event.key;
	if (key === ' ') key = 'Space';
	if (key.length === 1) key = key.toLowerCase();

	parts.push(key);

	return parts.join('+');
}

/**
 * 查找快捷键对应的命令
 */
export function findCommandByKeys(keys: string, bindings: KeyBinding[]): string | null {
	const binding = bindings.find((b) => b.keys.toLowerCase() === keys.toLowerCase());
	return binding ? binding.command : null;
}
