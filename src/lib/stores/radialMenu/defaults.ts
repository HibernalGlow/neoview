/**
 * Radial menu defaults and migration.
 */

import type { RadialMenuConfig, RadialMenuDefinition, RadialMenuItem } from './types';

export const RADIAL_MENU_STORAGE_KEY = 'neoview-radial-menus';

/** 创建默认轮盘配置（默认无绑定，用户自行添加） */
export function createDefaultRadialMenu(): RadialMenuConfig {
	return {
		id: 'default',
		name: '默认轮盘',
		enabled: true,
		layerCount: 3,
		items: [],
		radius: 120,
		innerRadius: 40,
		variant: 'slice',
		startAngle: -90,
		sweepAngle: 360,
	};
}

function normalizeItem(raw: any, index = 0): RadialMenuItem {
	const rawSlotIndex = Number(raw?.slotIndex);
	return {
		id: String(raw?.id ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`),
		action: typeof raw?.action === 'string' ? raw.action : null,
		label: typeof raw?.label === 'string' ? raw.label : '',
		slotIndex: Number.isFinite(rawSlotIndex) && rawSlotIndex >= 0 ? Math.floor(rawSlotIndex) : index,
		moveToMenuId: typeof raw?.moveToMenuId === 'string' && raw.moveToMenuId ? raw.moveToMenuId : undefined,
		icon: typeof raw?.icon === 'string' && raw.icon ? raw.icon : undefined,
		disabled: raw?.disabled === true ? true : undefined,
		children: Array.isArray(raw?.children)
			? raw.children.map((child: unknown, childIndex: number) => normalizeItem(child, childIndex))
			: undefined,
	};
}

function pruneItemsToLayer(items: RadialMenuItem[], layerCount: 1 | 2 | 3, layer = 1): RadialMenuItem[] {
	return items.map((item) => {
		const next: RadialMenuItem = {
			...item,
			children: undefined,
		};
		if (layer < layerCount && Array.isArray(item.children)) {
			next.children = pruneItemsToLayer(item.children, layerCount, layer + 1);
		}
		return next;
	});
}

export function migrateRadialMenuConfig(raw: any): RadialMenuConfig {
	const defaults = createDefaultRadialMenu();

	if (!raw || typeof raw !== 'object') {
		return defaults;
	}

	const layerCount = raw.layerCount === 1 || raw.layerCount === 2 || raw.layerCount === 3
		? raw.layerCount
		: 3;

	// 旧 schema：layer:sector 槽位 → 转换为空 items（用户自行绑定）
	if ('slots' in raw && !('items' in raw)) {
		return {
			...defaults,
			layerCount,
		};
	}

	const items = Array.isArray(raw.items)
		? pruneItemsToLayer(raw.items.map((item: unknown, index: number) => normalizeItem(item, index)), layerCount)
		: [];
	const menus: RadialMenuDefinition[] = Array.isArray(raw.menus) && raw.menus.length > 0
		? raw.menus.map((menu: any, index: number) => ({
				id: String(menu?.id ?? (index === 0 ? defaults.id : `menu-${Date.now()}-${index}`)),
				name: typeof menu?.name === 'string' && menu.name ? menu.name : `轮盘 ${index + 1}`,
				items: Array.isArray(menu?.items)
					? pruneItemsToLayer(
							menu.items.map((item: unknown, itemIndex: number) => normalizeItem(item, itemIndex)),
							layerCount
						)
					: []
			}))
		: [
				{
					id: String(raw.id ?? defaults.id),
					name: typeof raw.name === 'string' && raw.name ? raw.name : defaults.name,
					items
				}
			];
	const activeMenuId =
		typeof raw.activeMenuId === 'string' && menus.some((menu) => menu.id === raw.activeMenuId)
			? raw.activeMenuId
			: menus[0]?.id ?? defaults.id;
	const activeItems = menus.find((menu) => menu.id === activeMenuId)?.items ?? items;

	return {
		...defaults,
		...raw,
		activeMenuId,
		layerCount,
		menus,
		items: activeItems,
		variant: raw.variant === 'bubble' ? 'bubble' : 'slice',
	};
}
