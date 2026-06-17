/**
 * 轮盘菜单系统 - 默认配置
 * 基于 ray-menu Web Component
 */

import type { RadialMenuConfig, RadialMenuItem } from './types';

/** localStorage key */
export const RADIAL_MENU_STORAGE_KEY = 'neoview-radial-menus';

/** 创建默认轮盘配置 */
export function createDefaultRadialMenu(): RadialMenuConfig {
	return {
		id: 'default',
		name: '默认轮盘',
		enabled: true,
		items: [
			{ id: 'nextPage', label: '下一页', icon: '▶' },
			{ id: 'prevPage', label: '上一页', icon: '◀' },
			{ id: 'fitWindow', label: '适合窗口', icon: '⬜' },
			{ id: 'fitOriginal', label: '原始大小', icon: '1:1' },
			{ id: 'zoomIn', label: '放大', icon: '＋' },
			{ id: 'zoomOut', label: '缩小', icon: '－' },
			{ id: 'toggleFullScreen', label: '全屏', icon: '⛶' },
			{ id: 'togglePanorama', label: '全景', icon: '〰' },
		],
		radius: 120,
		innerRadius: 40,
		variant: 'slice',
		startAngle: -90,
		sweepAngle: 360,
	};
}

/**
 * Schema migration
 * 兼容旧版 layer:sector 槽位模型 → 新版 flat items 模型
 */
export function migrateRadialMenuConfig(raw: any): RadialMenuConfig {
	const defaults = createDefaultRadialMenu();

	if (!raw || typeof raw !== 'object') {
		return defaults;
	}

	// 旧 schema：有 slots 字段，无 items 字段 → 转换
	if ('slots' in raw && !('items' in raw)) {
		const items: RadialMenuItem[] = [];
		const slots = raw.slots as Record<string, any>;
		const keys = Object.keys(slots).sort((a, b) => {
			const [la, sa] = a.split(':').map(Number);
			const [lb, sb] = b.split(':').map(Number);
			return la !== lb ? la - lb : sa - sb;
		});
		for (const key of keys) {
			const slot = slots[key];
			if (slot && slot.action && slot.enabled !== false) {
				items.push({
					id: slot.action,
					label: slot.label ?? slot.action,
				});
			}
		}
		return {
			...defaults,
			id: raw.id ?? defaults.id,
			name: raw.name ?? defaults.name,
			enabled: raw.enabled ?? defaults.enabled,
			items: items.length > 0 ? items : defaults.items,
		};
	}

	// 新 schema：直接合并
	return {
		...defaults,
		...raw,
		items: Array.isArray(raw.items) ? raw.items : defaults.items,
		variant: raw.variant === 'bubble' ? 'bubble' : 'slice',
	};
}
