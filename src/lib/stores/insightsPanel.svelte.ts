import { writable } from 'svelte/store';

export type InsightsCardId =	'daily-trend' | 'bookmark-overview' | 'source-breakdown' | 'emm-tags' | 'reading-heatmap' | 'reading-streak';

export interface InsightsPanelState {
	order: InsightsCardId[];
	collapsed: Record<InsightsCardId, boolean>;
}

const STORAGE_KEY = 'neoview-insights-cards';
const DEFAULT_CARD_ORDER: InsightsCardId[] = [
	'daily-trend',
	'reading-streak',
	'reading-heatmap',
	'bookmark-overview',
	'source-breakdown',
	'emm-tags'
];

function ensureState(state?: Partial<InsightsPanelState>): InsightsPanelState {
	const currentOrder = Array.isArray(state?.order) ? (state!.order as InsightsCardId[]) : [];
	const mergedOrder = DEFAULT_CARD_ORDER.filter((id) => currentOrder.includes(id)).length
		? [
			...currentOrder.filter((id) => DEFAULT_CARD_ORDER.includes(id as InsightsCardId)),
			...DEFAULT_CARD_ORDER.filter((id) => !currentOrder.includes(id))
		  ]
		: [...DEFAULT_CARD_ORDER];

	const collapsed: Record<InsightsCardId, boolean> = { ...DEFAULT_CARD_ORDER.reduce((acc, id) => {
		acc[id] = false;
		return acc;
	}, {} as Record<InsightsCardId, boolean>), ...(state?.collapsed ?? {}) } as Record<InsightsCardId, boolean>;

	return {
		order: mergedOrder as InsightsCardId[],
		collapsed
	};
}

function loadState(): InsightsPanelState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return ensureState();
		return ensureState(JSON.parse(raw));
	} catch (error) {
		console.warn('[InsightsPanelStore] Failed to load state:', error);
		return ensureState();
	}
}

const { subscribe, set, update } = writable<InsightsPanelState>(ensureState());

if (typeof window !== 'undefined') {
	set(loadState());
}

subscribe((value) => {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	} catch (error) {
		console.warn('[InsightsPanelStore] Failed to persist state:', error);
	}
});

export const insightsPanelStore = {
	subscribe,
	reset() {
		set(ensureState());
	},
	toggleCollapsed(id: InsightsCardId) {
		update((state) => ({
			...state,
			collapsed: {
				...state.collapsed,
				[id]: !state.collapsed[id]
			}
		}));
	},
	setCollapsed(id: InsightsCardId, collapsed: boolean) {
		update((state) => ({
			...state,
			collapsed: {
				...state.collapsed,
				[id]: collapsed
			}
		}));
	},
	reorder(nextOrder: InsightsCardId[]) {
		const deduped = nextOrder.filter((id, index) => nextOrder.indexOf(id) === index && DEFAULT_CARD_ORDER.includes(id));
		const merged = [...deduped, ...DEFAULT_CARD_ORDER.filter((id) => !deduped.includes(id))];
		update((state) => ({
			...state,
			order: merged
		}));
	}
};

export const insightsCardOrder = DEFAULT_CARD_ORDER;
