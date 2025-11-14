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
	preloadPages: number;
	backgroundConcurrency: number;
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
	gpuId: 0,
	preloadPages: 3,
	backgroundConcurrency: 2
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
		},
		currentImageUpscaleEnabled: settings.currentImageUpscaleEnabled,
		useCachedFirst: settings.useCachedFirst
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

export function buildHashInput(path: string, innerPath?: string): string {
	return `${path || ''}|${innerPath || ''}`;
}

export async function calculatePathHash(pathInput: string): Promise<string> {
	try {
		const encoder = new TextEncoder();
		const bytes = encoder.encode(pathInput);
		const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	} catch (error) {
		console.error('计算路径 hash 失败:', error);
		return pathInput.length.toString(36);
	}
}

export async function readUpscaleCacheFile(cachePath: string): Promise<Uint8Array> {
	const { invoke } = await import('@tauri-apps/api/core');
	const data = await invoke<number[]>('read_upscale_cache_file', { cachePath });
	return new Uint8Array(data);
}

export function getProgressColor(progress: number): string {
	if (progress < 30) return 'bg-blue-500';
	if (progress < 70) return 'bg-yellow-500';
	return 'bg-green-500';
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}
