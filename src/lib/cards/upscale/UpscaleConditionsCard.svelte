<script lang="ts">
/**
 * 超分条件管理卡片
 * 包装 UpscalePanelConditionTabs 组件
 */
import { ChevronDown, ChevronUp, Settings2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import UpscalePanelConditionTabs from '$lib/components/panels/UpscalePanelConditionTabs.svelte';
import {
	conditionalUpscaleEnabled,
	conditionsList,
	availableModels,
	saveSettings,
	MODEL_LABELS,
	GPU_OPTIONS,
	TILE_SIZE_OPTIONS,
	NOISE_LEVEL_OPTIONS
} from '$lib/stores/upscale/upscalePanelStore.svelte';

let expanded = $state(false);

function handleConditionsChange(event: CustomEvent) {
	// 条件列表已通过 bindable 更新
	saveSettings();
}
</script>

<div class="space-y-2 text-xs">
	<!-- 摘要信息 -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground">条件数量:</span>
			<span class="font-medium">{conditionsList.value.length}</span>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-muted-foreground">状态:</span>
			<span class={conditionalUpscaleEnabled.value ? 'text-green-500' : 'text-muted-foreground'}>
				{conditionalUpscaleEnabled.value ? '已启用' : '已禁用'}
			</span>
		</div>
	</div>

	<!-- 启用的条件列表预览 -->
	{#if conditionsList.value.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each conditionsList.value.filter(c => c.enabled).slice(0, 3) as cond}
				<span class="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded">
					{cond.name}
				</span>
			{/each}
			{#if conditionsList.value.filter(c => c.enabled).length > 3}
				<span class="text-[10px] text-muted-foreground">
					+{conditionsList.value.filter(c => c.enabled).length - 3} 更多
				</span>
			{/if}
		</div>
	{/if}

	<!-- 展开/折叠按钮 -->
	<Button
		variant="outline"
		size="sm"
		class="w-full h-7 text-xs"
		onclick={() => expanded = !expanded}
	>
		<Settings2 class="h-3 w-3 mr-1" />
		{expanded ? '收起条件编辑器' : '展开条件编辑器'}
		{#if expanded}
			<ChevronUp class="h-3 w-3 ml-auto" />
		{:else}
			<ChevronDown class="h-3 w-3 ml-auto" />
		{/if}
	</Button>

	<!-- 条件编辑器 -->
	{#if expanded}
		<div class="pt-2 border-t mt-2">
			<UpscalePanelConditionTabs
				bind:conditions={conditionsList.value}
				bind:conditionalUpscaleEnabled={conditionalUpscaleEnabled.value}
				availableModels={availableModels.value}
				modelLabels={MODEL_LABELS}
				gpuOptions={GPU_OPTIONS}
				tileSizeOptions={TILE_SIZE_OPTIONS}
				noiseLevelOptions={NOISE_LEVEL_OPTIONS}
				on:change={handleConditionsChange}
			/>
		</div>
	{/if}
</div>
