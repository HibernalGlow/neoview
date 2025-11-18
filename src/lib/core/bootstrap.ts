import { appState } from './state/appState';
import { settingsManager } from '$lib/settings/settingsManager';

let initialized = false;
let removeSettingsListener: (() => void) | null = null;

export function initializeCoreServices(): void {
	if (initialized) {
		return;
	}
	initialized = true;

	// Seed state with current settings snapshot
	appState.update({
		settings: settingsManager.getSettings()
	});

	const listener = (settings: any) => {
		appState.update({ settings });
	};

	settingsManager.addListener(listener);
	removeSettingsListener = () => settingsManager.removeListener(listener);
}

export function teardownCoreServices(): void {
	if (!initialized) return;
	removeSettingsListener?.();
	removeSettingsListener = null;
	initialized = false;
}





