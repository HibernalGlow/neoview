<script lang="ts">
	/**
	 * Upscale Panel
	 * 超分面板 - 图片超分辨率处理设置
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { Slider } from '$lib/components/ui/slider';
	import { Switch } from '$lib/components/ui/switch';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Sparkles, Play, Settings, Loader2, CheckCircle, AlertCircle, Image as ImageIcon, Download, TestTube, List, FolderOpen } from '@lucide/svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { save } from '@tauri-apps/plugin-dialog';
	import { bookStore } from '$lib/stores/book.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
	import { upscaleSettings, upscaleState, currentAlgorithmSettings, preloadPages, conditionalUpscaleSettings, initUpscaleSettingsManager, loadUpscaleSettings, saveUpscaleSettings, resetUpscaleSettings, switchAlgorithm, updateCurrentAlgorithmSettings, performUpscale, setPreloadPages, updateConditionalUpscaleSettings, getGlobalUpscaleEnabled, setGlobalUpscaleEnabled, refreshCacheStatusForData, checkCacheMetaForData } from '$lib/stores/upscale/UpscaleManager.svelte';

	// 使用store订阅
	let isUpscaling = $state(false);
	let upscaleProgress = $state(0);
	let upscaleStatus = $state('');
	let showProgress = $state(false);
	let upscaledImageData = $state('');
	let upscaledImageBlob = $state(null);

// 缓存元数据（面板用来显示更详细的信息）
let cacheFound = $state(false);
let cacheAlgorithm = $state('');
let cachePath = $state('');
let cacheMeta: any = $state(null);
	
	// 当前算法和设置
	let activeTab = $state('realcugan');
	let currentSettings = $state({});
	
	// 订阅currentAlgorithmSettings
	let currentAlgorithmSettingsUnsubscribe: () => void;
	
	// 延迟订阅store，确保所有变量已初始化
	let upscaleStateUnsubscribe: () => void;
	let upscaleSettingsUnsubscribe: () => void;

	// 监听书籍当前图片变化用于实时刷新当前图片缓存状态
	let bookStoreUnsubscribe: () => void;
	
	onMount(async () => {
		// 检查是否有可用的超分工具
		await checkUpscaleAvailability();
		// 初始化通用超分管理器
		await initGenericUpscaleManager();
		// 初始化设置管理器（已在UpscaleManager中处理）
		// 扫描模型文件
		await scanModels();
		
		// 同步临时变量
		tempPreloadPages = currentPreloadPages;
		tempConditionalEnabled = conditionalEnabled;
		tempMinWidth = conditionalMinWidth;
		tempMinHeight = conditionalMinHeight;
		tempMaxWidth = conditionalMaxWidth;
		tempMaxHeight = conditionalMaxHeight;
		
		// 现在可以安全地订阅store
		upscaleStateUnsubscribe = upscaleState.subscribe(state => {
			isUpscaling = state.isUpscaling;
			upscaleProgress = state.progress;
			upscaleStatus = state.status;
			showProgress = state.showProgress;
			upscaledImageData = state.upscaledImageData;
			upscaledImageBlob = state.upscaledImageBlob;
		});
		
		currentAlgorithmSettingsUnsubscribe = currentAlgorithmSettings.subscribe(settings => {
			currentSettings = settings;
		});
		
		upscaleSettingsUnsubscribe = upscaleSettings.subscribe(settings => {
			activeTab = settings.active_algorithm;
			
			// 同步Real-CUGAN设置
			realcuganModel = settings.realcugan.model;
			realcuganScale = settings.realcugan.scale;
			realcuganNoiseLevel = settings.realcugan.noise_level;
			realcuganTileSize = settings.realcugan.tile_size;
			realcuganSyncgapMode = settings.realcugan.syncgap_mode;
			realcuganGpuId = settings.realcugan.gpu_id;
			realcuganThreads = settings.realcugan.threads;
			realcuganTta = settings.realcugan.tta;
			realcuganFormat = settings.realcugan.format;
			
			// 同步Real-ESRGAN设置
			realesrganModel = settings.realesrgan.model;
			realesrganScale = settings.realesrgan.scale;
			realesrganTileSize = settings.realesrgan.tile_size;
			realesrganGpuId = settings.realesrgan.gpu_id;
			realesrganThreads = settings.realesrgan.threads;
			realesrganTta = settings.realesrgan.tta;
			realesrganFormat = settings.realesrgan.format;
			
			// 同步Waifu2x设置
			waifu2xModel = settings.waifu2x.model;
			waifu2xNoiseLevel = settings.waifu2x.noise_level;
			waifu2xScale = settings.waifu2x.scale;
			waifu2xTileSize = settings.waifu2x.tile_size;
			waifu2xGpuId = settings.waifu2x.gpu_id;
			waifu2xThreads = settings.waifu2x.threads;
			
			// 同步条件超分设置
			conditionalEnabled = settings.conditional_upscale.enabled;
			conditionalMinWidth = settings.conditional_upscale.min_width;
			conditionalMinHeight = settings.conditional_upscale.min_height;
			conditionalMaxWidth = settings.conditional_upscale.max_width;
			conditionalMaxHeight = settings.conditional_upscale.max_height;
			
			// 同步预加载页数
			currentPreloadPages = settings.preload_pages;
			
			// 同步全局超分开关
			globalUpscaleEnabled = settings.global_upscale_enabled;
		});

	    // 订阅 bookStore 的变化，当当前图片索引或路径变化时刷新缓存状态（更精确，避免重复检查）
	    		let lastPageIndex: number | null = null;
	    		let lastImagePath: string | null = null;
	    		bookStoreUnsubscribe = bookStore.subscribe(bs => {
	    			try {
	    				const currentIndex = bs?.currentPageIndex ?? null;
	    				const currentPath = bs?.currentImage?.path ?? null;
	    				if (currentIndex !== lastPageIndex || currentPath !== lastImagePath) {
	    					lastPageIndex = currentIndex;
	    					lastImagePath = currentPath;
	    					if (bs && bs.currentImage) {
	    						// 请求 ImageViewer 返回图片 data（短时限）
	    						const imageDataPromise = new Promise<string>((resolve, reject) => {
	    							const timeout = setTimeout(() => reject(new Error('获取图片数据超时')), 1500);
	    							window.dispatchEvent(new CustomEvent('request-current-image-data', {
	    								detail: { callback: (data: string) => { clearTimeout(timeout); resolve(data); } }
	    							}));
	    						});
	    						imageDataPromise.then(data => {
	    							if (data) {
	    								// 使用轻量元数据检查来快速更新面板上的缓存信息
	    								checkCacheMetaForData(data).then(meta => {
	    									if (meta) {
	    										// 将信息写入局部展示变量（由 panel 中的绑定使用）
	    										cacheFound = true;
	    										cacheAlgorithm = meta.detected_algorithm || meta.algorithm || 'unknown';
	    										cachePath = meta.path || '';
	    										cacheMeta = meta;
	    									} else {
	    										cacheFound = false;
	    										cacheAlgorithm = '';
	    										cachePath = '';
	    										cacheMeta = null;
	    									}
	    								}).catch(err => console.warn('checkCacheMetaForData 失败:', err));
	    							}
	    						}).catch(err => { console.warn('获取当前图片数据失败:', err); });
	    					} else {
	    						// 没有当前图片
	    						cacheFound = false; cacheAlgorithm = ''; cachePath = ''; cacheMeta = null;
	    					}
	    				}
	    			} catch (e) {
	    				console.warn('bookStore 订阅处理失败:', e);
	    			}
	    		});
	});
	
	// 清理订阅
	onDestroy(() => {
		if (upscaleStateUnsubscribe) upscaleStateUnsubscribe();
		if (upscaleSettingsUnsubscribe) upscaleSettingsUnsubscribe();
		if (currentAlgorithmSettingsUnsubscribe) currentAlgorithmSettingsUnsubscribe();
		if (bookStoreUnsubscribe) bookStoreUnsubscribe();
	});
	
	// Real-CUGAN 设置
	let realcuganModel = $state('models-se');
	let realcuganScale = $state('2');
	let realcuganNoiseLevel = $state('-1');
	let realcuganTileSize = $state('0');
	let realcuganSyncgapMode = $state('3');
	let realcuganGpuId = $state('auto');
	let realcuganThreads = $state('1:2:2');
	let realcuganTta = $state(false);
	let realcuganFormat = $state('png');
	
	// Real-ESRGAN 设置
	let realesrganModel = $state('realesr-animevideov3');
	let realesrganScale = $state('4');
	let realesrganTileSize = $state('0');
	let realesrganGpuId = $state('auto');
	let realesrganThreads = $state('1:2:2');
	let realesrganTta = $state(false);
	let realesrganFormat = $state('png');
	
	// Waifu2x 设置
	let waifu2xModel = $state('models-cunet');
	let waifu2xNoiseLevel = $state('0');
	let waifu2xScale = $state('2');
	let waifu2xTileSize = $state('400');
	let waifu2xGpuId = $state('0');
	let waifu2xThreads = $state('1:2:2');
	
	// 模型选项
	let realcuganModelOptions = $state([
		{ value: 'models-se', label: 'models-se (默认)' },
		{ value: 'models-up2x', label: 'models-up2x' },
		{ value: 'models-up3x', label: 'models-up3x' },
		{ value: 'custom', label: '自定义模型路径' }
	]);
	
	let realesrganModelOptions = $state([
		{ value: 'realesr-animevideov3', label: 'realesr-animevideov3 (默认)' },
		{ value: 'realesrgan-x4plus', label: 'realesrgan-x4plus' },
		{ value: 'realesrgan-x4plus-anime', label: 'realesrgan-x4plus-anime' },
		{ value: 'realesrnet-x4plus', label: 'realesrnet-x4plus' },
		{ value: 'custom', label: '自定义模型路径' }
	]);
	
	let waifu2xModelOptions = $state([
		{ value: 'models-cunet', label: 'models-cunet (默认)' },
		{ value: 'models-upconv_7_anime_style_art_rgb', label: 'upconv_7_anime_style_art_rgb' },
		{ value: 'models-upconv_7_photo', label: 'upconv_7_photo' },
		{ value: 'custom', label: '自定义模型路径' }
	]);
	
	// 自定义模型路径
	let customModelPath = $state('');
	
	// 扫描到的模型列表
	let scannedModels = $state<string[]>([]);
	
	// 条件超分设置
	let conditionalEnabled = $state(false);
	let conditionalMinWidth = $state(0);
	let conditionalMinHeight = $state(0);
	let conditionalMaxWidth = $state(0);
	let conditionalMaxHeight = $state(0);
	
	// 预加载页数设置
	let currentPreloadPages = $state(3);
	let tempPreloadPages = $state(0);
	
	// 全局超分开关
	let globalUpscaleEnabled = $state(true);
	
	// 条件超分临时变量
	let tempConditionalEnabled = $state(false);
	let tempMinWidth = $state(0);
	let tempMinHeight = $state(0);
	let tempMaxWidth = $state(0);
	let tempMaxHeight = $state(0);
	
	// 计算全局样式
	const globalStyle = $derived(() => ({
		opacity: globalUpscaleEnabled ? 1 : 0.5
	}));

	

	// 超分参数（已废弃，使用新的变量）
	// let upscaleModel = $state('general'); // general | digital
	// let upscaleFactor = $state('4'); // 2 | 3 | 4
	// let gpuId = $state('0');
	// let tileSize = $state('0'); // 0 = auto
	// let tta = $state(false); // Test Time Augmentation

	// 旧的模型选项（已废弃）
	// const modelOptions = [
	// 	{ value: 'general', label: '通用模型 (General)' },
	// 	{ value: 'digital', label: '动漫模型 (Digital/Anime)' }
	// ];

	// 旧的倍数选项（已废弃）
	// const factorOptions = [
	// 	{ value: '2', label: '2x' },
	// 	{ value: '3', label: '3x' },
	// 	{ value: '4', label: '4x' }
	// ];

	onMount(async () => {
		// 检查是否有可用的超分工具
		await checkUpscaleAvailability();
		// 初始化通用超分管理器
		await initGenericUpscaleManager();
		// 初始化设置管理器（已在UpscaleManager中处理）
		// 扫描模型文件
		await scanModels();
		
		// 同步临时变量
		tempPreloadPages = currentPreloadPages;
		tempConditionalEnabled = conditionalEnabled;
		tempMinWidth = conditionalMinWidth;
		tempMinHeight = conditionalMinHeight;
		tempMaxWidth = conditionalMaxWidth;
		tempMaxHeight = conditionalMaxHeight;
	});

	async function checkUpscaleAvailability() {
		try {
			await invoke('check_upscale_availability');
		} catch (error) {
			console.error('超分工具不可用:', error);
			upscaleStatus = '超分工具未安装或不可用';
		}
	}

	async function initGenericUpscaleManager() {
		try {
			// 使用固定的缩略图路径
			const thumbnailPath = 'D:\\temp\\neoview_thumbnails_test';
			
			await invoke('init_generic_upscale_manager', {
				thumbnailPath
			});
			
			console.log('通用超分管理器初始化完成');
		} catch (error) {
			console.error('初始化通用超分管理器失败:', error);
		}
	}

	async function initSettingsManager() {
		try {
			// 初始化设置管理器
			await invoke('init_upscale_settings_manager');
			
			// 加载保存的设置
			const settings = await invoke('get_upscale_settings');
			console.log('加载设置:', settings);
			
			// 应用设置到各个算法
			if (settings.realcugan) {
				Object.assign({ realcuganModel, realcuganScale, realcuganNoiseLevel, realcuganTileSize, 
					realcuganSyncgapMode, realcuganGpuId, realcuganThreads, realcuganTta, realcuganFormat }, settings.realcugan);
			}
			if (settings.realesrgan) {
				Object.assign({ realesrganModel, realesrganScale, realesrganTileSize, realesrganGpuId, 
					realesrganThreads, realesrganTta, realesrganFormat }, settings.realesrgan);
			}
			if (settings.waifu2x) {
				Object.assign({ waifu2xModel, waifu2xNoiseLevel, waifu2xScale, waifu2xTileSize, 
					waifu2xGpuId, waifu2xThreads }, settings.waifu2x);
			}
			
			// 扫描模型文件
			await scanModels();
		} catch (error) {
			console.error('初始化设置管理器失败:', error);
		}
	}

	async function scanModels() {
		try {
			console.log('开始扫描模型文件...');
			const models = await invoke('scan_models_directory');
			console.log('扫描到的模型:', models);
			
			// 更新模型选项 - 只显示扫描到的模型
			if (models && models.length > 0) {
				modelOptions = models.map(model => ({
					value: model,
					label: model
				}));
				console.log('模型选项已更新，共', modelOptions.length, '个模型');
			} else {
				// 没有扫描到模型时，保持现有选项不变
				console.log('未扫描到模型，保持现有选项');
			}
		} catch (error) {
			console.error('扫描模型失败:', error);
			// 扫描失败时，保持现有选项不变
			console.log('扫描失败，保持现有选项');
		}
	}

	// 保存设置
	async function saveSettings() {
		try {
			await saveUpscaleSettings();
			console.log('设置已保存');
		} catch (error) {
			console.error('保存设置失败:', error);
		}
	}

	// 根据当前算法更新模型选项
	async function updateModelsForAlgorithm() {
		// 仅重新扫描模型，不提供默认选项
		await scanModels();
	}

	// 重置设置
	async function resetSettings() {
		try {
			await resetUpscaleSettings();
			console.log('设置已重置为默认值');
		} catch (error) {
			console.error('重置设置失败:', error);
		}
	}

	// 构建命令行参数
	function buildCommand(algorithm: string) {
		let command = '';
		let inputPath = 'temp_input.png';
		let outputPath = 'temp_output.webp';
		
		switch (algorithm) {
			case 'realcugan':
				command = 'realcugan-ncnn-vulkan.exe';
				command += ` -i ${inputPath}`;
				command += ` -o ${outputPath}`;
				command += ` -n ${realcuganNoiseLevel}`;
				command += ` -s ${realcuganScale}`;
				command += ` -t ${realcuganTileSize}`;
				command += ` -c ${realcuganSyncgapMode}`;
				command += ` -m ${realcuganModel === 'custom' ? customModelPath : realcuganModel}`;
				command += ` -g ${realcuganGpuId}`;
				command += ` -j ${realcuganThreads}`;
				if (realcuganTta) command += ` -x`;
				command += ` -f ${realcuganFormat}`;
				break;
				
			case 'realesrgan':
				command = 'realesrgan-ncnn-vulkan.exe';
				command += ` -i ${inputPath}`;
				command += ` -o ${outputPath}`;
				command += ` -s ${realesrganScale}`;
				command += ` -t ${realesrganTileSize}`;
				command += ` -m ${realesrganModel === 'custom' ? customModelPath : 'models'}`;
				command += ` -n ${realesrganModel}`;
				command += ` -g ${realesrganGpuId}`;
				command += ` -j ${realesrganThreads}`;
				if (realesrganTta) command += ` -x`;
				command += ` -f ${realesrganFormat}`;
				break;
				
			case 'waifu2x':
				command = 'waifu2x-ncnn-vulkan.exe';
				command += ` -i ${inputPath}`;
				command += ` -o ${outputPath}`;
				command += ` -n ${waifu2xNoiseLevel}`;
				command += ` -s ${waifu2xScale}`;
				command += ` -t ${waifu2xTileSize}`;
				command += ` -m ${waifu2xModel === 'custom' ? customModelPath : waifu2xModel}`;
				command += ` -g ${waifu2xGpuId}`;
				command += ` -j ${waifu2xThreads}`;
				break;
		}
		
		return command;
	}

	

	async function startUpscale() {
		if (!bookStore.currentImage) {
			upscaleStatus = '没有当前图片';
			return;
		}
		
		// 检查全局开关
		if (!globalUpscaleEnabled) {
			upscaleStatus = '全局超分开关已关闭';
			showErrorToast('超分已禁用', '请先开启全局超分开关');
			return;
		}

		try {
			// 从全局事件获取当前图片数据
			let imageData: string | null = null;
			
			// 使用Promise包装回调
			const imageDataPromise = new Promise<string>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('获取图片数据超时'));
				}, 2000);
				
				console.log('UpscalePanel: 发送图片数据请求');
				// 触发事件获取当前图片数据
				window.dispatchEvent(new CustomEvent('request-current-image-data', {
					detail: { 
						callback: (data: string) => {
							console.log('UpscalePanel: 收到图片数据回调');
							clearTimeout(timeout);
							resolve(data);
						}
					}
				}));
			});
			
			imageData = await imageDataPromise;
			
			console.log('获取到图片数据，长度:', imageData.length);
			
			// 检查是否是blob URL，如果是则转换为data URL
			if (imageData.startsWith('blob:')) {
				console.log('检测到blob URL，正在转换为data URL...');
				const response = await fetch(imageData);
				const blob = await response.blob();
				
				// 转换为base64
				const reader = new FileReader();
				imageData = await new Promise<string>((resolve, reject) => {
					reader.onload = () => {
						const result = reader.result as string;
						resolve(result);
					};
					reader.onerror = reject;
					reader.readAsDataURL(blob);
				});
				console.log('转换后的data URL长度:', imageData.length);
			}
			
			// 检查图片格式
			const isAvif = imageData.startsWith('data:image/avif');
			const isJxl = imageData.startsWith('data:image/jxl');
			
			// 对于AVIF和JXL，先转换为WebP
			if (isAvif || isJxl) {
				upscaleStatus = `转换${isAvif ? 'AVIF' : 'JXL'}为WebP...`;
				imageData = await invoke<string>('convert_data_url_to_webp', {
					dataUrl: imageData
				});
				console.log('转换后的WebP数据长度:', imageData.length);
			}
			
			// 使用新的超分管理器执行超分
			await performUpscale(imageData);

		} catch (error) {
			console.error('超分失败:', error);
			upscaleStatus = `超分失败: ${error}`;
			isUpscaling = false;
			
			// 显示错误提示
			showErrorToast('超分失败', String(error));
		}
	}

	

	function resetOldSettings() {
		upscaleModel = 'general';
		upscaleFactor = '4';
		gpuId = '0';
		tileSize = '0';
		tta = false;
	}

	async function saveUpscaledImage() {
		if (!upscaledImageBlob) {
			upscaleStatus = '没有超分结果可保存';
			return;
		}

		try {
			// 生成默认文件名
			const originalName = bookStore.currentImage?.name || 'image';
			const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
			
			// 获取当前算法的放大倍数
			const currentScale = activeTab === 'realcugan' ? realcuganScale : 
								 activeTab === 'realesrgan' ? realesrganScale : waifu2xScale;
			const defaultFileName = `${nameWithoutExt}_upscaled_${currentScale}x.webp`;

			// 使用文件保存对话框
			const filePath = await save({
				filters: [{
					name: 'WebP Image',
					extensions: ['webp']
				}],
				defaultPath: defaultFileName
			});

			if (filePath) {
				// 直接使用超分后的二进制数据
				const arrayBuffer = await upscaledImageBlob.arrayBuffer();
				
				// 使用后端命令保存文件
				await invoke('save_binary_file', {
					filePath,
					data: Array.from(new Uint8Array(arrayBuffer))
				});

				upscaleStatus = '图片已保存';
			}
		} catch (error) {
			console.error('保存失败:', error);
			upscaleStatus = `保存失败: ${error}`;
		}
	}
</script>

<div class="h-full flex flex-col bg-background p-4 space-y-4">
	<!-- 头部 -->
	<div class="flex items-center gap-2 pb-2 border-b">
		<Sparkles class="h-5 w-5 text-primary" />
		<h3 class="text-lg font-semibold">图片超分</h3>
	</div>
	
	<!-- 全局超分开关 -->
	<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
		<div class="flex items-center gap-2">
			<Switch 
				bind:checked={globalUpscaleEnabled}
				onchange={async () => {
					await setGlobalUpscaleEnabled(globalUpscaleEnabled);
					showSuccessToast(
						globalUpscaleEnabled ? '超分已启用' : '超分已禁用',
						globalUpscaleEnabled ? '自动超分功能已开启' : '自动超分功能已关闭'
					);
				}}
			/>
			<Label class="text-sm font-medium">全局超分开关</Label>
		</div>
		<span class="text-xs text-muted-foreground">
			{globalUpscaleEnabled ? '已启用自动超分' : '已禁用自动超分'}
		</span>
	</div>

	<!-- Tab 切换 -->
	<div class="flex gap-1 p-1 bg-muted rounded-lg">
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'realcugan' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchAlgorithm('realcugan')}
		>
			Real-CUGAN
		</button>
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'realesrgan' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchAlgorithm('realesrgan')}
		>
			Real-ESRGAN
		</button>
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'waifu2x' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => switchAlgorithm('waifu2x')}
		>
			Waifu2x
		</button>
	</div>
	
	<!-- 全局设置 -->
	<div class="space-y-3" style={globalStyle}>
		<div class="flex items-center justify-between">
			<Label class="text-sm font-medium">预加载页数</Label>
			<input
				type="number"
				bind:value={tempPreloadPages}
				class="w-16 h-8 px-2 text-sm border rounded-md text-center"
				min="0"
				max="10"
				disabled={!globalUpscaleEnabled}
			/>
		</div>
		<Button
			variant="outline"
			size="sm"
			class="w-full"
			disabled={!globalUpscaleEnabled}
			onclick={async () => {
				await setPreloadPages(tempPreloadPages);
				showSuccessToast('设置已保存', `预加载页数已更新为 ${tempPreloadPages}`);
			}}
		>
			保存预加载设置
		</Button>
		
		<div class="border-t pt-3" style={globalStyle}>
			<div class="flex items-center justify-between mb-2">
				<Label class="text-sm font-medium">条件超分</Label>
				<Switch bind:checked={tempConditionalEnabled} disabled={!globalUpscaleEnabled} />
			</div>
			
			{#if tempConditionalEnabled}
				<div class="space-y-2 p-2 bg-muted rounded-md" style={globalStyle}>
					<!-- 最小尺寸 -->
					<div class="grid grid-cols-2 gap-2">
						<div>
							<Label class="text-xs text-muted-foreground">最小宽度</Label>
							<input
								type="number"
								bind:value={tempMinWidth}
								class="w-full h-8 px-2 text-sm border rounded-md"
								placeholder="0"
								min="0"
								disabled={!globalUpscaleEnabled}
							/>
						</div>
						<div>
							<Label class="text-xs text-muted-foreground">最小高度</Label>
							<input
								type="number"
								bind:value={tempMinHeight}
								class="w-full h-8 px-2 text-sm border rounded-md"
								placeholder="0"
								min="0"
								disabled={!globalUpscaleEnabled}
							/>
						</div>
					</div>
					
					<!-- 最大尺寸 -->
					<div class="grid grid-cols-2 gap-2">
						<div>
							<Label class="text-xs text-muted-foreground">最大宽度 (0=无限制)</Label>
							<input
								type="number"
								bind:value={tempMaxWidth}
								class="w-full h-8 px-2 text-sm border rounded-md"
								placeholder="0"
								min="0"
								disabled={!globalUpscaleEnabled}
							/>
						</div>
						<div>
							<Label class="text-xs text-muted-foreground">最大高度 (0=无限制)</Label>
							<input
								type="number"
								bind:value={tempMaxHeight}
								class="w-full h-8 px-2 text-sm border rounded-md"
								placeholder="0"
								min="0"
								disabled={!globalUpscaleEnabled}
							/>
						</div>
					</div>
					
					<Button
						variant="outline"
						size="sm"
						class="w-full"
						disabled={!globalUpscaleEnabled}
						onclick={async () => {
							const conditionalSettings = {
								enabled: tempConditionalEnabled,
								min_width: tempMinWidth,
								min_height: tempMinHeight,
								max_width: tempMaxWidth,
								max_height: tempMaxHeight,
								aspect_ratio_condition: null
							};
							await updateConditionalUpscaleSettings(conditionalSettings);
							showSuccessToast('设置已保存', '条件超分设置已更新');
						}}
					>
						保存条件设置
					</Button>
				</div>
			{/if}
		</div>
	</div>

	<!-- 当前图片信息 -->
	<div class="flex items-center gap-2 p-2 bg-muted rounded-md">
		<ImageIcon class="h-4 w-4 text-muted-foreground" />
		<span class="text-sm text-muted-foreground truncate">
			{#if bookStore.currentImage}
				{bookStore.currentImage.name}
			{:else}
				没有当前图片
			{/if}
		</span>
	</div>

	<!-- 缓存元信息（快速显示 / 手动刷新 / 立即超分） -->
	<div class="flex flex-col gap-2 p-2 bg-muted rounded-md">
		<div class="flex items-center justify-between">
			<div class="text-sm">
				{#if cacheFound}
					<span class="text-success">缓存已找到</span>
					<span class="text-muted-foreground ml-2 text-xs">({cacheAlgorithm})</span>
				{:else}
					<span class="text-muted-foreground">未找到缓存</span>
				{/if}
			</div>
			<div class="flex gap-2">
				<button class="btn btn-sm" onclick={async () => {
					// 手动刷新：请求当前 ImageViewer 的图片数据并检查元数据
					try {
						const data = await new Promise<string>((resolve, reject) => {
							const timeout = setTimeout(() => reject(new Error('获取图片数据超时')), 2000);
							window.dispatchEvent(new CustomEvent('request-current-image-data', { detail: { callback: (d: string) => { clearTimeout(timeout); resolve(d); } } }));
						});
						const meta = await checkCacheMetaForData(data);
						if (meta) {
							cacheFound = true; cacheAlgorithm = meta.detected_algorithm || meta.algorithm || 'unknown'; cachePath = meta.path || ''; cacheMeta = meta;
						} else {
							cacheFound = false; cacheAlgorithm = ''; cachePath = ''; cacheMeta = null;
						}
					} catch (e) {
						console.warn('手动刷新缓存失败:', e);
					}
				}}>手动刷新</button>
				<button class="btn btn-primary btn-sm" disabled={isUpscaling || !bookStore.currentImage || !globalUpscaleEnabled} onclick={() => startUpscale()}>立即超分</button>
			</div>
		</div>
		{#if cachePath}
			<div class="text-xs text-muted-foreground truncate" title={cachePath}>缓存路径: {cachePath}</div>
		{/if}
	</div>

	<!-- Tab 内容 -->
	{#if activeTab === 'realcugan'}
		<!-- Real-CUGAN Tab 内容 -->
		<div class="space-y-3" style={globalStyle}>
			<!-- 模型选择 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">模型路径</Label>
				<NativeSelect 
					value={realcuganModel}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ model: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					{#each realcuganModelOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if realcuganModel === 'custom'}
					<input
						type="text"
						bind:value={customModelPath}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="输入自定义模型路径"
					/>
				{/if}
			</div>

			<!-- 放大倍数 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">放大倍数</Label>
				<NativeSelect 
					value={realcuganScale}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ scale: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					<option value="1">1x</option>
					<option value="2">2x</option>
					<option value="3">3x</option>
					<option value="4">4x</option>
				</NativeSelect>
			</div>

			<!-- 噪声等级 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">噪声等级</Label>
				<NativeSelect 
					value={realcuganNoiseLevel}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ noise_level: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					<option value="-1">无效果 (-1)</option>
					<option value="0">0</option>
					<option value="1">1</option>
					<option value="2">2</option>
					<option value="3">3</option>
				</NativeSelect>
			</div>

			<!-- 高级设置 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">高级设置</Label>
				
				<!-- Tile Size -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Tile Size (0=自动)</Label>
					<input
						type="number"
						value={realcuganTileSize}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ tile_size: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="0"
						min="0"
					/>
				</div>

				<!-- Sync Gap Mode -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Sync Gap Mode</Label>
					<NativeSelect 
						value={realcuganSyncgapMode}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ syncgap_mode: e.target.value });
							saveSettings();
						}}
						class="w-full z-[60]"
					>
						<option value="0">0 - 无同步</option>
						<option value="1">1 - 精确同步</option>
						<option value="2">2 - 粗略同步</option>
						<option value="3">3 - 非常粗略同步</option>
					</NativeSelect>
				</div>

				<!-- GPU ID -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">GPU ID</Label>
					<input
						type="text"
						value={realcuganGpuId}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ gpu_id: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="auto"
					/>
				</div>

				<!-- 线程数 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">线程数 (load:proc:save)</Label>
					<input
						type="text"
						value={realcuganThreads}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ threads: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="1:2:2"
					/>
				</div>

				<!-- TTA -->
				<div class="flex items-center justify-between">
					<Label class="text-xs text-muted-foreground">TTA 模式</Label>
					<Switch 
						checked={realcuganTta}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ tta: e.target.checked });
							saveSettings();
						}} 
					/>
				</div>

				<!-- 输出格式 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">输出格式</Label>
					<NativeSelect 
						value={realcuganFormat}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ format: e.target.value });
							saveSettings();
						}}
						class="w-full z-[60]"
					>
						<option value="jpg">JPG</option>
						<option value="png">PNG</option>
						<option value="webp">WebP</option>
					</NativeSelect>
				</div>
			</div>

			<!-- 命令行预览 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">命令行预览</Label>
				<div class="p-2 bg-muted rounded-md">
					<code class="text-xs break-all">{buildCommand('realcugan')}</code>
				</div>
			</div>
		</div>
	{:else if activeTab === 'realesrgan'}
		<!-- Real-ESRGAN Tab 内容 -->
		<div class="space-y-3" style={globalStyle}>
			<!-- 模型选择 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">模型名称</Label>
				<NativeSelect 
					value={realesrganModel}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ model: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					{#each realesrganModelOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if realesrganModel === 'custom'}
					<input
						type="text"
						bind:value={customModelPath}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="输入自定义模型路径"
					/>
				{/if}
			</div>

			<!-- 放大倍数 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">放大倍数</Label>
				<NativeSelect 
					value={realesrganScale}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ scale: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					<option value="2">2x</option>
					<option value="3">3x</option>
					<option value="4">4x</option>
				</NativeSelect>
			</div>

			<!-- 高级设置 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">高级设置</Label>
				
				<!-- Tile Size -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Tile Size (0=自动)</Label>
					<input
						type="number"
						value={realesrganTileSize}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ tile_size: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="0"
						min="0"
					/>
				</div>

				<!-- GPU ID -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">GPU ID</Label>
					<input
						type="text"
						value={realesrganGpuId}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ gpu_id: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="auto"
					/>
				</div>

				<!-- 线程数 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">线程数 (load:proc:save)</Label>
					<input
						type="text"
						value={realesrganThreads}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ threads: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="1:2:2"
					/>
				</div>

				<!-- TTA -->
				<div class="flex items-center justify-between">
					<Label class="text-xs text-muted-foreground">TTA 模式</Label>
					<Switch 
						checked={realesrganTta}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ tta: e.target.checked });
							saveSettings();
						}} 
					/>
				</div>

				<!-- 输出格式 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">输出格式</Label>
					<NativeSelect 
						value={realesrganFormat}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ format: e.target.value });
							saveSettings();
						}}
						class="w-full z-[60]"
					>
						<option value="jpg">JPG</option>
						<option value="png">PNG</option>
						<option value="webp">WebP</option>
					</NativeSelect>
				</div>
			</div>

			<!-- 命令行预览 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">命令行预览</Label>
				<div class="p-2 bg-muted rounded-md">
					<code class="text-xs break-all">{buildCommand('realesrgan')}</code>
				</div>
			</div>
		</div>
	{:else if activeTab === 'waifu2x'}
		<!-- Waifu2x Tab 内容 -->
		<div class="space-y-3" style={globalStyle}>
			<!-- 模型选择 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">模型路径</Label>
				<NativeSelect 
					value={waifu2xModel}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ model: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					{#each waifu2xModelOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
				</NativeSelect>
				{#if waifu2xModel === 'custom'}
					<input
						type="text"
						bind:value={customModelPath}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="输入自定义模型路径"
					/>
				{/if}
			</div>

			<!-- 噪声等级 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">噪声等级</Label>
				<NativeSelect 
					value={waifu2xNoiseLevel}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ noise_level: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					<option value="-1">无效果 (-1)</option>
					<option value="0">0</option>
					<option value="1">1</option>
					<option value="2">2</option>
					<option value="3">3</option>
				</NativeSelect>
			</div>

			<!-- 放大倍数 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">放大倍数</Label>
				<NativeSelect 
					value={waifu2xScale}
					onchange={(e) => {
						updateCurrentAlgorithmSettings({ scale: e.target.value });
						saveSettings();
					}}
					class="w-full z-[60]"
				>
					<option value="1">1x (无缩放)</option>
					<option value="2">2x</option>
				</NativeSelect>
			</div>

			<!-- 高级设置 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">高级设置</Label>
				
				<!-- Tile Size -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Tile Size</Label>
					<input
						type="number"
						value={waifu2xTileSize}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ tile_size: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="400"
						min="32"
					/>
				</div>

				<!-- GPU ID -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">GPU ID</Label>
					<input
						type="number"
						value={waifu2xGpuId}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ gpu_id: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="0"
						min="0"
					/>
				</div>

				<!-- 线程数 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">线程数 (load:proc:save)</Label>
					<input
						type="text"
						value={waifu2xThreads}
						onchange={(e) => {
							updateCurrentAlgorithmSettings({ threads: e.target.value });
							saveSettings();
						}}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="1:2:2"
					/>
				</div>
			</div>

			<!-- 命令行预览 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">命令行预览</Label>
				<div class="p-2 bg-muted rounded-md">
					<code class="text-xs break-all">{buildCommand('waifu2x')}</code>
				</div>
			</div>
		</div>
	{/if}

	<!-- 操作按钮 -->
	<div class="flex gap-2 pt-2">
		<Button
			variant="outline"
			size="sm"
			class="flex-1"
			onclick={resetSettings}
			disabled={isUpscaling || !globalUpscaleEnabled}
		>
			重置设置
		</Button>
		<Button
			variant="default"
			size="sm"
			class="flex-1"
			onclick={startUpscale}
			disabled={isUpscaling || !bookStore.currentImage || !globalUpscaleEnabled}
		>
			{#if isUpscaling}
				<Loader2 class="h-4 w-4 mr-1 animate-spin" />
				处理中...
			{:else}
				<Play class="h-4 w-4 mr-1" />
				开始超分
			{/if}
		</Button>
	</div>

	<!-- 进度条 -->
	{#if showProgress}
		<div class="space-y-2">
			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<span>{upscaleStatus}</span>
				<span>{upscaleProgress}%</span>
			</div>
			<Progress value={upscaleProgress} class="h-2" />
		</div>
	{/if}

	<!-- 超分结果预览 -->
	{#if upscaledImageData}
		<div class="space-y-2">
			<Label class="text-sm font-medium flex items-center gap-1">
				<CheckCircle class="h-4 w-4 text-green-500" />
				超分结果
			</Label>
			<div class="border rounded-md overflow-hidden">
				<img
					src={upscaledImageData}
					alt="Upscaled image"
					class="w-full h-auto max-h-48 object-contain bg-muted"
				/>
			</div>
			<!-- 保存按钮 -->
			<Button
				variant="outline"
				size="sm"
				class="w-full"
				onclick={saveUpscaledImage}
			>
				<Download class="h-4 w-4 mr-1" />
				保存图片
			</Button>
		</div>
	{/if}

	<!-- 错误信息 -->
	{#if upscaleStatus && upscaleStatus.includes('失败')}
		<div class="flex items-center gap-2 text-sm text-destructive">
			<AlertCircle class="h-4 w-4" />
			<span>{upscaleStatus}</span>
		</div>
	{/if}
</div>