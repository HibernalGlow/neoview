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
	import { Sparkles, Play, Settings, Loader2, CheckCircle, AlertCircle, Image as ImageIcon, Download } from '@lucide/svelte';
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

	// 超分参数
	let upscaleModel = $state('general'); // general | digital
	let upscaleFactor = $state('4'); // 2 | 3 | 4
	let gpuId = $state('0');
	let tileSize = $state('0'); // 0 = auto
	let tta = $state(false); // Test Time Augmentation

	// 模型选项
	const modelOptions = [
		{ value: 'general', label: '通用模型 (General)' },
		{ value: 'digital', label: '动漫模型 (Digital/Anime)' }
	];

	const factorOptions = [
		{ value: '2', label: '2x' },
		{ value: '3', label: '3x' },
		{ value: '4', label: '4x' }
	];

	onMount(() => {
		// 检查是否有可用的超分工具
		checkUpscaleAvailability();
	});

	async function checkUpscaleAvailability() {
		try {
			await invoke('check_upscale_availability');
		} catch (error) {
			console.error('超分工具不可用:', error);
			upscaleStatus = '超分工具未安装或不可用';
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

			// 计算保存路径（使用原始路径和实际处理路径）
			const savePath = await invoke<string>('get_upscale_save_path_with_info', {
				originalPath: imagePath,
				actualPath: actualImagePath,
				model: upscaleModel,
				factor: upscaleFactor
			});

			console.log('超分保存路径:', savePath);

			// 开始超分
			upscaleStatus = '执行超分处理...';
			const result = await invoke<number[]>('upscale_image', {
				imagePath: actualImagePath,
				savePath,
				model: upscaleModel,
				factor: upscaleFactor,
				gpuId,
				tileSize,
				tta
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

	// 监听进度事件
	$effect(() => {
		const handleProgress = (event: CustomEvent) => {
			const percentage = event.detail;
			if (percentage.endsWith('%')) {
				upscaleProgress = parseInt(percentage);
				upscaleStatus = `处理中... ${percentage}`;
			}
		};

		window.addEventListener('UPSCALE-PERCENTAGE', handleProgress as EventListener);
		return () => {
			window.removeEventListener('UPSCALE-PERCENTAGE', handleProgress as EventListener);
		};
	});

	function resetSettings() {
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

	<!-- 模型选择 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">超分模型</Label>
		<Select.Root bind:value={upscaleModel}>
			<Select.Trigger class="w-full">
				{modelOptions.find(opt => opt.value === upscaleModel)?.label || '选择模型'}
			</Select.Trigger>
			<Select.Content>
				{#each modelOptions as option}
					<Select.Item value={option.value} label={option.label}>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	<!-- 放大倍数 -->
	<div class="space-y-2">
		<Label class="text-sm font-medium">放大倍数</Label>
		<Select.Root bind:value={upscaleFactor}>
			<Select.Trigger class="w-full">
				{factorOptions.find(opt => opt.value === upscaleFactor)?.label || '选择倍数'}
			</Select.Trigger>
			<Select.Content>
				{#each factorOptions as option}
					<Select.Item value={option.value} label={option.label}>
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
				bind:value={gpuId}
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
				bind:value={tileSize}
				class="w-full h-8 px-2 text-sm border rounded-md"
				placeholder="0"
				min="0"
			/>
		</div>

		<!-- TTA -->
		<div class="flex items-center justify-between">
			<Label class="text-xs text-muted-foreground">TTA (测试时增强)</Label>
			<Switch bind:checked={tta} />
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
			重置
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