/**
 * 卡片状态管理器
 * 管理卡片的排序和展开状态，支持 localStorage 持久化
 */

const STORAGE_KEY_PREFIX = 'neoview_cards_';

export interface CardState {
	order: string[];
	expanded: Record<string, boolean>;
}

/**
 * 创建卡片状态管理器
 * @param panelId 面板唯一标识（用于 localStorage key）
 * @param defaultOrder 默认卡片排序
 * @param defaultExpanded 默认展开状态
 */
export function createCardManager(
	panelId: string,
	defaultOrder: string[],
	defaultExpanded?: Record<string, boolean>
) {
	const storageKey = `${STORAGE_KEY_PREFIX}${panelId}`;
	
	// 从 localStorage 加载状态
	function loadState(): CardState {
		try {
			const stored = localStorage.getItem(storageKey);
			if (stored) {
				const parsed = JSON.parse(stored) as CardState;
				// 合并新增的卡片到末尾
				const storedIds = parsed.order;
				const newCards = defaultOrder.filter(id => !storedIds.includes(id));
				return {
					order: [...parsed.order, ...newCards],
					expanded: { ...getDefaultExpanded(), ...parsed.expanded }
				};
			}
		} catch (e) {
			console.warn(`Failed to load card state for ${panelId}:`, e);
		}
		return {
			order: [...defaultOrder],
			expanded: getDefaultExpanded()
		};
	}
	
	function getDefaultExpanded(): Record<string, boolean> {
		if (defaultExpanded) return { ...defaultExpanded };
		// 默认全部展开
		return Object.fromEntries(defaultOrder.map(id => [id, true]));
	}
	
	// 保存状态到 localStorage
	function saveState(state: CardState) {
		try {
			localStorage.setItem(storageKey, JSON.stringify(state));
		} catch (e) {
			console.warn(`Failed to save card state for ${panelId}:`, e);
		}
	}
	
	// 初始化状态
	let state = $state<CardState>(loadState());
	
	// 获取卡片顺序
	function getOrder(cardId: string): number {
		return state.order.indexOf(cardId);
	}
	
	// 检查是否可以移动
	function canMove(cardId: string, direction: 'up' | 'down'): boolean {
		const idx = state.order.indexOf(cardId);
		if (direction === 'up') return idx > 0;
		return idx < state.order.length - 1;
	}
	
	// 移动卡片
	function move(cardId: string, direction: 'up' | 'down') {
		const idx = state.order.indexOf(cardId);
		if (idx === -1) return;
		
		const newOrder = [...state.order];
		if (direction === 'up' && idx > 0) {
			[newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
		} else if (direction === 'down' && idx < newOrder.length - 1) {
			[newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
		}
		
		state = { ...state, order: newOrder };
		saveState(state);
	}
	
	// 获取展开状态
	function isExpanded(cardId: string): boolean {
		return state.expanded[cardId] ?? true;
	}
	
	// 设置展开状态
	function setExpanded(cardId: string, expanded: boolean) {
		state = {
			...state,
			expanded: { ...state.expanded, [cardId]: expanded }
		};
		saveState(state);
	}
	
	// 切换展开状态
	function toggleExpanded(cardId: string) {
		setExpanded(cardId, !isExpanded(cardId));
	}
	
	// 重置为默认状态
	function reset() {
		state = {
			order: [...defaultOrder],
			expanded: getDefaultExpanded()
		};
		saveState(state);
	}
	
	return {
		get state() { return state; },
		getOrder,
		canMove,
		move,
		isExpanded,
		setExpanded,
		toggleExpanded,
		reset
	};
}

export type CardManager = ReturnType<typeof createCardManager>;
