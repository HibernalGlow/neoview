import { setUpscaleSettings, DEFAULT_UPSCALE_SETTINGS } from '$lib/utils/upscale/settings';
import { settingsManager } from '$lib/settings/settingsManager';
import { apiPost, apiGet } from '$lib/api/http-bridge';
import type { UpscaleSettings } from '$lib/utils/upscale/settings';
import { getDefaultConditionPresets, normalizeCondition } from '$lib/utils/upscale/conditions';

// 条件表达式类型
export interface ConditionExpression {
	operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'contains';
	value: string | number;
}

// 超分条件定义
export interface UpscaleCondition {
	id: string;                  // 稳定标识
	name: string;                // Tab 标题
	enabled: boolean;
	priority: number;            // 决定"向后进位"顺序
	match: {
		minWidth?: number;
		minHeight?: number;
		maxWidth?: number;
		maxHeight?: number;
		dimensionMode?: 'and' | 'or';
		createdBetween?: [number, number]; // epoch
		modifiedBetween?: [number, number];
		regexBookPath?: string;    // 正则表达式字符串
		regexImagePath?: string;
		matchInnerPath?: boolean;  // 是否匹配内部路径，默认false只匹配book路径
		excludeFromPreload?: boolean; // 筛出预超分队列
		metadata?: Record<string, ConditionExpression>; // 自定义键
	};
	action: {
		model: string;
		scale: number;
		tileSize: number;
		noiseLevel: number;
		gpuId: number;
		useCache: boolean;
		skip?: boolean;
	};
}

// 条件评估结果
export interface ConditionResult {
	conditionId: string | null;
	action: UpscaleCondition['action'] | null;
	excludeFromPreload: boolean;
	skipUpscale: boolean;
}

export interface UpscalePanelSettings extends UpscaleSettings {
	// ...已有字段
	preloadPages: number;
	backgroundConcurrency: number;
	showPanelPreview: boolean;
	conditionalUpscaleEnabled: boolean;
	conditionalMinWidth: number;
	conditionalMinHeight: number;
	conditionsList: UpscaleCondition[];
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
	conditionsList: UpscaleCondition[];
}

const STORAGE_KEY = 'pyo3_upscale_settings';

const initialImageSettings = (() => {
	try {
		const imageSettings = settingsManager.getSettings().image ?? {};
		return {
			enableSuperResolution:
				imageSettings.enableSuperResolution ?? DEFAULT_UPSCALE_SETTINGS.currentImageUpscaleEnabled
		};
	} catch (error) {
		console.warn('无法读取全局图像设置，使用默认值', error);
		return {
			enableSuperResolution: DEFAULT_UPSCALE_SETTINGS.currentImageUpscaleEnabled
		};
	}
})();

const DEFAULT_CONDITION_PRESETS = getDefaultConditionPresets();

export const defaultPanelSettings: UpscalePanelSettings = {
	...DEFAULT_UPSCALE_SETTINGS,
	currentImageUpscaleEnabled: initialImageSettings.enableSuperResolution,
	preloadPages: 3,
	backgroundConcurrency: 2,
	showPanelPreview: false,
	conditionalUpscaleEnabled: false,
	conditionalMinWidth: 0,
	conditionalMinHeight: 0,
	conditionsList: DEFAULT_CONDITION_PRESETS,
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
			return {
				...defaultPanelSettings,
				conditionsList: getDefaultConditionPresets()
			};
		}

		const parsed = JSON.parse(stored) as Partial<UpscalePanelSettings>;
		
		// 处理条件列表，确保向后兼容
		let conditionsList = getDefaultConditionPresets();
		if (parsed.conditionsList) {
			conditionsList = parsed.conditionsList.map((condition, index) =>
				normalizeCondition(condition, index)
			);
		} else if (parsed.conditions) {
			// 向后兼容：将旧的单条件转换为条件列表
			const oldCondition = parsed.conditions as any;
			conditionsList = [
				normalizeCondition({
					id: 'migrated-condition',
					name: '迁移的条件',
					enabled: oldCondition.enabled ?? true,
					priority: 0,
					match: {
						minWidth: oldCondition.minWidth,
						minHeight: oldCondition.minHeight,
						excludeFromPreload: false
					},
					action: {
						model: oldCondition.model || 'real-cugan',
						scale: oldCondition.scale || 2,
						tileSize: oldCondition.tileSize || 400,
						noiseLevel: oldCondition.noiseLevel || -1,
						gpuId: oldCondition.gpuId || 0,
						useCache: oldCondition.useCache ?? true
					}
				})
			];
		}

		return {
			...defaultPanelSettings,
			...parsed,
			conditionalUpscaleEnabled: parsed.conditionalUpscaleEnabled ?? defaultPanelSettings.conditionalUpscaleEnabled,
			conditionsList
		};
	} catch (error) {
		console.warn('加载面板设置失败，使用默认配置', error);
		return {
			...defaultPanelSettings,
			conditionsList: getDefaultConditionPresets()
		};
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
		currentImageUpscaleEnabled: settings.currentImageUpscaleEnabled
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
