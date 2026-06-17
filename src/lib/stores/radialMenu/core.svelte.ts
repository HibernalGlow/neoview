/**
 * 轮盘菜单系统 - 核心 Store
 * 管理 ray-menu 配置和运行时状态
 * 几何计算/指针追踪/键盘导航由 ray-menu 内部处理
 */

import type { RadialMenuConfig, RadialState, RadialMode, RadialMenuItem } from './types';
import { createDefaultRadialMenu, migrateRadialMenuConfig, RADIAL_MENU_STORAGE_KEY } from './defaults';

class RadialMenuStore {
	/** 轮盘配置 */
	config = $state<RadialMenuConfig>(createDefaultRadialMenu());

	/** 状态机当前状态 */
	state = $state<RadialState>('idle');

	/** 打开模式 */
	mode = $state<RadialMode>('pointer');

	/** 轮盘中心位置（视口坐标） */
	centerX = $state(0);
	centerY = $state(0);

	constructor() {
		this.loadFromStorage();
	}

	// ========== 配置管理 ==========

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

	/** 添加菜单项 */
	addItem(item: RadialMenuItem) {
		this.config.items = [...this.config.items, item];
		this.saveToStorage();
	}

	/** 更新菜单项 */
	updateItem(id: string, updates: Partial<RadialMenuItem>) {
		this.config.items = this.config.items.map((it) =>
			it.id === id ? { ...it, ...updates } : it
		);
		this.saveToStorage();
	}

	/** 删除菜单项 */
	removeItem(id: string) {
		this.config.items = this.config.items.filter((it) => it.id !== id);
		this.saveToStorage();
	}

	/** 移动菜单项顺序 */
	moveItem(id: string, direction: 'up' | 'down') {
		const idx = this.config.items.findIndex((it) => it.id === id);
		if (idx < 0) return;
		const newIdx = direction === 'up' ? idx - 1 : idx + 1;
		if (newIdx < 0 || newIdx >= this.config.items.length) return;
		const items = [...this.config.items];
		[items[idx], items[newIdx]] = [items[newIdx], items[idx]];
		this.config.items = items;
		this.saveToStorage();
	}

	// ========== 状态机 ==========

	/** 打开轮盘 */
	open(x: number, y: number, mode: RadialMode = 'pointer') {
		this.centerX = x;
		this.centerY = y;
		this.mode = mode;
		this.state = 'open';
	}

	/** 选中提交 */
	commit() {
		this.state = 'committed';
	}

	/** 取消 */
	cancel() {
		this.state = 'cancelled';
	}

	/** 回到 idle */
	reset() {
		this.state = 'idle';
	}

	/** 是否打开 */
	get isOpen(): boolean {
		return this.state === 'open';
	}

	/** 是否消费后续 click（选中/取消后短暂为 true） */
	get shouldSuppressClick(): boolean {
		return this.state === 'committed' || this.state === 'cancelled';
	}
}

/** 单例 */
export const radialMenuStore = new RadialMenuStore();
