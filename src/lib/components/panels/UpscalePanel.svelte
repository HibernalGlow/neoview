<script lang="ts">
	/**
	 * PyO3 Upscale Panel
	 * 超分面板 - 使用 PyO3 直接调用 Python sr_vulkan
	 * 参考 picacg-qt 的 Waifu2x 面板功能
	 */
import { Sparkles, AlertCircle } from '@lucide/svelte';
import { onMount, onDestroy, createEventDispatcher } from 'svelte';
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import { Button } from '$lib/components/ui/button';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { normalizeThumbnailDirectoryPath } from '$lib/config/paths';
	// Toast 已改为控制台输出，避免右上角弹窗干扰
	import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
import {
		defaultPanelSettings,
		loadUpscalePanelSettings,
		persistUpscalePanelSettings,
		toUpscalePanelEventDetail,
		formatFileSize,
		getProgressColor,
		readUpscaleCacheFile,
		type UpscalePanelSettings
	} from './UpscalePanel';
	import UpscalePanelGlobalControls from './UpscalePanelGlobalControls.svelte';
	import UpscalePanelModelSettings from './UpscalePanelModelSettings.svelte';
	import UpscalePanelCurrentInfo from './UpscalePanelCurrentInfo.svelte';
	import UpscalePanelCacheSection from './UpscalePanelCacheSection.svelte';
	import UpscalePanelPreview from './UpscalePanelPreview.svelte';
	import UpscalePanelConditionTabs from './UpscalePanelConditionTabs.svelte';
import './UpscalePanel.styles.css';
import { infoPanelStore } from '$lib/stores/infoPanel.svelte';
import { collectPageMetadata, evaluateConditions } from '$lib/utils/upscale/conditions';

	// ==================== 状态管理 ====================
	
	// 全局开关
	let autoUpscaleEnabled = $state(false);
	let preUpscaleEnabled = $state(true);
	let conditionalUpscaleEnabled = $state(false);
	let conditionalMinWidth = $state(0);
	let conditionalMinHeight = $state(0);
	let currentImageUpscaleEnabled = $state(false);
	let showPanelPreview = $state(false); // 新增：侧边预览开关
	let settingsInitialized = $state(false);
	
	// 保存超分图相关状态
	let lastUpscaledBlob = $state<Blob | null>(null);
	let lastUpscaledFileName = $state('');

	// 预加载配置
	let preloadPages = $state(3);
	let backgroundConcurrency = $state(2);

	// 条件列表
	let conditionsList = $state(loadUpscalePanelSettings().conditionsList);

	// 模型参数
	let selectedModel = $state('MODEL_WAIFU2X_CUNET_UP2X');
	let scale = $state(2);
	let tileSize = $state(64); // 默认 tile size
	let noiseLevel = $state(0);
	let gpuId = $state(0);

	// 可用模型列表
	let availableModels = $state<string[]>([]);
	
	// 模型选项映射 - 使用 sr_vulkan 实际的模型名称
	const modelLabels: Record<string, string> = (() => {
		const map = new Map<string, string>();
		map.set('MODEL_WAIFU2X_CUNET_UP2X', 'CUNet 2x (推荐)');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X', 'Photo 2x (照片)');
		map.set('MODEL_WAIFU2X_ANIME_UP2X', 'Anime 2x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE3X', 'CUNet 1x + Denoise 3x');
		map.set('MODEL_WAIFU2X_CUNET_UP2X_DENOISE3X', 'CUNet 2x + Denoise 3x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE3X', 'Photo 2x + Denoise 3x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE3X', 'Anime 2x + Denoise 3x');
		map.set('MODEL_REALCUGAN_PRO_UP2X', 'Real-CUGAN Pro 2x');
		map.set('MODEL_REALCUGAN_SE_UP2X', 'Real-CUGAN SE 2x');
		map.set('MODEL_REALCUGAN_PRO_UP3X', 'Real-CUGAN Pro 3x');
		map.set('MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X', 'Real-ESRGAN Anime 2x');
		map.set('MODEL_REALESRGAN_X4PLUS_ANIME_UP4X', 'Real-ESRGAN 4x+ Anime');
		map.set('MODEL_REALSR_DF2K_UP4X', 'Real-ESRGAN 4x DF2K');
		map.set('MODEL_WAIFU2X_CUNET_UP1X', 'CUNet 1x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE1X', 'CUNet 1x + Denoise 1x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE2X', 'CUNet 1x + Denoise 2x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE0X', 'Anime 2x + Denoise 0x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X', 'Anime 2x + Denoise 1x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE2X', 'Anime 2x + Denoise 2x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE0X', 'Photo 2x + Denoise 0x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE1X', 'Photo 2x + Denoise 1x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE2X', 'Photo 2x + Denoise 2x');
		map.set('MODEL_REALCUGAN_PRO_UP2X_DENOISE3X', 'Real-CUGAN Pro 2x + Denoise 3x');
		map.set('MODEL_REALCUGAN_SE_UP2X_DENOISE1X', 'Real-CUGAN SE 2x + Denoise 1x');
		map.set('MODEL_REALCUGAN_SE_UP2X_DENOISE2X', 'Real-CUGAN SE 2x + Denoise 2x');
		map.set('MODEL_REALCUGAN_PRO_UP3X_DENOISE3X', 'Real-CUGAN Pro 3x + Denoise 3x');
		map.set('MODEL_REALESRGAN_ANIMAVIDEOV3_UP3X', 'Real-ESRGAN Anime 3x');
		map.set('MODEL_REALESRGAN_ANIMAVIDEOV3_UP4X', 'Real-ESRGAN Anime 4x');
		map.set('MODEL_REALESRGAN_X4PLUS_ANIME_UP4X', 'Real-ESRGAN 4x+ Anime');
		map.set('MODEL_REALSR_DF2K_UP4X', 'Real-ESRGAN 4x DF2K');
		map.set('MODEL_WAIFU2X_ANIME_UP2X', 'Waifu2x Anime 2x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X', 'Waifu2x CUNet 1x');
		map.set('MODEL_WAIFU2X_CUNET_UP2X', 'Waifu2x CUNet 2x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X', 'Waifu2x Photo 2x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE0X', 'Waifu2x Anime 2x + Denoise 0x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X', 'Waifu2x Anime 2x + Denoise 1x');
		map.set('MODEL_WAIFU2X_ANIME_UP2X_DENOISE2X', 'Waifu2x Anime 2x + Denoise 2x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE0X', 'Waifu2x CUNet 1x + Denoise 0x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE1X', 'Waifu2x CUNet 1x + Denoise 1x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE2X', 'Waifu2x CUNet 1x + Denoise 2x');
		map.set('MODEL_WAIFU2X_CUNET_UP1X_DENOISE3X', 'Waifu2x CUNet 1x + Denoise 3x');
		map.set('MODEL_WAIFU2X_CUNET_UP2X_DENOISE0X', 'Waifu2x CUNet 2x + Denoise 0x');
		map.set('MODEL_WAIFU2X_CUNET_UP2X_DENOISE1X', 'Waifu2x CUNet 2x + Denoise 1x');
		map.set('MODEL_WAIFU2X_CUNET_UP2X_DENOISE2X', 'Waifu2x CUNet 2x + Denoise 2x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE0X', 'Waifu2x Photo 2x + Denoise 0x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE1X', 'Waifu2x Photo 2x + Denoise 1x');
		map.set('MODEL_WAIFU2X_PHOTO_UP2X_DENOISE2X', 'Waifu2x Photo 2x + Denoise 2x');
		return Object.fromEntries(map);
	})();

	// 处理状态
	type UpscaleTrigger = 'manual' | 'auto';

	let isProcessing = $state(false);
	let progress = $state(0);
	let status = $state('就绪');
	let processingTime = $state(0);
	let startTime = 0;
	let error = $state('');

	// 当前图片信息
let currentImagePath = $state('');
let currentImageResolution = $state('');
let currentImageSize = $state('');
let upscaledImageUrl = $state('');
let currentImageHash = $state<string | null>(null);
let originalPreviewUrl = $state('');
let originalPreviewObjectUrl: string | null = null;
let upscaledPreviewObjectUrl: string | null = null;
let showOriginalPreview = $state(false);
let showUpscaledPreview = $state(false);

let pendingUpscaleRequest: { trigger: UpscaleTrigger; imageHash: string | null } | null = null;

interface ResolvedModelConfig {
	modelName: string;
	scale: number;
	tileSize: number;
	noiseLevel: number;
	conditionId: string | null;
}

interface ModelResolutionResult {
	config: ResolvedModelConfig | null;
	reason?: string;
	conditionId?: string | null;
}

interface ProcessingToken {
	cancelled: boolean;
	reason?: string;
}

let activeProcessingToken: ProcessingToken | null = null;
let lastBookPath: string | null = null;

	// 缓存统计
	let cacheStats = $state({
		totalFiles: 0,
		totalSize: 0,
		cacheDir: ''
	});

	function getResolutionString(width?: number, height?: number): string {
		if (typeof width !== 'number' || typeof height !== 'number') {
			return '';
		}
		if (width <= 0 || height <= 0) {
			return '';
		}
		return `${Math.round(width)}×${Math.round(height)}`;
	}

	// GPU 选项
	const gpuOptions = [
		{ value: 0, label: 'GPU 0 (默认)' },
		{ value: 1, label: 'GPU 1' },
		{ value: 2, label: 'GPU 2' },
		{ value: 3, label: 'GPU 3' }
	];

	// Tile Size 选项
	const tileSizeOptions = [
		{ value: 0, label: '自动' },
		{ value: 256, label: '256' },
		{ value: 512, label: '512' },
		{ value: 1024, label: '1024' }
	];

	// 降噪等级选项
	const noiseLevelOptions = [
		{ value: -1, label: '无降噪' },
		{ value: 0, label: '等级 0' },
		{ value: 1, label: '等级 1' },
		{ value: 2, label: '等级 2' },
		{ value: 3, label: '等级 3' }
	];

	// ==================== 生命周期 ====================

	// 监听当前图片变化 - 同步 Viewer 的当前图片
	$effect(() => {
		const currentPage = bookStore.currentPage;
		if (currentPage) {
			// 获取图片路径
			const imagePath = (currentPage as any).path || (currentPage as any).url;
			if (imagePath && imagePath !== currentImagePath) {
				updateCurrentImageInfo(imagePath);
				console.log('📷 同步当前图片:', imagePath);
				
				// 如果启用自动超分，自动执行
				if (autoUpscaleEnabled) {
					console.log('🚀 自动超分已启用，执行超分...');
					requestUpscale('auto');
				}
			}
		}
	});

	// 监听自动超分开关变化
	$effect(() => {
		console.log('🔄 $effect 触发:', {
			settingsInitialized,
			autoUpscaleEnabled
		});
		
		if (settingsInitialized) {
			// 读取当前全局设置以便对比
			const currentGlobalSettings = settingsManager.getSettings();
			console.log('🔍 更新前全局设置:', {
				enableSuperResolution: currentGlobalSettings.image.enableSuperResolution,
				autoUpscaleEnabled: autoUpscaleEnabled
			});
			
			// 使用 updateNestedSettings 更新全局设置
			settingsManager.updateNestedSettings('image', {
				enableSuperResolution: autoUpscaleEnabled
			});
			
			// 验证更新是否成功
			const updatedGlobalSettings = settingsManager.getSettings();
			console.log('🔍 更新后全局设置:', {
				enableSuperResolution: updatedGlobalSettings.image.enableSuperResolution,
				updateSuccess: updatedGlobalSettings.image.enableSuperResolution === autoUpscaleEnabled
			});
			
			console.log('⚙️ 自动超分全局设置 =>', autoUpscaleEnabled ? '已开启' : '已关闭');
			
			// 同时更新面板设置
			const panelSettings = gatherPanelSettings();
			console.log('💾 保存面板设置:', {
				autoUpscaleEnabled: panelSettings.autoUpscaleEnabled,
				preloadPages: panelSettings.preloadPages,
				backgroundConcurrency: panelSettings.backgroundConcurrency
			});
			persistAndBroadcast(panelSettings);
			syncPreloadConfig(panelSettings);
			
			if (autoUpscaleEnabled) {
				console.log('✅ 自动超分已启用');
				if (currentImagePath) {
					requestUpscale('auto');
				}
			} else {
				console.log('❌ 自动超分已关闭');
			}
		}
	});

	$effect(() => {
		if (!autoUpscaleEnabled && pendingUpscaleRequest?.trigger === 'auto') {
			pendingUpscaleRequest = null;
		}
	});

	$effect(() => {
		const currentBookPath = bookStore.currentBook?.path ?? null;
		if (currentBookPath !== lastBookPath) {
			if (lastBookPath) {
				cancelCurrentProcessing('书籍已切换，停止超分');
				pendingUpscaleRequest = null;
				resetUpscaledDisplay();
				// 同时通知后端取消上一部书的 PyO3 任务
				void pyo3UpscaleManager.cancelJob(lastBookPath);
			}
			lastBookPath = currentBookPath;
		}
	});

	// 创建事件分发器
	const dispatch = createEventDispatcher();

	function applyPanelSettings(settings: UpscalePanelSettings) {
		autoUpscaleEnabled = settings.autoUpscaleEnabled;
		preUpscaleEnabled = settings.preUpscaleEnabled;
		conditionalUpscaleEnabled = settings.conditionalUpscaleEnabled;
		conditionalMinWidth = settings.conditionalMinWidth;
		conditionalMinHeight = settings.conditionalMinHeight;
		currentImageUpscaleEnabled = settings.currentImageUpscaleEnabled;
		selectedModel = settings.selectedModel;
		scale = settings.scale;
		tileSize = settings.tileSize;
		noiseLevel = settings.noiseLevel;
		gpuId = settings.gpuId;
		preloadPages = settings.preloadPages;
		backgroundConcurrency = settings.backgroundConcurrency;
		showPanelPreview = settings.showPanelPreview ?? false;
		conditionsList = settings.conditionsList;
		
		// 同步预加载配置到 PreloadManager
		syncPreloadConfig(settings);
	}

	function gatherPanelSettings(): UpscalePanelSettings {
		return {
			...defaultPanelSettings,
			autoUpscaleEnabled,
			preUpscaleEnabled,
			conditionalUpscaleEnabled,
			conditionalMinWidth,
			conditionalMinHeight,
			currentImageUpscaleEnabled,
			selectedModel,
			scale,
			tileSize,
			noiseLevel,
			gpuId,
			preloadPages,
			backgroundConcurrency,
			showPanelPreview,
			conditionsList,
			conditions: {
				enabled: conditionalUpscaleEnabled,
				minWidth: conditionalMinWidth,
				minHeight: conditionalMinHeight
			}
		};
	}

	function emitUpscaleSettings(settings: UpscalePanelSettings) {
		dispatch('upscale-settings-updated', toUpscalePanelEventDetail(settings));
	}

	onMount(async () => {
		console.log('🚀 UpscalePanel onMount 开始');
		// 加载设置
		const loaded = loadUpscalePanelSettings();
		applyPanelSettings(loaded);
		settingsInitialized = true;
		console.log('✅ settingsInitialized 设置为 true');
		emitUpscaleSettings(gatherPanelSettings());

		// 初始化 PyO3 管理器
		try {
			// 使用绝对路径
			// 在开发环境中，使用项目根目录的绝对路径
			const pythonModulePath = 'D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/src-tauri/python/upscale_wrapper.py';
			
			// 超分缓存目录：跟随通用设置里的缩略图目录，默认 DEFAULT_THUMBNAIL_DIRECTORY
			const globalSettings = settingsManager.getSettings();
			const thumbnailRoot = normalizeThumbnailDirectoryPath(globalSettings.system?.thumbnailDirectory);
			// 这里只传缩略图根目录，具体的 pyo3-upscale 子目录由 Rust 端统一追加，避免重复
			const cacheDir = thumbnailRoot;
			
			console.log('🔧 初始化 PyO3 超分管理器...');
			console.log('  Python 模块路径:', pythonModulePath);
			console.log('  缓存目录 (根自通用设置 thumbnailDirectory):', cacheDir);
			
			await pyo3UpscaleManager.initialize(pythonModulePath, cacheDir);
			
			if (pyo3UpscaleManager.isAvailable()) {
				availableModels = pyo3UpscaleManager.getAvailableModels();
				console.log('✅ PyO3 超分功能可用');
				console.log('可用模型:', availableModels);
				
				// 更新缓存统计
				await updateCacheStats();
			} else {
				console.warn('⚠️ PyO3 超分功能不可用，请检查 sr_vulkan 模块');
				console.error('[UpscalePanel] sr_vulkan 模块不可用，请确保已安装: pip install sr_vulkan');
			}
		} catch (error) {
			console.error('❌ 初始化 PyO3 超分管理器失败:', error);
			console.error('[UpscalePanel] 初始化超分功能失败:', error instanceof Error ? error.message : String(error));
		}
	});

	$effect(() => {
		if (!settingsInitialized) {
			return;
		}
		// $effect 会自动追踪其内部使用的响应式状态
		const settings = gatherPanelSettings();
		persistAndBroadcast(settings);
		syncPreloadConfig(settings);
	});

	// ==================== 功能函数 ====================

	/**
	 * 更新当前图片信息
	 */
	async function updateCurrentImageInfo(imagePath: string) {
		currentImagePath = imagePath;
		// 重置超分状态
		upscaledImageUrl = '';
		progress = 0;
		status = '';
		isProcessing = false;
		currentImageHash = bookStore.getCurrentPageHash();
		originalPreviewUrl = '';
		void updateOriginalPreview();
		if (autoUpscaleEnabled) {
			requestUpscale('auto');
		}

		const currentPage = bookStore.currentPage as {
			width?: number;
			height?: number;
			size?: number;
		} | null;

		if (currentPage) {
			currentImageResolution = getResolutionString(currentPage.width, currentPage.height);
			currentImageSize =
				typeof currentPage.size === 'number' ? formatFileSize(currentPage.size) : '';
		} else {
			currentImageResolution = '';
			currentImageSize = '';
		}
	}

	$effect(() => {
		const unsubscribe = infoPanelStore.subscribe((state) => {
			const imageInfo = state.imageInfo;
			if (!imageInfo) {
				currentImageResolution = '';
				currentImageSize = '';
				return;
			}

			currentImageResolution = getResolutionString(imageInfo.width, imageInfo.height);
			currentImageSize =
				typeof imageInfo.fileSize === 'number' ? formatFileSize(imageInfo.fileSize) : '';
		});
		return unsubscribe;
	});

	async function updateOriginalPreview() {
		if (originalPreviewObjectUrl) {
			URL.revokeObjectURL(originalPreviewObjectUrl);
			originalPreviewObjectUrl = null;
		}

		const preloadManager = (window as { preloadManager?: { getCurrentPageBlob: () => Promise<Blob | null> } })
			.preloadManager;
		if (!preloadManager) {
			originalPreviewUrl = '';
			return;
		}

		try {
			const blob = await preloadManager.getCurrentPageBlob();
			if (blob && blob.size > 0) {
				const objectUrl = URL.createObjectURL(blob);
				originalPreviewUrl = objectUrl;
				originalPreviewObjectUrl = objectUrl;
				return;
			}
		} catch (error) {
			console.warn('获取原图预览失败:', error);
		}

		originalPreviewUrl = '';
	}

	function applyUpscaledPreview(imageHash: string, url: string, options?: { revokeOnMismatch?: boolean }) {
		const expected = currentImageHash;
		if (expected && imageHash !== expected) {
			console.warn(
				`⚠️ 超分预览 hash 不匹配，expected=${expected}, received=${imageHash}，跳过更新`
			);
			if (options?.revokeOnMismatch) {
				try {
					URL.revokeObjectURL(url);
				} catch (error) {
					console.warn('释放对象 URL 失败:', error);
				}
			}
			return false;
		}
		if (upscaledPreviewObjectUrl && upscaledPreviewObjectUrl !== url) {
			try {
				URL.revokeObjectURL(upscaledPreviewObjectUrl);
			} catch (error) {
				console.warn('释放旧的超分预览 URL 失败:', error);
			}
			upscaledPreviewObjectUrl = null;
		}
		upscaledImageUrl = url;
		if (url.startsWith('blob:')) {
			upscaledPreviewObjectUrl = url;
		}
		return true;
	}

	function resetUpscaledDisplay() {
		if (upscaledPreviewObjectUrl) {
			try {
				URL.revokeObjectURL(upscaledPreviewObjectUrl);
			} catch (error) {
				console.warn('释放超分预览 URL 失败:', error);
			}
			upscaledPreviewObjectUrl = null;
		}
		upscaledImageUrl = '';
	}

	$effect(() => {
		if (showOriginalPreview) {
			if (!originalPreviewUrl && currentImagePath) {
				void updateOriginalPreview();
			}
		} else if (originalPreviewObjectUrl) {
			try {
				URL.revokeObjectURL(originalPreviewObjectUrl);
			} catch (error) {
				console.warn('释放原图预览 URL 失败:', error);
			}
			originalPreviewObjectUrl = null;
			originalPreviewUrl = '';
		}
	});

	onDestroy(() => {
		if (originalPreviewObjectUrl) {
			URL.revokeObjectURL(originalPreviewObjectUrl);
			originalPreviewObjectUrl = null;
		}
	if (upscaledPreviewObjectUrl) {
		URL.revokeObjectURL(upscaledPreviewObjectUrl);
		upscaledPreviewObjectUrl = null;
	}
	});

	/**
	 * 更新缓存统计
	 */
	async function updateCacheStats() {
		try {
			cacheStats = await pyo3UpscaleManager.getCacheStats();
		} catch (error) {
			console.error('更新缓存统计失败:', error);
		}
	}

	/**
	 * 应用模型设置
	 */
	async function applyModelSettings() {
		try {
			await pyo3UpscaleManager.setModel(selectedModel, scale);
			pyo3UpscaleManager.setTileSize(tileSize);
			pyo3UpscaleManager.setNoiseLevel(noiseLevel);
			const settings = gatherPanelSettings();
			persistUpscalePanelSettings(settings);
			emitUpscaleSettings(settings);
			console.log('[UpscalePanel] 模型设置已应用', {
				model: selectedModel,
				scale,
				tileSize,
				noiseLevel
			});
		} catch (error) {
			console.error('[UpscalePanel] 应用模型设置失败:', error);
		}
	}

	function persistAndBroadcast(settings: UpscalePanelSettings) {
		persistUpscalePanelSettings(settings);
		emitUpscaleSettings(settings);
	}

	function syncPreloadConfig(settings: UpscalePanelSettings) {
		const preloadManager = (window as any).preloadManager;
		if (preloadManager) {
			preloadManager.updateImageLoaderConfig({
				preloadPages: settings.preloadPages,
				maxThreads: settings.backgroundConcurrency
			});
		}
	}

	function handleGlobalControlsChange() {
		console.log('🔄 处理开关设置变化');
		const settings = gatherPanelSettings();
		persistAndBroadcast(settings);
		syncPreloadConfig(settings);
	}

	/**
	 * 处理预加载配置变化
	 */
	function handlePreloadConfigChange() {
		const settings = gatherPanelSettings();
		persistAndBroadcast(settings);
		syncPreloadConfig(settings);
	}

	/**
	 * 检查是否有缓存
	 */
	async function checkUpscaleCache(): Promise<Uint8Array | null> {
		try {
			const imageHash = await getCurrentImageHash();
			if (!imageHash) return null;

			const cache = bookStore.getUpscaleCache(
				imageHash,
				pyo3UpscaleManager.currentModel.modelName,
				pyo3UpscaleManager.currentModel.scale
			);

			if (cache) {
				console.log('🎯 找到超分缓存:', cache.cachePath);
				// 使用 invoke 命令读取缓存文件
				const data = await tauriInvoke<number[]>('read_upscale_cache_file', {
					cachePath: cache.cachePath
				});
				return new Uint8Array(data);
			}

			return null;
		} catch (error) {
			console.warn('检查缓存失败:', error);
			return null;
		}
	}

	/**
	 * 更新进度
	 */
	function updateProgress(progressValue: number, statusValue: string) {
		progress = progressValue;
		status = statusValue;
	}

	function requestUpscale(trigger: UpscaleTrigger = 'manual') {
		if (!currentImagePath) {
			console.warn('[UpscalePanel] 当前没有可供超分的图片');
			return;
		}

		const requestHash = currentImageHash;

		if (isProcessing) {
			pendingUpscaleRequest = { trigger, imageHash: requestHash };
			console.log('[UpscalePanel] 正在超分，新的任务已排队', {
				trigger,
				requestHash
			});
			return;
		}

		pendingUpscaleRequest = null;
		void performUpscale(trigger);
	}

	function processPendingUpscale() {
		if (!pendingUpscaleRequest) {
			return;
		}

		const next = pendingUpscaleRequest;
		pendingUpscaleRequest = null;

		if (next.trigger === 'auto' && !autoUpscaleEnabled) {
			console.log('[UpscalePanel] 自动超分已关闭，丢弃排队任务');
			return;
		}

		Promise.resolve().then(() => {
			requestUpscale(next.trigger);
		});
	}

	function resolveModelConfigForPage(page: any): ModelResolutionResult {
		if (!page) {
			return { config: null, reason: '没有可用的页面数据' };
		}

		if (!conditionalUpscaleEnabled) {
			return {
				config: {
					modelName: selectedModel,
					scale,
					tileSize,
					noiseLevel,
					conditionId: null
				}
			};
		}

		const currentBook = bookStore.currentBook;
		if (!currentBook) {
			return { config: null, reason: '未打开书籍，无法匹配条件' };
		}

		const metadata = collectPageMetadata(page, currentBook.path ?? '');
		const result = evaluateConditions(metadata, conditionsList ?? []);

		if (result.skipUpscale) {
			return {
				config: null,
				reason: '条件规则标记为跳过',
				conditionId: result.conditionId ?? null
			};
		}

		if (!result.action) {
			return {
				config: null,
				reason: '条件模式启用但没有匹配项'
			};
		}

		return {
			config: {
				modelName: result.action.model,
				scale: result.action.scale,
				tileSize: result.action.tileSize,
				noiseLevel: result.action.noiseLevel,
				conditionId: result.conditionId ?? null
			}
		};
	}

	function cancelCurrentProcessing(reason: string) {
		if (activeProcessingToken) {
			activeProcessingToken.cancelled = true;
			activeProcessingToken.reason = reason;
		}
		if (isProcessing) {
			status = reason;
		}
	}

	function shouldAbortProcessing(
		token: ProcessingToken,
		bookPathAtStart: string | null,
		expectedHash?: string | null
	): boolean {
		if (token.cancelled) {
			return true;
		}
		const activeBookPath = bookStore.currentBook?.path ?? null;
		if (bookPathAtStart && activeBookPath && activeBookPath !== bookPathAtStart) {
			return true;
		}
		if (expectedHash && bookStore.getCurrentPageHash() !== expectedHash) {
			return true;
		}
		return false;
	}

	/**
	 * 执行超分处理
	 */
	async function performUpscale(trigger: UpscaleTrigger = 'manual') {
		if (!currentImagePath) {
			console.error('[UpscalePanel] 没有选中的图片');
			return;
		}

		if (isProcessing) {
			console.log('[UpscalePanel] 当前已有任务执行，新的请求将等待');
			pendingUpscaleRequest = { trigger, imageHash: currentImageHash };
			return;
		}

		const currentPage = bookStore.currentPage;
		if (!currentPage) {
			console.error('[UpscalePanel] 没有找到当前页面');
			return;
		}

		const resolution = resolveModelConfigForPage(currentPage);
		if (!resolution.config) {
			const message = resolution.reason ?? '条件限制，已跳过超分';
			status = message;
			progress = 0;
			console.log('[UpscalePanel] 跳过超分:', message);
			bookStore.setCurrentPageUpscaled(false);
			return;
		}

		const modelConfig = resolution.config;
		const resolvedConditionId = modelConfig.conditionId;
		const processingBookPath = bookStore.currentBook?.path ?? null;
		const token: ProcessingToken = { cancelled: false };
		activeProcessingToken = token;

		resetUpscaledDisplay();
		isProcessing = true;
		progress = 0;
		status = '准备中...';
		startTime = Date.now();
		processingTime = 0;

		// 启动计时器
		const timer = setInterval(() => {
			processingTime = (Date.now() - startTime) / 1000;
		}, 100);

		try {
			// 应用当前/条件设置
			console.log('🔧 应用设置', {
				model: modelConfig.modelName,
				scale: modelConfig.scale,
				tileSize: modelConfig.tileSize,
				noiseLevel: modelConfig.noiseLevel,
				conditionId: resolvedConditionId
			});
			await pyo3UpscaleManager.setModel(modelConfig.modelName, modelConfig.scale);
			pyo3UpscaleManager.setTileSize(modelConfig.tileSize);
			pyo3UpscaleManager.setNoiseLevel(modelConfig.noiseLevel);
			console.log('✅ 设置已应用到 PyO3UpscaleManager');

			// 从当前页面获取图像数据

			// 检查当前页是否已有内存缓存
			console.log('🔍 检查内存超分缓存...');
			const imageHash = await getCurrentImageHash();
			
			// 通过全局 window 对象获取 preloadManager
			const preloadManager = (window as any).preloadManager;
			if (preloadManager && imageHash) {
				const memCache = preloadManager.getPreloadMemoryCache();
				const cached = memCache.get(imageHash);
				
				if (cached) {
					if (!cached.blob || cached.blob.size === 0) {
						console.warn('[UpscalePanel] 内存缓存为空，移除后重新超分:', imageHash);
						memCache.delete(imageHash);
					} else {
						console.log('✅ 使用内存缓存数据，无需重新生成');
						progress = 100;
						status = '缓存命中';
						
						// 设置当前页面超分状态
						bookStore.setCurrentPageUpscaled(true);
						
						const processingTime = (Date.now() - startTime) / 1000;
						console.log('[UpscalePanel] 使用缓存！', {
							page: bookStore.currentPageIndex + 1,
							time: processingTime.toFixed(1)
						});
						
						if (shouldAbortProcessing(token, processingBookPath, imageHash)) {
							status = '上下文已变化，缓存结果丢弃';
							return;
						}

						// 直接使用内存缓存
						applyUpscaledPreview(imageHash, cached.url);
						
						// 使用统一处理函数（resultData 为空表示无需重新保存）
						await handleUpscaleResult(
							imageHash,
							cached.blob,
							cached.url,
							new Uint8Array(),
							resolvedConditionId
						);
						
						return; // 使用缓存，直接返回
					}
				}
			}

			// 检查磁盘缓存
			if (imageHash) {
				try {
					const cachePath = await tauriInvoke<string | null>('check_pyo3_upscale_cache', {
						imageHash,
						modelName: selectedModel,
						scale,
						tileSize: tileSize,
						noiseLevel: 0
					});

					if (cachePath) {
						const bytes = await tauriInvoke<number[]>('read_binary_file', { filePath: cachePath });
						if (bytes.length === 0) {
							console.warn('[UpscalePanel] 磁盘缓存文件为空，忽略并重新超分:', cachePath);
						} else {
							console.log('✅ 发现磁盘缓存，直接使用:', cachePath);
							progress = 100;
							status = '磁盘缓存命中';
							
							// 设置当前页面超分状态
							bookStore.setCurrentPageUpscaled(true);
							
							const processingTime = (Date.now() - startTime) / 1000;
							console.log('[UpscalePanel] 使用磁盘缓存！', {
								page: bookStore.currentPageIndex + 1,
								time: processingTime.toFixed(1),
								path: cachePath
							});
							
							if (shouldAbortProcessing(token, processingBookPath, imageHash)) {
								status = '上下文已变化，磁盘缓存丢弃';
								return;
							}

							const arr = new Uint8Array(bytes);
							const blob = new Blob([arr], { type: 'image/webp' });
							const url = URL.createObjectURL(blob);
							
							// 使用统一处理函数
							await handleUpscaleResult(imageHash, blob, url, arr, resolvedConditionId);
							
							return; // 使用磁盘缓存，直接返回
						}
					}
				} catch (error) {
					console.warn('检查磁盘缓存失败:', error);
				}
			}
			
			console.log('📥 从 ImageViewer 获取图像数据...');
			const imageData = await getCurrentImageBlob();
			console.log('✅ 成功获取图像数据，大小:', imageData.length);
			
			// 执行超分
			progress = 20;
			status = '执行超分...';
			updateProgress?.(progress, status);
			
			// 为当前任务生成 jobKey（按书籍路径区分），便于后端取消
			const bookPath = bookStore.currentBook?.path ?? 'pyo3_panel_current';
			// 调用 PyO3 超分管理器
			const result = await pyo3UpscaleManager.upscaleImageMemory(imageData, 120.0, bookPath);
			console.log('✅ 超分完成，输出大小:', result.length);
			
			// 检查 imageHash 是否存在
			if (!imageHash) {
				console.warn('[UpscalePanel] 无法获取当前页 hash，跳过缓存保存');
				error = '无法获取页面哈希';
				status = '超分失败';
				console.error('[UpscalePanel] 超分失败: 无法获取页面哈希');
				return;
			}

			// 转换为 Blob 和 URL
			const buffer = new ArrayBuffer(result.byteLength);
			new Uint8Array(buffer).set(result);
			const blob = new Blob([buffer], { type: 'image/webp' });
			const objectUrl = URL.createObjectURL(blob);
			applyUpscaledPreview(imageHash, objectUrl, {
				revokeOnMismatch: true
			});

			if (shouldAbortProcessing(token, processingBookPath, imageHash)) {
				status = '上下文已变化，超分结果丢弃';
				return;
			}

			progress = 100;
			status = '转换完成';
			updateProgress?.(progress, status);
			
			// 设置当前页面超分状态
			bookStore.setCurrentPageUpscaled(true);
			
			const processingTime = (Date.now() - startTime) / 1000;
			console.log('[UpscalePanel] 超分完成', {
					page: bookStore.currentPageIndex + 1,
					time: processingTime.toFixed(1)
				});

			// 使用统一处理函数
			await handleUpscaleResult(imageHash, blob, objectUrl, result, resolvedConditionId);
			
		} catch (err) {
			console.error('[UpscalePanel] 超分失败:', err);
			error = err instanceof Error ? err.message : String(err);
			status = '超分失败';
			console.error('[UpscalePanel] 超分失败:', error);
		} finally {
			clearInterval(timer);
			isProcessing = false;
			if (activeProcessingToken === token) {
				activeProcessingToken = null;
			}
			processPendingUpscale();
		}
	}

	/**
	 * 获取当前图像的 Blob 数据 (从 ImageViewer 内存缓存获取)
	 */
	async function getCurrentImageBlob(): Promise<Uint8Array> {
		try {
			const currentPage = bookStore.currentPage;
			if (!currentPage) {
				throw new Error('没有当前图片');
			}

			console.log('🎯 从 ImageViewer 内存获取图像数据:', currentPage.path);
			
			// 使用 Promise 等待 ImageViewer 响应
			return new Promise<Uint8Array>((resolve, reject) => {
				// 设置超时
				const timeout = setTimeout(() => {
					reject(new Error('等待 ImageViewer 响应超时'));
				}, 5000);
				
				// 定义回调函数
				const callback = (imageData: string) => {
					clearTimeout(timeout);
					console.log('✅ 收到 ImageViewer 返回的数据，长度:', imageData.length);
					
					// 转换 data URL 或 blob URL 为 Uint8Array
					if (imageData.startsWith('data:') || imageData.startsWith('blob:')) {
						fetch(imageData)
							.then(response => response.blob())
							.then(blob => blob.arrayBuffer())
							.then(arrayBuffer => {
								console.log('✅ 成功转换为 Uint8Array，大小:', arrayBuffer.byteLength);
								resolve(new Uint8Array(arrayBuffer));
							})
							.catch(error => {
								console.error('❌ 转换图像数据失败:', error);
								reject(error);
							});
					} else {
						reject(new Error('无效的图像数据格式: ' + imageData.substring(0, 50)));
					}
				};
				
				// 使用 window.dispatchEvent 发送 CustomEvent
				const event = new CustomEvent('request-current-image-data', {
					detail: { callback }
				});
				window.dispatchEvent(event);
			});
			
		} catch (error) {
			console.error('获取图像数据失败:', error);
			throw error;
		}
	}

	/**
	 * 获取当前图像的 Hash
	 */
	async function getCurrentImageHash(): Promise<string | null> {
		// 使用 bookStore 的统一 hash API
		const hash = bookStore.getCurrentPageHash();
		if (hash) {
			console.log(`UpscalePanel 使用稳定哈希，页码: ${bookStore.currentPageIndex + 1}/${bookStore.totalPages}, hash: ${hash}`);
		}
		return hash;
	}

	/**
	 * 处理超分完成后的统一逻辑
	 */
	async function handleUpscaleResult(
		imageHash: string,
		blob: Blob,
		url: string,
		resultData: Uint8Array,
		conditionId?: string | null
	) {
		const currentPageIndex = bookStore.currentPageIndex;
		const currentPage = bookStore.currentPage;
		
		// 记住最新超分结果（用于保存功能）
		lastUpscaledBlob = blob;
		// 简单从路径提文件名（可自行优化）
		lastUpscaledFileName = currentPage
			? (currentPage as any).path?.split(/[\/]/).pop() ?? 'upscaled.webp'
			: 'upscaled.webp';

		// 1. 异步保存到磁盘缓存 + BookStore 记录（仅在有新结果时）
		if (currentPage && resultData.length > 0) {
			pyo3UpscaleManager
				.saveUpscaleCache(imageHash, resultData)
				.then((cachePath) => {
					if (!cachePath) {
						return;
					}
					console.log('💾 超分结果已异步缓存:', cachePath);
					const innerPath = (currentPage as any).innerPath || undefined;
					bookStore.recordUpscaleCache(
						imageHash,
						pyo3UpscaleManager.currentModel.modelName,
						pyo3UpscaleManager.currentModel.scale,
						cachePath,
						currentPage.path,
						innerPath
					);
				})
				.catch((error) => {
					console.warn('异步保存缓存失败:', error);
				});
		} else if (resultData.length === 0) {
			console.log('⚠️ 命中缓存，跳过重复保存:', imageHash);
		}

		// 2. 通知面板父组件（内部事件）
		dispatch('upscale-complete', {
			originalPath: currentImagePath,
			upscaledBlob: blob,
			upscaledData: resultData
		});

		// 3. 写入内存预超分缓存
		const preloadManager = (window as any).preloadManager;
		if (preloadManager) {
			const memCache = preloadManager.getPreloadMemoryCache();
			memCache.set(imageHash, { url, blob });
			console.log('UpscalePanel 超分结果已写入内存缓存');
		}

		// 4. 触发全局事件给 ImageViewer
		console.log('🔥 UpscalePanel 触发全局 upscale-complete 事件，页码:', currentPageIndex + 1);
		window.dispatchEvent(new CustomEvent('upscale-complete', {
			detail: {
				imageData: url,
				imageBlob: blob,
				originalImageHash: imageHash,
				background: false,
				pageIndex: currentPageIndex,
				conditionId: conditionId ?? undefined,
				writeToMemoryCache: false   // 已经写入内存缓存
			}
		}));
	}

	/**
	 * 清理缓存
	 */
	async function cleanupCache() {
		try {
			const removed = await pyo3UpscaleManager.cleanupCache(30);
			await updateCacheStats();
			console.log('[UpscalePanel] 已清理缓存文件', { removed });
		} catch (error) {
			console.error('[UpscalePanel] 清理缓存失败:', error);
		}
	}

	/**
	 * 保存超分图到本地文件
	 */
	async function saveUpscaledImage() {
		try {
			if (!lastUpscaledBlob) {
				console.error('[UpscalePanel] 没有可保存的超分结果');
				return;
			}

			// 1. 选择保存路径
			const defaultName = lastUpscaledFileName.replace(/\.[^.]+$/, '') + '_sr.webp';
			const savePath = await tauriInvoke<string | null>('dialog_save', {
				title: '保存超分结果',
				defaultPath: defaultName,
				filters: [{ name: 'WebP Image', extensions: ['webp'] }]
			});

			if (!savePath) {
				// 用户取消
				return;
			}

			// 2. Blob -> Uint8Array
			const arrayBuffer = await lastUpscaledBlob.arrayBuffer();
			const bytes = new Uint8Array(arrayBuffer);

			// 3. 写入文件
			await tauriInvoke('write_binary_file', { path: savePath, contents: bytes });

			console.log('[UpscalePanel] 超分结果已保存', { path: savePath });
		} catch (err) {
			console.error('[UpscalePanel] 保存超分图失败:', err);
		}
	}

	/**
	 * 保存设置
	 */

	// 快捷键处理
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'F2') {
			event.preventDefault();
			currentImageUpscaleEnabled = !currentImageUpscaleEnabled;
		}
	}

	function stopAllUpscaleForCurrentBook() {
		console.log('[UpscalePanel] 手动停止当前书籍的所有超分任务');
		cancelCurrentProcessing('手动停止当前书籍超分');
		pendingUpscaleRequest = null;
		const bookPath = bookStore.currentBook?.path ?? null;
		if (bookPath) {
			// 1. 取消当前书籍对应的 PyO3 直连任务
			void pyo3UpscaleManager.cancelJob(bookPath);
			// 2. 同时通知 UpscaleScheduler 取消该书的所有后台超分任务
			void tauriInvoke('cancel_upscale_jobs_for_book', { bookPath });
		}
	}
</script>

<svelte:window onkeydown={handleKeyPress} />

<div class="upscale-panel">
	<!-- 标题栏 -->
	<div class="panel-header">
		<div class="flex items-center gap-2">
			<Sparkles class="w-5 h-5 text-purple-500" />
			<h3 class="text-lg font-semibold">PyO3 超分面板</h3>
		</div>
		{#if !pyo3UpscaleManager.isAvailable()}
			<div class="flex items-center gap-1 text-red-500 text-sm">
				<AlertCircle class="w-4 h-4" />
				<span>sr_vulkan 不可用</span>
			</div>
		{/if}
	</div>

	<!-- 全局开关 -->
	<UpscalePanelGlobalControls
		bind:autoUpscaleEnabled
		bind:preUpscaleEnabled
		bind:conditionalUpscaleEnabled
		bind:conditionalMinWidth
		bind:conditionalMinHeight
		bind:currentImageUpscaleEnabled
		bind:preloadPages
		bind:backgroundConcurrency
		on:change={handleGlobalControlsChange}
	/>

	<!-- 修改参数 -->
	<UpscalePanelModelSettings
		bind:scale
		bind:selectedModel
		availableModels={availableModels}
		modelLabels={modelLabels}
		bind:gpuId
		gpuOptions={gpuOptions}
		bind:tileSize
		tileSizeOptions={tileSizeOptions}
		bind:noiseLevel
		noiseLevelOptions={noiseLevelOptions}
		on:apply={applyModelSettings}
	/>

	<!-- 当前图片信息 -->
	<UpscalePanelCurrentInfo
		currentImageResolution={currentImageResolution}
		currentImageSize={currentImageSize}
		processingTime={processingTime}
		status={status}
		statusClass={status === '转换完成' ? 'text-green-500' : status === '超分失败' ? 'text-red-500' : ''}
		isProcessing={isProcessing}
		currentImagePath={currentImagePath}
		progress={progress}
		progressColorClass={getProgressColor(progress)}
		on:perform={() => requestUpscale('manual')}
	/>

	<div class="flex justify-end">
		<Button variant="outline" onclick={stopAllUpscaleForCurrentBook}>
			停止当前书籍超分
		</Button>
	</div>

	<!-- 条件管理 -->
	<UpscalePanelConditionTabs
		bind:conditions={conditionsList}
		bind:conditionalUpscaleEnabled
		availableModels={availableModels}
		modelLabels={modelLabels}
		gpuOptions={gpuOptions}
		tileSizeOptions={tileSizeOptions}
		noiseLevelOptions={noiseLevelOptions}
		on:conditionsChanged={(e) => {
			conditionsList = e.detail.conditions;
			const settings = gatherPanelSettings();
			persistAndBroadcast(settings);
		}}
	/>

	<!-- 缓存管理 -->
	<UpscalePanelCacheSection
		cacheStats={cacheStats}
		formattedSize={formatFileSize(cacheStats.totalSize)}
		on:clear={cleanupCache}
	/>

	<!-- 预览控制 -->
	<div class="rounded-md border border-border/70 p-4 space-y-3">
		<div class="text-xs text-muted-foreground">预览显示（默认关闭以节约性能）</div>
		<div class="flex flex-wrap gap-6">
			<label class="flex items-center gap-2 text-sm">
				<Switch bind:checked={showOriginalPreview} />
				<span>显示原图预览</span>
			</label>
			<label class="flex items-center gap-2 text-sm">
				<Switch bind:checked={showUpscaledPreview} />
				<span>显示超分结果预览</span>
			</label>
		</div>
	</div>

	<!-- 预览区域 -->
	{#if showOriginalPreview || showUpscaledPreview}
		<UpscalePanelPreview
			upscaledImageUrl={upscaledImageUrl}
			originalImageUrl={originalPreviewUrl}
			isProcessing={isProcessing}
			showOriginal={showOriginalPreview}
			showUpscaled={showUpscaledPreview}
		/>
	{/if}
</div>

<style>
	.upscale-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
		height: 100%;
		overflow-y: auto;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
	}
</style>
