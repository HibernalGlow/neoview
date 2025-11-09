/**
 * NeoView - Panels Store
 * 面板管理系统 - 支持多侧边栏和面板拖拽
 */

import { writable, derived } from 'svelte/store';

// 面板位置类型
export type PanelLocation = 'left' | 'right' | 'bottom' | 'floating';

// 面板类型
export type PanelType = 'folder' | 'history' | 'bookmark' | 'info' | 'thumbnail' | 'playlist';

// 面板配置
export interface PanelConfig {
	id: PanelType;
	title: string;
	icon: string; // Lucide icon name
	location: PanelLocation;
	order: number; // 排序位置
	visible: boolean;
	pinned: boolean; // 是否固定显示
}

// 侧边栏配置
export interface SidebarConfig {
	location: 'left' | 'right' | 'bottom';
	width: number; // 左右侧边栏的宽度
	height: number; // 底部侧边栏的高度
	visible: boolean;
	panels: PanelType[]; // 该侧边栏包含的面板
}

// 默认面板配置
const defaultPanels: PanelConfig[] = [
	{
		id: 'folder',
		title: '文件夹',
		icon: 'Folder',
		location: 'left',
		order: 0,
		visible: true,
		pinned: false
	},
	{
		id: 'history',
		title: '历史记录',
		icon: 'History',
		location: 'left',
		order: 1,
		visible: true,
		pinned: false
	},
	{
		id: 'bookmark',
		title: '书签',
		icon: 'Bookmark',
		location: 'left',
		order: 2,
		visible: true,
		pinned: false
	},
	{
		id: 'info',
		title: '信息',
		icon: 'Info',
		location: 'right',
		order: 0,
		visible: true,
		pinned: false
	},
	{
		id: 'thumbnail',
		title: '缩略图',
		icon: 'Grid',
		location: 'bottom',
		order: 0,
		visible: true,
		pinned: false
	},
	{
		id: 'playlist',
		title: '播放列表',
		icon: 'List',
		location: 'bottom',
		order: 1,
		visible: true,
		pinned: false
	}
];

// 默认侧边栏配置
const defaultSidebars: Record<'left' | 'right' | 'bottom', SidebarConfig> = {
	left: {
		location: 'left',
		width: 250,
		height: 0,
		visible: true,
		panels: ['folder', 'history', 'bookmark']
	},
	right: {
		location: 'right',
		width: 250,
		height: 0,
		visible: false,
		panels: ['info']
	},
	bottom: {
		location: 'bottom',
		width: 0,
		height: 200,
		visible: false,
		panels: ['thumbnail', 'playlist']
	}
};

// Stores
export const panels = writable<PanelConfig[]>(loadPanels());
export const sidebars = writable<Record<'left' | 'right' | 'bottom', SidebarConfig>>(
	loadSidebars()
);
export const activePanel = writable<PanelType | null>('folder');
export const draggingPanel = writable<PanelType | null>(null);

// 派生 Store：按位置分组的面板
export const panelsByLocation = derived(panels, ($panels) => {
	const grouped: Record<PanelLocation, PanelConfig[]> = {
		left: [],
		right: [],
		bottom: [],
		floating: []
	};

	$panels.forEach((panel) => {
		if (panel.visible) {
			grouped[panel.location].push(panel);
		}
	});

	// 按 order 排序
	Object.keys(grouped).forEach((location) => {
		grouped[location as PanelLocation].sort((a, b) => a.order - b.order);
	});

	return grouped;
});

// 派生 Store：左侧边栏的面板
export const leftPanels = derived(panelsByLocation, ($grouped) => $grouped.left);

// 派生 Store：右侧边栏的面板
export const rightPanels = derived(panelsByLocation, ($grouped) => $grouped.right);

// 派生 Store：底部侧边栏的面板
export const bottomPanels = derived(panelsByLocation, ($grouped) => $grouped.bottom);

/**
 * 从本地存储加载面板配置
 */
function loadPanels(): PanelConfig[] {
	try {
		const saved = localStorage.getItem('neoview-panels');
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error('Failed to load panels:', e);
	}
	return defaultPanels;
}

/**
 * 从本地存储加载侧边栏配置
 */
function loadSidebars(): Record<'left' | 'right' | 'bottom', SidebarConfig> {
	try {
		const saved = localStorage.getItem('neoview-sidebars');
		if (saved) {
			return JSON.parse(saved);
		}
	} catch (e) {
		console.error('Failed to load sidebars:', e);
	}
	return defaultSidebars;
}

/**
 * 保存面板配置到本地存储
 */
function savePanels(panelConfigs: PanelConfig[]) {
	try {
		localStorage.setItem('neoview-panels', JSON.stringify(panelConfigs));
	} catch (e) {
		console.error('Failed to save panels:', e);
	}
}

/**
 * 保存侧边栏配置到本地存储
 */
function saveSidebars(sidebarConfigs: Record<'left' | 'right' | 'bottom', SidebarConfig>) {
	try {
		localStorage.setItem('neoview-sidebars', JSON.stringify(sidebarConfigs));
	} catch (e) {
		console.error('Failed to save sidebars:', e);
	}
}

/**
 * 切换侧边栏可见性
 */
export function togglePanelSidebar(location: 'left' | 'right' | 'bottom') {
	sidebars.update((bars) => {
		bars[location].visible = !bars[location].visible;
		saveSidebars(bars);
		return bars;
	});
}

/**
 * 设置侧边栏尺寸
 */
export function setPanelSidebarSize(location: 'left' | 'right' | 'bottom', size: number) {
	sidebars.update((bars) => {
		if (location === 'bottom') {
			bars[location].height = size;
		} else {
			bars[location].width = size;
		}
		saveSidebars(bars);
		return bars;
	});
}

/**
 * 切换面板可见性
 */
export function togglePanelVisibility(panelId: PanelType) {
	panels.update((p) => {
		const panel = p.find((x) => x.id === panelId);
		if (panel) {
			panel.visible = !panel.visible;
		}
		savePanels(p);
		return p;
	});
}

/**
 * 移动面板到新位置
 */
export function movePanelToLocation(panelId: PanelType, newLocation: PanelLocation) {
	panels.update((p) => {
		const panel = p.find((x) => x.id === panelId);
		if (panel) {
			// 获取目标位置的最大 order
			const maxOrder = p
				.filter((x) => x.location === newLocation)
				.reduce((max, x) => Math.max(max, x.order), -1);

			panel.location = newLocation;
			panel.order = maxOrder + 1;
		}
		savePanels(p);
		return p;
	});
}

/**
 * 重新排序面板
 */
export function reorderPanels(location: PanelLocation, panelIds: PanelType[]) {
	panels.update((p) => {
		panelIds.forEach((id, index) => {
			const panel = p.find((x) => x.id === id);
			if (panel && panel.location === location) {
				panel.order = index;
			}
		});
		savePanels(p);
		return p;
	});
}

/**
 * 设置激活的面板
 */
export function setActivePanelTab(panelId: PanelType | null) {
	activePanel.set(panelId);
}

/**
 * 开始拖拽面板
 */
export function startDraggingPanel(panelId: PanelType) {
	draggingPanel.set(panelId);
}

/**
 * 结束拖拽面板
 */
export function stopDraggingPanel() {
	draggingPanel.set(null);
}

/**
 * 重置为默认配置
 */
export function resetPanelLayout() {
	panels.set(defaultPanels);
	sidebars.set(defaultSidebars);
	savePanels(defaultPanels);
	saveSidebars(defaultSidebars);
}
