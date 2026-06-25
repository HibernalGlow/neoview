import { normalizeThumbnailDirectoryPath } from '$lib/config/paths';
import { settingsManager } from '$lib/settings/settingsManager';
import {
	defaultPanelSettings,
	loadUpscalePanelSettings,
	persistUpscalePanelSettings,
	type UpscaleCondition,
	type UpscalePanelSettings
} from '$lib/components/panels/UpscalePanel';
import { pyo3UpscaleManager } from './PyO3UpscaleManager.svelte';

export type UpscaleTrigger = 'manual' | 'auto';
export type { UpscaleCondition };

export interface CacheStats {
	totalFiles: number;
	totalSize: number;
	cacheDir: string;
}

export const MODEL_LABELS: Record<string, string> = {
	MODEL_WAIFU2X_CUNET_UP2X: 'CUNet 2x (Recommended)',
	MODEL_WAIFU2X_PHOTO_UP2X: 'Photo 2x',
	MODEL_WAIFU2X_ANIME_UP2X: 'Anime 2x',
	MODEL_WAIFU2X_CUNET_UP2X_DENOISE3X: 'CUNet 2x + Denoise 3x',
	MODEL_REALCUGAN_PRO_UP2X: 'Real-CUGAN Pro 2x',
	MODEL_REALCUGAN_SE_UP2X: 'Real-CUGAN SE 2x',
	MODEL_REALCUGAN_PRO_UP3X: 'Real-CUGAN Pro 3x',
	MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X: 'Real-ESRGAN Anime 2x',
	MODEL_REALESRGAN_X4PLUS_ANIME_UP4X: 'Real-ESRGAN 4x+ Anime',
	ILLUSJANAI_X2: 'IllusJaNai 2x',
	ILLUSJANAI_X4: 'IllusJaNai 4x',
	ILLUSJANAI_DAT2_X4: 'IllusJaNai DAT2 4x'
};

export const DEFAULT_MANGA_JANAI_MODEL_DIR =
	'D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/model/MangaJaNai_V1_ModelsOnly';

export const GPU_OPTIONS = [
	{ value: 0, label: 'GPU 0 (Default)' },
	{ value: 1, label: 'GPU 1' },
	{ value: 2, label: 'GPU 2' },
	{ value: 3, label: 'GPU 3' }
];

export const TILE_SIZE_OPTIONS = [
	{ value: 0, label: 'Auto' },
	{ value: 256, label: '256' },
	{ value: 400, label: '400' },
	{ value: 512, label: '512' },
	{ value: 1024, label: '1024' }
];

export const NOISE_LEVEL_OPTIONS = [
	{ value: -1, label: 'None' },
	{ value: 0, label: 'Level 0' },
	{ value: 1, label: 'Level 1' },
	{ value: 2, label: 'Level 2' },
	{ value: 3, label: 'Level 3' }
];

export const autoUpscaleEnabled = $state({ value: false });
export const preUpscaleEnabled = $state({ value: true });
export const conditionalUpscaleEnabled = $state({ value: false });
export const showPanelPreview = $state({ value: false });

export const selectedModel = $state({ value: 'MODEL_WAIFU2X_CUNET_UP2X' });
export const scale = $state({ value: 2 });
export const tileSize = $state({ value: 64 });
export const tileEnabled = $state({ value: true });
export const noiseLevel = $state({ value: 0 });
export const gpuId = $state({ value: 0 });
export const mangaJanaiModelDir = $state({ value: DEFAULT_MANGA_JANAI_MODEL_DIR });

export const preloadPages = $state({ value: 3 });
export const backgroundConcurrency = $state({ value: 2 });

export const progressiveUpscaleEnabled = $state({ value: false });
export const progressiveDwellTime = $state({ value: 3 });
export const progressiveMaxPages = $state({ value: 20 });

export const conditionalMinWidth = $state({ value: 0 });
export const conditionalMinHeight = $state({ value: 0 });
export const conditionsList = $state<{ value: UpscaleCondition[] }>({ value: [] });

export const isProcessing = $state({ value: false });
export const progress = $state({ value: 0 });
export const status = $state({ value: 'Ready' });
export const processingTime = $state({ value: 0 });
export const errorMessage = $state({ value: '' });

export const currentImagePath = $state({ value: '' });
export const currentImageResolution = $state({ value: '' });
export const currentImageSize = $state({ value: '' });
export const currentImageHash = $state<{ value: string | null }>({ value: null });

export const originalPreviewUrl = $state({ value: '' });
export const upscaledPreviewUrl = $state({ value: '' });
export const showOriginalPreview = $state({ value: false });
export const showUpscaledPreview = $state({ value: false });

export const cacheStats = $state<{ value: CacheStats }>({
	value: { totalFiles: 0, totalSize: 0, cacheDir: '' }
});

export const availableModels = $state<{ value: string[] }>({ value: [] });

export const isInitialized = $state({ value: false });
export const isPyO3Available = $state({ value: false });

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getResolutionString(width?: number, height?: number): string {
	if (typeof width !== 'number' || typeof height !== 'number') return '';
	if (width <= 0 || height <= 0) return '';
	return `${Math.round(width)}x${Math.round(height)}`;
}

export function getModelLabel(modelName: string): string {
	return MODEL_LABELS[modelName] || modelName;
}

export function applySettings(settings: UpscalePanelSettings) {
	autoUpscaleEnabled.value = settings.autoUpscaleEnabled;
	preUpscaleEnabled.value = settings.preUpscaleEnabled;
	conditionalUpscaleEnabled.value = settings.conditionalUpscaleEnabled;
	conditionalMinWidth.value = settings.conditionalMinWidth;
	conditionalMinHeight.value = settings.conditionalMinHeight;
	selectedModel.value = settings.selectedModel;
	scale.value = settings.scale;
	tileSize.value = settings.tileSize;
	tileEnabled.value = settings.tileEnabled ?? true;
	noiseLevel.value = settings.noiseLevel;
	gpuId.value = settings.gpuId;
	mangaJanaiModelDir.value = settings.mangaJanaiModelDir || DEFAULT_MANGA_JANAI_MODEL_DIR;
	preloadPages.value = settings.preloadPages;
	backgroundConcurrency.value = settings.backgroundConcurrency;
	showPanelPreview.value = settings.showPanelPreview ?? false;
	conditionsList.value = settings.conditionsList ?? [];
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
		tileEnabled: tileEnabled.value,
		noiseLevel: noiseLevel.value,
		gpuId: gpuId.value,
		mangaJanaiModelDir: mangaJanaiModelDir.value || DEFAULT_MANGA_JANAI_MODEL_DIR,
		preloadPages: preloadPages.value,
		backgroundConcurrency: backgroundConcurrency.value,
		showPanelPreview: showPanelPreview.value,
		conditionsList: conditionsList.value,
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
	persistUpscalePanelSettings(gatherSettings());
}

export function resetProcessingState() {
	isProcessing.value = false;
	progress.value = 0;
	status.value = 'Ready';
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
	status.value = 'Failed';
	isProcessing.value = false;
}

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

export async function initializeUpscale() {
	if (isInitialized.value) return;

	console.log('Initializing upscale panel state...');

	const loaded = loadUpscalePanelSettings();
	applySettings(loaded);

	try {
		const pythonModulePath =
			'D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src-tauri/python/upscale_wrapper.py';
		const globalSettings = settingsManager.getSettings();
		const thumbnailRoot = normalizeThumbnailDirectoryPath(
			globalSettings.system?.thumbnailDirectory
		);

		await pyo3UpscaleManager.initialize(
			pythonModulePath,
			thumbnailRoot,
			mangaJanaiModelDir.value || DEFAULT_MANGA_JANAI_MODEL_DIR
		);

		if (pyo3UpscaleManager.isAvailable()) {
			availableModels.value = pyo3UpscaleManager.getAvailableModels();
			isPyO3Available.value = true;
			console.log('PyO3 upscale is available');
		} else {
			console.warn('PyO3 upscale is not available');
		}
	} catch (error) {
		console.error('Failed to initialize PyO3 upscale manager', error);
	}

	isInitialized.value = true;
}

export const upscalePanelStore = {
	autoUpscaleEnabled,
	preUpscaleEnabled,
	conditionalUpscaleEnabled,
	showPanelPreview,
	selectedModel,
	scale,
	tileSize,
	tileEnabled,
	noiseLevel,
	gpuId,
	mangaJanaiModelDir,
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
	applySettings,
	gatherSettings,
	saveSettings,
	resetProcessingState,
	setProcessingStatus,
	setError,
	initializeUpscale,
	formatFileSize,
	getResolutionString,
	getModelLabel,
	MODEL_LABELS,
	DEFAULT_MANGA_JANAI_MODEL_DIR,
	GPU_OPTIONS,
	TILE_SIZE_OPTIONS,
	NOISE_LEVEL_OPTIONS
};
