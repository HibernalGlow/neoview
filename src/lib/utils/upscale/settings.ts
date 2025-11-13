export interface UpscaleConditionSettings {
	enabled: boolean;
	minWidth: number;
	minHeight: number;
}

export interface UpscaleSettings {
	autoUpscaleEnabled: boolean;
	preUpscaleEnabled: boolean;
	globalUpscaleEnabled: boolean;
	conditions: UpscaleConditionSettings;
}

const defaultSettings: UpscaleSettings = {
	autoUpscaleEnabled: true,
	preUpscaleEnabled: true,
	globalUpscaleEnabled: true,
	conditions: {
		enabled: false,
		minWidth: 0,
		minHeight: 0
	}
};

let currentSettings: UpscaleSettings = { ...defaultSettings };

const listeners = new Set<(settings: UpscaleSettings) => void>();

export function getUpscaleSettings(): UpscaleSettings {
	return currentSettings;
}

export function setUpscaleSettings(settings: UpscaleSettings): void {
	currentSettings = { ...settings };
	notify();
}

export function updateUpscaleSettings(partial: Partial<UpscaleSettings>): UpscaleSettings {
	currentSettings = {
		...currentSettings,
		...partial,
		conditions: {
			...currentSettings.conditions,
			...(partial.conditions ?? {})
		}
	};
	notify();
	return currentSettings;
}

export function subscribeUpscaleSettings(listener: (settings: UpscaleSettings) => void): () => void {
	listeners.add(listener);
	listener(currentSettings);
	return () => {
		listeners.delete(listener);
	};
}

function notify(): void {
	for (const listener of listeners) {
		listener(currentSettings);
	}
	window.dispatchEvent(new CustomEvent('upscale-settings-changed', { detail: currentSettings }));
}

export function resetUpscaleSettings(): void {
	currentSettings = { ...defaultSettings };
	notify();
}

export const DEFAULT_UPSCALE_SETTINGS = defaultSettings;
