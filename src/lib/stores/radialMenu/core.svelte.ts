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

/** 生成唯一 ID */
function genId(): string {
	return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSlotIndex(item: RadialMenuItem, fallbackIndex: number): number {
	return typeof item.slotIndex === 'number' && Number.isFinite(item.slotIndex)
		? item.slotIndex
		: fallbackIndex;
}

function sortBySlot(items: RadialMenuItem[]): RadialMenuItem[] {
	return [...items].sort((a, b) => {
		const diff = getSlotIndex(a, items.indexOf(a)) - getSlotIndex(b, items.indexOf(b));
		return diff || items.indexOf(a) - items.indexOf(b);
	});
}

function moveItemRecursive(
	items: RadialMenuItem[],
	id: string,
	direction: 'up' | 'down'
): { items: RadialMenuItem[]; moved: boolean } {
	const ordered = sortBySlot(items);
	const index = ordered.findIndex((item) => item.id === id);
	if (index >= 0) {
		const nextIndex = direction === 'up' ? index - 1 : index + 1;
		if (nextIndex < 0 || nextIndex >= ordered.length) {
			return { items, moved: false };
		}

		const current = ordered[index];
		const target = ordered[nextIndex];
		const currentSlot = getSlotIndex(current, index);
		const targetSlot = getSlotIndex(target, nextIndex);

		return {
			items: items.map((item) => {
				if (item.id === current.id) return { ...item, slotIndex: targetSlot };
				if (item.id === target.id) return { ...item, slotIndex: currentSlot };
				return item;
			}),
			moved: true,
		};
	}

	let moved = false;
	const nextItems = items.map((item) => {
		if (!item.children?.length || moved) return item;
		const result = moveItemRecursive(item.children, id, direction);
		if (!result.moved) return item;
		moved = true;
		return { ...item, children: result.items };
	});

	return { items: nextItems, moved };
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
			slotIndex: Math.max(
				0,
				...this.config.items.map((item, index) => getSlotIndex(item, index) + 1)
			),
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
					children: [
						...(parent.children ?? []),
						{
							...newItem,
							slotIndex: Math.max(
								0,
								...(parent.children ?? []).map((child, index) => getSlotIndex(child, index) + 1)
							),
						},
					],
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
		const result = moveItemRecursive(this.config.items, id, direction);
		if (!result.moved) return;
		this.config = { ...this.config, items: result.items };
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

export const radialMenuStore = new RadialMenuStore();
