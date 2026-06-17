/**
 * 轮盘菜单系统 - 核心 Store
 * 管理轮盘配置和运行时状态
 */

import type { RadialMenuConfig, RadialState, RadialMode, HitTestResult } from './types';
import { createDefaultRadialMenu, migrateRadialMenuConfig, RADIAL_MENU_STORAGE_KEY } from './defaults';
import { hitTestRadial } from './geometry';

class RadialMenuStore {
	/** 轮盘配置 */
	config = $state<RadialMenuConfig>(createDefaultRadialMenu());

	/** 状态机当前状态 */
	state = $state<RadialState>('idle');

	/** 打开模式 */
	mode = $state<RadialMode>('pointer');

	/** 轮盘中心位置（屏幕坐标） */
	centerX = $state(0);
	centerY = $state(0);

	/** 当前命中结果 */
	currentHit = $state<HitTestResult | null>(null);

	/** 键盘虚拟向量 */
	private keyboardX = 0;
	private keyboardY = 0;

	constructor() {
		this.loadFromStorage();
	}

	// ========== 配置管理 ==========

	/** 从 localStorage 加载 */
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

	/** 保存到 localStorage */
	saveToStorage() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(RADIAL_MENU_STORAGE_KEY, JSON.stringify(this.config));
		} catch (err) {
			console.error('[RadialMenu] saveToStorage failed:', err);
		}
	}

	/** 更新配置 */
	updateConfig(updates: Partial<RadialMenuConfig>) {
		this.config = { ...this.config, ...updates };
		this.saveToStorage();
	}

	/** 设置 slot 绑定 */
	setSlot(key: string, action: string | null, label?: string) {
		const slot = this.config.slots[key];
		if (slot) {
			slot.action = action;
			if (label !== undefined) slot.label = label;
			this.saveToStorage();
		}
	}

	/** 获取 slot 的 action */
	getSlotAction(key: string): string | null {
		const slot = this.config.slots[key];
		if (!slot || slot.enabled === false || !slot.action) return null;
		return slot.action;
	}

	/** 获取当前选中的 action（含 fallbackToInner 逻辑） */
	getSelectedAction(): string | null {
		if (!this.currentHit) return null;

		// 先尝试当前命中
		const action = this.getSlotAction(this.currentHit.key);
		if (action) return action;

		// fallbackToInner：向内层查找
		if (this.config.fallbackToInner && this.currentHit.layer > 1) {
			for (let l = this.currentHit.layer - 1; l >= 1; l--) {
				const fallbackKey = `${l}:${this.currentHit.sector}`;
				const fallbackAction = this.getSlotAction(fallbackKey);
				if (fallbackAction) return fallbackAction;
			}
		}

		return null;
	}

	// ========== 状态机 ==========

	/** 进入 pendingHold 状态 */
	startPendingHold(mode: RadialMode, x: number, y: number) {
		this.mode = mode;
		this.centerX = x;
		this.centerY = y;
		this.state = 'pendingHold';
		this.currentHit = null;
		this.keyboardX = 0;
		this.keyboardY = 0;
	}

	/** 打开轮盘 */
	open(x?: number, y?: number) {
		if (x !== undefined) this.centerX = x;
		if (y !== undefined) this.centerY = y;
		this.state = 'open';
		this.currentHit = null;
		this.keyboardX = 0;
		this.keyboardY = 0;
	}

	/** 更新指针位置（pointer 模式） */
	updatePointer(dx: number, dy: number) {
		if (this.state !== 'open' || this.mode !== 'pointer') return;
		this.currentHit = hitTestRadial(dx, dy, this.config);
	}

	/** 更新键盘向量（keyboard 模式） */
	updateKeyboard(direction: 'up' | 'down' | 'left' | 'right') {
		if (this.state !== 'open' || this.mode !== 'keyboard') return;
		const step = this.config.keyboardStepPx;
		switch (direction) {
			case 'right': this.keyboardX += step; break;
			case 'left': this.keyboardX -= step; break;
			case 'down': this.keyboardY += step; break;
			case 'up': this.keyboardY -= step; break;
		}
		this.currentHit = hitTestRadial(this.keyboardX, this.keyboardY, this.config);
	}

	/** 提交选中 */
	commit(): string | null {
		const action = this.getSelectedAction();
		this.state = 'committed';
		return action;
	}

	/** 取消 */
	cancel() {
		this.state = 'cancelled';
		this.currentHit = null;
	}

	/** 回到 idle */
	reset() {
		this.state = 'idle';
		this.currentHit = null;
		this.keyboardX = 0;
		this.keyboardY = 0;
	}

	/** 是否打开或即将打开 */
	get isOpen(): boolean {
		return this.state === 'open' || this.state === 'pendingHold';
	}

	/** 是否消费后续 click */
	get shouldSuppressClick(): boolean {
		return this.state === 'committed' || this.state === 'cancelled';
	}
}

/** 单例 */
export const radialMenuStore = new RadialMenuStore();
