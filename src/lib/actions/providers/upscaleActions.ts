import type { ActionProvider } from '$lib/actions/actionRegistry';
import type { ActionBinding } from '$lib/stores/keybindings/types';
import { showInfoToast } from '$lib/utils/toast';

const UPSCALE_ACTIONS: ActionBinding[] = [
	{
		action: 'upscale.toggleTile',
		name: 'Tile Toggle',
		category: 'Upscale',
		description: 'Toggle tile processing for the global upscale model settings',
		bindings: []
	}
];

function getUpscaleActionBindings(): ActionBinding[] {
	return UPSCALE_ACTIONS.map((binding) => ({
		...binding,
		bindings: binding.bindings.map((input) => ({ ...input }))
	}));
}

function executeUpscaleAction(action: string): boolean {
	if (action !== 'upscale.toggleTile') return false;

	void import('$lib/stores/upscale/upscalePanelStore.svelte')
		.then(({ saveSettings, tileEnabled }) => {
			tileEnabled.value = !tileEnabled.value;
			saveSettings();
			showInfoToast(`Tile: ${tileEnabled.value ? 'On' : 'Off'}`);
		})
		.catch((error) => {
			console.error('[upscaleActions] Failed to toggle tile:', error);
		});

	return true;
}

export const actionProvider: ActionProvider = {
	id: 'upscale-actions',
	getBindings: getUpscaleActionBindings,
	execute: executeUpscaleAction
};
