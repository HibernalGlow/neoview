/**
 * Radial menu defaults and migration.
 */

import type { RadialMenuConfig, RadialMenuItem } from './types';

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

function normalizeItem(raw: any): RadialMenuItem {
	return {
		id: String(raw?.id ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`),
		action: typeof raw?.action === 'string' ? raw.action : null,
		label: typeof raw?.label === 'string' ? raw.label : '',
		icon: typeof raw?.icon === 'string' && raw.icon ? raw.icon : undefined,
		disabled: raw?.disabled === true ? true : undefined,
		children: Array.isArray(raw?.children) ? raw.children.map(normalizeItem) : undefined,
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
		? pruneItemsToLayer(raw.items.map(normalizeItem), layerCount)
		: [];

	return {
		...defaults,
		...raw,
		layerCount,
		items,
		variant: raw.variant === 'bubble' ? 'bubble' : 'slice',
	};
}
