<script lang="ts">
/**
 * 条件超分 - 执行参数编辑器
 */
import { createEventDispatcher } from 'svelte';
import { Label } from '$lib/components/ui/label';
import { Switch } from '$lib/components/ui/switch';
import type { UpscaleCondition } from '$lib/components/panels/UpscalePanel';

interface Props {
	condition: UpscaleCondition;
	availableModels: string[];
	modelLabels: Record<string, string>;
	gpuOptions: { value: number; label: string }[];
	tileSizeOptions: { value: number; label: string }[];
	noiseLevelOptions: { value: number; label: string }[];
}

let {
	condition,
	availableModels = [],
	modelLabels = {},
	gpuOptions = [],
	tileSizeOptions = [],
	noiseLevelOptions = []
}: Props = $props();

const dispatch = createEventDispatcher<{
	update: { action: Partial<UpscaleCondition['action']> };
}>();

function updateAction(updates: Partial<UpscaleCondition['action']>) {
	dispatch('update', { action: updates });
}
</script>

<div class="space-y-3">
	<h4 class="text-xs font-semibold text-muted-foreground">执行参数</h4>
	
	<div class="grid grid-cols-2 md:grid-cols-3 gap-2" class:opacity-50={condition.action.skip}>
		<div class="space-y-1">
			<Label class="text-[10px]">模型</Label>
			<select
				class="w-full h-7 px-2 text-xs bg-muted rounded border-0"
				value={condition.action.model}
				disabled={condition.action.skip}
				onchange={(e) => updateAction({ model: e.currentTarget.value })}
			>
				{#each availableModels as model}
					<option value={model}>{modelLabels[model] || model}</option>
				{/each}
			</select>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">倍数</Label>
			<select
				class="w-full h-7 px-2 text-xs bg-muted rounded border-0"
				value={condition.action.scale}
				disabled={condition.action.skip}
				onchange={(e) => updateAction({ scale: parseInt(e.currentTarget.value) })}
			>
				<option value={1}>1x</option>
				<option value={2}>2x</option>
				<option value={3}>3x</option>
				<option value={4}>4x</option>
			</select>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">Tile</Label>
			<select
				class="w-full h-7 px-2 text-xs bg-muted rounded border-0"
				value={condition.action.tileSize}
				disabled={condition.action.skip}
				onchange={(e) => updateAction({ tileSize: parseInt(e.currentTarget.value) })}
			>
				{#each tileSizeOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">降噪</Label>
			<select
				class="w-full h-7 px-2 text-xs bg-muted rounded border-0"
				value={condition.action.noiseLevel}
				disabled={condition.action.skip}
				onchange={(e) => updateAction({ noiseLevel: parseInt(e.currentTarget.value) })}
			>
				{#each noiseLevelOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">GPU</Label>
			<select
				class="w-full h-7 px-2 text-xs bg-muted rounded border-0"
				value={condition.action.gpuId}
				disabled={condition.action.skip}
				onchange={(e) => updateAction({ gpuId: parseInt(e.currentTarget.value) })}
			>
				{#each gpuOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="flex flex-wrap gap-4">
		<label class="flex items-center gap-2 text-xs">
			<Switch
				checked={condition.action.useCache}
				disabled={condition.action.skip}
				onclick={() => updateAction({ useCache: !condition.action.useCache })}
			/>
			<span>写入缓存</span>
		</label>
		<label class="flex items-center gap-2 text-xs">
			<Switch
				checked={condition.action.skip ?? false}
				onclick={() => updateAction({ skip: !condition.action.skip })}
			/>
			<span class="text-amber-500">不超分</span>
		</label>
	</div>
</div>
