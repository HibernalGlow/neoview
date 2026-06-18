/**
 * Upscale Panel Store
 * 超分面板统一状态管理
 */
import { pyo3UpscaleManager } from './PyO3UpscaleManager.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import { normalizeThumbnailDirectoryPath } from '$lib/config/paths';
import {
	defaultPanelSettings,
	loadUpscalePanelSettings,
	persistUpscalePanelSettings,
	type UpscalePanelSettings,
	type UpscaleCondition
} from '$lib/components/panels/UpscalePanel';

// ==================== 类型定义 ====================
export type UpscaleTrigger = 'manual' | 'auto';
export type { UpscaleCondition };

export interface CacheStats {
	totalFiles: number;
	totalSize: number;
	cacheDir: string;
}

// ==================== 模型配置 ====================
export const MODEL_LABELS: Record<string, string> = {
	MODEL_WAIFU2X_CUNET_UP2X: 'CUNet 2x (推荐)',
	MODEL_WAIFU2X_PHOTO_UP2X: 'Photo 2x (照片)',
	MODEL_WAIFU2X_ANIME_UP2X: 'Anime 2x',
	MODEL_WAIFU2X_CUNET_UP2X_DENOISE3X: 'CUNet 2x + Denoise 3x',
	MODEL_REALCUGAN_PRO_UP2X: 'Real-CUGAN Pro 2x',
	MODEL_REALCUGAN_SE_UP2X: 'Real-CUGAN SE 2x',
	MODEL_REALCUGAN_PRO_UP3X: 'Real-CUGAN Pro 3x',
	MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X: 'Real-ESRGAN Anime 2x',
	MODEL_REALESRGAN_X4PLUS_ANIME_UP4X: 'Real-ESRGAN 4x+ Anime'
};

export const GPU_OPTIONS = [
	{ value: 0, label: 'GPU 0 (默认)' },
	{ value: 1, label: 'GPU 1' },
	{ value: 2, label: 'GPU 2' },
	{ value: 3, label: 'GPU 3' }
];

export const TILE_SIZE_OPTIONS = [
	{ value: 0, label: '自动' },
	{ value: 256, label: '256' },
	{ value: 512, label: '512' },
	{ value: 1024, label: '1024' }
];

export const NOISE_LEVEL_OPTIONS = [
	{ value: -1, label: '无降噪' },
	{ value: 0, label: '等级 0' },
	{ value: 1, label: '等级 1' },
	{ value: 2, label: '等级 2' },
	{ value: 3, label: '等级 3' }
];

// ==================== 响应式状态 ====================

// 全局开关
export const autoUpscaleEnabled = $state({ value: false });
export const preUpscaleEnabled = $state({ value: true });
export const conditionalUpscaleEnabled = $state({ value: false });
export const showPanelPreview = $state({ value: false });

// 模型参数
export const selectedModel = $state({ value: 'MODEL_WAIFU2X_CUNET_UP2X' });
export const scale = $state({ value: 2 });
export const tileSize = $state({ value: 64 });
export const noiseLevel = $state({ value: 0 });
export const gpuId = $state({ value: 0 });

// 预加载配置
export const preloadPages = $state({ value: 3 });
export const backgroundConcurrency = $state({ value: 2 });

// 递进超分配置
export const progressiveUpscaleEnabled = $state({ value: false });
export const progressiveDwellTime = $state({ value: 3 }); // 秒
export const progressiveMaxPages = $state({ value: 20 }); // 最多向后超分页数

// 条件配置
export const conditionalMinWidth = $state({ value: 0 });
export const conditionalMinHeight = $state({ value: 0 });
export const conditionsList = $state<{ value: UpscaleCondition[] }>({ value: [] });

// 处理状态
export const isProcessing = $state({ value: false });
export const progress = $state({ value: 0 });
export const status = $state({ value: '就绪' });
export const processingTime = $state({ value: 0 });
export const errorMessage = $state({ value: '' });

// 当前图片信息
export const currentImagePath = $state({ value: '' });
export const currentImageResolution = $state({ value: '' });
export const currentImageSize = $state({ value: '' });
export const currentImageHash = $state<{ value: string | null }>({ value: null });

// 预览状态
export const originalPreviewUrl = $state({ value: '' });
export const upscaledPreviewUrl = $state({ value: '' });
export const showOriginalPreview = $state({ value: false });
export const showUpscaledPreview = $state({ value: false });

// 缓存统计
export const cacheStats = $state<{ value: CacheStats }>({
	value: { totalFiles: 0, totalSize: 0, cacheDir: '' }
});

// 可用模型列表
export const availableModels = $state<{ value: string[] }>({ value: [] });

// 初始化状态
export const isInitialized = $state({ value: false });
export const isPyO3Available = $state({ value: false });

// ==================== 辅助函数 ====================

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getResolutionString(width?: number, height?: number): string {
	if (typeof width !== 'number' || typeof height !== 'number') return '';
	if (width <= 0 || height <= 0) return '';
	return `${Math.round(width)}×${Math.round(height)}`;
}

export function getModelLabel(modelName: string): string {
	return MODEL_LABELS[modelName] || modelName;
}

// ==================== 状态管理函数 ====================

export function applySettings(settings: UpscalePanelSettings) {
	autoUpscaleEnabled.value = settings.autoUpscaleEnabled;
	preUpscaleEnabled.value = settings.preUpscaleEnabled;
	conditionalUpscaleEnabled.value = settings.conditionalUpscaleEnabled;
	conditionalMinWidth.value = settings.conditionalMinWidth;
	conditionalMinHeight.value = settings.conditionalMinHeight;
	selectedModel.value = settings.selectedModel;
	scale.value = settings.scale;
	tileSize.value = settings.tileSize;
	noiseLevel.value = settings.noiseLevel;
	gpuId.value = settings.gpuId;
	preloadPages.value = settings.preloadPages;
	backgroundConcurrency.value = settings.backgroundConcurrency;
	showPanelPreview.value = settings.showPanelPreview ?? false;
	conditionsList.value = settings.conditionsList ?? [];
	// 递进超分配置
	progressiveUpscaleEnabled.value = settings.progressiveUpscaleEnabled ?? false;
	progressiveDwellTime.value = settings.progressiveDwellTime ?? 3;
	progressiveMaxPages.value = settings.progressiveMaxPages ?? 20;
}

export function gatherSettings(): UpscalePanelSettings {
	return {
		...defaultPanelSettings,
		autoUpscaleEnabled: autoUpscaleEnabled.value,
		preUpscaleEnabled: preUpscaleEnabled.value,
		conditionalUpscaleEnabled: conditionalUpscaleEnabled.value,
		conditionalMinWidth: conditionalMinWidth.value,
		conditionalMinHeight: conditionalMinHeight.value,
		currentImageUpscaleEnabled: false,
		selectedModel: selectedModel.value,
		scale: scale.value,
		tileSize: tileSize.value,
		noiseLevel: noiseLevel.value,
		gpuId: gpuId.value,
		preloadPages: preloadPages.value,
		backgroundConcurrency: backgroundConcurrency.value,
		showPanelPreview: showPanelPreview.value,
		conditionsList: conditionsList.value,
		// 递进超分配置
		progressiveUpscaleEnabled: progressiveUpscaleEnabled.value,
		progressiveDwellTime: progressiveDwellTime.value,
		progressiveMaxPages: progressiveMaxPages.value,
		conditions: {
			enabled: conditionalUpscaleEnabled.value,
			minWidth: conditionalMinWidth.value,
			minHeight: conditionalMinHeight.value
		}
	};
}

export function saveSettings() {
	const settings = gatherSettings();
	persistUpscalePanelSettings(settings);
}

export function resetProcessingState() {
	isProcessing.value = false;
	progress.value = 0;
	status.value = '就绪';
	processingTime.value = 0;
	errorMessage.value = '';
}

export function setProcessingStatus(msg: string, prog?: number) {
	status.value = msg;
	if (prog !== undefined) {
		progress.value = prog;
	}
}

export function setError(msg: string) {
	errorMessage.value = msg;
	status.value = '处理失败';
	isProcessing.value = false;
}

// ==================== 当前图片管理 ====================

export function updateCurrentImage(path: string, resolution?: string, size?: string) {
	currentImagePath.value = path;
	if (resolution) currentImageResolution.value = resolution;
	if (size) currentImageSize.value = size;
}

export function clearCurrentImage() {
	currentImagePath.value = '';
	currentImageResolution.value = '';
	currentImageSize.value = '';
	currentImageHash.value = null;
}

// ==================== 初始化 ====================

export async function initializeUpscale() {
	if (isInitialized.value) return;

	console.log('🚀 初始化超分面板状态...');

	// 加载保存的设置
	const loaded = loadUpscalePanelSettings();
	applySettings(loaded);

	// 初始化 PyO3 管理器
	try {
		const pythonModulePath =
			'D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src-tauri/python/upscale_wrapper.py';
		const globalSettings = settingsManager.getSettings();
		const thumbnailRoot = normalizeThumbnailDirectoryPath(
			globalSettings.system?.thumbnailDirectory
		);

		await pyo3UpscaleManager.initialize(pythonModulePath, thumbnailRoot);

		if (pyo3UpscaleManager.isAvailable()) {
			availableModels.value = pyo3UpscaleManager.getAvailableModels();
			isPyO3Available.value = true;
			console.log('✅ PyO3 超分功能可用');
		} else {
			console.warn('⚠️ PyO3 超分功能不可用');
		}
	} catch (error) {
		console.error('❌ 初始化 PyO3 超分管理器失败:', error);
	}

	isInitialized.value = true;
}

// ==================== 导出 Store 对象 ====================

export const upscalePanelStore = {
	// 状态
	autoUpscaleEnabled,
	preUpscaleEnabled,
	conditionalUpscaleEnabled,
	showPanelPreview,
	selectedModel,
	scale,
	tileSize,
	noiseLevel,
	gpuId,
	preloadPages,
	backgroundConcurrency,
	progressiveUpscaleEnabled,
	progressiveDwellTime,
	progressiveMaxPages,
	conditionalMinWidth,
	conditionalMinHeight,
	conditionsList,
	isProcessing,
	progress,
	status,
	processingTime,
	errorMessage,
	currentImagePath,
	currentImageResolution,
	currentImageSize,
	currentImageHash,
	originalPreviewUrl,
	upscaledPreviewUrl,
	showOriginalPreview,
	showUpscaledPreview,
	cacheStats,
	availableModels,
	isInitialized,
	isPyO3Available,

	// 方法
	applySettings,
	gatherSettings,
	saveSettings,
	resetProcessingState,
	setProcessingStatus,
	setError,
	initializeUpscale,

	// 工具函数
	formatFileSize,
	getResolutionString,
	getModelLabel,

	// 常量
	MODEL_LABELS,
	GPU_OPTIONS,
	TILE_SIZE_OPTIONS,
	NOISE_LEVEL_OPTIONS
};
