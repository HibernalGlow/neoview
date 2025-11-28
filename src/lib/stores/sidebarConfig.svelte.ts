/**
 * Sidebar Configuration Store
 * 侧边栏配置存储 - 管理面板的显示、顺序和位置
 */

import { writable, derived, get } from 'svelte/store';
import { Folder, History, Bookmark, Image as ImageIcon, Info, FileText } from '@lucide/svelte';

// 面板类型
export type PanelId = 'folder' | 'history' | 'bookmark' | 'thumbnail' | 'info' | 'settings' | 'playlist';

// 面板位置
export type PanelPosition = 'left' | 'right' | 'bottom' | 'floating';

// 面板配置
export interface PanelConfig {
	id: PanelId;
	title: string;
	icon: typeof Folder;
	visible: boolean;
	order: number;
	position: PanelPosition;
	defaultPosition: PanelPosition;
	canMove: boolean;
	canHide: boolean;
}

// 侧边栏配置状态
export interface SidebarConfigState {
	panels: PanelConfig[];
	leftSidebarWidth: number;
	rightSidebarWidth: number;
	leftSidebarPinned: boolean;
	rightSidebarPinned: boolean;
	leftSidebarOpen: boolean;
	rightSidebarOpen: boolean;
}

// 默认面板配置
const defaultPanels: PanelConfig[] = [
	{
		id: 'folder',
		title: '文件夹',
		icon: Folder,
		visible: true,
		order: 0,
		position: 'left',
		defaultPosition: 'left',
		canMove: true,
		canHide: false // 文件夹面板不能隐藏
	},
	{
		id: 'history',
		title: '历史记录',
		icon: History,
		visible: true,
		order: 1,
		position: 'left',
		defaultPosition: 'left',
		canMove: true,
		canHide: true
	},
	{
		id: 'bookmark',
		title: '书签',
		icon: Bookmark,
		visible: true,
		order: 2,
		position: 'left',
		defaultPosition: 'left',
		canMove: true,
		canHide: true
	},
	{
		id: 'thumbnail',
		title: '缩略图',
		icon: ImageIcon,
		visible: true,
		order: 3,
		position: 'left',
		defaultPosition: 'left',
		canMove: true,
		canHide: true
	},
	{
		id: 'info',
		title: '信息',
		icon: Info,
		visible: false,
		order: 0,
		position: 'right',
		defaultPosition: 'right',
		canMove: true,
		canHide: true
	},
	{
		id: 'playlist',
		title: '播放列表',
		icon: FileText,
		visible: false,
		order: 4,
		position: 'left',
		defaultPosition: 'left',
		canMove: true,
		canHide: true
	}
];

const initialState: SidebarConfigState = {
	panels: defaultPanels,
	leftSidebarWidth: 320,
	rightSidebarWidth: 280,
	leftSidebarPinned: true,
	rightSidebarPinned: false,
	leftSidebarOpen: true,
	rightSidebarOpen: false
};

// 从 localStorage 加载配置
function loadFromStorage(): SidebarConfigState {
	try {
		const stored = localStorage.getItem('neoview-sidebar-config');
		if (stored) {
			const parsed = JSON.parse(stored);
			// 合并默认配置和存储的配置
			const panels = defaultPanels.map(defaultPanel => {
				const storedPanel = parsed.panels?.find((p: PanelConfig) => p.id === defaultPanel.id);
				if (storedPanel) {
					return {
						...defaultPanel,
						visible: storedPanel.visible ?? defaultPanel.visible,
						order: storedPanel.order ?? defaultPanel.order,
						position: storedPanel.position ?? defaultPanel.position
					};
				}
				return defaultPanel;
			});
			return {
				...initialState,
				...parsed,
				panels
			};
		}
	} catch (e) {
		console.error('Failed to load sidebar config:', e);
	}
	return initialState;
}

// 保存到 localStorage
function saveToStorage(state: SidebarConfigState) {
	try {
		// 只保存可序列化的数据
		const toSave = {
			panels: state.panels.map(p => ({
				id: p.id,
				visible: p.visible,
				order: p.order,
				position: p.position
			})),
			leftSidebarWidth: state.leftSidebarWidth,
			rightSidebarWidth: state.rightSidebarWidth,
			leftSidebarPinned: state.leftSidebarPinned,
			rightSidebarPinned: state.rightSidebarPinned,
			leftSidebarOpen: state.leftSidebarOpen,
			rightSidebarOpen: state.rightSidebarOpen
		};
		localStorage.setItem('neoview-sidebar-config', JSON.stringify(toSave));
	} catch (e) {
		console.error('Failed to save sidebar config:', e);
	}
}

// 创建 store
function createSidebarConfigStore() {
	const { subscribe, update } = writable<SidebarConfigState>(loadFromStorage());

	// 自动保存
	subscribe(state => {
		saveToStorage(state);
	});

	return {
		subscribe,
		
		// 设置面板可见性
		setPanelVisible(id: PanelId, visible: boolean) {
			update(state => {
				const panels = state.panels.map(p => 
					p.id === id && p.canHide ? { ...p, visible } : p
				);
				return { ...state, panels };
			});
		},

		// 设置面板顺序
		setPanelOrder(id: PanelId, order: number) {
			update(state => {
				const panels = state.panels.map(p => 
					p.id === id ? { ...p, order } : p
				);
				return { ...state, panels };
			});
		},

		// 设置面板位置
		setPanelPosition(id: PanelId, position: PanelPosition) {
			update(state => {
				const panel = state.panels.find(p => p.id === id);
				if (!panel || !panel.canMove) return state;
				
				const panels = state.panels.map(p => 
					p.id === id ? { ...p, position } : p
				);
				return { ...state, panels };
			});
		},

		// 移动面板（拖拽排序）
		movePanel(id: PanelId, newOrder: number, newPosition?: PanelPosition) {
			update(state => {
				const panel = state.panels.find(p => p.id === id);
				if (!panel) return state;

				const targetPosition = newPosition ?? panel.position;
				
				// 获取同位置的面板并重新排序
				
				// 重新排序
				const panels = state.panels.map(p => {
					if (p.id === id) {
						return { ...p, order: newOrder, position: targetPosition };
					}
					// 调整其他面板的顺序
					if (p.position === targetPosition && p.order >= newOrder) {
						return { ...p, order: p.order + 1 };
					}
					return p;
				});
				
				return { ...state, panels };
			});
		},

		// 重置面板配置
		resetPanels() {
			update(state => ({
				...state,
				panels: defaultPanels
			}));
		},

		// 设置侧边栏宽度
		setLeftSidebarWidth(width: number) {
			update(state => ({ ...state, leftSidebarWidth: width }));
		},

		setRightSidebarWidth(width: number) {
			update(state => ({ ...state, rightSidebarWidth: width }));
		},

		// 设置侧边栏固定状态
		setLeftSidebarPinned(pinned: boolean) {
			update(state => ({ ...state, leftSidebarPinned: pinned }));
		},

		setRightSidebarPinned(pinned: boolean) {
			update(state => ({ ...state, rightSidebarPinned: pinned }));
		},

		// 设置侧边栏打开状态
		setLeftSidebarOpen(open: boolean) {
			update(state => ({ ...state, leftSidebarOpen: open }));
		},

		setRightSidebarOpen(open: boolean) {
			update(state => ({ ...state, rightSidebarOpen: open }));
		},

		// 切换侧边栏
		toggleLeftSidebar() {
			update(state => ({ ...state, leftSidebarOpen: !state.leftSidebarOpen }));
		},

		toggleRightSidebar() {
			update(state => ({ ...state, rightSidebarOpen: !state.rightSidebarOpen }));
		},

		// 获取当前状态
		getState() {
			return get({ subscribe });
		}
	};
}

export const sidebarConfigStore = createSidebarConfigStore();

// 派生 stores - 使用 sidebarConfig 前缀避免与 panels.svelte.ts 冲突
export const sidebarLeftPanels = derived(sidebarConfigStore, $state => 
	$state.panels
		.filter(p => p.position === 'left' && p.visible)
		.sort((a, b) => a.order - b.order)
);

export const sidebarRightPanels = derived(sidebarConfigStore, $state => 
	$state.panels
		.filter(p => p.position === 'right' && p.visible)
		.sort((a, b) => a.order - b.order)
);

export const sidebarAllPanels = derived(sidebarConfigStore, $state => 
	$state.panels.sort((a, b) => a.order - b.order)
);
