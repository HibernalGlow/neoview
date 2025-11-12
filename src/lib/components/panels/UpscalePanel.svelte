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
	import { onMount } from 'svelte';

	// 超分状态
	let isUpscaling = $state(false);
	let upscaleProgress = $state(0);
	let upscaleStatus = $state('');
	let showProgress = $state(false);
	let upscaledImageData = $state(''); // 保持兼容性，用于预览
	let upscaledImageBlob = $state<Blob | null>(null); // 新增：存储二进制数据

	// Tab切换状态
	let activeTab = $state('realcugan'); // 'realcugan' | 'realesrgan' | 'waifu2x'
	
	// Real-CUGAN 参数
	let realcuganModel = $state('models-se');
	let realcuganScale = $state('2');
	let realcuganNoiseLevel = $state('-1');
	let realcuganTileSize = $state('0');
	let realcuganSyncgapMode = $state('3');
	let realcuganGpuId = $state('auto');
	let realcuganThreads = $state('1:2:2');
	let realcuganTta = $state(false);
	let realcuganFormat = $state('png');
	
	// Real-ESRGAN 参数
	let realesrganModel = $state('realesr-animevideov3');
	let realesrganScale = $state('4');
	let realesrganTileSize = $state('0');
	let realesrganGpuId = $state('auto');
	let realesrganThreads = $state('1:2:2');
	let realesrganTta = $state(false);
	let realesrganFormat = $state('png');
	
	// Waifu2x 参数
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
		checkUpscaleAvailability();
		// 初始化通用超分管理器
		await initGenericUpscaleManager();
		// 初始化设置管理器
		await initSettingsManager();
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
			const settings = {
				realcugan: {
					model: realcuganModel,
					scale: realcuganScale,
					noiseLevel: realcuganNoiseLevel,
					tileSize: realcuganTileSize,
					syncgapMode: realcuganSyncgapMode,
					gpuId: realcuganGpuId,
					threads: realcuganThreads,
					tta: realcuganTta,
					format: realcuganFormat
				},
				realesrgan: {
					model: realesrganModel,
					scale: realesrganScale,
					tileSize: realesrganTileSize,
					gpuId: realesrganGpuId,
					threads: realesrganThreads,
					tta: realesrganTta,
					format: realesrganFormat
				},
				waifu2x: {
					model: waifu2xModel,
					noiseLevel: waifu2xNoiseLevel,
					scale: waifu2xScale,
					tileSize: waifu2xTileSize,
					gpuId: waifu2xGpuId,
					threads: waifu2xThreads
				}
			};
			
			await invoke('save_upscale_settings', { settings });
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
			// 重置所有算法为默认值
			realcuganModel = 'models-se';
			realcuganScale = '2';
			realcuganNoiseLevel = '-1';
			realcuganTileSize = '0';
			realcuganSyncgapMode = '3';
			realcuganGpuId = 'auto';
			realcuganThreads = '1:2:2';
			realcuganTta = false;
			realcuganFormat = 'png';
			
			realesrganModel = 'realesr-animevideov3';
			realesrganScale = '4';
			realesrganTileSize = '0';
			realesrganGpuId = 'auto';
			realesrganThreads = '1:2:2';
			realesrganTta = false;
			realesrganFormat = 'png';
			
			waifu2xModel = 'models-cunet';
			waifu2xNoiseLevel = '0';
			waifu2xScale = '2';
			waifu2xTileSize = '400';
			waifu2xGpuId = '0';
			waifu2xThreads = '1:2:2';
			
			await saveSettings();
			console.log('设置已重置为默认值');
		} catch (error) {
			console.error('重置设置失败:', error);
		}
	}

	// 构建命令行参数
	function buildCommand(algorithm: string) {
		let command = '';
		
		switch (algorithm) {
			case 'realcugan':
				command = 'realcugan-ncnn-vulkan.exe';
				command += ` -i input.jpg`;
				command += ` -o output.png`;
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
				command += ` -i input.jpg`;
				command += ` -o output.png`;
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
				command += ` -i input.jpg`;
				command += ` -o output.png`;
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

		isUpscaling = true;
		showProgress = true;
		upscaleProgress = 0;
		upscaleStatus = '准备超分...';
		upscaledImageData = '';

		try {
			// 从全局事件获取当前图片数据
			let imageData: string | null = null;
			
			// 触发事件获取当前图片数据
			window.dispatchEvent(new CustomEvent('request-current-image-data', {
				detail: { callback: (data: string) => imageData = data }
			}));
			
			// 等待图片数据
			let attempts = 0;
			while (!imageData && attempts < 10) {
				await new Promise(resolve => setTimeout(resolve, 100));
				attempts++;
			}
			
			if (!imageData) {
				throw new Error('无法获取当前图片数据');
			}
			
			console.log('获取到图片数据，长度:', imageData.length);
			
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
			
			// 生成文件标识符（使用图片数据的hash）
			const imageHash = await invoke<string>('calculate_data_hash', {
				dataUrl: imageData
			});
			
			// 生成保存路径
			const savePath = await invoke<string>('get_upscale_save_path_from_data', {
				imageHash,
				algorithm: activeTab,
				model: activeTab === 'realcugan' ? realcuganModel : 
					   activeTab === 'realesrgan' ? realesrganModel : waifu2xModel,
				gpuId: activeTab === 'realcugan' ? realcuganGpuId : 
					   activeTab === 'realesrgan' ? realesrganGpuId : waifu2xGpuId,
				tileSize: activeTab === 'realcugan' ? realcuganTileSize : 
						  activeTab === 'realesrgan' ? realesrganTileSize : waifu2xTileSize,
				tta: activeTab === 'realcugan' ? realcuganTta : 
					 activeTab === 'realesrgan' ? realesrganTta : false,
				noiseLevel: activeTab === 'realcugan' ? realcuganNoiseLevel : 
							activeTab === 'realesrgan' ? '0' : waifu2xNoiseLevel,
				numThreads: activeTab === 'realcugan' ? realcuganThreads : 
							activeTab === 'realesrgan' ? realesrganThreads : waifu2xThreads
			});

			console.log('超分保存路径:', savePath);

			// 开始超分
			upscaleStatus = '执行超分处理...';
			const result = await invoke<number[]>('upscale_image_from_data', {
				imageData,
				savePath,
				algorithm: activeTab,
				model: activeTab === 'realcugan' ? realcuganModel : 
					   activeTab === 'realesrgan' ? realesrganModel : waifu2xModel,
				gpuId: activeTab === 'realcugan' ? realcuganGpuId : 
					   activeTab === 'realesrgan' ? realesrganGpuId : waifu2xGpuId,
				tileSize: activeTab === 'realcugan' ? realcuganTileSize : 
						  activeTab === 'realesrgan' ? realesrganTileSize : waifu2xTileSize,
				tta: activeTab === 'realcugan' ? realcuganTta : 
					 activeTab === 'realesrgan' ? realesrganTta : false,
				noiseLevel: activeTab === 'realcugan' ? realcuganNoiseLevel : 
							activeTab === 'realesrgan' ? '0' : waifu2xNoiseLevel,
				numThreads: activeTab === 'realcugan' ? realcuganThreads : 
							activeTab === 'realesrgan' ? realesrganThreads : waifu2xThreads
			});

			console.log('超分完成，数据长度:', result.length);
			
			// 将二进制数据转换为 Blob
			upscaledImageBlob = new Blob([new Uint8Array(result)], { type: 'image/webp' });
			
			// 为预览生成 data URL
			upscaledImageData = URL.createObjectURL(upscaledImageBlob);
			upscaleStatus = '超分完成';
			
			// 通知主查看器替换图片
			window.dispatchEvent(new CustomEvent('upscale-complete', {
				detail: { imageData: upscaledImageData, imageBlob: upscaledImageBlob }
			}));

		} catch (error) {
			console.error('超分失败:', error);
			upscaleStatus = `超分失败: ${error}`;
		} finally {
			isUpscaling = false;
			// 3秒后隐藏进度条
			setTimeout(() => {
				showProgress = false;
			}, 3000);
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
		if (!upscaledImageBlob && !bookStore.currentImage) {
			return;
		}

		try {
			// 生成默认文件名
			const originalName = bookStore.currentImage.name;
			const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
			const defaultFileName = `${nameWithoutExt}_upscaled_${upscaleFactor}x.webp`;

			// 使用文件保存对话框
			const filePath = await save({
				filters: [{
					name: 'WebP Image',
					extensions: ['webp']
				}],
				defaultPath: defaultFileName
			});

			if (filePath) {
				let arrayBuffer: ArrayBuffer;
				
				if (upscaledImageBlob) {
					// 直接使用二进制数据
					arrayBuffer = await upscaledImageBlob.arrayBuffer();
				} else {
					// 兼容旧方式：从 data URL 获取数据
					const response = await fetch(upscaledImageData);
					const blob = await response.blob();
					arrayBuffer = await blob.arrayBuffer();
				}
				
				// 使用 Tauri 的文件系统 API 保存文件
				await invoke('save_upscaled_image', {
					filePath,
					imageData: Array.from(new Uint8Array(arrayBuffer))
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

	<!-- Tab 切换 -->
	<div class="flex gap-1 p-1 bg-muted rounded-lg">
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'realcugan' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'realcugan'}
		>
			Real-CUGAN
		</button>
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'realesrgan' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'realesrgan'}
		>
			Real-ESRGAN
		</button>
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'waifu2x' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'waifu2x'}
		>
			Waifu2x
		</button>
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

	<!-- Tab 内容 -->
	{#if activeTab === 'realcugan'}
		<!-- Real-CUGAN Tab 内容 -->
		<div class="space-y-3">
			<!-- 模型选择 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">模型路径</Label>
				<NativeSelect 
					bind:value={realcuganModel} 
					onchange={saveSettings}
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
					bind:value={realcuganScale} 
					onchange={saveSettings}
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
					bind:value={realcuganNoiseLevel} 
					onchange={saveSettings}
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
						bind:value={realcuganTileSize}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="0"
						min="0"
					/>
				</div>

				<!-- Sync Gap Mode -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Sync Gap Mode</Label>
					<NativeSelect 
						bind:value={realcuganSyncgapMode} 
						onchange={saveSettings}
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
						bind:value={realcuganGpuId}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="auto"
					/>
				</div>

				<!-- 线程数 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">线程数 (load:proc:save)</Label>
					<input
						type="text"
						bind:value={realcuganThreads}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="1:2:2"
					/>
				</div>

				<!-- TTA -->
				<div class="flex items-center justify-between">
					<Label class="text-xs text-muted-foreground">TTA 模式</Label>
					<Switch bind:checked={realcuganTta} onchange={saveSettings} />
				</div>

				<!-- 输出格式 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">输出格式</Label>
					<NativeSelect 
						bind:value={realcuganFormat} 
						onchange={saveSettings}
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
		<div class="space-y-3">
			<!-- 模型选择 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">模型名称</Label>
				<NativeSelect 
					bind:value={realesrganModel} 
					onchange={saveSettings}
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
					bind:value={realesrganScale} 
					onchange={saveSettings}
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
						bind:value={realesrganTileSize}
						onchange={saveSettings}
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
						bind:value={realesrganGpuId}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="auto"
					/>
				</div>

				<!-- 线程数 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">线程数 (load:proc:save)</Label>
					<input
						type="text"
						bind:value={realesrganThreads}
						onchange={saveSettings}
						class="w-full h-8 px-2 text-sm border rounded-md"
						placeholder="1:2:2"
					/>
				</div>

				<!-- TTA -->
				<div class="flex items-center justify-between">
					<Label class="text-xs text-muted-foreground">TTA 模式</Label>
					<Switch bind:checked={realesrganTta} onchange={saveSettings} />
				</div>

				<!-- 输出格式 -->
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">输出格式</Label>
					<NativeSelect 
						bind:value={realesrganFormat} 
						onchange={saveSettings}
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
		<div class="space-y-3">
			<!-- 模型选择 -->
			<div class="space-y-2">
				<Label class="text-sm font-medium">模型路径</Label>
				<NativeSelect 
					bind:value={waifu2xModel} 
					onchange={saveSettings}
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
					bind:value={waifu2xNoiseLevel} 
					onchange={saveSettings}
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
					bind:value={waifu2xScale} 
					onchange={saveSettings}
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
						bind:value={waifu2xTileSize}
						onchange={saveSettings}
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
						bind:value={waifu2xGpuId}
						onchange={saveSettings}
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
						bind:value={waifu2xThreads}
						onchange={saveSettings}
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
			disabled={isUpscaling}
		>
			重置设置
		</Button>
		<Button
			variant="default"
			size="sm"
			class="flex-1"
			onclick={startUpscale}
			disabled={isUpscaling || !bookStore.currentImage}
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