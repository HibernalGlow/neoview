/**
 * Radial menu defaults and migration.
 */

import type { RadialMenuConfig, RadialMenuItem } from './types';

export const RADIAL_MENU_STORAGE_KEY = 'neoview-radial-menus';

function createEmptyItem(id: string, label: string): RadialMenuItem {
	return {
		id,
		action: null,
		label,
	};
}

function createLayerItems(layerCount: 1 | 2 | 3): RadialMenuItem[] {
	const rootCount = 8;
	const childCount = 8;

	return Array.from({ length: rootCount }, (_, rootIndex) => {
		const rootId = `l1-${rootIndex + 1}`;
		const root: RadialMenuItem = createEmptyItem(rootId, `L1-${rootIndex + 1}`);

		if (layerCount >= 2) {
			root.children = Array.from({ length: childCount }, (_, childIndex) => {
				const childId = `l2-${rootIndex + 1}-${childIndex + 1}`;
				const child = createEmptyItem(childId, `L2-${rootIndex + 1}-${childIndex + 1}`);

				if (layerCount >= 3) {
					child.children = Array.from({ length: childCount }, (_, grandIndex) =>
						createEmptyItem(
							`l3-${rootIndex + 1}-${childIndex + 1}-${grandIndex + 1}`,
							`L3-${rootIndex + 1}-${childIndex + 1}-${grandIndex + 1}`
						)
					);
				}

				return child;
			});
		}

		return root;
	});
}

export function createDefaultRadialMenu(): RadialMenuConfig {
	return {
		id: 'default',
		name: '默认轮盘',
		enabled: true,
		layerCount: 3,
		items: createLayerItems(3),
		radius: 120,
		innerRadius: 40,
		variant: 'slice',
		startAngle: -90,
		sweepAngle: 360,
	};
}

function normalizeItem(raw: any): RadialMenuItem {
	return {
		id: String(raw?.id ?? `item-${Date.now()}-${Math.random()}`),
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

	if ('slots' in raw && !('items' in raw)) {
		const migrated = createDefaultRadialMenu();
		migrated.layerCount = layerCount;
		migrated.items = createLayerItems(layerCount);

		const slots = raw.slots as Record<string, any>;
		for (const [key, slot] of Object.entries(slots)) {
			const [layerStr, sectorStr] = key.split(':');
			const layer = Number(layerStr);
			const sector = Number(sectorStr);
			if (!Number.isFinite(layer) || !Number.isFinite(sector) || !slot) continue;

			if (layer === 1) {
				const item = migrated.items[sector];
				if (item) {
					item.action = slot.action ?? null;
					item.label = slot.label ?? item.label;
				}
				continue;
			}

			if (layer === 2) {
				const rootIndex = Math.floor(sector / 8);
				const childIndex = sector % 8;
				const item = migrated.items[rootIndex]?.children?.[childIndex];
				if (item) {
					item.action = slot.action ?? null;
					item.label = slot.label ?? item.label;
				}
				continue;
			}

			if (layer === 3) {
				const rootIndex = Math.floor(sector / 64);
				const remain = sector % 64;
				const childIndex = Math.floor(remain / 8);
				const grandIndex = remain % 8;
				const item = migrated.items[rootIndex]?.children?.[childIndex]?.children?.[grandIndex];
				if (item) {
					item.action = slot.action ?? null;
					item.label = slot.label ?? item.label;
				}
			}
		}

		return migrated;
	}

	const items = Array.isArray(raw.items)
		? pruneItemsToLayer(raw.items.map(normalizeItem), layerCount)
		: createLayerItems(layerCount);

	return {
		...defaults,
		...raw,
		layerCount,
		items,
		variant: raw.variant === 'bubble' ? 'bubble' : 'slice',
	};
}
