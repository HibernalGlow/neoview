<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Settings } from '@lucide/svelte';

	const dispatch = createEventDispatcher();

	let {
		scale = 2,
		selectedModel = '',
		availableModels = [],
		modelLabels = {},
		gpuId = 0,
		gpuOptions = [],
		tileSize = 0,
		tileSizeOptions = [],
		noiseLevel = 0,
		noiseLevelOptions = []
	}: {
		scale?: number;
		selectedModel?: string;
		availableModels?: string[];
		modelLabels?: Record<string, string>;
		gpuId?: number;
		gpuOptions?: { value: number; label: string }[];
		tileSize?: number;
		tileSizeOptions?: { value: number; label: string }[];
		noiseLevel?: number;
		noiseLevelOptions?: { value: number; label: string }[];
	} = $props();

	function handleApply() {
		dispatch('apply');
	}
</script>

<div class="section">
	<div class="section-title">
		<Settings class="w-4 h-4" />
		<span>修改参数</span>
	</div>

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

	<div class="setting-row">
		<Label>GPU：</Label>
		<select bind:value={gpuId} class="select-input">
			{#each gpuOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	<div class="setting-row">
		<Label>Tile Size：</Label>
		<select bind:value={tileSize} class="select-input">
			{#each tileSizeOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	<div class="setting-row">
		<Label>降噪等级：</Label>
		<select bind:value={noiseLevel} class="select-input">
			{#each noiseLevelOptions as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</div>

	<Button onclick={handleApply} class="w-full mt-2" variant="outline">
		<Settings class="w-4 h-4 mr-2" />
		应用设置
	</Button>
</div>
