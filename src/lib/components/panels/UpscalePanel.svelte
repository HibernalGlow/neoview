<script lang="ts">
	/**
	 * PyO3 Upscale Panel
	 * 超分面板 - 使用 PyO3 直接调用 Python sr_vulkan
	 * 参考 picacg-qt 的 Waifu2x 面板功能
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { 
		Sparkles, 
		Settings, 
		Zap, 
		CheckCircle, 
		AlertCircle, 
		Loader2, 
		Clock,
		HardDrive,
		Trash2
	} from '@lucide/svelte';
	import { onMount, createEventDispatcher } from 'svelte';
	import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
	import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
	import { bookStore } from '$lib/stores/book.svelte';

	// ==================== 状态管理 ====================
	
	// 全局开关
	let autoUpscaleEnabled = $state(false);
	let currentImageUpscaleEnabled = $state(false);
	let useCachedFirst = $state(true);

	// 模型参数
	let selectedModel = $state('cunet');
	let scale = $state(2);
	let tileSize = $state(0); // 0 = 自动
	let noiseLevel = $state(0);
	let gpuId = $state(0);

	// 可用模型列表
	let availableModels = $state<string[]>([]);
	
	// 模型选项映射
	const modelLabels: Record<string, string> = {
		'cunet': 'CUNet (推荐)',
		'photo': 'Photo (照片)',
		'anime_style_art_rgb': 'Anime Style Art',
		'upconv_7_anime_style_art_rgb': 'UpConv 7 Anime',
		'upconv_7_photo': 'UpConv 7 Photo',
		'upresnet10': 'UpResNet10',
		'swin_unet_art_scan': 'Swin UNet Art'
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
			if (imagePath) {
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
		if (autoUpscaleEnabled) {
			console.log('✅ 自动超分已启用');
		}
	});

	// 创建事件分发器
	const dispatch = createEventDispatcher();

	onMount(async () => {
		// 加载设置
		loadSettings();
		
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

	// ==================== 功能函数 ====================

	/**
	 * 更新当前图片信息
	 */
	async function updateCurrentImageInfo(imagePath: string) {
		currentImagePath = imagePath;
		
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
			
			saveSettings();
			showSuccessToast('模型设置已应用');
		} catch (error) {
			console.error('应用模型设置失败:', error);
			showErrorToast('应用设置失败');
		}
	}

	/**
	 * 执行超分
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
			await pyo3UpscaleManager.setModel(selectedModel, scale);
			pyo3UpscaleManager.setTileSize(tileSize);

			// 从当前页面获取图像数据
			const currentPage = bookStore.currentPage;
			if (!currentPage) {
				throw new Error('没有当前图片');
			}

			// 获取图像数据 - 从 ImageViewer 的缓存中获取已加载的 blob
			const imageData = await getCurrentImageBlob();
			
			progress = 20;
			status = '初始化模型...';
			await new Promise(resolve => setTimeout(resolve, 500));

			// 执行超分 (内存流)
			status = '超分处理中...';
			progress = 30;
			
			const result = await pyo3UpscaleManager.upscaleImageMemory(imageData, 120.0);
			
			progress = 90;
			status = '生成预览...';
			
			// 直接创建 blob，用于传递给 ImageViewer 和显示
			const blob = new Blob([result as BlobPart], { type: 'image/webp' });
			upscaledImageUrl = URL.createObjectURL(blob);
			
			progress = 100;
			status = '转换完成';
			
			const processingTime = (Date.now() - startTime) / 1000;
			showSuccessToast(`超分完成！耗时 ${processingTime.toFixed(1)}s`);
			
			// 异步保存超分结果到缓存
			try {
				const imageHash = await getCurrentImageHash();
				if (imageHash) {
					// 异步保存，不等待完成
					pyo3UpscaleManager.saveUpscaleCache(imageHash, result)
						.then(cachePath => {
							console.log('💾 超分结果已异步缓存:', cachePath);
						})
						.catch(error => {
							console.warn('异步保存缓存失败:', error);
						});
				}
			} catch (error) {
				console.warn('获取图像 hash 失败，跳过缓存保存:', error);
			}

			// 触发事件通知 ImageViewer，传递 blob 数据
			dispatch('upscale-complete', {
				originalPath: currentImagePath,
				upscaledBlob: blob,
				upscaledData: result
			});
			
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
	 * 获取当前图像的 Blob 数据 (通过事件请求 ImageViewer 数据)
	 */
	async function getCurrentImageBlob(): Promise<Uint8Array> {
		try {
			const currentPage = bookStore.currentPage;
			if (!currentPage) {
				throw new Error('没有当前图片');
			}

			// 触发事件请求当前图像数据
			dispatch('request-current-image-data');
			
			// 等待 ImageViewer 响应 (这里需要实现事件监听)
			// 暂时回退到文件读取
			console.warn('等待 ImageViewer 响应，暂时回退到文件读取');
			
			// 检查是否是压缩包文件
			const isArchive = currentPage.path.endsWith('.zip') || currentPage.path.endsWith('.rar') || currentPage.path.endsWith('.7z');
			
			if (isArchive) {
				// 对于压缩包，使用 invoke 调用后端提取
				const innerPath = (currentPage as any).innerPath || currentPage.name;
				console.log('从压缩包提取图像:', currentPage.path, 'inner:', innerPath);
				
				const { invoke } = await import('@tauri-apps/api/core');
				const imageData = await invoke<number[]>('extract_file_from_zip', {
					archivePath: currentPage.path,
					innerPath: innerPath
				});
				
				return new Uint8Array(imageData);
			} else {
				// 对于普通文件，直接读取
				const { readBinaryFile } = await import('@tauri-apps/api/fs');
				const data = await readBinaryFile(currentPage.path);
				return new Uint8Array(data);
			}
			
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

			// 使用路径 + innerpath 作为 hash 基础
			const path = currentPage.path || '';
			const innerPath = (currentPage as any).innerPath || '';
			const hashInput = path + '|' + innerPath;
			
			// 计算 hash
			const hash = await calculatePathHash(hashInput);
			return hash;
		} catch (error) {
			console.error('获取图像 hash 失败:', error);
			return null;
		}
	}

	/**
	 * 计算路径 hash (使用 Web Crypto API)
	 */
	async function calculatePathHash(pathInput: string): Promise<string> {
		try {
			// 将路径字符串转换为 ArrayBuffer
			const encoder = new TextEncoder();
			const bytes = encoder.encode(pathInput);
			
			// 使用 Web Crypto API 计算 SHA-256 hash
			const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
			
			return hashHex;
		} catch (error) {
			console.error('计算路径 hash 失败:', error);
			// 回退到简单的字符串 hash
			return pathInput.length.toString(36);
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
	function saveSettings() {
		const settings = {
			autoUpscaleEnabled,
			currentImageUpscaleEnabled,
			useCachedFirst,
			selectedModel,
			scale,
			tileSize,
			noiseLevel,
			gpuId
		};
		localStorage.setItem('pyo3_upscale_settings', JSON.stringify(settings));
	}

	/**
	 * 加载设置
	 */
	function loadSettings() {
		const saved = localStorage.getItem('pyo3_upscale_settings');
		if (saved) {
			try {
				const settings = JSON.parse(saved);
				autoUpscaleEnabled = settings.autoUpscaleEnabled ?? false;
				currentImageUpscaleEnabled = settings.currentImageUpscaleEnabled ?? false;
				useCachedFirst = settings.useCachedFirst ?? true;
				selectedModel = settings.selectedModel ?? 'cunet';
				scale = settings.scale ?? 2;
				tileSize = settings.tileSize ?? 0;
				noiseLevel = settings.noiseLevel ?? 0;
				gpuId = settings.gpuId ?? 0;
			} catch (error) {
				console.error('加载设置失败:', error);
			}
		}
	}

	/**
	 * 获取进度条颜色
	 */
	function getProgressColor(progress: number): string {
		if (progress < 30) return 'bg-blue-500';
		if (progress < 70) return 'bg-yellow-500';
		return 'bg-green-500';
	}

	/**
	 * 格式化文件大小
	 */
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
	}

	// 快捷键处理
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'F2') {
			event.preventDefault();
			currentImageUpscaleEnabled = !currentImageUpscaleEnabled;
			saveSettings();
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
	<div class="section">
		<div class="setting-row">
			<div class="flex items-center gap-2">
				<Switch bind:checked={autoUpscaleEnabled} onchange={saveSettings} />
				<Label>自动 Waifu2x</Label>
			</div>
		</div>

		<div class="setting-row">
			<div class="flex items-center gap-2">
				<Switch bind:checked={currentImageUpscaleEnabled} onchange={saveSettings} />
				<Label>本张图开启 Waifu2x (F2)</Label>
			</div>
		</div>

		<div class="setting-row">
			<div class="flex items-center gap-2">
				<Switch bind:checked={useCachedFirst} onchange={saveSettings} />
				<Label>优先使用下载转换好的</Label>
			</div>
		</div>
	</div>

	<!-- 修改参数 -->
	<div class="section">
		<div class="section-title">
			<Settings class="w-4 h-4" />
			<span>修改参数</span>
		</div>

		<!-- 放大倍数 -->
		<div class="setting-row">
			<Label>放大倍数：</Label>
			<div class="flex items-center gap-2">
				<input
					type="number"
					bind:value={scale}
					min="1"
					max="4"
					step="0.5"
					class="input-number"
				/>
				<span class="text-sm text-gray-500">x</span>
			</div>
		</div>

		<!-- 模型选择 -->
		<div class="setting-row">
			<Label>模型：</Label>
			<select bind:value={selectedModel} class="select-input">
				{#each availableModels as model}
					<option value={model}>
						{modelLabels[model] || model}
					</option>
				{/each}
			</select>
		</div>

		<!-- GPU 选择 -->
		<div class="setting-row">
			<Label>GPU：</Label>
			<select bind:value={gpuId} class="select-input">
				{#each gpuOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<!-- Tile Size -->
		<div class="setting-row">
			<Label>Tile Size：</Label>
			<select bind:value={tileSize} class="select-input">
				{#each tileSizeOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<!-- 降噪等级 -->
		<div class="setting-row">
			<Label>降噪等级：</Label>
			<select bind:value={noiseLevel} class="select-input">
				{#each noiseLevelOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>

		<!-- 应用按钮 -->
		<Button onclick={applyModelSettings} class="w-full mt-2" variant="outline">
			<Settings class="w-4 h-4 mr-2" />
			应用设置
		</Button>
	</div>

	<!-- 当前图片信息 -->
	<div class="section">
		<div class="section-title">
			<Zap class="w-4 h-4" />
			<span>当前图片</span>
		</div>

		<div class="info-grid">
			<div class="info-item">
				<span class="info-label">分辨率：</span>
				<span class="info-value">{currentImageResolution || '-'}</span>
			</div>
			<div class="info-item">
				<span class="info-label">大小：</span>
				<span class="info-value">{currentImageSize || '-'}</span>
			</div>
			<div class="info-item">
				<span class="info-label">耗时：</span>
				<span class="info-value">{processingTime.toFixed(1)}s</span>
			</div>
			<div class="info-item">
				<span class="info-label">状态：</span>
				<span class="info-value" class:text-green-500={status === '转换完成'} class:text-red-500={status === '转换失败'}>
					{status}
				</span>
			</div>
		</div>

		<!-- 执行超分按钮 -->
		<Button 
			onclick={performUpscale} 
			class="w-full mt-3" 
			disabled={isProcessing || !currentImagePath}
		>
			{#if isProcessing}
				<Loader2 class="w-4 h-4 mr-2 animate-spin" />
				处理中...
			{:else}
				<Sparkles class="w-4 h-4 mr-2" />
				执行超分
			{/if}
		</Button>

		<!-- 进度条 -->
		{#if isProcessing}
			<div class="progress-container">
				<div class="progress-bar">
					<div 
						class="progress-fill {getProgressColor(progress)}" 
						style="width: {progress}%"
					></div>
				</div>
				<span class="progress-text">{progress.toFixed(0)}%</span>
			</div>
		{/if}
	</div>

	<!-- 缓存管理 -->
	<div class="section">
		<div class="section-title">
			<HardDrive class="w-4 h-4" />
			<span>缓存管理</span>
		</div>

		<div class="info-grid">
			<div class="info-item">
				<span class="info-label">文件数：</span>
				<span class="info-value">{cacheStats.totalFiles}</span>
			</div>
			<div class="info-item">
				<span class="info-label">总大小：</span>
				<span class="info-value">{formatFileSize(cacheStats.totalSize)}</span>
			</div>
		</div>

		<Button onclick={cleanupCache} class="w-full mt-2" variant="outline">
			<Trash2 class="w-4 h-4 mr-2" />
			清理缓存 (30天前)
		</Button>
	</div>

	<!-- 预览区域 -->
	{#if upscaledImageUrl}
		<div class="section">
			<div class="section-title">
				<CheckCircle class="w-4 h-4 text-green-500" />
				<span>超分结果</span>
			</div>
			<div class="preview-container">
				<img src={upscaledImageUrl} alt="超分结果" class="preview-image" />
			</div>
		</div>
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

	.section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		padding: 1rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		color: hsl(var(--foreground));
	}

	.setting-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
	}

	.setting-row:not(:last-child) {
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.input-number {
		width: 80px;
		padding: 0.25rem 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		text-align: center;
	}

	.select-input {
		padding: 0.25rem 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.25rem;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		min-width: 150px;
	}

	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.info-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.progress-container {
		margin-top: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: hsl(var(--muted));
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease, background-color 0.3s ease;
	}

	.progress-text {
		font-size: 0.75rem;
		font-weight: 600;
		min-width: 40px;
		text-align: right;
	}

	.preview-container {
		margin-top: 0.5rem;
		border-radius: 0.5rem;
		overflow: hidden;
		border: 1px solid hsl(var(--border));
	}

	.preview-image {
		width: 100%;
		height: auto;
		display: block;
	}

	/* 响应式调整 */
	@media (max-width: 640px) {
		.info-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
