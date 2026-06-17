/**
 * 轮盘菜单系统 - 默认配置
 */

import type { RadialMenuConfig, RadialSlot } from './types';

/** localStorage key */
export const RADIAL_MENU_STORAGE_KEY = 'neoview-radial-menus';

/** 创建空 slot */
function emptySlot(): RadialSlot {
	return { action: null, enabled: true };
}

/** 生成所有 slot key */
function generateSlotKeys(layers: number, sectorCount: number): string[] {
	const keys: string[] = [];
	for (let layer = 1; layer <= layers; layer++) {
		for (let sector = 0; sector < sectorCount; sector++) {
			keys.push(`${layer}:${sector}`);
		}
	}
	return keys;
}

/** 创建默认轮盘配置 */
export function createDefaultRadialMenu(): RadialMenuConfig {
	const config: RadialMenuConfig = {
		id: 'default',
		name: '默认轮盘',
		enabled: true,
		sectorCount: 8,
		layers: 3,
		deadZonePx: 32,
		layerStepPx: 56,
		keyboardStepPx: 56,
		fallbackToInner: true,
		slots: {},
	};

	// 初始化所有 slot
	for (const key of generateSlotKeys(config.layers, config.sectorCount)) {
		config.slots[key] = emptySlot();
	}

	// 填充常用动作
	// 扇区 0 = 右, 1 = 右下, 2 = 下, 3 = 左下, 4 = 左, 5 = 左上, 6 = 上, 7 = 右上
	const defaultBindings: Record<string, { action: string; label: string }> = {
		// 第 1 层 - 基本导航
		'1:0': { action: 'nextPage', label: '下一页' },
		'1:4': { action: 'prevPage', label: '上一页' },
		'1:2': { action: 'fitWindow', label: '适合窗口' },
		'1:6': { action: 'fitOriginal', label: '原始大小' },
		'1:1': { action: 'zoomIn', label: '放大' },
		'1:5': { action: 'zoomOut', label: '缩小' },
		'1:3': { action: 'toggleFullScreen', label: '全屏' },
		'1:7': { action: 'togglePanorama', label: '全景' },

		// 第 2 层 - 视图操作
		'2:0': { action: 'rotateRight', label: '右旋' },
		'2:4': { action: 'rotateLeft', label: '左旋' },
		'2:2': { action: 'toggleAutoUpscale', label: '超分' },
		'2:6': { action: 'toggleSlideshow', label: '幻灯片' },
		'2:1': { action: 'firstPage', label: '首页' },
		'2:5': { action: 'lastPage', label: '末页' },

		// 第 3 层 - 文件操作
		'3:0': { action: 'openNextBook', label: '下一本' },
		'3:4': { action: 'openPrevBook', label: '上一本' },
		'3:2': { action: 'toggleBookmark', label: '书签' },
	};

	for (const [key, val] of Object.entries(defaultBindings)) {
		if (config.slots[key]) {
			config.slots[key] = { action: val.action, label: val.label, enabled: true };
		}
	}

	return config;
}

/** Schema migration：补齐缺失字段 */
export function migrateRadialMenuConfig(raw: Partial<RadialMenuConfig>): RadialMenuConfig {
	const defaults = createDefaultRadialMenu();
	const config: RadialMenuConfig = {
		id: raw.id ?? defaults.id,
		name: raw.name ?? defaults.name,
		enabled: raw.enabled ?? defaults.enabled,
		sectorCount: raw.sectorCount ?? defaults.sectorCount,
		layers: raw.layers ?? defaults.layers,
		deadZonePx: raw.deadZonePx ?? defaults.deadZonePx,
		layerStepPx: raw.layerStepPx ?? defaults.layerStepPx,
		keyboardStepPx: raw.keyboardStepPx ?? defaults.keyboardStepPx,
		fallbackToInner: raw.fallbackToInner ?? defaults.fallbackToInner,
		slots: {},
	};

	// 补齐所有 slot
	for (const key of generateSlotKeys(config.layers, config.sectorCount)) {
		const existing = raw.slots?.[key];
		config.slots[key] = existing
			? { action: existing.action ?? null, label: existing.label, icon: existing.icon, enabled: existing.enabled ?? true }
			: { action: null, enabled: true };
	}

	return config;
}
