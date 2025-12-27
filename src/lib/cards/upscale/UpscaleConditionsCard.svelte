<script lang="ts">
/**
 * 超分条件管理卡片
 * 包装 UpscalePanelConditionTabs 组件
 */
import { ChevronDown, ChevronUp, Settings2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import UpscalePanelConditionTabs from './UpscalePanelConditionTabs.svelte';
import { Switch } from '$lib/components/ui/switch';
import { Label } from '$lib/components/ui/label';
import {
	conditionalUpscaleEnabled,
	autoUpscaleEnabled,
	conditionsList,
	availableModels,
	MODEL_LABELS,
	GPU_OPTIONS,
	TILE_SIZE_OPTIONS,
	NOISE_LEVEL_OPTIONS
} from '$lib/stores/upscale/upscalePanelStore.svelte';
import { syncUpscaleConditions } from '$lib/services/upscaleConditionSync';

let expanded = $state(false);

// 受全局自动超分开关控制
const isAutoUpscaleEnabled = $derived(autoUpscaleEnabled.value);

async function handleEnabledChange(checked: boolean) {
	conditionalUpscaleEnabled.value = checked;
	await syncUpscaleConditions(conditionalUpscaleEnabled.value, conditionsList.value);
}

async function handleConditionsChange(event: CustomEvent) {
	// 条件列表已通过 bindable 更新，统一同步
	await syncUpscaleConditions(conditionalUpscaleEnabled.value, conditionsList.value);
}
</script>

<div class="space-y-3 text-xs">
	<!-- 条件超分开关 -->
	<div class="flex items-center justify-between">
		<Label class="text-xs font-medium">条件超分</Label>
		<Switch
			checked={conditionalUpscaleEnabled.value}
			onCheckedChange={handleEnabledChange}
			class="scale-90"
			disabled={!isAutoUpscaleEnabled}
		/>
	</div>
	<p class="text-[10px] text-muted-foreground -mt-1">
		根据图片尺寸等条件决定是否超分
	</p>

	{#if !isAutoUpscaleEnabled}
		<div class="text-[10px] text-amber-500 bg-amber-500/10 rounded p-2">
			⚠️ 需要先启用「自动超分」才能生效
		</div>
	{/if}

	<!-- 摘要信息 -->
	{#if conditionalUpscaleEnabled.value && isAutoUpscaleEnabled}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground">条件数量:</span>
				<span class="font-medium">{conditionsList.value.length}</span>
			</div>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground">状态:</span>
				<span class="text-green-500">已启用</span>
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
				on:conditionsChanged={handleConditionsChange}
			/>
		</div>
	{/if}
</div>
