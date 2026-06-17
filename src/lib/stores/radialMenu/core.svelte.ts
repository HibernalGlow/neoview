/**
 * Radial menu store.
 */

import type { RadialMenuConfig, RadialState, RadialMode, RadialMenuItem, RadialMenuDefinition } from './types';
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

function normalizeLayers(layers?: RadialMenuItem[][], items: RadialMenuItem[] = []): RadialMenuItem[][] {
	return [0, 1, 2].map((index) => layers?.[index] ?? (index === 0 ? items : []));
}

function updateLayersRecursive(
	layers: RadialMenuItem[][],
	id: string,
	updater: (item: RadialMenuItem) => RadialMenuItem
): RadialMenuItem[][] {
	return layers.map((items) => updateItemsRecursive(items, id, updater));
}

function removeFromLayers(layers: RadialMenuItem[][], id: string): RadialMenuItem[][] {
	return layers.map((items) => removeItemsRecursive(items, id));
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
		let nextConfig = { ...this.config, ...updates };
		if (updates.items || updates.layers) {
			const activeMenuId = nextConfig.activeMenuId ?? nextConfig.id;
			const nextLayers = normalizeLayers(updates.layers ?? nextConfig.layers, updates.items ?? nextConfig.items);
			const menus = (nextConfig.menus?.length
				? nextConfig.menus
				: [{ id: nextConfig.id, name: nextConfig.name, layers: this.config.layers, items: this.config.items }]
			).map((menu) =>
				menu.id === activeMenuId
					? { ...menu, layers: nextLayers, items: nextLayers[0] ?? [] }
					: menu
			);
			nextConfig = { ...nextConfig, layers: nextLayers, items: nextLayers[0] ?? [], menus };
		}
		this.config = this.syncActiveItems(nextConfig);
		this.saveToStorage();
	}

	private syncActiveItems(config: RadialMenuConfig): RadialMenuConfig {
		const menus = config.menus?.length
			? config.menus
			: [{ id: config.id, name: config.name, layers: config.layers, items: config.items }];
		const activeMenuId = config.activeMenuId && menus.some((menu) => menu.id === config.activeMenuId)
			? config.activeMenuId
			: menus[0].id;
		const activeMenu = menus.find((menu) => menu.id === activeMenuId) ?? menus[0];
		return {
			...config,
			activeMenuId,
			menus,
			layers: normalizeLayers(activeMenu.layers, activeMenu.items),
			items: normalizeLayers(activeMenu.layers, activeMenu.items)[0] ?? [],
		};
	}

	private updateActiveMenuLayers(layers: RadialMenuItem[][]) {
		const activeMenuId = this.config.activeMenuId ?? this.config.id;
		const normalized = normalizeLayers(layers, this.config.items);
		const menus = this.config.menus?.length
			? this.config.menus.map((menu) =>
					menu.id === activeMenuId ? { ...menu, layers: normalized, items: normalized[0] ?? [] } : menu
				)
			: [{ id: this.config.id, name: this.config.name, layers: normalized, items: normalized[0] ?? [] }];
		this.config = this.syncActiveItems({
			...this.config,
			activeMenuId,
			menus,
			layers: normalized,
			items: normalized[0] ?? []
		});
	}

	get menus(): RadialMenuDefinition[] {
		return this.config.menus?.length
			? this.config.menus
			: [{ id: this.config.id, name: this.config.name, layers: this.config.layers, items: this.config.items }];
	}

	get activeMenu(): RadialMenuDefinition {
		return this.menus.find((menu) => menu.id === this.config.activeMenuId) ?? this.menus[0];
	}

	setActiveMenu(menuId: string) {
		if (!this.menus.some((menu) => menu.id === menuId)) return;
		this.config = this.syncActiveItems({ ...this.config, activeMenuId: menuId });
		this.saveToStorage();
	}

	addMenu(name = `轮盘 ${this.menus.length + 1}`, activate = true): string {
		const id = `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const menus = [...this.menus, { id, name, layers: [[], [], []], items: [] }];
		this.config = this.syncActiveItems({
			...this.config,
			menus,
			activeMenuId: activate ? id : this.config.activeMenuId
		});
		this.saveToStorage();
		return id;
	}

	updateMenuName(menuId: string, name: string) {
		const menus = this.menus.map((menu) =>
			menu.id === menuId ? { ...menu, name: name.trim() || '未命名轮盘' } : menu
		);
		this.config = this.syncActiveItems({ ...this.config, menus });
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
			const layers = normalizeLayers(this.config.layers, this.config.items);
			layers[0] = [...layers[0], newItem];
			this.updateActiveMenuLayers(layers);
		} else {
			this.updateActiveMenuLayers(
				updateLayersRecursive(normalizeLayers(this.config.layers, this.config.items), parentId, (parent) => ({
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
				}))
			);
		}
		this.saveToStorage();
		return newItem.id;
	}

	updateItem(id: string, updates: Partial<RadialMenuItem>) {
		this.updateActiveMenuLayers(
			updateLayersRecursive(normalizeLayers(this.config.layers, this.config.items), id, (item) => ({
				...item,
				...updates,
			}))
		);
		this.saveToStorage();
	}

	removeItem(id: string) {
		this.updateActiveMenuLayers(removeFromLayers(normalizeLayers(this.config.layers, this.config.items), id));
		this.saveToStorage();
	}

	/** 在同级内移动项 */
	moveItem(id: string, direction: 'up' | 'down') {
		const layers = normalizeLayers(this.config.layers, this.config.items);
		for (let index = 0; index < layers.length; index += 1) {
			const result = moveItemRecursive(layers[index], id, direction);
			if (!result.moved) continue;
			layers[index] = result.items;
			this.updateActiveMenuLayers(layers);
			this.saveToStorage();
			return;
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

export const radialMenuStore = new RadialMenuStore();
