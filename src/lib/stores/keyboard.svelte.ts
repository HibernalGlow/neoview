/**
 * NeoView - Keyboard Store
 * 快捷键绑定状态管理
 */

import { writable, derived } from 'svelte/store';
import type { KeyBinding, GestureBinding } from '../types/keyboard';

// 默认键盘快捷键绑定
const defaultKeyBindings: KeyBinding[] = [
	// 导航
	{ command: 'next_page', keys: 'ArrowRight', description: '下一页', category: 'navigation' },
	{ command: 'previous_page', keys: 'ArrowLeft', description: '上一页', category: 'navigation' },
	{ command: 'first_page', keys: 'Home', description: '第一页', category: 'navigation' },
	{ command: 'last_page', keys: 'End', description: '最后一页', category: 'navigation' },
	{ command: 'next_page', keys: 'PageDown', description: '下一页', category: 'navigation' },
	{ command: 'previous_page', keys: 'PageUp', description: '上一页', category: 'navigation' },

	// 缩放
	{ command: 'zoom_in', keys: '+', description: '放大', category: 'zoom' },
	{ command: 'zoom_out', keys: '-', description: '缩小', category: 'zoom' },
	{ command: 'zoom_reset', keys: '0', description: '重置缩放', category: 'zoom' },
	{ command: 'fit_width', keys: 'w', description: '适应宽度', category: 'zoom' },
	{ command: 'fit_height', keys: 'h', description: '适应高度', category: 'zoom' },
	{ command: 'fit_screen', keys: 'f', description: '适应屏幕', category: 'zoom' },

	// 文件操作
	{ command: 'open_file', keys: 'Ctrl+o', description: '打开文件', category: 'file' },
	{ command: 'close_book', keys: 'Ctrl+w', description: '关闭书籍', category: 'file' },
	{ command: 'refresh', keys: 'F5', description: '刷新', category: 'file' },

	// 视图
	{
		command: 'toggle_fullscreen',
		keys: 'F11',
		description: '全屏切换',
		category: 'view'
	},
	{
		command: 'toggle_sidebar',
		keys: 'Ctrl+b',
		description: '侧边栏切换',
		category: 'view'
	},
	{
		command: 'toggle_statusbar',
		keys: 'Ctrl+/',
		description: '状态栏切换',
		category: 'view'
	},

	// 旋转
	{ command: 'rotate_left', keys: 'Ctrl+l', description: '向左旋转', category: 'transform' },
	{ command: 'rotate_right', keys: 'Ctrl+r', description: '向右旋转', category: 'transform' },
	{ command: 'flip_horizontal', keys: 'Ctrl+h', description: '水平翻转', category: 'transform' },
	{ command: 'flip_vertical', keys: 'Ctrl+v', description: '垂直翻转', category: 'transform' },

	// 书签
	{
		command: 'toggle_bookmark',
		keys: 'Ctrl+d',
		description: '添加/移除书签',
		category: 'bookmark'
	},
	{
		command: 'show_bookmarks',
		keys: 'Ctrl+Shift+d',
		description: '显示书签',
		category: 'bookmark'
	}
];

// 默认手势绑定
const defaultGestureBindings: GestureBinding[] = [
	{ gesture: 'swipe-right', command: 'previous_page', description: '上一页' },
	{ gesture: 'swipe-left', command: 'next_page', description: '下一页' },
	{ gesture: 'swipe-up', command: 'toggle_sidebar', description: '显示/隐藏侧边栏' },
	{ gesture: 'pinch-out', command: 'zoom_in', description: '放大' },
	{ gesture: 'pinch-in', command: 'zoom_out', description: '缩小' }
];

// Store
export const keyBindings = writable<KeyBinding[]>(defaultKeyBindings);
export const gestureBindings = writable<GestureBinding[]>(defaultGestureBindings);

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
