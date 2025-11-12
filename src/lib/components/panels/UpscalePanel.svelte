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
	import { Select } from '$lib/components/ui/select';
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

	// 通用超分状态
	let activeTab = $state('standard'); // 'standard' | 'test'
	let testResults = $state<string[]>([]);
	let isTesting = $state(false);
	let selectedTestAlgorithm = $state('realesrgan');
	
	// 手动设置状态
	let selectedAlgorithm = $state('realcugan'); // 默认使用 realcugan
	let selectedModel = $state('se');
	let selectedScale = $state('2');
	let customGpuId = $state('0');
	let customTileSize = $state('0');
	let customTta = $state(false);
	let customNoiseLevel = $state('1');
	let customNumThreads = $state('1');
	
	// 固定的算法列表
	let algorithmOptions = $state([
		{ value: 'realcugan', label: 'Real-CUGAN' },
		{ value: 'realesrgan', label: 'Real-ESRGAN' },
		{ value: 'waifu2x', label: 'Waifu2x' }
	]);
	
	// 扫描到的模型列表
	let scannedModels = $state<string[]>([]);
	let modelOptions = $state<Array<{value: string, label: string}>>([]);
	
	let scaleOptions = $state(['2', '3', '4']);

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
			
			// 应用设置
			selectedAlgorithm = settings.algorithm || 'realcugan';
			selectedModel = settings.model || 'se';
			selectedScale = settings.scale_factor || '2';
			customGpuId = settings.gpu_id || '0';
			customTileSize = settings.tile_size || '0';
			customTta = settings.tta || false;
			customNoiseLevel = settings.noise_level || '1';
			customNumThreads = settings.num_threads || '1';
			
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
			
			// 更新模型选项
			modelOptions = models.map(model => ({
				value: model,
				label: model
			}));
			
			// 如果当前选择的模型不在扫描列表中，使用第一个模型
			if (!models.includes(selectedModel)) {
				selectedModel = models[0] || '';
			}
			
			console.log('模型选项已更新');
		} catch (error) {
			console.error('扫描模型失败:', error);
		}
	}

	// 保存设置
	async function saveSettings() {
		try {
			const settings = {
				algorithm: selectedAlgorithm,
				model: selectedModel,
				scale_factor: selectedScale,
				gpu_id: customGpuId,
				tile_size: customTileSize,
				tta: customTta,
				noise_level: customNoiseLevel,
				num_threads: customNumThreads
			};
			
			await invoke('save_upscale_settings', { settings });
			console.log('设置已保存');
		} catch (error) {
			console.error('保存设置失败:', error);
		}
	}

	// 重置设置
	async function resetSettings() {
		try {
			const defaultSettings = await invoke('reset_upscale_settings');
			
			// 应用默认设置
			selectedAlgorithm = defaultSettings.algorithm;
			selectedModel = defaultSettings.model;
			selectedScale = defaultSettings.scale_factor;
			customGpuId = defaultSettings.gpu_id;
			customTileSize = defaultSettings.tile_size;
			customTta = defaultSettings.tta;
			customNoiseLevel = defaultSettings.noise_level;
			customNumThreads = defaultSettings.num_threads;
			
			console.log('设置已重置为默认值');
		} catch (error) {
			console.error('重置设置失败:', error);
		}
	}

	async function testAllAlgorithms() {
		isTesting = true;
		testResults = [];
		
		try {
			console.log('开始测试所有算法...');
			const results = await invoke('test_all_algorithms');
			testResults = results;
			console.log('测试结果:', results);
		} catch (error) {
			console.error('测试失败:', error);
			testResults = [`测试失败: ${error}`];
		} finally {
			isTesting = false;
		}
	}

	async function testAlgorithmModels() {
		isTesting = true;
		testResults = [];
		
		try {
			console.log(`开始测试 ${selectedTestAlgorithm} 算法的模型...`);
			const results = await invoke('test_algorithm_models', {
				algorithm: selectedTestAlgorithm
			});
			testResults = results;
			console.log('测试结果:', results);
		} catch (error) {
			console.error('测试失败:', error);
			testResults = [`测试失败: ${error}`];
		} finally {
			isTesting = false;
		}
	}

	async function openModelsFolder() {
		try {
			// 打开模型文件夹
			const modelsPath = 'D:\\temp\\neoview_thumbnails_test\\models';
			await invoke('show_in_file_manager', { path: modelsPath });
		} catch (error) {
			console.error('打开模型文件夹失败:', error);
		}
	}

	async function debugModelsInfo() {
		try {
			const info = await invoke('debug_models_info');
			console.log('=== 模型调试信息 ===');
			console.log(info);
			console.log('==================');
			
			// 也显示在测试结果中
			testResults = info.split('\n').filter(line => line.trim());
		} catch (error) {
			console.error('获取调试信息失败:', error);
			testResults = [`调试失败: ${error}`];
		}
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
			let imagePath = bookStore.currentImage.path;
			console.log('开始超分图片:', imagePath);

			// 检查是否是压缩包内的图片
			let actualImagePath = imagePath;
			let isFromArchive = false;
			
			if (bookStore.currentBook && bookStore.currentBook.type === 'archive') {
				// 对于压缩包，需要先提取图片到临时文件
				upscaleStatus = '提取压缩包图片...';
				actualImagePath = await invoke<string>('extract_image_from_archive', {
					archivePath: bookStore.currentBook.path,
					imagePath: imagePath
				});
				isFromArchive = true;
				console.log('提取的临时文件路径:', actualImagePath);
			}

			// 检查是否需要转换 AVIF 为 WebP
			if (actualImagePath.toLowerCase().endsWith('.avif')) {
				upscaleStatus = '转换 AVIF 为 WebP...';
				actualImagePath = await invoke<string>('convert_avif_to_webp', {
					imagePath: actualImagePath
				});
				console.log('转换后的 WebP 文件路径:', actualImagePath);
			}

			// 生成保存路径
			const savePath = await invoke<string>('get_generic_upscale_save_path', {
				imagePath: actualImagePath,
				algorithm: selectedAlgorithm,
				model: selectedModel,
				gpuId: customGpuId,
				tileSize: customTileSize,
				tta: customTta,
				noiseLevel: customNoiseLevel,
				numThreads: customNumThreads
			});

			console.log('超分保存路径:', savePath);

			// 开始超分
			upscaleStatus = '执行超分处理...';
			const result = await invoke<number[]>('generic_upscale_image', {
				imagePath: actualImagePath,
				savePath,
				algorithm: selectedAlgorithm,
				model: selectedModel,
				gpuId: customGpuId,
				tileSize: customTileSize,
				tta: customTta,
				noiseLevel: customNoiseLevel,
				numThreads: customNumThreads
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
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'standard' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'standard'}
		>
			<Play class="h-4 w-4" />
			标准超分
		</button>
		<button
			class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors {activeTab === 'test' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'test'}
		>
			<TestTube class="h-4 w-4" />
			算法测试
		</button>
	</div>

	<!-- Tab 内容 -->
	{#if activeTab === 'standard'}
		<!-- 标准 Tab 内容 -->
		<!-- 当前图片信息 -->
		{#if bookStore.currentImage}
			<div class="flex items-center gap-2 p-2 bg-muted rounded-md">
				<ImageIcon class="h-4 w-4 text-muted-foreground" />
				<span class="text-sm text-muted-foreground truncate">
					{bookStore.currentImage.name}
				</span>
			</div>
		{:else}
			<div class="text-sm text-muted-foreground text-center p-4">
				没有当前图片
			</div>
		{/if}

	<!-- 算法选择 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">超分算法</Label>
		<Select.Root bind:value={selectedAlgorithm} onchange={saveSettings}>
			<Select.Trigger class="w-full">
				{algorithmOptions.find(opt => opt.value === selectedAlgorithm)?.label || '选择算法'}
			</Select.Trigger>
			<Select.Content>
				{#each algorithmOptions as option}
					<Select.Item value={option.value} label={option.label}>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- 模型选择 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">超分模型</Label>
		<Select.Root bind:value={selectedModel} onchange={saveSettings}>
			<Select.Trigger class="w-full">
				{modelOptions.find(opt => opt.value === selectedModel)?.label || '选择模型'}
			</Select.Trigger>
			<Select.Content>
				{#each modelOptions as option}
					<Select.Item value={option.value} label={option.label}>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<div class="flex gap-2 pt-1">
			<Button
				variant="outline"
				size="sm"
				class="flex-1 text-xs"
				onclick={scanModels}
			>
				🔍 重新扫描
			</Button>
			<span class="text-xs text-muted-foreground">
				{modelOptions.length} 个模型
			</span>
		</div>
	</div>

	<!-- 放大倍数 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">放大倍数</Label>
		<Select.Root bind:value={selectedScale} onchange={saveSettings}>
			<Select.Trigger class="w-full">
				{selectedScale}x
			</Select.Trigger>
			<Select.Content>
				{#each scaleOptions as scale}
					<Select.Item value={scale}>
						{scale}x
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- 高级设置 -->
	<div class="space-y-3">
		<div class="flex items-center gap-2">
			<Settings class="h-4 w-4" />
			<Label class="text-sm font-medium">高级设置</Label>
		</div>

		<!-- GPU ID -->
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">GPU ID</Label>
			<input
				type="number"
				bind:value={customGpuId}
				onchange={saveSettings}
				class="w-full h-8 px-2 text-sm border rounded-md"
				placeholder="0"
				min="0"
			/>
		</div>

		<!-- Tile Size -->
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Tile Size (0=自动)</Label>
			<input
				type="number"
				bind:value={customTileSize}
				onchange={saveSettings}
				class="w-full h-8 px-2 text-sm border rounded-md"
				placeholder="0"
				min="0"
			/>
		</div>

		<!-- TTA -->
		<div class="flex items-center justify-between">
			<Label class="text-xs text-muted-foreground">TTA (测试时增强)</Label>
			<Switch bind:checked={customTta} onchange={saveSettings} />
		</div>

		<!-- 噪声等级 -->
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">噪声等级</Label>
			<input
				type="number"
				bind:value={customNoiseLevel}
				onchange={saveSettings}
				class="w-full h-8 px-2 text-sm border rounded-md"
				placeholder="1"
				min="0"
				max="3"
			/>
		</div>

		<!-- 线程数 -->
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">线程数</Label>
			<input
				type="number"
				bind:value={customNumThreads}
				onchange={saveSettings}
				class="w-full h-8 px-2 text-sm border rounded-md"
				placeholder="1"
				min="1"
			/>
		</div>
	</div>

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
	{:else if activeTab === 'test'}
		<!-- 测试 Tab 内容 -->
		<!-- 算法状态 -->
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<List class="h-4 w-4" />
				<Label class="text-sm font-medium">支持的超分算法</Label>
			</div>
			<div class="flex flex-wrap gap-2">
				<span class="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">Real-CUGAN</span>
				<span class="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">ESRGAN</span>
				<span class="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">Waifu2x</span>
			</div>
		</div>

		<!-- 测试操作 -->
		<div class="space-y-3">
			<div class="flex items-center gap-2">
				<TestTube class="h-4 w-4" />
				<Label class="text-sm font-medium">算法测试</Label>
			</div>

			<!-- 测试指定算法的模型 -->
			<div class="space-y-2">
				<Select.Root bind:value={selectedTestAlgorithm}>
					<Select.Trigger class="w-full h-8">
						{algorithmOptions.find(opt => opt.value === selectedTestAlgorithm)?.label || '选择算法'}
					</Select.Trigger>
					<Select.Content>
						{#each algorithmOptions as option}
							<Select.Item value={option.value} label={option.label}>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				
				<Button
					variant="outline"
					size="sm"
					class="w-full"
					onclick={testAlgorithmModels}
					disabled={isTesting}
				>
					{#if isTesting}
						<Loader2 class="h-4 w-4 mr-1 animate-spin" />
						测试中...
					{:else}
						<TestTube class="h-4 w-4 mr-1" />
						测试 {selectedTestAlgorithm} 工具
					{/if}
				</Button>
			</div>
		</div>

		<!-- 打开模型文件夹 -->
		<div class="space-y-2">
			<Button
				variant="ghost"
				size="sm"
				class="w-full"
				onclick={openModelsFolder}
			>
				<FolderOpen class="h-4 w-4 mr-1" />
				打开模型文件夹
			</Button>
			<Button
				variant="ghost"
				size="sm"
				class="w-full"
				onclick={debugModelsInfo}
			>
				<Settings class="h-4 w-4 mr-1" />
				调试模型信息
			</Button>
			<div class="text-xs text-muted-foreground">
				将测试图片放在 models/testimg 目录下
			</div>
		</div>

		<!-- 测试结果 -->
		{#if testResults.length > 0}
			<div class="space-y-2">
				<div class="flex items-center gap-2">
					<CheckCircle class="h-4 w-4" />
					<Label class="text-sm font-medium">测试结果</Label>
				</div>
				<div class="max-h-48 overflow-y-auto space-y-1">
					{#each testResults as result}
						<div class="text-xs p-2 bg-muted rounded-md font-mono">
							{result}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>