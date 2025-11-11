<script lang="ts">
	/**
	 * Upscale Panel
	 * 超分面板 - 图片超分辨率处理设置
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Progress from '$lib/components/ui/progress';
	import * as Slider from '$lib/components/ui/slider';
	import * as Switch from '$lib/components/ui/switch';
	import * as Select from '$lib/components/ui/select';
	import { Sparkles, Play, Settings, Loader2, CheckCircle, AlertCircle, Image as ImageIcon } from '@lucide/svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { bookStore } from '$lib/stores/book.svelte';
	import { onMount } from 'svelte';

	// 超分状态
	let isUpscaling = $state(false);
	let upscaleProgress = $state(0);
	let upscaleStatus = $state('');
	let showProgress = $state(false);
	let upscaledImageData = $state('');

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
			const imagePath = bookStore.currentImage.path;
			console.log('开始超分图片:', imagePath);

			// 计算保存路径
			const savePath = await invoke<string>('get_upscale_save_path', {
				imagePath,
				model: upscaleModel,
				factor: upscaleFactor
			});

			console.log('超分保存路径:', savePath);

			// 开始超分
			const result = await invoke<string>('upscale_image', {
				imagePath,
				savePath,
				model: upscaleModel,
				factor: upscaleFactor,
				gpuId,
				tileSize,
				tta
			});

			console.log('超分完成:', result);
			
			// 保存超分后的 base64 数据
			upscaledImageData = result;
			upscaleStatus = '超分完成';
			
			// 通知主查看器替换图片
			window.dispatchEvent(new CustomEvent('upscale-complete', {
				detail: { imageData: upscaledImageData }
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
				<Select.Value placeholder="选择模型" />
			</Select.Trigger>
			<Select.Content>
				{#each modelOptions as option}
					<Select.Item value={option.value}>
						<Select.ItemText>{option.label}</Select.ItemText>
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
				<Select.Value placeholder="选择倍数" />
			</Select.Trigger>
			<Select.Content>
				{#each factorOptions as option}
					<Select.Item value={option.value}>
						<Select.ItemText>{option.label}</Select.ItemText>
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
			<Switch.Root bind:checked={tta}>
				<Switch.Thumb />
			</Switch.Root>
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
			<Progress.Root value={upscaleProgress} class="h-2">
				<Progress.Indicator class="h-full bg-primary transition-all duration-300" />
			</Progress.Root>
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