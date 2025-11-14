<script lang="ts">
	/**
	 * PyO3 Upscale Panel
	 * 超分面板 - 使用 PyO3 直接调用 Python sr_vulkan
	 * 参考 picacg-qt 的 Waifu2x 面板功能
	 */
	import { Sparkles, AlertCircle } from '@lucide/svelte';
	import { onMount, createEventDispatcher } from 'svelte';
	import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
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
		buildHashInput,
		calculatePathHash,
		readUpscaleCacheFile,
		type UpscalePanelSettings
	} from './UpscalePanel';
	import UpscalePanelGlobalControls from './UpscalePanelGlobalControls.svelte';
	import UpscalePanelModelSettings from './UpscalePanelModelSettings.svelte';
	import UpscalePanelCurrentInfo from './UpscalePanelCurrentInfo.svelte';
	import UpscalePanelCacheSection from './UpscalePanelCacheSection.svelte';
	import UpscalePanelPreview from './UpscalePanelPreview.svelte';
	import './UpscalePanel.styles.css';

	// ==================== 状态管理 ====================
	
	// 全局开关
	let autoUpscaleEnabled = $state(false);
	let preUpscaleEnabled = $state(true);
	let conditionalUpscaleEnabled = $state(false);
	let conditionalMinWidth = $state(0);
	let conditionalMinHeight = $state(0);
	let currentImageUpscaleEnabled = $state(false);
	let useCachedFirst = $state(true);
	let settingsInitialized = $state(false);

	// 预加载配置
	let preloadPages = $state(3);
	let backgroundConcurrency = $state(2);

	// 模型参数
	let selectedModel = $state('MODEL_WAIFU2X_CUNET_UP2X');
	let scale = $state(2);
	let tileSize = $state(64); // 默认 tile size
	let noiseLevel = $state(0);
	let gpuId = $state(0);

	// 可用模型列表
	let availableModels = $state<string[]>([]);
	
	// 模型选项映射 - 使用 sr_vulkan 实际的模型名称
	const modelLabels: Record<string, string> = {
		'MODEL_WAIFU2X_CUNET_UP2X': 'CUNet 2x (推荐)',
		'MODEL_WAIFU2X_PHOTO_UP2X': 'Photo 2x (照片)',
		'MODEL_WAIFU2X_ANIME_UP2X': 'Anime 2x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE3X': 'CUNet 1x + Denoise 3x',
		'MODEL_WAIFU2X_CUNET_UP2X_DENOISE3X': 'CUNet 2x + Denoise 3x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE3X': 'Photo 2x + Denoise 3x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE3X': 'Anime 2x + Denoise 3x',
		'MODEL_REALCUGAN_PRO_UP2X': 'Real-CUGAN Pro 2x',
		'MODEL_REALCUGAN_SE_UP2X': 'Real-CUGAN SE 2x',
		'MODEL_REALCUGAN_PRO_UP3X': 'Real-CUGAN Pro 3x',
		'MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X': 'Real-ESRGAN Anime 2x',
		'MODEL_REALESRGAN_X4PLUS_ANIME_UP4X': 'Real-ESRGAN 4x+ Anime',
		'MODEL_REALSR_DF2K_UP4X': 'Real-ESRGAN 4x DF2K',
		'MODEL_WAIFU2X_CUNET_UP1X': 'CUNet 1x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE1X': 'CUNet 1x + Denoise 1x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE2X': 'CUNet 1x + Denoise 2x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE0X': 'Anime 2x + Denoise 0x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X': 'Anime 2x + Denoise 1x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE2X': 'Anime 2x + Denoise 2x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE0X': 'Photo 2x + Denoise 0x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE1X': 'Photo 2x + Denoise 1x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE2X': 'Photo 2x + Denoise 2x',
		'MODEL_REALCUGAN_PRO_UP2X_DENOISE3X': 'Real-CUGAN Pro 2x + Denoise 3x',
		'MODEL_REALCUGAN_SE_UP2X_DENOISE1X': 'Real-CUGAN SE 2x + Denoise 1x',
		'MODEL_REALCUGAN_SE_UP2X_DENOISE2X': 'Real-CUGAN SE 2x + Denoise 2x',
		'MODEL_REALCUGAN_PRO_UP3X_DENOISE3X': 'Real-CUGAN Pro 3x + Denoise 3x',
		'MODEL_REALESRGAN_ANIMAVIDEOV3_UP3X': 'Real-ESRGAN Anime 3x',
		'MODEL_REALESRGAN_ANIMAVIDEOV3_UP4X': 'Real-ESRGAN Anime 4x',
		'MODEL_REALESRGAN_X4PLUS_ANIME_UP4X': 'Real-ESRGAN 4x+ Anime',
		'MODEL_REALSR_DF2K_UP4X': 'Real-ESRGAN 4x DF2K',
		'MODEL_WAIFU2X_ANIME_UP2X': 'Waifu2x Anime 2x',
		'MODEL_WAIFU2X_CUNET_UP1X': 'Waifu2x CUNet 1x',
		'MODEL_WAIFU2X_CUNET_UP2X': 'Waifu2x CUNet 2x',
		'MODEL_WAIFU2X_PHOTO_UP2X': 'Waifu2x Photo 2x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE0X': 'Waifu2x Anime 2x + Denoise 0x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X': 'Waifu2x Anime 2x + Denoise 1x',
		'MODEL_WAIFU2X_ANIME_UP2X_DENOISE2X': 'Waifu2x Anime 2x + Denoise 2x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE0X': 'Waifu2x CUNet 1x + Denoise 0x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE1X': 'Waifu2x CUNet 1x + Denoise 1x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE2X': 'Waifu2x CUNet 1x + Denoise 2x',
		'MODEL_WAIFU2X_CUNET_UP1X_DENOISE3X': 'Waifu2x CUNet 1x + Denoise 3x',
		'MODEL_WAIFU2X_CUNET_UP2X_DENOISE0X': 'Waifu2x CUNet 2x + Denoise 0x',
		'MODEL_WAIFU2X_CUNET_UP2X_DENOISE1X': 'Waifu2x CUNet 2x + Denoise 1x',
		'MODEL_WAIFU2X_CUNET_UP2X_DENOISE2X': 'Waifu2x CUNet 2x + Denoise 2x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE0X': 'Waifu2x Photo 2x + Denoise 0x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE1X': 'Waifu2x Photo 2x + Denoise 1x',
		'MODEL_WAIFU2X_PHOTO_UP2X_DENOISE2X': 'Waifu2x Photo 2x + Denoise 2x'
	};

	// 处理状态
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

	// 缓存统计
	let cacheStats = $state({
		totalFiles: 0,
		totalSize: 0,
		cacheDir: ''
	});

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
				if (autoUpscaleEnabled && !isProcessing) {
					console.log('🚀 自动超分已启用，执行超分...');
					performUpscale();
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
			persistUpscalePanelSettings(panelSettings);
			
			// 发送事件通知其他组件
			emitUpscaleSettings(panelSettings);
			
			if (autoUpscaleEnabled) {
				console.log('✅ 自动超分已启用');
			} else {
				console.log('❌ 自动超分已关闭');
			}
		}
	});

	// 创建事件分发器
	const dispatch = createEventDispatcher();

	function applyPanelSettings(settings: UpscalePanelSettings) {
		// 优先从 settingsManager 读取自动超分开关状态
		const globalSettings = settingsManager.getSettings();
		const globalEnabled = globalSettings.image.enableSuperResolution;
		const localEnabled = settings.autoUpscaleEnabled;
		
		console.log('🔧 applyPanelSettings:', {
			globalEnabled,
			localEnabled,
			final: globalEnabled ?? localEnabled
		});
		
		autoUpscaleEnabled = globalEnabled ?? localEnabled;
		
		preUpscaleEnabled = settings.preUpscaleEnabled;
		conditionalUpscaleEnabled = settings.conditions.enabled ?? settings.conditionalUpscaleEnabled;
		conditionalMinWidth = settings.conditionalMinWidth ?? settings.conditions.minWidth;
		conditionalMinHeight = settings.conditionalMinHeight ?? settings.conditions.minHeight;
		currentImageUpscaleEnabled = settings.currentImageUpscaleEnabled;
		useCachedFirst = settings.useCachedFirst;
		selectedModel = settings.selectedModel;
		scale = settings.scale;
		tileSize = settings.tileSize;
		noiseLevel = settings.noiseLevel;
		gpuId = settings.gpuId;
		preloadPages = settings.preloadPages;
		backgroundConcurrency = settings.backgroundConcurrency;
		
		// 同步预加载配置到 PreloadManager
		if (window.preloadManager) {
			window.preloadManager.updateImageLoaderConfig({
				preloadPages: settings.preloadPages,
				maxThreads: settings.backgroundConcurrency
			});
		}
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
			useCachedFirst,
			selectedModel,
			scale,
			tileSize,
			noiseLevel,
			gpuId,
			preloadPages,
			backgroundConcurrency,
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
			const cacheDir = 'D:/1VSCODE/Projects/ImageAll/NeeWaifu/neoview/neoview-tauri/cache/pyo3-upscale';
			
			console.log('🔧 初始化 PyO3 超分管理器...');
			console.log('  Python 模块路径:', pythonModulePath);
			console.log('  缓存目录:', cacheDir);
			
			await pyo3UpscaleManager.initialize(pythonModulePath, cacheDir);
			
			if (pyo3UpscaleManager.isAvailable()) {
				availableModels = pyo3UpscaleManager.getAvailableModels();
				console.log('✅ PyO3 超分功能可用');
				console.log('可用模型:', availableModels);
				
				// 更新缓存统计
				await updateCacheStats();
			} else {
				console.warn('⚠️ PyO3 超分功能不可用，请检查 sr_vulkan 模块');
				showErrorToast('sr_vulkan 模块不可用，请确保已安装: pip install sr_vulkan');
			}
		} catch (error) {
			console.error('❌ 初始化 PyO3 超分管理器失败:', error);
			showErrorToast('初始化超分功能失败: ' + (error instanceof Error ? error.message : String(error)));
		}
	});

	$effect(() => {
		if (!settingsInitialized) {
			return;
		}
		// $effect 会自动追踪其内部使用的响应式状态
		const settings = gatherPanelSettings();
		persistUpscalePanelSettings(settings);
		emitUpscaleSettings(settings);
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
		
		// 获取图片尺寸和大小
		try {
			// 这里可以调用 Tauri 命令获取图片信息
			// 暂时使用占位符
			currentImageResolution = '2560x3716';
			currentImageSize = '6.44mb';
		} catch (error) {
			console.error('获取图片信息失败:', error);
		}
	}

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
			showSuccessToast('模型设置已应用');
		} catch (error) {
			console.error('应用模型设置失败:', error);
			showErrorToast('应用设置失败');
		}
	}

	/**
	 * 处理开关设置变化
	 */
	function handleGlobalControlsChange() {
		console.log('🔄 处理开关设置变化');
		const settings = gatherPanelSettings();
		persistUpscalePanelSettings(settings);
		emitUpscaleSettings(settings);
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
				const { invoke } = await import('@tauri-apps/api/core');
				const data = await invoke<number[]>('read_upscale_cache_file', {
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
	 * 执行超分处理
	 */
	async function performUpscale() {
		if (!currentImagePath) {
			showErrorToast('没有选中的图片');
			return;
		}

		if (isProcessing) {
			showErrorToast('正在处理中，请稍候');
			return;
		}

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
			// 应用当前设置
			console.log('🔧 应用设置 - tileSize:', tileSize, 'selectedModel:', selectedModel, 'scale:', scale);
			await pyo3UpscaleManager.setModel(selectedModel, scale);
			pyo3UpscaleManager.setTileSize(tileSize);
			console.log('✅ 设置已应用到 PyO3UpscaleManager');

			// 从当前页面获取图像数据
			const currentPage = bookStore.currentPage;
			if (!currentPage) {
				throw new Error('没有当前图片');
			}

			// 首先检查缓存
			console.log('🔍 检查超分缓存...');
			const cachedResult = await checkUpscaleCache();
			
			let result: Uint8Array;
			
			if (cachedResult) {
				console.log('✅ 使用缓存数据，无需重新生成');
				result = cachedResult;
				progress = 100;
				status = '缓存命中';
				
				// 设置当前页面超分状态
				bookStore.setCurrentPageUpscaled(true);
				
				const processingTime = (Date.now() - startTime) / 1000;
				showSuccessToast(`使用缓存！耗时 ${processingTime.toFixed(1)}s`);
				
				// 直接创建 blob，用于传递给 ImageViewer 和显示
				const blob = new Blob([result as BlobPart], { type: 'image/webp' });
				upscaledImageUrl = URL.createObjectURL(blob);
				
				// 获取当前页面的 hash 和索引
				const imageHash = await getCurrentImageHash();
				const currentPageIndex = bookStore.currentPageIndex;
				
				// 触发事件通知 ImageViewer，传递 blob 数据
				dispatch('upscale-complete', {
					originalPath: currentImagePath,
					upscaledBlob: blob,
					upscaledData: result
				});
				
				// 同时触发全局 upscale-complete 事件（与 preloadRuntime.performUpscale 格式一致）
				window.dispatchEvent(new CustomEvent('upscale-complete', {
					detail: {
						imageData: upscaledImageUrl,
						imageBlob: blob,
						originalImageHash: imageHash,
						background: false,
						pageIndex: currentPageIndex
					}
				}));
				
				return; // 缓存命中，直接返回
			}

			// 获取图像数据 - 从 ImageViewer 的缓存中获取已加载的 blob
			const imageData = await getCurrentImageBlob();
			
			progress = 20;
			status = '初始化模型...';
			await new Promise(resolve => setTimeout(resolve, 500));

			// 执行超分 (内存流)
			status = '超分处理中...';
			progress = 30;
			
			// 通知 ImageViewer 开始超分（设置进度条闪烁）
			window.dispatchEvent(new CustomEvent('upscale-start'));
			
			result = await pyo3UpscaleManager.upscaleImageMemory(imageData, 120.0);
			
			progress = 90;
			status = '生成预览...';
			
			// 直接创建 blob，用于传递给 ImageViewer 和显示
			const blob = new Blob([result as BlobPart], { type: 'image/webp' });
			upscaledImageUrl = URL.createObjectURL(blob);
			
			progress = 100;
			status = '转换完成';
			
			const processingTime = (Date.now() - startTime) / 1000;
			showSuccessToast(`超分完成！耗时 ${processingTime.toFixed(1)}s`);
			
			// 设置当前页面超分状态
			bookStore.setCurrentPageUpscaled(true);
			
			// 异步保存超分结果到缓存
			try {
				const imageHash = await getCurrentImageHash();
				if (imageHash) {
					const currentPage = bookStore.currentPage;
					if (currentPage) {
						// 异步保存，不等待完成
						pyo3UpscaleManager.saveUpscaleCache(imageHash, result)
							.then(cachePath => {
								console.log('💾 超分结果已异步缓存:', cachePath);
								
								// 记录缓存关系到 BookStore
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
							.catch(error => {
								console.warn('异步保存缓存失败:', error);
							});
					}
				}
			} catch (error) {
				console.warn('获取图像 hash 失败，跳过缓存保存:', error);
			}

			// 获取当前页面的 hash 和索引
			const imageHash = await getCurrentImageHash();
			const currentPageIndex = bookStore.currentPageIndex;
			
			// 触发事件通知 ImageViewer，传递 blob 数据
			dispatch('upscale-complete', {
				originalPath: currentImagePath,
				upscaledBlob: blob,
				upscaledData: result
			});
			
			// 同时触发全局 upscale-complete 事件（与 preloadRuntime.performUpscale 格式一致）
			window.dispatchEvent(new CustomEvent('upscale-complete', {
				detail: {
					imageData: upscaledImageUrl,
					imageBlob: blob,
					originalImageHash: imageHash,
					background: false,
					pageIndex: currentPageIndex
				}
			}));
			
		} catch (err) {
			console.error('超分失败:', err);
			error = err instanceof Error ? err.message : String(err);
			status = '超分失败';
			showErrorToast('超分失败: ' + error);
		} finally {
			clearInterval(timer);
			isProcessing = false;
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
	 * 获取当前图像的 Hash (使用路径 + innerpath)
	 */
	async function getCurrentImageHash(): Promise<string | null> {
		try {
			const currentPage = bookStore.currentPage;
			if (!currentPage) {
				return null;
			}

			const hashInput = buildHashInput(currentPage.path, (currentPage as any).innerPath);
			const hash = await calculatePathHash(hashInput);
			return hash;
		} catch (error) {
			console.error('获取图像 hash 失败:', error);
			return null;
		}
	}

	/**
	 * 清理缓存
	 */
	async function cleanupCache() {
		try {
			const removed = await pyo3UpscaleManager.cleanupCache(30);
			await updateCacheStats();
			showSuccessToast(`已清理 ${removed} 个缓存文件`);
		} catch (error) {
			console.error('清理缓存失败:', error);
			showErrorToast('清理缓存失败');
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
		bind:useCachedFirst
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
		on:perform={performUpscale}
	/>

	<!-- 缓存管理 -->
	<UpscalePanelCacheSection
		cacheStats={cacheStats}
		formattedSize={formatFileSize(cacheStats.totalSize)}
		on:clear={cleanupCache}
	/>

	<!-- 预览区域 -->
	<UpscalePanelPreview upscaledImageUrl={upscaledImageUrl} />
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
