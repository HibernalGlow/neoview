/**
 * Sidebar Configuration Store
 * 侧边栏配置存储 - 管理面板的显示、顺序和位置
 * 支持跨窗口同步（通过 Tauri 事件）
 * 
 * 添加新面板只需在 PANEL_DEFINITIONS 中添加一条记录即可
 */

import { writable, derived, get } from 'svelte/store';
import { Folder, History, Bookmark, Info, FileText, File, Sparkles, BarChart3, Settings, ListMusic, Timer, Bot, Tag  } from '@lucide/svelte';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// 面板位置
export type PanelPosition = 'left' | 'right' | 'bottom' | 'floating';

/**
 * 面板定义 - 添加新面板只需在这里添加一条记录
 * 系统会自动处理类型、图标、emoji、默认配置等
 */
export const PANEL_DEFINITIONS = {
	// 左侧边栏面板
	folder: {
		title: '文件夹',
		icon: Folder,
		emoji: '📁',
		defaultPosition: 'left' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 0,
		canMove: true,
		canHide: false,
		supportsCards: true
	},
	history: {
		title: '历史记录',
		icon: History,
		emoji: '📚',
		defaultPosition: 'left' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 1,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	bookmark: {
		title: '书签',
		icon: Bookmark,
		emoji: '🔖',
		defaultPosition: 'left' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 2,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	pageList: {
		title: '页面列表',
		icon: FileText,
		emoji: '📄',
		defaultPosition: 'left' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 3,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	playlist: {
		title: '播放列表',
		icon: ListMusic,
		emoji: '📝',
		defaultPosition: 'left' as PanelPosition,
		defaultVisible: false,
		defaultOrder: 4,
		canMove: true,
		canHide: true,
		supportsCards: false
	},
	// 右侧边栏面板
	info: {
		title: '信息',
		icon: Info,
		emoji: '📋',
		defaultPosition: 'right' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 0,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	properties: {
		title: '属性',
		icon: Tag,
		emoji: '📑',
		defaultPosition: 'right' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 1,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	upscale: {
		title: '超分',
		icon: Sparkles,
		emoji: '✨',
		defaultPosition: 'right' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 2,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	insights: {
		title: '洞察',
		icon: BarChart3,
		emoji: '📊',
		defaultPosition: 'right' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 3,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	// 设置面板（特殊）
	settings: {
		title: '设置',
		icon: Settings,
		emoji: '⚙️',
		defaultPosition: 'left' as PanelPosition,
		defaultVisible: false,
		defaultOrder: 99,
		canMove: false,
		canHide: true,
		supportsCards: false
	},
	// 开发/测试面板
	benchmark: {
		title: '基准测试',
		icon: Timer,
		emoji: '⏱️',
		defaultPosition: 'right' as PanelPosition,
		defaultVisible: false,
		defaultOrder: 10,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	// AI 面板
	ai: {
		title: 'AI',
		icon: Bot,
		emoji: '🤖',
		defaultPosition: 'right' as PanelPosition,
		defaultVisible: true,
		defaultOrder: 5,
		canMove: true,
		canHide: true,
		supportsCards: true
	},
	// 卡片窗口（独立窗口使用）
	cardwindow: {
		title: '卡片窗口',
		icon: File,
		emoji: '🪟',
		defaultPosition: 'floating' as PanelPosition,
		defaultVisible: false,
		defaultOrder: 100,
		canMove: false,
		canHide: false,
		supportsCards: true
	}
} as const;

// 从定义中自动生成面板 ID 类型
export type PanelId = keyof typeof PANEL_DEFINITIONS;

// 获取所有面板 ID 列表
export const ALL_PANEL_IDS = Object.keys(PANEL_DEFINITIONS) as PanelId[];

// 获取面板定义
export function getPanelDefinition(id: PanelId) {
	return PANEL_DEFINITIONS[id];
}

// 获取面板 emoji
export function getPanelEmoji(id: PanelId): string {
	return PANEL_DEFINITIONS[id]?.emoji || '📄';
}

// 获取面板图标
export function getPanelIcon(id: PanelId) {
	return PANEL_DEFINITIONS[id]?.icon || File;
}

// 获取面板标题
export function getPanelTitle(id: PanelId): string {
	return PANEL_DEFINITIONS[id]?.title || id;
}

// 获取支持卡片的面板 ID 列表
export function getCardSupportingPanels(): PanelId[] {
	return ALL_PANEL_IDS.filter(id => PANEL_DEFINITIONS[id].supportsCards);
}

// 检查面板是否支持卡片
export function panelSupportsCards(id: PanelId): boolean {
	return PANEL_DEFINITIONS[id]?.supportsCards ?? false;
}

// 面板配置（运行时状态）
export interface PanelConfig {
	id: PanelId;
	title: string;
	icon: typeof Folder;
	emoji: string;
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

// 从 PANEL_DEFINITIONS 自动生成默认面板配置
const defaultPanels: PanelConfig[] = ALL_PANEL_IDS.map(id => {
	const def = PANEL_DEFINITIONS[id];
	return {
		id,
		title: def.title,
		icon: def.icon,
		emoji: def.emoji,
		visible: def.defaultVisible,
		order: def.defaultOrder,
		position: def.defaultPosition,
		defaultPosition: def.defaultPosition,
		canMove: def.canMove,
		canHide: def.canHide
	};
});

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
				
				// 如果指定了新位置且面板不能移动，则不改变位置
				const targetPosition = (newPosition && panel.canMove) ? newPosition : panel.position;
				
				// 计算目标位置的最大顺序
				const samePosPanel = state.panels.filter(p => p.position === targetPosition && p.id !== id);
				const maxOrder = samePosPanel.length > 0 ? Math.max(...samePosPanel.map(p => p.order)) + 1 : 0;
				const finalOrder = Math.min(newOrder, maxOrder);
				
				// 重新排序
				const panels = state.panels.map(p => {
					if (p.id === id) {
						return { ...p, order: finalOrder, position: targetPosition };
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
		},
		
		// 从远程配置应用（跨窗口同步用）
		applyRemoteConfig(remoteConfig: Partial<SidebarConfigState>) {
			update(state => {
				const newState = { ...state };
				
				if (remoteConfig.panels) {
					// 合并面板配置
					newState.panels = state.panels.map(panel => {
						const remotePanel = remoteConfig.panels?.find(p => p.id === panel.id);
						if (remotePanel) {
							return {
								...panel,
								visible: remotePanel.visible ?? panel.visible,
								order: remotePanel.order ?? panel.order,
								position: remotePanel.position ?? panel.position
							};
						}
						return panel;
					});
				}
				
				if (remoteConfig.leftSidebarWidth !== undefined) {
					newState.leftSidebarWidth = remoteConfig.leftSidebarWidth;
				}
				if (remoteConfig.rightSidebarWidth !== undefined) {
					newState.rightSidebarWidth = remoteConfig.rightSidebarWidth;
				}
				if (remoteConfig.leftSidebarPinned !== undefined) {
					newState.leftSidebarPinned = remoteConfig.leftSidebarPinned;
				}
				if (remoteConfig.rightSidebarPinned !== undefined) {
					newState.rightSidebarPinned = remoteConfig.rightSidebarPinned;
				}
				if (remoteConfig.leftSidebarOpen !== undefined) {
					newState.leftSidebarOpen = remoteConfig.leftSidebarOpen;
				}
				if (remoteConfig.rightSidebarOpen !== undefined) {
					newState.rightSidebarOpen = remoteConfig.rightSidebarOpen;
				}
				
				return newState;
			});
		}
	};
}

export const sidebarConfigStore = createSidebarConfigStore();

// 初始化主窗口重载监听器
let reloadUnlisten: UnlistenFn | null = null;

export function initSidebarConfigListener() {
	if (typeof window === 'undefined') return;
	
	// 监听重载事件
	listen('reload-main-window', () => {
		console.log('📐 收到重载请求，刷新页面...');
		window.location.reload();
	}).then(fn => {
		reloadUnlisten = fn;
	});
	
	// 页面卸载时清理
	window.addEventListener('beforeunload', () => {
		if (reloadUnlisten) {
			reloadUnlisten();
		}
	});
}

// 当前激活的面板
export const activePanel = writable<PanelId | null>('folder');

// 设置激活的面板
export function setActivePanelTab(panelId: PanelId | null) {
	activePanel.set(panelId);
}

// 派生 stores
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

// 隐藏的面板（等待区）
export const sidebarHiddenPanels = derived(sidebarConfigStore, $state =>
	$state.panels
		.filter(p => !p.visible)
		.sort((a, b) => a.order - b.order)
);
