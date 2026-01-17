<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Settings } from '@lucide/svelte';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';

	const dispatch = createEventDispatcher();

	let {
		scale = $bindable(2),
		selectedModel = $bindable(''),
		availableModels = $bindable([] as string[]),
		modelLabels = $bindable({} as Record<string, string>),
		gpuId = $bindable(0),
		gpuOptions = $bindable([] as { value: number; label: string }[]),
		tileSize = $bindable(0),
		tileSizeOptions = $bindable([] as { value: number; label: string }[]),
		noiseLevel = $bindable(0),
		noiseLevelOptions = $bindable([] as { value: number; label: string }[])
	} = $props();

	function handleApply() {
		dispatch('apply');
	}
</script>

<div class="space-y-2">
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
			<span class="text-sm text-muted-foreground">x</span>
		</div>
	</div>

	<div class="setting-row">
		<Label>模型：</Label>
		<NativeSelect class="min-w-[150px]" bind:value={selectedModel}>
			{#each availableModels as model}
				<NativeSelectOption value={model}>
					{modelLabels[model] || model}
				</NativeSelectOption>
			{/each}
		</NativeSelect>
	</div>

	<div class="setting-row">
		<Label>GPU：</Label>
		<NativeSelect class="min-w-[150px]" bind:value={gpuId}>
			{#each gpuOptions as option}
				<NativeSelectOption value={option.value}>
					{option.label}
				</NativeSelectOption>
			{/each}
		</NativeSelect>
	</div>

	<div class="setting-row">
		<Label>Tile Size：</Label>
		<NativeSelect class="min-w-[150px]" bind:value={tileSize}>
			{#each tileSizeOptions as option}
				<NativeSelectOption value={option.value}>
					{option.label}
				</NativeSelectOption>
			{/each}
		</NativeSelect>
	</div>

	<div class="setting-row">
		<Label>降噪等级：</Label>
		<NativeSelect class="min-w-[150px]" bind:value={noiseLevel}>
			{#each noiseLevelOptions as option}
				<NativeSelectOption value={option.value}>
					{option.label}
				</NativeSelectOption>
			{/each}
		</NativeSelect>
	</div>

	<Button onclick={handleApply} class="w-full mt-2" variant="outline">
		<Settings class="w-4 h-4 mr-2" />
		应用设置
	</Button>
</div>
