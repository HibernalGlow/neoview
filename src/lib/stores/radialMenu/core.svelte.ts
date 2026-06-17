/**
 * Radial menu store.
 */

import type { RadialMenuConfig, RadialState, RadialMode, RadialMenuItem } from './types';
import { createDefaultRadialMenu, migrateRadialMenuConfig, RADIAL_MENU_STORAGE_KEY } from './defaults';

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
		const next = createDefaultRadialMenu();
		next.layerCount = layerCount;
		const migrated = migrateRadialMenuConfig({
			...this.config,
			layerCount,
			items: this.config.items,
		});
		this.config = {
			...next,
			...migrated,
			layerCount,
		};
		this.saveToStorage();
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
