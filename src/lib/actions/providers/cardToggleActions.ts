import { cardRegistry } from '$lib/cards/registry';
import { cardConfigStore } from '$lib/stores/cardConfig.svelte';
import { getPanelTitle } from '$lib/stores/sidebarConfig.svelte';
import { showInfoToast } from '$lib/utils/toast';
import type { ActionProvider } from '$lib/actions/actionRegistry';
import type { ActionBinding } from '$lib/stores/keybindings/types';

const CARD_TOGGLE_PREFIX = 'card.toggle.';
const CARD_ACTION_CATEGORY = '卡片开关';

function getCardIdFromAction(action: string): string | null {
	if (!action.startsWith(CARD_TOGGLE_PREFIX)) return null;
	const cardId = action.slice(CARD_TOGGLE_PREFIX.length);
	return cardId.length > 0 ? cardId : null;
}

function findCardConfig(cardId: string) {
	for (const panel of cardConfigStore.getAllPanels()) {
		const card = panel.cards.find((candidate) => candidate.id === cardId);
		if (card) {
			return { panelId: panel.panelId, card };
		}
	}
	return null;
}

function getToggleableCardBindings(): ActionBinding[] {
	return Object.values(cardRegistry)
		.filter((card) => card.canHide)
		.map((card) => ({
			action: `${CARD_TOGGLE_PREFIX}${card.id}`,
			name: `${card.title}开关`,
			category: CARD_ACTION_CATEGORY,
			description: `显示或隐藏${getPanelTitle(card.defaultPanel)}面板里的${card.title}卡片`,
			bindings: []
		}));
}

function executeCardToggleAction(action: string): boolean {
	const cardId = getCardIdFromAction(action);
	if (!cardId) return false;

	const definition = cardRegistry[cardId];
	if (!definition?.canHide) return false;

	const current = findCardConfig(cardId);
	if (!current) return false;

	const nextVisible = !current.card.visible;
	cardConfigStore.setCardVisible(current.panelId, cardId, nextVisible);
	showInfoToast(`${definition.title}: ${nextVisible ? '显示' : '隐藏'}`);
	return true;
}

export const actionProvider: ActionProvider = {
	id: 'card-toggles',
	getBindings: getToggleableCardBindings,
	execute: executeCardToggleAction
};
