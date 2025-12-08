<script lang="ts">
	/**
	 * 上色控制卡片
	 * 独立开关，可选择上色后超分
	 */
	import { onMount } from 'svelte';
	import { Palette, Sparkles, Loader2, CheckCircle2, XCircle, AlertCircle } from '@lucide/svelte';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { colorizationManager } from '$lib/stores/colorization';
	import { settingsManager } from '$lib/settings/settingsManager';

	// 状态
	let isInitialized = $state(false);
	let isAvailable = $state(false);
	let modelsExist = $state(false);
	let modelLoaded = $state(false);
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);

	// 设置
	let enabled = $state(false);
	let upscaleAfterColorize = $state(false);
	let colorizationSize = $state(576);
	let denoiseSigma = $state(25);

	onMount(async () => {
		await initializeColorizer();
	});

	async function initializeColorizer() {
		try {
			isLoading = true;
			errorMessage = null;

			// 获取模型目录和缓存目录
			const globalSettings = settingsManager.getSettings();
			const appDataDir = globalSettings.system?.thumbnailDirectory || 'C:/NeoView/cache';
			const modelDir = `${appDataDir}/colorize-models`;

			await colorizationManager.initialize(modelDir, appDataDir);

			isInitialized = colorizationManager.isInitialized();
			isAvailable = colorizationManager.isAvailable();
			modelsExist = colorizationManager.areModelsExist();
			modelLoaded = colorizationManager.isModelLoaded();

			// 同步状态
			enabled = colorizationManager.enabled;
			upscaleAfterColorize = colorizationManager.upscaleAfterColorize;
			colorizationSize = colorizationManager.currentModel.colorizationSize;
			denoiseSigma = colorizationManager.currentModel.denoiseSigma;
		} catch (error) {
			console.error('初始化上色管理器失败:', error);
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			isLoading = false;
		}
	}

	async function loadModel() {
		try {
			isLoading = true;
			errorMessage = null;
			await colorizationManager.loadModel('cuda');
			modelLoaded = colorizationManager.isModelLoaded();
		} catch (error) {
			console.error('加载上色模型失败:', error);
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			isLoading = false;
		}
	}

	async function unloadModel() {
		try {
			isLoading = true;
			await colorizationManager.unloadModel();
			modelLoaded = colorizationManager.isModelLoaded();
		} catch (error) {
			console.error('卸载上色模型失败:', error);
		} finally {
			isLoading = false;
		}
	}

	function handleEnabledChange(value: boolean) {
		enabled = value;
		colorizationManager.enabled = value;
	}

	function handleUpscaleAfterChange(value: boolean) {
		upscaleAfterColorize = value;
		colorizationManager.upscaleAfterColorize = value;
	}

	function handleSizeChange(value: number[]) {
		colorizationSize = value[0];
		colorizationManager.setColorizationSize(value[0]);
	}

	function handleDenoiseChange(value: number[]) {
		denoiseSigma = value[0];
		colorizationManager.setDenoiseSigma(value[0]);
	}
</script>

<div class="space-y-3">
	<!-- 状态指示 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Palette class="h-4 w-4 text-purple-500" />
			<span class="text-sm font-medium">漫画上色</span>
		</div>
		<div class="flex items-center gap-1">
			{#if isLoading}
				<Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
			{:else if !isAvailable}
				<XCircle class="h-3 w-3 text-destructive" />
				<span class="text-xs text-destructive">PyTorch 不可用</span>
			{:else if !modelsExist}
				<AlertCircle class="h-3 w-3 text-yellow-500" />
				<span class="text-xs text-yellow-500">模型缺失</span>
			{:else if modelLoaded}
				<CheckCircle2 class="h-3 w-3 text-green-500" />
				<span class="text-xs text-green-500">已加载</span>
			{:else}
				<span class="text-xs text-muted-foreground">未加载</span>
			{/if}
		</div>
	</div>

	{#if errorMessage}
		<div class="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
			{errorMessage}
		</div>
	{/if}

	<!-- 主开关 -->
	<div class="flex items-center justify-between">
		<Label for="colorize-enabled" class="text-xs">启用上色</Label>
		<Switch
			id="colorize-enabled"
			checked={enabled}
			onCheckedChange={handleEnabledChange}
			disabled={!isAvailable || !modelsExist || isLoading}
		/>
	</div>

	<!-- 上色后超分开关 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1">
			<Sparkles class="h-3 w-3 text-primary" />
			<Label for="upscale-after" class="text-xs">上色后超分</Label>
		</div>
		<Switch
			id="upscale-after"
			checked={upscaleAfterColorize}
			onCheckedChange={handleUpscaleAfterChange}
			disabled={!enabled || isLoading}
		/>
	</div>

	<!-- 上色尺寸 -->
	<div class="space-y-1">
		<div class="flex items-center justify-between">
			<Label class="text-xs">上色尺寸</Label>
			<span class="text-xs text-muted-foreground">{colorizationSize}px</span>
		</div>
		<input
			type="range"
			min={128}
			max={1024}
			step={32}
			value={colorizationSize}
			oninput={(e) => handleSizeChange([(e.target as HTMLInputElement).valueAsNumber])}
			disabled={!enabled || isLoading}
			class="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-primary disabled:opacity-50"
		/>
		<p class="text-[10px] text-muted-foreground">推荐 576 以下，较大尺寸需更多显存</p>
	</div>

	<!-- 降噪强度 -->
	<div class="space-y-1">
		<div class="flex items-center justify-between">
			<Label class="text-xs">降噪强度</Label>
			<span class="text-xs text-muted-foreground">{denoiseSigma}</span>
		</div>
		<input
			type="range"
			min={0}
			max={100}
			step={5}
			value={denoiseSigma}
			oninput={(e) => handleDenoiseChange([(e.target as HTMLInputElement).valueAsNumber])}
			disabled={!enabled || isLoading}
			class="w-full h-1.5 rounded-full appearance-none bg-muted cursor-pointer accent-primary disabled:opacity-50"
		/>
		<p class="text-[10px] text-muted-foreground">0 = 无降噪，25 = 默认</p>
	</div>

	<!-- 模型控制按钮 -->
	{#if isAvailable && modelsExist}
		<div class="flex gap-2">
			{#if modelLoaded}
				<Button
					variant="outline"
					size="sm"
					class="flex-1 text-xs"
					onclick={unloadModel}
					disabled={isLoading}
				>
					{#if isLoading}
						<Loader2 class="mr-1 h-3 w-3 animate-spin" />
					{/if}
					卸载模型
				</Button>
			{:else}
				<Button
					variant="default"
					size="sm"
					class="flex-1 text-xs"
					onclick={loadModel}
					disabled={isLoading}
				>
					{#if isLoading}
						<Loader2 class="mr-1 h-3 w-3 animate-spin" />
					{/if}
					加载模型
				</Button>
			{/if}
		</div>
	{/if}

	<!-- 模型下载提示 -->
	{#if isAvailable && !modelsExist}
		<div class="rounded bg-yellow-500/10 px-2 py-2 text-xs text-yellow-600">
			<p class="font-medium">需要下载模型文件</p>
			<p class="mt-1 text-[10px]">
				请将 generator.zip 和 net_rgb.pth 放入模型目录
			</p>
		</div>
	{/if}
</div>
