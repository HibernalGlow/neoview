/**
 * 卡片配置存储
 * 管理各面板内卡片的顺序、展开状态和可见性
 * 从 sidebarConfig 读取支持卡片的面板
 */
import type { Component } from 'svelte';
import { getCardSupportingPanels, getPanelTitle, type PanelId } from './sidebarConfig.svelte';

// 重新导出类型和函数
export type { PanelId };
export { getCardSupportingPanels, getPanelTitle };

// 卡片配置
export interface CardConfig {
	id: string;
	panelId: PanelId;
	title: string;
	icon?: Component;
	order: number;
	visible: boolean;
	expanded: boolean;
	canHide: boolean;
}

// 面板配置
export interface PanelCardConfig {
	panelId: PanelId;
	title: string;
	cards: CardConfig[];
}

// 默认卡片配置（按面板 ID 索引）
// 新面板只需在 sidebarConfig 中添加 supportsCards: true，然后在这里添加默认卡片
const defaultCardConfigs: Partial<Record<PanelId, Omit<CardConfig, 'panelId'>[]>> = {
	info: [
		{ id: 'file', title: '文件信息', order: 0, visible: true, expanded: true, canHide: false },
		{ id: 'image', title: '图片信息', order: 1, visible: true, expanded: true, canHide: true }
	],
	properties: [
		{ id: 'basic', title: '基本信息', order: 0, visible: true, expanded: true, canHide: false },
		{ id: 'exif', title: 'EXIF 数据', order: 1, visible: true, expanded: true, canHide: true },
		{ id: 'histogram', title: '直方图', order: 2, visible: true, expanded: true, canHide: true }
	],
	upscale: [
		{ id: 'model', title: '模型选择', order: 0, visible: true, expanded: true, canHide: false },
		{ id: 'settings', title: '参数设置', order: 1, visible: true, expanded: true, canHide: true },
		{ id: 'preview', title: '预览', order: 2, visible: true, expanded: true, canHide: true },
		{ id: 'history', title: '历史记录', order: 3, visible: true, expanded: true, canHide: true }
	],
	insights: [
		{ id: 'analysis', title: '分析', order: 0, visible: true, expanded: true, canHide: false },
		{ id: 'tags', title: '标签', order: 1, visible: true, expanded: true, canHide: true },
		{ id: 'similar', title: '相似图片', order: 2, visible: true, expanded: true, canHide: true }
	],
	benchmark: [
		{ id: 'visibility', title: '可见性监控', order: 0, visible: true, expanded: true, canHide: true },
		{ id: 'latency', title: '延迟分析', order: 1, visible: true, expanded: true, canHide: true },
		{ id: 'renderer', title: '渲染模式测试', order: 2, visible: true, expanded: true, canHide: true },
		{ id: 'files', title: '文件选择', order: 3, visible: true, expanded: true, canHide: true },
		{ id: 'detailed', title: '详细结果', order: 4, visible: true, expanded: true, canHide: true },
		{ id: 'loadmode', title: '加载模式', order: 5, visible: true, expanded: true, canHide: true },
		{ id: 'archives', title: '压缩包扫描', order: 6, visible: true, expanded: true, canHide: true },
		{ id: 'realworld', title: '实际场景', order: 7, visible: true, expanded: true, canHide: true },
		{ id: 'results', title: '测试结果', order: 8, visible: true, expanded: true, canHide: true },
		{ id: 'summary', title: '总结', order: 9, visible: true, expanded: true, canHide: true }
	]
};

// 从 sidebarConfig 动态获取支持卡片的面板
function getCardPanelIds(): PanelId[] {
	return getCardSupportingPanels();
}

const STORAGE_KEY = 'neoview_card_configs';

// 创建响应式状态
function createCardConfigStore() {
	// 从 localStorage 加载
	function loadConfigs(): Partial<Record<PanelId, CardConfig[]>> {
		const cardPanels = getCardPanelIds();
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as Partial<Record<PanelId, CardConfig[]>>;
				// 合并新增的卡片
				const result: Partial<Record<PanelId, CardConfig[]>> = {};
				for (const panelId of cardPanels) {
					const storedCards = parsed[panelId] || [];
					const storedIds = storedCards.map(c => c.id);
					const defaultCards = defaultCardConfigs[panelId] || [];
					// 保留已存储的卡片配置，添加新卡片到末尾
					const newCards = defaultCards
						.filter(c => !storedIds.includes(c.id))
						.map((c, i) => ({ ...c, panelId, order: storedCards.length + i }));
					result[panelId] = [...storedCards, ...newCards];
				}
				return result;
			}
		} catch (e) {
			console.warn('Failed to load card configs:', e);
		}
		// 返回默认配置
		const result: Partial<Record<PanelId, CardConfig[]>> = {};
		for (const panelId of cardPanels) {
			const cards = defaultCardConfigs[panelId] || [];
			result[panelId] = cards.map(c => ({ ...c, panelId }));
		}
		return result;
	}

	// 保存到 localStorage
	function saveConfigs(data: Partial<Record<PanelId, CardConfig[]>>) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (e) {
			console.warn('Failed to save card configs:', e);
		}
	}

	let configs = $state<Partial<Record<PanelId, CardConfig[]>>>(loadConfigs());

	// 获取面板的卡片列表（按顺序）
	function getPanelCards(panelId: PanelId): CardConfig[] {
		return [...(configs[panelId] || [])].sort((a, b) => a.order - b.order);
	}

	// 获取所有支持卡片的面板配置
	function getAllPanels(): PanelCardConfig[] {
		return getCardPanelIds().map(panelId => ({
			panelId,
			title: getPanelTitle(panelId),
			cards: getPanelCards(panelId)
		}));
	}

	// 设置卡片可见性
	function setCardVisible(panelId: PanelId, cardId: string, visible: boolean) {
		const cards = configs[panelId];
		if (!cards) return;
		const idx = cards.findIndex(c => c.id === cardId);
		if (idx !== -1) {
			cards[idx] = { ...cards[idx], visible };
			configs = { ...configs, [panelId]: [...cards] };
			saveConfigs(configs);
		}
	}

	// 设置卡片展开状态
	function setCardExpanded(panelId: PanelId, cardId: string, expanded: boolean) {
		const cards = configs[panelId];
		if (!cards) return;
		const idx = cards.findIndex(c => c.id === cardId);
		if (idx !== -1) {
			cards[idx] = { ...cards[idx], expanded };
			configs = { ...configs, [panelId]: [...cards] };
			saveConfigs(configs);
		}
	}

	// 移动卡片
	function moveCard(panelId: PanelId, cardId: string, newOrder: number) {
		const cards = configs[panelId];
		if (!cards) return;
		
		const cardIdx = cards.findIndex(c => c.id === cardId);
		if (cardIdx === -1) return;
		
		const card = cards[cardIdx];
		const oldOrder = card.order;
		
		// 更新所有卡片的顺序
		const newCards = cards.map(c => {
			if (c.id === cardId) {
				return { ...c, order: newOrder };
			}
			if (oldOrder < newOrder) {
				// 向下移动：中间的卡片向上移
				if (c.order > oldOrder && c.order <= newOrder) {
					return { ...c, order: c.order - 1 };
				}
			} else {
				// 向上移动：中间的卡片向下移
				if (c.order >= newOrder && c.order < oldOrder) {
					return { ...c, order: c.order + 1 };
				}
			}
			return c;
		});
		
		configs = { ...configs, [panelId]: newCards };
		saveConfigs(configs);
	}

	// 重置面板卡片
	function resetPanel(panelId: PanelId) {
		configs = {
			...configs,
			[panelId]: defaultCardConfigs[panelId].map(c => ({ ...c, panelId }))
		};
		saveConfigs(configs);
	}

	// 重置所有
	function resetAll() {
		const result: Record<PanelId, CardConfig[]> = {} as Record<PanelId, CardConfig[]>;
		for (const panelId of Object.keys(defaultCardConfigs) as PanelId[]) {
			result[panelId] = defaultCardConfigs[panelId].map(c => ({ ...c, panelId }));
		}
		configs = result;
		saveConfigs(configs);
	}

	return {
		get configs() { return configs; },
		getPanelCards,
		getAllPanels,
		setCardVisible,
		setCardExpanded,
		moveCard,
		resetPanel,
		resetAll
	};
}

export const cardConfigStore = createCardConfigStore();

// 派生状态：所有面板配置
export const allPanelConfigs = {
	get value() {
		return cardConfigStore.getAllPanels();
	}
};
