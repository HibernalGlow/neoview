import { setUpscaleSettings, DEFAULT_UPSCALE_SETTINGS } from '$lib/utils/upscale/settings';
import { settingsManager } from '$lib/settings/settingsManager';
import { invoke } from '@tauri-apps/api/core';
import type { UpscaleSettings } from '$lib/utils/upscale/settings';
import type { UpscaleCondition } from '$lib/types/upscaleConditions';
import { createDefaultCondition } from '$lib/types/upscaleConditions';

export interface UpscalePanelSettings extends UpscaleSettings {
	// ...已有字段
	backgroundConcurrency: number;
	showPanelPreview: boolean;
	// 新增条件列表
	conditionsList: UpscaleCondition[];
	// 保持向后兼容的旧字段
	conditionalMinWidth?: number;
	conditionalMinHeight?: number;
}

export interface UpscalePanelEventDetail {
	autoUpscaleEnabled: boolean;
	preUpscaleEnabled: boolean;
	conditionalUpscaleEnabled: boolean;
	conditionalMinWidth: number;
	conditionalMinHeight: number;
	currentImageUpscaleEnabled: boolean;
	useCachedFirst: boolean;
	// 新增条件列表
	conditionsList: UpscaleCondition[];
}

const STORAGE_KEY = 'pyo3_upscale_settings';

const initialImageSettings = (() => {
	try {
		const imageSettings = settingsManager.getSettings().image ?? {};
		return {
			enableSuperResolution:
				imageSettings.enableSuperResolution ?? DEFAULT_UPSCALE_SETTINGS.currentImageUpscaleEnabled,
			useCachedFirst: imageSettings.useCachedFirst ?? DEFAULT_UPSCALE_SETTINGS.useCachedFirst
		};
	} catch (error) {
		console.warn('无法读取全局图像设置，使用默认值', error);
		return {
			enableSuperResolution: DEFAULT_UPSCALE_SETTINGS.currentImageUpscaleEnabled,
			useCachedFirst: DEFAULT_UPSCALE_SETTINGS.useCachedFirst
		};
	}
})();

export const defaultPanelSettings: UpscalePanelSettings = {
	...DEFAULT_UPSCALE_SETTINGS,
	currentImageUpscaleEnabled: initialImageSettings.enableSuperResolution,
	useCachedFirst: initialImageSettings.useCachedFirst,
	preloadPages: 3,
	backgroundConcurrency: 2,
	showPanelPreview: false,
	// 新增条件列表，默认包含一个默认条件
	conditionsList: [createDefaultCondition()],
	// 保持向后兼容
	conditionalMinWidth: 0,
	conditionalMinHeight: 0
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
			// 向后兼容：如果旧数据中有 conditions，转换为新的 conditionsList
			conditionsList: parsed.conditionsList ?? (
				parsed.conditionalUpscaleEnabled ? [{
					...createDefaultCondition(),
					match: {
						minWidth: parsed.conditionalMinWidth ?? 0,
						minHeight: parsed.conditionalMinHeight ?? 0
					}
				}] : defaultPanelSettings.conditionsList
			),
			conditionalUpscaleEnabled: parsed.conditionalUpscaleEnabled ?? defaultPanelSettings.conditionalUpscaleEnabled,
			conditionalMinWidth: parsed.conditionalMinWidth ?? defaultPanelSettings.conditionalMinWidth,
			conditionalMinHeight: parsed.conditionalMinHeight ?? defaultPanelSettings.conditionalMinHeight
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
	
	// 异步同步 conditionsList 到全局 settingsManager
	void syncConditionsToGlobal(settings);
}

/**
 * 异步同步条件列表到全局设置
 */
async function syncConditionsToGlobal(settings: UpscalePanelSettings): Promise<void> {
	try {
		const { settingsManager } = await import('$lib/settings/settingsManager');
		const globalSettings = settingsManager.getSettings();
		if (globalSettings.image) {
			globalSettings.image.conditionsList = settings.conditionsList;
			settingsManager.saveSettings();
		}
	} catch (error) {
		console.warn('同步条件失败', error);
	}
}

export function toUpscalePanelEventDetail(settings: UpscalePanelSettings): UpscalePanelEventDetail {
	return {
		autoUpscaleEnabled: settings.autoUpscaleEnabled,
		preUpscaleEnabled: settings.preUpscaleEnabled,
		conditionalUpscaleEnabled: settings.conditionalUpscaleEnabled,
		conditionalMinWidth: settings.conditionalMinWidth ?? 0,
		conditionalMinHeight: settings.conditionalMinHeight ?? 0,
		currentImageUpscaleEnabled: settings.currentImageUpscaleEnabled,
		useCachedFirst: settings.useCachedFirst,
		conditionsList: settings.conditionsList
	};
}

// 移除本地哈希实现，这些功能已迁移到 pathHash.ts
// export function buildHashInput(path: string, innerPath?: string): string {
// export async function calculatePathHash(pathInput: string): Promise<string> {
// }

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
