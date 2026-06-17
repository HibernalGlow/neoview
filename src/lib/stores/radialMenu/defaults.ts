/**
 * Radial menu defaults and migration.
 */

import type { RadialMenuConfig, RadialMenuDefinition, RadialMenuItem } from './types';

export const RADIAL_MENU_STORAGE_KEY = 'neoview-radial-menus';

export function createDefaultRadialMenu(): RadialMenuConfig {
	return {
		id: 'default',
		name: '默认轮盘',
		enabled: true,
		layerCount: 3,
		layers: [[], [], []],
		items: [],
		radius: 120,
		innerRadius: 40,
		variant: 'slice',
		startAngle: -90,
		sweepAngle: 360
	};
}

function normalizeItem(raw: any, index = 0): RadialMenuItem {
	const rawSlotIndex = Number(raw?.slotIndex);
	return {
		id: String(raw?.id ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`),
		action: typeof raw?.action === 'string' ? raw.action : null,
		label: typeof raw?.label === 'string' ? raw.label : '',
		slotIndex: Number.isFinite(rawSlotIndex) && rawSlotIndex >= 0 ? Math.floor(rawSlotIndex) : index,
		moveToMenuId:
			typeof raw?.moveToMenuId === 'string' && raw.moveToMenuId ? raw.moveToMenuId : undefined,
		icon: typeof raw?.icon === 'string' && raw.icon ? raw.icon : undefined,
		disabled: raw?.disabled === true ? true : undefined,
		children: Array.isArray(raw?.children)
			? raw.children.map((child: unknown, childIndex: number) => normalizeItem(child, childIndex))
			: undefined
	};
}

function withoutChildren(item: RadialMenuItem): RadialMenuItem {
	const { children: _children, ...rest } = item;
	return rest;
}

function normalizeLayers(
	rawLayers: unknown,
	fallbackItems: RadialMenuItem[],
	layerCount: 1 | 2 | 3
): RadialMenuItem[][] {
	if (Array.isArray(rawLayers)) {
		return [0, 1, 2].map((layerIndex) => {
			const layer = rawLayers[layerIndex];
			return Array.isArray(layer)
				? layer.map((item: unknown, itemIndex: number) => normalizeItem(item, itemIndex)).map(withoutChildren)
				: [];
		});
	}

	const layers: RadialMenuItem[][] = [[], [], []];
	const visit = (items: RadialMenuItem[], depth: 0 | 1 | 2) => {
		for (const item of items) {
			layers[depth].push(withoutChildren(item));
			if (depth < Math.min(2, layerCount - 1) && item.children?.length) {
				visit(item.children, (depth + 1) as 0 | 1 | 2);
			}
		}
	};
	visit(fallbackItems, 0);
	return layers;
}

function normalizeOldItems(rawItems: unknown, layerCount: 1 | 2 | 3): RadialMenuItem[] {
	return Array.isArray(rawItems)
		? rawItems.map((item: unknown, index: number) => normalizeItem(item, index)).map((item) => {
				if (!item.children?.length || layerCount <= 1) {
					return withoutChildren(item);
				}
				return {
					...item,
					children: item.children.map(withoutChildren)
				};
			})
		: [];
}

export function migrateRadialMenuConfig(raw: any): RadialMenuConfig {
	const defaults = createDefaultRadialMenu();

	if (!raw || typeof raw !== 'object') {
		return defaults;
	}

	const layerCount =
		raw.layerCount === 1 || raw.layerCount === 2 || raw.layerCount === 3 ? raw.layerCount : 3;

	if ('slots' in raw && !('items' in raw) && !('layers' in raw)) {
		return {
			...defaults,
			layerCount
		};
	}

	const rootItems = normalizeOldItems(raw.items, layerCount);
	const rootLayers = normalizeLayers(raw.layers, rootItems, layerCount);
	const menus: RadialMenuDefinition[] =
		Array.isArray(raw.menus) && raw.menus.length > 0
			? raw.menus.map((menu: any, index: number) => {
					const menuItems = normalizeOldItems(menu?.items, layerCount);
					const layers = normalizeLayers(menu?.layers, menuItems, layerCount);
					return {
						id: String(menu?.id ?? (index === 0 ? defaults.id : `menu-${Date.now()}-${index}`)),
						name: typeof menu?.name === 'string' && menu.name ? menu.name : `轮盘 ${index + 1}`,
						layers,
						items: layers[0] ?? []
					};
				})
			: [
					{
						id: String(raw.id ?? defaults.id),
						name: typeof raw.name === 'string' && raw.name ? raw.name : defaults.name,
						layers: rootLayers,
						items: rootLayers[0] ?? []
					}
				];

	const activeMenuId =
		typeof raw.activeMenuId === 'string' && menus.some((menu) => menu.id === raw.activeMenuId)
			? raw.activeMenuId
			: menus[0]?.id ?? defaults.id;
	const activeMenu = menus.find((menu) => menu.id === activeMenuId) ?? menus[0];
	const activeLayers = activeMenu?.layers ?? rootLayers;

	return {
		...defaults,
		...raw,
		activeMenuId,
		layerCount,
		menus,
		layers: activeLayers,
		items: activeLayers[0] ?? [],
		variant: raw.variant === 'bubble' ? 'bubble' : 'slice'
	};
}
