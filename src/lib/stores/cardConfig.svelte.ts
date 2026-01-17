/**
 * 卡片配置存储
 * 管理各面板内卡片的顺序、展开状态和可见性
 * 从 sidebarConfig 读取支持卡片的面板
 * 从 cardRegistry 读取卡片定义
 */
import type { Component } from 'svelte';
import { getCardSupportingPanels, getPanelTitle, type PanelId } from './sidebarConfig.svelte';
import { cardRegistry, getDefaultCardsForPanel } from '$lib/cards/registry';
import type { IconName } from '$lib/utils/iconMap';

// 重新导出类型和函数
export type { PanelId };
export { getCardSupportingPanels, getPanelTitle };

// 卡片配置
export interface CardConfig {
	id: string;
	panelId: PanelId;
	title: string;
	icon?: IconName | Component;
	order: number;
	visible: boolean;
	expanded: boolean;
	canHide: boolean;
	height?: number; // 自定义高度（像素），undefined 表示自动高度
}

// 面板配置
export interface PanelCardConfig {
	panelId: PanelId;
	title: string;
	cards: CardConfig[];
}

// 从 registry 生成默认卡片配置
function generateDefaultConfigs(): Partial<Record<PanelId, Omit<CardConfig, 'panelId'>[]>> {
	const result: Partial<Record<PanelId, Omit<CardConfig, 'panelId'>[]>> = {};
	const cardPanels = getCardSupportingPanels();
	
	for (const panelId of cardPanels) {
		const cardIds = getDefaultCardsForPanel(panelId);
		result[panelId] = cardIds.map((cardId, index) => {
			const def = cardRegistry[cardId];
			return {
				id: cardId,
				title: def?.title || cardId,
				order: index,
				visible: true,
				expanded: true,
				canHide: def?.canHide ?? true
			};
		});
	}
	
	return result;
}

// 默认卡片配置（从 registry 动态生成）
const defaultCardConfigs = generateDefaultConfigs();

// 从 sidebarConfig 动态获取支持卡片的面板
function getCardPanelIds(): PanelId[] {
	return getCardSupportingPanels();
}

const CURRENT_CONFIG_VERSION = 14; // 增加版本号让卡片迁移到新的 control 面板
const STORAGE_KEY = `neoview_card_configs_v${CURRENT_CONFIG_VERSION}`;

// 创建响应式状态
function createCardConfigStore() {
	// 从 localStorage 加载
	function loadConfigs(): Partial<Record<PanelId, CardConfig[]>> {
		const cardPanels = getCardPanelIds();
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as Partial<Record<PanelId, CardConfig[]>>;
				// 合并新增的卡片，过滤掉不存在的卡片
				const result: Partial<Record<PanelId, CardConfig[]>> = {};
				for (const panelId of cardPanels) {
					const storedCards = parsed[panelId] || [];
					// 过滤掉不存在于 cardRegistry 中的卡片
					const validStoredCards = storedCards.filter(c => cardRegistry[c.id]);
					const validIds = validStoredCards.map(c => c.id);
					const defaultCards = defaultCardConfigs[panelId] || [];
					// 计算已存储卡片的最大 order
					const maxOrder = validStoredCards.length > 0 
						? Math.max(...validStoredCards.map(c => c.order)) 
						: -1;
					// 保留已存储的有效卡片配置（保留其 order），添加新卡片到末尾
					const newCards = defaultCards
						.filter(c => !validIds.includes(c.id))
						.map((c, i) => ({ ...c, panelId, order: maxOrder + 1 + i }));
					// 合并但不重新分配 order，保留用户的排序
					result[panelId] = [...validStoredCards, ...newCards];
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
			[panelId]: (defaultCardConfigs[panelId] || []).map(c => ({ ...c, panelId }))
		};
		saveConfigs(configs);
	}

	// 重置所有
	function resetAll() {
		const result: Record<PanelId, CardConfig[]> = {} as Record<PanelId, CardConfig[]>;
		for (const panelId of Object.keys(defaultCardConfigs) as PanelId[]) {
			result[panelId] = (defaultCardConfigs[panelId] || []).map(c => ({ ...c, panelId }));
		}
		configs = result;
		saveConfigs(configs);
	}

	// 移动卡片到另一个面板（解耦设计：只需更新 panelId）
	function moveCardToPanel(cardId: string, toPanelId: PanelId) {
		// 找到卡片当前所在面板
		let fromPanelId: PanelId | null = null;
		let card: CardConfig | null = null;
		
		for (const [panelId, cards] of Object.entries(configs)) {
			const found = cards?.find(c => c.id === cardId);
			if (found) {
				fromPanelId = panelId as PanelId;
				card = found;
				break;
			}
		}
		
		if (!fromPanelId || !card || fromPanelId === toPanelId) return;
		
		const fromCards = configs[fromPanelId] || [];
		const toCards = configs[toPanelId] || [];
		
		// 更新配置
		configs = {
			...configs,
			[fromPanelId]: fromCards.filter(c => c.id !== cardId).map((c, i) => ({ ...c, order: i })),
			[toPanelId]: [...toCards, { ...card, panelId: toPanelId, order: toCards.length }]
		};
		saveConfigs(configs);
	}

	// 设置卡片高度
	function setCardHeight(panelId: PanelId, cardId: string, height: number | undefined) {
		const panelCards = configs[panelId];
		if (!panelCards) return;
		
		const newCards = panelCards.map(c => 
			c.id === cardId ? { ...c, height } : c
		);
		
		configs = { ...configs, [panelId]: newCards };
		saveConfigs(configs);
	}

	// 获取卡片配置
	function getCardConfig(panelId: PanelId, cardId: string): CardConfig | undefined {
		return configs[panelId]?.find(c => c.id === cardId);
	}

	return {
		get configs() { return configs; },
		getPanelCards,
		getAllPanels,
		getCardConfig,
		setCardVisible,
		setCardExpanded,
		setCardHeight,
		moveCard,
		moveCardToPanel,
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
