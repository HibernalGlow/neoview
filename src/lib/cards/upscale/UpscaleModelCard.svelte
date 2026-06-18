<script lang="ts">
	/**
	 * 超分模型选择卡片
	 */
	import { Label } from '$lib/components/ui/label';
	import {
		selectedModel,
		scale,
		tileSize,
		noiseLevel,
		gpuId,
		availableModels,
		isPyO3Available,
		saveSettings,
		MODEL_LABELS,
		GPU_OPTIONS,
		TILE_SIZE_OPTIONS,
		NOISE_LEVEL_OPTIONS
	} from '$lib/stores/upscale/upscalePanelStore.svelte';

	function getModelLabel(modelName: string): string {
		return MODEL_LABELS[modelName] || modelName.replace(/^MODEL_/, '').replace(/_/g, ' ');
	}

	function handleModelChange(value: string) {
		selectedModel.value = value;
		// 自动设置 scale 根据模型名
		if (value.includes('UP2X')) scale.value = 2;
		else if (value.includes('UP3X')) scale.value = 3;
		else if (value.includes('UP4X')) scale.value = 4;
		else if (value.includes('UP1X')) scale.value = 1;
		saveSettings();
	}
</script>

<div class="space-y-3 text-xs">
	{#if !isPyO3Available.value}
		<div class="text-muted-foreground py-4 text-center">
			<p>超分功能不可用</p>
			<p class="mt-1 text-[10px]">请检查 sr_vulkan 模块是否安装</p>
		</div>
	{:else}
		<!-- 模型选择 -->
		<div class="space-y-1">
			<Label class="text-xs">模型</Label>
			<select
				class="bg-muted h-7 w-full rounded border-0 px-2 text-xs"
				value={selectedModel.value}
				onchange={(e) => handleModelChange(e.currentTarget.value)}
			>
				{#each availableModels.value as model}
					<option value={model}>{getModelLabel(model)}</option>
				{/each}
			</select>
		</div>

		<!-- 参数配置 -->
		<div class="grid grid-cols-2 gap-2">
			<!-- 放大倍数 -->
			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">放大倍数</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={scale.value}
					onchange={(e) => {
						scale.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					<option value={1}>1x</option>
					<option value={2}>2x</option>
					<option value={3}>3x</option>
					<option value={4}>4x</option>
				</select>
			</div>

			<!-- Tile Size -->
			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">Tile Size</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={tileSize.value}
					onchange={(e) => {
						tileSize.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					{#each TILE_SIZE_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<!-- 降噪等级 -->
			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">降噪等级</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={noiseLevel.value}
					onchange={(e) => {
						noiseLevel.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					{#each NOISE_LEVEL_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<!-- GPU 选择 -->
			<div class="space-y-1">
				<Label class="text-muted-foreground text-[10px]">GPU</Label>
				<select
					class="bg-muted h-6 w-full rounded border-0 px-2 text-xs"
					value={gpuId.value}
					onchange={(e) => {
						gpuId.value = parseInt(e.currentTarget.value);
						saveSettings();
					}}
				>
					{#each GPU_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- 当前配置摘要 -->
		<div class="text-muted-foreground border-t pt-2 text-[10px]">
			<p>当前: {getModelLabel(selectedModel.value)} @ {scale.value}x</p>
		</div>
	{/if}
</div>
