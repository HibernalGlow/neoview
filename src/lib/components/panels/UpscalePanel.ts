import { setUpscaleSettings, DEFAULT_UPSCALE_SETTINGS } from '$lib/utils/upscale/settings';
import type { UpscaleSettings } from '$lib/utils/upscale/settings';

export interface UpscalePanelSettings extends UpscaleSettings {
	conditionalMinWidth: number;
	conditionalMinHeight: number;
	conditionalUpscaleEnabled: boolean;
	currentImageUpscaleEnabled: boolean;
	useCachedFirst: boolean;
	selectedModel: string;
	scale: number;
	tileSize: number;
	noiseLevel: number;
	gpuId: number;
}

export interface UpscalePanelEventDetail {
	autoUpscaleEnabled: boolean;
	preUpscaleEnabled: boolean;
	conditionalUpscaleEnabled: boolean;
	conditionalMinWidth: number;
	conditionalMinHeight: number;
	currentImageUpscaleEnabled: boolean;
	useCachedFirst: boolean;
}

const STORAGE_KEY = 'pyo3_upscale_settings';

export const defaultPanelSettings: UpscalePanelSettings = {
	...DEFAULT_UPSCALE_SETTINGS,
	conditionalMinWidth: 0,
	conditionalMinHeight: 0,
	conditionalUpscaleEnabled: false,
	currentImageUpscaleEnabled: false,
	useCachedFirst: true,
	selectedModel: 'MODEL_WAIFU2X_CUNET_UP2X',
	scale: 2,
	tileSize: 64,
	noiseLevel: 0,
	gpuId: 0
};

export function loadUpscalePanelSettings(): UpscalePanelSettings {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) {
			return { ...defaultPanelSettings };
		}

		const parsed = JSON.parse(stored) as Partial<UpscalePanelSettings>;
		return {
			...defaultPanelSettings,
			...parsed,
			conditionalUpscaleEnabled: parsed.conditionalUpscaleEnabled ?? parsed.conditions?.enabled ?? defaultPanelSettings.conditionalUpscaleEnabled,
			conditions: {
				...defaultPanelSettings.conditions,
				...(parsed.conditions ?? defaultPanelSettings.conditions)
			}
		};
	} catch (error) {
		console.warn('加载面板设置失败，使用默认配置', error);
		return { ...defaultPanelSettings };
	}
}

export function persistUpscalePanelSettings(settings: UpscalePanelSettings): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch (error) {
		console.warn('保存面板设置失败', error);
	}

	const upscaleSettings: UpscaleSettings = {
		autoUpscaleEnabled: settings.autoUpscaleEnabled,
		preUpscaleEnabled: settings.preUpscaleEnabled,
		globalUpscaleEnabled: settings.autoUpscaleEnabled,
		conditions: {
			enabled: settings.conditionalUpscaleEnabled,
			minWidth: settings.conditionalMinWidth,
			minHeight: settings.conditionalMinHeight
		}
	};

	setUpscaleSettings(upscaleSettings);
}

export function toUpscalePanelEventDetail(settings: UpscalePanelSettings): UpscalePanelEventDetail {
	return {
		autoUpscaleEnabled: settings.autoUpscaleEnabled,
		preUpscaleEnabled: settings.preUpscaleEnabled,
		conditionalUpscaleEnabled: settings.conditionalUpscaleEnabled,
		conditionalMinWidth: settings.conditionalMinWidth,
		conditionalMinHeight: settings.conditionalMinHeight,
		currentImageUpscaleEnabled: settings.currentImageUpscaleEnabled,
		useCachedFirst: settings.useCachedFirst
	};
}
