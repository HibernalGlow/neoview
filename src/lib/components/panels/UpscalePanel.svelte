<script lang="ts">
	/**
	 * Upscale Panel (New)
	 * 超分面板 - 内存中超分工作流集成
	 * 支持实时进度、预超分、内存缓存
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { Switch } from '$lib/components/ui/switch';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Sparkles, Play, Zap, CheckCircle, AlertCircle, Image as ImageIcon, Download, Loader2, Clock, Flame } from '@lucide/svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { save } from '@tauri-apps/plugin-dialog';
	import { bookStore } from '$lib/stores/book.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { showSuccessToast, showErrorToast } from '$lib/utils/toast';
	
	// 导入新的内存中超分 Store
	import { 
		currentUpscaleTask, 
		upscaleTaskQueue, 
		upscaleCacheStats 
	} from '$lib/stores/upscale/UpscaleMemoryCache.svelte';
	import {
		performUpscaleInMemory,
		preupscaleInMemory,
		createBlobUrl,
		releaseBlobUrl,
		getTaskProgress,
		getTaskStatus,
		getTaskProgressColor,
		setPreupscaleEnabled,
		setMaxMemory
	} from '$lib/stores/upscale/UpscaleWorkflow.svelte';

	// 超分参数
	let selectedModel = $state('REALESRGAN_X4PLUS_UP4X');
	let selectedScale = $state(2.0);
	let gpuId = $state(0);
	let tileSize = $state(400);
	let tta = $state(false);
	let preupscaleEnabled = $state(true);
	let preupscalePageCount = $state(3); // 预超分页数
	let maxMemoryMB = $state(500);
	let globalUpscaleEnabled = $state(true); // 全局超分开关

	// UI 状态
	let isUpscaling = $state(false);
	let currentProgress = $state(0);
	let currentStatus = $state('');
	let currentProgressColor = $state('green');
	let upscaledImageUrl = $state('');
	let lastUpscaleTaskId = $state('');

	// 缓存统计
	let cacheStats = $state({ totalTasks: 0, totalCached: 0, totalCachedSize: 0, queueLength: 0 });

	// 模型选项
	const modelOptions = [
		{ value: 'REALESRGAN_X4PLUS_UP4X', label: 'Real-ESRGAN 4x (通用)' },
		{ value: 'REALESRGAN_X4PLUSANIME_UP4X', label: 'Real-ESRGAN 4x (动漫)' },
		{ value: 'WAIFU2X_CUNET_UP2X', label: 'Waifu2x 2x (动漫)' },
		{ value: 'WAIFU2X_CUNET_UP4X', label: 'Waifu2x 4x (动漫)' },
		{ value: 'REALCUGAN_PRO_UP2X', label: 'RealCUGAN 2x (专业)' },
		{ value: 'REALCUGAN_PRO_UP3X', label: 'RealCUGAN 3x (专业)' },
		{ value: 'REALCUGAN_PRO_UP4X', label: 'RealCUGAN 4x (专业)' }
	];

	const scaleOptions = [1, 2, 3, 4];

	// 订阅 Store
	let currentTask = $state($currentUpscaleTask);
	let taskQueue = $state($upscaleTaskQueue);

	$effect(() => {
		currentTask = $currentUpscaleTask;
		if (currentTask) {
			currentProgress = getTaskProgress(currentTask.id);
			currentStatus = getTaskStatus(currentTask.id);
			currentProgressColor = getTaskProgressColor(currentTask.id);
			isUpscaling = currentTask.status === 'upscaling' || currentTask.status === 'preupscaling';
			lastUpscaleTaskId = currentTask.id;
		}
	});

	$effect(() => {
		taskQueue = $upscaleTaskQueue;
	});

	$effect(() => {
		cacheStats = $upscaleCacheStats;
	});

	/**
	 * 保存设置到 localStorage
	 */
	function saveSettings() {
		const settings = {
			selectedModel,
			selectedScale,
			gpuId,
			tileSize,
			tta,
			preupscaleEnabled,
			preupscalePageCount,
			maxMemoryMB,
			globalUpscaleEnabled
		};
		localStorage.setItem('upscaleSettings', JSON.stringify(settings));
		console.log('[UpscalePanel] 设置已保存');
	}

	/**
	 * 从 localStorage 加载设置
	 */
	function loadSettings() {
		try {
			const saved = localStorage.getItem('upscaleSettings');
			if (saved) {
				const settings = JSON.parse(saved);
				selectedModel = settings.selectedModel || selectedModel;
				selectedScale = settings.selectedScale || selectedScale;
				gpuId = settings.gpuId ?? gpuId;
				tileSize = settings.tileSize ?? tileSize;
				tta = settings.tta ?? tta;
				preupscaleEnabled = settings.preupscaleEnabled ?? preupscaleEnabled;
				preupscalePageCount = settings.preupscalePageCount ?? preupscalePageCount;
				maxMemoryMB = settings.maxMemoryMB ?? maxMemoryMB;
				globalUpscaleEnabled = settings.globalUpscaleEnabled ?? globalUpscaleEnabled;
				console.log('[UpscalePanel] 设置已加载');
			}
		} catch (error) {
			console.warn('[UpscalePanel] 加载设置失败:', error);
		}
	}

	onMount(() => {
		// 加载保存的设置
		loadSettings();
		
		// 初始化设置
		setPreupscaleEnabled(preupscaleEnabled);
		setMaxMemory(maxMemoryMB);
	});

	/**
	 * 执行超分
	 */
	async function handleUpscale() {
		if (!bookStore.currentImage) {
			showErrorToast('错误', '没有当前图片');
			return;
		}

		try {
			// 获取当前图片数据
			const imageData = await getImageData();
			if (!imageData) {
				showErrorToast('错误', '无法获取图片数据');
				return;
			}

			// 计算图片哈希
			const imageHash = await calculateHash(imageData);

			// 执行超分（内存中）
			const { blob, taskId } = await performUpscaleInMemory(
				imageHash,
				bookStore.currentImage.path,
				imageData,
				selectedModel,
				selectedScale,
				gpuId,
				tileSize,
				tta,
				(progress) => {
					currentProgress = progress;
				}
			);

			// 创建 Blob URL
			upscaledImageUrl = createBlobUrl(blob);
			lastUpscaleTaskId = taskId;

			// 触发事件通知 Viewer 更新图片
			window.dispatchEvent(new CustomEvent('upscale-complete', {
				detail: { imageUrl: upscaledImageUrl, taskId }
			}));

			showSuccessToast('成功', '超分完成！');

		} catch (error) {
			console.error('超分失败:', error);
			showErrorToast('失败', `超分失败: ${error}`);
		}
	}

	/**
	 * 启动预超分
	 */
	async function handlePreupscale() {
		if (!bookStore.currentImage) {
			showErrorToast('错误', '没有当前图片');
			return;
		}

		try {
			// 获取下一页图片
			const nextPages = getNextPages(3);
			
			for (const page of nextPages) {
				try {
					const imageData = await loadPageImage(page);
					const imageHash = await calculateHash(imageData);

					await preupscaleInMemory(
						imageHash,
						page.path,
						imageData,
						selectedModel,
						selectedScale
					);
				} catch (e) {
					console.warn(`预超分第 ${page.index + 1} 页失败:`, e);
				}
			}

			showSuccessToast('成功', '预超分已启动');

		} catch (error) {
			console.error('预超分失败:', error);
			showErrorToast('失败', `预超分失败: ${error}`);
		}
	}

	/**
	 * 获取图片数据
	 */
	async function getImageData(): Promise<Uint8Array | null> {
		return new Promise((resolve) => {
			const timeout = setTimeout(() => resolve(null), 2000);
			
			window.dispatchEvent(new CustomEvent('request-current-image-data', {
				detail: {
					callback: (data: string) => {
						clearTimeout(timeout);
						// 转换 data URL 或 blob URL 到 Uint8Array
						dataUrlToUint8Array(data).then(resolve).catch(() => resolve(null));
					}
				}
			}));
		});
	}

	/**
	 * 将 data URL 或 blob URL 转换为 Uint8Array
	 */
	async function dataUrlToUint8Array(url: string): Promise<Uint8Array> {
		if (url.startsWith('data:')) {
			// data URL
			const base64 = url.split(',')[1];
			const binary = atob(base64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			return bytes;
		} else if (url.startsWith('blob:')) {
			// blob URL
			const response = await fetch(url);
			const blob = await response.blob();
			return new Uint8Array(await blob.arrayBuffer());
		}
		throw new Error('不支持的 URL 格式');
	}

	/**
	 * 计算数据哈希
	 */
	async function calculateHash(data: Uint8Array): Promise<string> {
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
	}

	/**
	 * 获取下一页图片
	 */
	function getNextPages(count: number): any[] {
		// TODO: 从 bookStore 获取下一页图片
		return [];
	}

	/**
	 * 加载页面图片
	 */
	async function loadPageImage(page: any): Promise<Uint8Array> {
		// TODO: 从文件系统加载图片
		return new Uint8Array();
	}

	/**
	 * 保存超分图片
	 */
	async function handleSaveUpscaled() {
		if (!upscaledImageUrl) {
			showErrorToast('错误', '没有超分结果可保存');
			return;
		}

		try {
			const originalName = bookStore.currentImage?.name || 'image';
			const nameWithoutExt = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
			const defaultFileName = `${nameWithoutExt}_upscaled_${selectedScale}x.webp`;

			const filePath = await save({
				filters: [{ name: 'WebP Image', extensions: ['webp'] }],
				defaultPath: defaultFileName
			});

			if (filePath) {
				const response = await fetch(upscaledImageUrl);
				const blob = await response.blob();
				const arrayBuffer = await blob.arrayBuffer();

				await invoke('save_binary_file', {
					filePath,
					data: Array.from(new Uint8Array(arrayBuffer))
				});

				showSuccessToast('成功', '图片已保存');
			}
		} catch (error) {
			console.error('保存失败:', error);
			showErrorToast('失败', `保存失败: ${error}`);
		}
	}

	/**
	 * 清理资源
	 */
	onDestroy(() => {
		if (upscaledImageUrl) {
			releaseBlobUrl(upscaledImageUrl);
		}
	});
</script>

<div class="h-full flex flex-col bg-background p-4 space-y-4 overflow-y-auto">
	<!-- 头部 -->
	<div class="flex items-center gap-2 pb-2 border-b sticky top-0 bg-background">
		<Sparkles class="h-5 w-5 text-primary" />
		<h3 class="text-lg font-semibold">图片超分 (内存中)</h3>
	</div>

	<!-- 当前任务进度 -->
	{#if currentTask}
		<div class="space-y-2 p-3 bg-muted/50 rounded-lg border">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					{#if currentProgressColor === 'yellow'}
						<Flame class="h-4 w-4 text-yellow-500 animate-pulse" />
						<span class="text-sm font-medium">预超分中...</span>
					{:else if currentProgressColor === 'green'}
						<Loader2 class="h-4 w-4 text-green-500 animate-spin" />
						<span class="text-sm font-medium">超分中...</span>
					{:else}
						<AlertCircle class="h-4 w-4 text-red-500" />
						<span class="text-sm font-medium text-red-500">错误</span>
					{/if}
				</div>
				<span class="text-sm font-semibold">{currentProgress}%</span>
			</div>
			
			<!-- 进度条 -->
			<div class="w-full bg-muted rounded-full h-2 overflow-hidden">
				<div 
					class="h-full transition-all duration-300"
					style:background-color={currentProgressColor === 'yellow' ? '#eab308' : currentProgressColor === 'green' ? '#22c55e' : '#ef4444'}
					style:width="{currentProgress}%"
				></div>
			</div>

			<div class="text-xs text-muted-foreground">
				状态: {currentStatus} | 模型: {selectedModel} | 倍数: {selectedScale}x
			</div>
		</div>
	{/if}

	<!-- 缓存统计 -->
	<div class="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg">
		<div class="text-center">
			<div class="text-2xl font-bold text-primary">{cacheStats.totalCached}</div>
			<div class="text-xs text-muted-foreground">已缓存</div>
		</div>
		<div class="text-center">
			<div class="text-2xl font-bold text-primary">{(cacheStats.totalCachedSize / 1024 / 1024).toFixed(1)}</div>
			<div class="text-xs text-muted-foreground">MB</div>
		</div>
	</div>

	<!-- 任务队列 -->
	{#if taskQueue.length > 0}
		<div class="space-y-2">
			<Label class="text-sm font-medium">任务队列 ({taskQueue.length})</Label>
			<div class="space-y-1 max-h-32 overflow-y-auto">
				{#each taskQueue as task}
					<div class="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs">
						<div 
							class="w-2 h-2 rounded-full"
							style:background-color={task.progressColor === 'yellow' ? '#eab308' : task.progressColor === 'green' ? '#22c55e' : '#ef4444'}
						></div>
						<span class="flex-1 truncate">{task.isPreupscale ? '预' : ''}{task.model}</span>
						<span class="font-semibold">{task.progress}%</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 全局超分开关 -->
	<div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
		<div class="flex items-center gap-2">
			<Sparkles class="h-4 w-4 text-primary" />
			<Label class="text-sm font-medium">全局超分</Label>
		</div>
		<Switch 
			bind:checked={globalUpscaleEnabled}
			onchange={() => saveSettings()}
		/>
	</div>

	<!-- 模型选择 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">超分模型</Label>
		<NativeSelect 
			bind:value={selectedModel}
			onchange={() => saveSettings()}
			class="w-full"
		>
			{#each modelOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</NativeSelect>
	</div>

	<!-- 放大倍数 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">放大倍数</Label>
		<div class="grid grid-cols-4 gap-2">
			{#each scaleOptions as scale}
				<button
					class="px-3 py-2 text-sm font-medium rounded-md transition-colors {selectedScale === scale ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}"
					onclick={() => {
						selectedScale = scale;
						saveSettings();
					}}
				>
					{scale}x
				</button>
			{/each}
		</div>
	</div>

	<!-- 保存设置按钮 -->
	<Button
		variant="outline"
		size="sm"
		class="w-full"
		onclick={() => {
			saveSettings();
			showSuccessToast('成功', '设置已保存');
		}}
	>
		💾 保存设置
	</Button>

	<!-- 高级设置 -->
	<details class="group">
		<summary class="cursor-pointer flex items-center gap-2 p-2 hover:bg-muted/50 rounded">
			<span class="text-sm font-medium">高级设置</span>
		</summary>
		
		<div class="space-y-3 p-3 bg-muted/30 rounded-lg mt-2">
			<!-- GPU ID -->
			<div class="space-y-1">
				<Label class="text-xs font-medium">GPU ID</Label>
				<input
					type="number"
					bind:value={gpuId}
					class="w-full h-8 px-2 text-sm border rounded-md"
					min="0"
				/>
			</div>

			<!-- Tile Size -->
			<div class="space-y-1">
				<Label class="text-xs font-medium">Tile Size (内存)</Label>
				<input
					type="number"
					bind:value={tileSize}
					class="w-full h-8 px-2 text-sm border rounded-md"
					min="100"
					step="100"
				/>
			</div>

			<!-- TTA -->
			<div class="flex items-center justify-between">
				<Label class="text-xs font-medium">TTA (更好质量)</Label>
				<Switch bind:checked={tta} />
			</div>

			<!-- 最大内存 -->
			<div class="space-y-1">
				<Label class="text-xs font-medium">最大内存: {maxMemoryMB} MB</Label>
				<input
					type="range"
					bind:value={maxMemoryMB}
					onchange={() => setMaxMemory(maxMemoryMB)}
					class="w-full"
					min="100"
					max="1000"
					step="50"
				/>
			</div>
		</div>
	</details>

	<!-- 预超分设置 -->
	<div class="space-y-3 p-3 bg-muted/50 rounded-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<Flame class="h-4 w-4 text-yellow-500" />
				<Label class="text-sm font-medium">预超分</Label>
			</div>
			<Switch 
				bind:checked={preupscaleEnabled}
				onchange={() => {
					setPreupscaleEnabled(preupscaleEnabled);
					saveSettings();
				}}
			/>
		</div>

		<!-- 预超分页数设置 -->
		{#if preupscaleEnabled}
			<div class="space-y-2">
				<Label class="text-xs font-medium">预超分页数: {preupscalePageCount}</Label>
				<input
					type="range"
					bind:value={preupscalePageCount}
					onchange={() => saveSettings()}
					class="w-full"
					min="1"
					max="10"
					step="1"
				/>
				<div class="text-xs text-muted-foreground">
					翻页时自动预超分后续 {preupscalePageCount} 页
				</div>
			</div>
		{/if}
	</div>

	<!-- 操作按钮 -->
	<div class="space-y-2">
		<!-- 超分按钮 -->
		<Button
			class="w-full"
			disabled={isUpscaling || !bookStore.currentImage}
			onclick={handleUpscale}
		>
			{#if isUpscaling}
				<Loader2 class="h-4 w-4 mr-2 animate-spin" />
				超分中...
			{:else}
				<Play class="h-4 w-4 mr-2" />
				立即超分
			{/if}
		</Button>

		<!-- 预超分按钮 -->
		<Button
			variant="outline"
			class="w-full"
			disabled={isUpscaling || !bookStore.currentImage || !preupscaleEnabled}
			onclick={handlePreupscale}
		>
			<Flame class="h-4 w-4 mr-2 text-yellow-500" />
			预超分下一页
		</Button>

		<!-- 保存按钮 -->
		<Button
			variant="outline"
			class="w-full"
			disabled={!upscaledImageUrl}
			onclick={handleSaveUpscaled}
		>
			<Download class="h-4 w-4 mr-2" />
			保存超分图
		</Button>
	</div>

	<!-- 当前图片信息 -->
	<div class="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-xs">
		<ImageIcon class="h-4 w-4 text-muted-foreground shrink-0" />
		<span class="truncate text-muted-foreground">
			{#if bookStore.currentImage}
				{bookStore.currentImage.name}
			{:else}
				没有当前图片
			{/if}
		</span>
	</div>

	<!-- 提示信息 -->
	<div class="text-xs text-muted-foreground p-2 bg-muted/30 rounded-md">
		<p>💡 <strong>内存中处理:</strong> 超分结果存储在内存中，无需保存到本地</p>
		<p>💡 <strong>实时进度:</strong> 进度条实时更新，支持多任务队列</p>
		<p>💡 <strong>预超分:</strong> 后台预处理下一页，翻页时无需等待</p>
	</div>
</div>

<style>
	:global(.animate-pulse) {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
