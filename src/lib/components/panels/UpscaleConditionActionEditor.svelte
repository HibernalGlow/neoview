<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import UpscalePanelModelSettings from './UpscalePanelModelSettings.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import type { UpscaleCondition } from './UpscalePanel';

	interface Props {
		condition: UpscaleCondition;
		availableModels: string[];
		modelLabels: Record<string, string>;
		gpuOptions: { value: number; label: string }[];
		tileSizeOptions: { value: number; label: string }[];
		noiseLevelOptions: { value: number; label: string }[];
	}

	const dispatch = createEventDispatcher<{
		apply: { id: string; action: UpscaleCondition['action'] };
	}>();

	let {
		condition,
		availableModels = [],
		modelLabels = {},
		gpuOptions = [],
		tileSizeOptions = [],
		noiseLevelOptions = []
	}: Props = $props();

	let selectedModel = $state(condition.action.model);
	let scale = $state(condition.action.scale);
	let tileSize = $state(condition.action.tileSize);
	let noiseLevel = $state(condition.action.noiseLevel);
	let gpuId = $state(condition.action.gpuId);
	let useCache = $state(condition.action.useCache);
	let skipUpscale = $state(condition.action.skip ?? false);

	$effect(() => {
		selectedModel = condition.action.model;
		scale = condition.action.scale;
		tileSize = condition.action.tileSize;
		noiseLevel = condition.action.noiseLevel;
		gpuId = condition.action.gpuId;
		useCache = condition.action.useCache;
		skipUpscale = condition.action.skip ?? false;
	});

	function emitApply() {
		dispatch('apply', {
			id: condition.id,
			action: {
				model: selectedModel,
				scale,
				tileSize,
				noiseLevel,
				gpuId,
				useCache,
				skip: skipUpscale
			}
		});
	}
</script>

<div class="space-y-4">
	<div class="rounded-md border border-border/70">
		<div class="flex items-center justify-between px-4 py-3 border-b border-border/60">
			<div>
				<p class="text-sm font-medium">模型与参数</p>
				<p class="text-xs text-muted-foreground">复用全局模型选择器</p>
			</div>
			{#if skipUpscale}
				<span class="text-xs text-amber-500">当前设置为不超分</span>
			{/if}
		</div>
		<div class="p-4" class:opacity-50={skipUpscale} class:pointer-events-none={skipUpscale}>
			<UpscalePanelModelSettings
				bind:scale
				bind:selectedModel
				availableModels={availableModels}
				modelLabels={modelLabels}
				bind:gpuId
				gpuOptions={gpuOptions}
				bind:tileSize
				tileSizeOptions={tileSizeOptions}
				bind:noiseLevel
				noiseLevelOptions={noiseLevelOptions}
				on:apply={emitApply}
			/>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
		<label class="flex items-center gap-2 text-sm">
			<Switch bind:checked={useCache} disabled={skipUpscale} />
			<Label class="cursor-pointer">写入缓存</Label>
		</label>
		<label class="flex items-center gap-2 text-sm">
			<Switch bind:checked={skipUpscale} />
			<Label class="cursor-pointer">只记录为不超分</Label>
		</label>
	</div>

	<div class="text-right">
		<Button size="sm" variant="secondary" onclick={emitApply}>保存动作配置</Button>
	</div>
</div>

