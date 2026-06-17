/**
 * Radial menu store.
 */

import type { RadialMenuConfig, RadialState, RadialMode, RadialMenuItem } from './types';
import { createDefaultRadialMenu, migrateRadialMenuConfig, RADIAL_MENU_STORAGE_KEY } from './defaults';

/** 递归更新 items 树中指定 id 的项 */
function updateItemsRecursive(
	items: RadialMenuItem[],
	id: string,
	updater: (item: RadialMenuItem) => RadialMenuItem
): RadialMenuItem[] {
	return items.map((item) => {
		if (item.id === id) {
			return updater(item);
		}
		if (item.children?.length) {
			return {
				...item,
				children: updateItemsRecursive(item.children, id, updater),
			};
		}
		return item;
	});
}

/** 递归删除 items 树中指定 id 的项 */
function removeItemsRecursive(items: RadialMenuItem[], id: string): RadialMenuItem[] {
	return items
		.filter((item) => item.id !== id)
		.map((item) => {
			if (item.children?.length) {
				return { ...item, children: removeItemsRecursive(item.children, id) };
			}
			return item;
		});
}

/** 递归查找指定 id 的项及其所在数组 */
function findItemAndParent(
	items: RadialMenuItem[],
	id: string
): { item: RadialMenuItem; siblings: RadialMenuItem[]; index: number } | null {
	for (let i = 0; i < items.length; i++) {
		if (items[i].id === id) {
			return { item: items[i], siblings: items, index: i };
		}
		if (items[i].children?.length) {
			const found = findItemAndParent(items[i].children!, id);
			if (found) return found;
		}
	}
	return null;
}

/** 生成唯一 ID */
function genId(): string {
	return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class RadialMenuStore {
	config = $state<RadialMenuConfig>(createDefaultRadialMenu());
	state = $state<RadialState>('idle');
	mode = $state<RadialMode>('pointer');
	centerX = $state(0);
	centerY = $state(0);

	constructor() {
		this.loadFromStorage();
	}

	private loadFromStorage() {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(RADIAL_MENU_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				this.config = migrateRadialMenuConfig(parsed);
			}
		} catch (err) {
			console.error('[RadialMenu] loadFromStorage failed:', err);
		}
	}

	saveToStorage() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(RADIAL_MENU_STORAGE_KEY, JSON.stringify(this.config));
		} catch (err) {
			console.error('[RadialMenu] saveToStorage failed:', err);
		}
	}

	updateConfig(updates: Partial<RadialMenuConfig>) {
		this.config = { ...this.config, ...updates };
		this.saveToStorage();
	}

	setLayerCount(layerCount: 1 | 2 | 3) {
		const migrated = migrateRadialMenuConfig({
			...this.config,
			layerCount,
			items: this.config.items,
		});
		this.config = migrated;
		this.saveToStorage();
	}

	/** 添加菜单项（parentId 为空时添加到根层） */
	addItem(parentId?: string): string {
		const newItem: RadialMenuItem = {
			id: genId(),
			action: null,
			label: '新项目',
		};

		if (!parentId) {
			this.config = {
				...this.config,
				items: [...this.config.items, newItem],
			};
		} else {
			this.config = {
				...this.config,
				items: updateItemsRecursive(this.config.items, parentId, (parent) => ({
					...parent,
					children: [...(parent.children ?? []), newItem],
				})),
			};
		}
		this.saveToStorage();
		return newItem.id;
	}

	updateItem(id: string, updates: Partial<RadialMenuItem>) {
		this.config = {
			...this.config,
			items: updateItemsRecursive(this.config.items, id, (item) => ({
				...item,
				...updates,
			})),
		};
		this.saveToStorage();
	}

	removeItem(id: string) {
		this.config = {
			...this.config,
			items: removeItemsRecursive(this.config.items, id),
		};
		this.saveToStorage();
	}

	/** 在同级内移动项 */
	moveItem(id: string, direction: 'up' | 'down') {
		const found = findItemAndParent(this.config.items, id);
		if (!found) return;
		const { siblings, index } = found;
		const newIdx = direction === 'up' ? index - 1 : index + 1;
		if (newIdx < 0 || newIdx >= siblings.length) return;

		const newSiblings = [...siblings];
		[newSiblings[index], newSiblings[newIdx]] = [newSiblings[newIdx], newSiblings[index]];

		// 如果 siblings 是根数组
		if (siblings === this.config.items) {
			this.config = { ...this.config, items: newSiblings };
		} else {
			// siblings 是某个父项的 children，需要递归替换
			this.config = {
				...this.config,
				items: updateItemsRecursive(this.config.items, id, () => newSiblings[direction === 'up' ? newIdx + 1 : newIdx - 1]),
			};
			// 上面的方式不对，需要找到父项并替换其 children
			// 使用更可靠的方式：深拷贝并替换
			this.config = {
				...this.config,
				items: replaceChildrenById(this.config.items, id, newSiblings),
			};
		}
		this.saveToStorage();
	}

	resetConfig() {
		this.config = createDefaultRadialMenu();
		this.saveToStorage();
	}

	open(x: number, y: number, mode: RadialMode = 'pointer') {
		this.centerX = x;
		this.centerY = y;
		this.mode = mode;
		this.state = 'open';
	}

	commit() {
		this.state = 'committed';
	}

	cancel() {
		this.state = 'cancelled';
	}

	reset() {
		this.state = 'idle';
	}

	get isOpen(): boolean {
		return this.state === 'open';
	}

	get shouldSuppressClick(): boolean {
		return this.state === 'committed' || this.state === 'cancelled';
	}
}

/** 递归查找包含指定 id 的父项，替换其 children 数组 */
function replaceChildrenById(
	items: RadialMenuItem[],
	childId: string,
	newChildren: RadialMenuItem[]
): RadialMenuItem[] {
	return items.map((item) => {
		if (item.children?.some((c) => c.id === childId)) {
			return { ...item, children: newChildren };
		}
		if (item.children?.length) {
			return { ...item, children: replaceChildrenById(item.children, childId, newChildren) };
		}
		return item;
	});
}

export const radialMenuStore = new RadialMenuStore();
