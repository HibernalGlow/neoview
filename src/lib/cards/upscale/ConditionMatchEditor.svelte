<script lang="ts">
/**
 * 条件超分 - 匹配规则编辑器
 */
import { createEventDispatcher } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import { Switch } from '$lib/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
import { Trash2, Plus } from '@lucide/svelte';
import type { UpscaleCondition, ConditionExpression } from '$lib/components/panels/UpscalePanel';

interface Props {
	condition: UpscaleCondition;
}

let { condition }: Props = $props();

const dispatch = createEventDispatcher<{
	update: { match: Partial<UpscaleCondition['match']> };
}>();

const dimensionModeOptions = [
	{ value: 'and', label: '同时满足' },
	{ value: 'or', label: '任一满足' }
];

const operators = [
	{ value: 'eq', label: '等于' },
	{ value: 'ne', label: '不等于' },
	{ value: 'gt', label: '大于' },
	{ value: 'gte', label: '≥' },
	{ value: 'lt', label: '小于' },
	{ value: 'lte', label: '≤' },
	{ value: 'regex', label: '正则' },
	{ value: 'contains', label: '包含' }
];

function parseNumericInput(value: string): number | undefined {
	if (value === '' || value === null || value === undefined) return undefined;
	const parsed = Number(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function updateMatch(updates: Partial<UpscaleCondition['match']>) {
	console.log('📝 ConditionMatchEditor updateMatch:', updates);
	dispatch('update', { match: updates });
}

function addMetadata() {
	const newKey = `key_${Object.keys(condition.match.metadata || {}).length + 1}`;
	const newExpr: ConditionExpression = { operator: 'eq', value: '' };
	updateMatch({ metadata: { ...condition.match.metadata, [newKey]: newExpr } });
}

function deleteMetadata(key: string) {
	const { [key]: _, ...rest } = condition.match.metadata || {};
	updateMatch({ metadata: rest });
}

function updateMetadata(key: string, expr: ConditionExpression) {
	updateMatch({ metadata: { ...condition.match.metadata, [key]: expr } });
}
</script>

<div class="space-y-3">
	<h4 class="text-xs font-semibold text-muted-foreground">匹配规则</h4>
	
	<!-- 尺寸限制 -->
	<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
		<div class="space-y-1">
			<Label class="text-[10px]">最小宽度</Label>
			<Input
				type="number"
				class="h-7 text-xs"
				value={condition.match.minWidth || ''}
				onchange={(e) => updateMatch({ minWidth: parseNumericInput(e.currentTarget.value) })}
				placeholder="不限"
			/>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">最小高度</Label>
			<Input
				type="number"
				class="h-7 text-xs"
				value={condition.match.minHeight || ''}
				onchange={(e) => updateMatch({ minHeight: parseNumericInput(e.currentTarget.value) })}
				placeholder="不限"
			/>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">最大宽度</Label>
			<Input
				type="number"
				class="h-7 text-xs"
				value={condition.match.maxWidth || ''}
				onchange={(e) => updateMatch({ maxWidth: parseNumericInput(e.currentTarget.value) })}
				placeholder="不限"
			/>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">最大高度</Label>
			<Input
				type="number"
				class="h-7 text-xs"
				value={condition.match.maxHeight || ''}
				onchange={(e) => updateMatch({ maxHeight: parseNumericInput(e.currentTarget.value) })}
				placeholder="不限"
			/>
		</div>
	</div>

	<!-- 总像素量限制 -->
	<div class="grid grid-cols-2 gap-2">
		<div class="space-y-1">
			<Label class="text-[10px]">最小像素量 (MPx)</Label>
			<Input
				type="number"
				step="0.1"
				class="h-7 text-xs"
				value={condition.match.minPixels || ''}
				onchange={(e) => updateMatch({ minPixels: parseNumericInput(e.currentTarget.value) })}
				placeholder="不限 (百万像素)"
			/>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">最大像素量 (MPx)</Label>
			<Input
				type="number"
				step="0.1"
				class="h-7 text-xs"
				value={condition.match.maxPixels || ''}
				onchange={(e) => updateMatch({ maxPixels: parseNumericInput(e.currentTarget.value) })}
				placeholder="不限 (百万像素)"
			/>
		</div>
	</div>

	<!-- 判定逻辑 -->
	<div class="flex items-center gap-2">
		<span class="text-[10px] text-muted-foreground">判定:</span>
		{#each dimensionModeOptions as opt}
			{@const mode = opt.value as 'and' | 'or'}
			<Button
				type="button"
				size="sm"
				class="h-6 text-[10px] px-2"
				variant={condition.match.dimensionMode === opt.value ? 'default' : 'outline'}
				onclick={() => updateMatch({ dimensionMode: mode })}
			>
				{opt.label}
			</Button>
		{/each}
	</div>

	<!-- 路径正则 -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
		<div class="space-y-1">
			<Label class="text-[10px]">书籍路径正则</Label>
			<Input
				class="h-7 text-xs"
				value={condition.match.regexBookPath || ''}
				onchange={(e) => updateMatch({ regexBookPath: e.currentTarget.value || undefined })}
				placeholder=".*manga.*"
			/>
		</div>
		<div class="space-y-1">
			<Label class="text-[10px]">图片路径正则</Label>
			<Input
				class="h-7 text-xs"
				value={condition.match.regexImagePath || ''}
				onchange={(e) => updateMatch({ regexImagePath: e.currentTarget.value || undefined })}
				placeholder=".*\.(jpg|png)$"
			/>
		</div>
	</div>

	<!-- 路径匹配选项 -->
	<div class="flex flex-wrap gap-4">
		<label class="flex items-center gap-2 text-xs">
			<Switch
				checked={condition.match.matchInnerPath || false}
				onclick={() => updateMatch({ matchInnerPath: !condition.match.matchInnerPath })}
			/>
			<span>匹配内部路径</span>
			<span class="text-[10px] text-muted-foreground">(默认只匹配book路径)</span>
		</label>
		<label class="flex items-center gap-2 text-xs">
			<Switch
				checked={condition.match.excludeFromPreload || false}
				onclick={() => updateMatch({ excludeFromPreload: !condition.match.excludeFromPreload })}
			/>
			<span>排除预超分队列</span>
		</label>
	</div>

	<!-- 自定义元数据 -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<Label class="text-[10px]">自定义元数据</Label>
			<Button size="sm" variant="outline" class="h-6 text-[10px]" onclick={addMetadata}>
				<Plus class="w-3 h-3 mr-1" />
				添加
			</Button>
		</div>
		{#if condition.match.metadata && Object.keys(condition.match.metadata).length > 0}
			{#each Object.entries(condition.match.metadata) as [key, expr]}
				<div class="grid grid-cols-4 gap-1 items-end">
					<Input
						class="h-6 text-[10px]"
						value={key}
						onchange={(e) => {
							const { [key]: _, ...rest } = condition.match.metadata || {};
							updateMatch({ metadata: { ...rest, [e.currentTarget.value]: expr } });
						}}
						placeholder="键"
					/>
					<NativeSelect
						class="h-6 text-[10px]"
						value={expr.operator}
						onchange={(e) => updateMetadata(key, { ...expr, operator: e.currentTarget.value as ConditionExpression['operator'] })}
					>
						{#each operators as op}
							<NativeSelectOption value={op.value}>{op.label}</NativeSelectOption>
						{/each}
					</NativeSelect>
					<Input
						class="h-6 text-[10px]"
						value={String(expr.value)}
						onchange={(e) => updateMetadata(key, { ...expr, value: e.currentTarget.value })}
						placeholder="值"
					/>
					<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={() => deleteMetadata(key)}>
						<Trash2 class="w-3 h-3" />
					</Button>
				</div>
			{/each}
		{:else}
			<p class="text-[10px] text-muted-foreground">无自定义条件</p>
		{/if}
	</div>
</div>
