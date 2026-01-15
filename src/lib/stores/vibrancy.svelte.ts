import { invoke } from '@tauri-apps/api/core';
import { settingsManager } from '$lib/settings/settingsManager';

/**
 * Vibrancy Store
 * Manages the window vibrancy effect state.
 */
class VibrancyStore {
	private initialized = false;

	constructor() {
		// Listen to settings changes
		settingsManager.addListener((settings) => {
			this.updateState(settings.view.vibrancyEnabled);
		});
	}

	init() {
		if (this.initialized) return;
		const settings = settingsManager.getSettings();
		this.updateState(settings.view.vibrancyEnabled);
		this.initialized = true;
	}

	private async updateState(enabled: boolean) {
		const isEnabled = enabled; // Can add extra logic here if needed
		
		// Update DOM class
		if (isEnabled) {
			document.body.classList.add('vibrancy-enabled');
		} else {
			document.body.classList.remove('vibrancy-enabled');
		}

		// Call Backend
		try {
			await invoke('set_sidebar_vibrancy', { enable: isEnabled });
		} catch (error) {
			console.error('Failed to set vibrancy:', error);
		}
	}

    toggle() {
        const current = settingsManager.getSettings().view.vibrancyEnabled;
        settingsManager.updateNestedSettings('view', { vibrancyEnabled: !current });
    }
}

export const vibrancyStore = new VibrancyStore();
