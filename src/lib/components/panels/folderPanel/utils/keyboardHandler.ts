/**
 * 键盘快捷键处理模块
 * 从 FolderPanel 中提取，保持主组件简洁
 */

import type { FsItem } from '$lib/types';

export interface KeyboardHandlerOptions {
	selectedItems: Set<string>;
	sortedItems: FsItem[];
	multiSelectMode: boolean;
	deleteMode: boolean;
	onNavigate: (path: string) => void;
	onOpenItem: (item: FsItem) => void;
	onGoBack: () => void;
	onRefresh: () => void;
	onBatchDelete: () => void;
	onSelectAll: () => void;
	onDeselectAll: () => void;
	onToggleSearchBar: () => void;
}

/**
 * 创建键盘事件处理器
 */
export function createKeyboardHandler(getOptions: () => KeyboardHandlerOptions) {
	return function handleKeydown(e: KeyboardEvent) {
		// 如果在输入框中，不处理快捷键
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
			return;
		}

		const options = getOptions();
		const { selectedItems, sortedItems, multiSelectMode, deleteMode } = options;

		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				// 键盘导航需要在 FolderPanel 中通过 onSelectItem 回调实现
				// 当前版本暂不支持，可通过鼠标点击选择项目
				e.preventDefault();
				break;

			case 'Enter':
				e.preventDefault();
				if (selectedItems.size > 0) {
					const firstPath = Array.from(selectedItems)[0];
					const item = sortedItems.find((i: FsItem) => i.path === firstPath);
					if (item) {
						if (item.isDir) {
							options.onNavigate(item.path);
						} else {
							options.onOpenItem(item);
						}
					}
				}
				break;

			case 'Backspace':
				e.preventDefault();
				options.onGoBack();
				break;

			case 'F5':
				e.preventDefault();
				options.onRefresh();
				break;

			case 'Delete':
				e.preventDefault();
				if (deleteMode && selectedItems.size > 0) {
					options.onBatchDelete();
				}
				break;

			case 'a':
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					options.onSelectAll();
				}
				break;

			case 'f':
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					options.onToggleSearchBar();
				}
				break;

			case 'Escape':
				e.preventDefault();
				if (multiSelectMode) {
					options.onDeselectAll();
				}
				break;
		}
	};
}
