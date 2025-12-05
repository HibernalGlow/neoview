<script lang="ts">
/**
 * 超分条件管理 - 主组件（模块化版本）
 */
import { createEventDispatcher } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import { Switch } from '$lib/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
import { Badge } from '$lib/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
import { Trash2, ArrowUp, ArrowDown, Copy } from '@lucide/svelte';
import type { UpscaleCondition } from '$lib/components/panels/UpscalePanel';
import type { ConditionPresetKey } from '$lib/utils/upscale/conditions';
import { createBlankCondition, createPresetCondition, getDefaultConditionPresets, normalizeCondition } from '$lib/utils/upscale/conditions';
import ConditionHeader from './ConditionHeader.svelte';
import ConditionMatchEditor from './ConditionMatchEditor.svelte';
import ConditionActionEditor from './ConditionActionEditor.svelte';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';

interface Props {
	conditions: UpscaleCondition[];
	conditionalUpscaleEnabled: boolean;
	availableModels: string[];
	modelLabels: Record<string, string>;
	gpuOptions: { value: number; label: string }[];
	tileSizeOptions: { value: number; label: string }[];
	noiseLevelOptions: { value: number; label: string }[];
}

let {
	conditions = $bindable([] as UpscaleCondition[]),
	conditionalUpscaleEnabled = $bindable(false),
	availableModels = [],
	modelLabels = {},
	gpuOptions = [],
	tileSizeOptions = [],
	noiseLevelOptions = []
}: Props = $props();

const dispatch = createEventDispatcher();

let activeTab = $state(conditions[0]?.id || '');
let importDialogOpen = $state(false);
let importJson = $state('');

function normalizeList(list: UpscaleCondition[]): UpscaleCondition[] {
	return list.map((c, i) => normalizeCondition({ ...c, priority: i }, i));
}

function persistConditions(nextList?: UpscaleCondition[]) {
	const normalized = normalizeList(nextList ?? conditions);
	conditions = normalized;
	dispatch('conditionsChanged', { conditions: normalized });
}

function addBlankCondition() {
	const newCond = createBlankCondition(`条件 ${conditions.length + 1}`);
	newCond.priority = conditions.length;
	persistConditions([...conditions, newCond]);
	activeTab = newCond.id;
}

function addPresetCondition(key: ConditionPresetKey) {
	const preset = createPresetCondition(key, conditions.length);
	if (!preset) return;
	preset.priority = conditions.length;
	persistConditions([...conditions, preset]);
	activeTab = preset.id;
}

function deleteCondition(id: string) {
	if (conditions.length <= 1) { alert('至少保留一个条件'); return; }
	const next = conditions.filter(c => c.id !== id);
	persistConditions(next);
	if (activeTab === id) activeTab = next[0]?.id || '';
}

function duplicateCondition(cond: UpscaleCondition) {
	const newCond = normalizeCondition({ ...cond, id: '', name: `${cond.name} (副本)` }, conditions.length);
	newCond.priority = conditions.length;
	persistConditions([...conditions, newCond]);
	activeTab = newCond.id;
}

function moveCondition(id: string, dir: 'up' | 'down') {
	const idx = conditions.findIndex(c => c.id === id);
	if (idx === -1) return;
	const newIdx = dir === 'up' ? idx - 1 : idx + 1;
	if (newIdx < 0 || newIdx >= conditions.length) return;
	const next = [...conditions];
	[next[idx], next[newIdx]] = [next[newIdx], next[idx]];
	persistConditions(next);
}

function updateCondition(id: string, updates: Partial<UpscaleCondition>) {
	const next = conditions.map(c => c.id === id ? normalizeCondition({ ...c, ...updates }, c.priority) : c);
	persistConditions(next);
}

function updateMatch(id: string, matchUpdates: Partial<UpscaleCondition['match']>) {
	const next = conditions.map(c => c.id === id ? { ...c, match: { ...c.match, ...matchUpdates } } : c);
	persistConditions(next);
}

function updateAction(id: string, actionUpdates: Partial<UpscaleCondition['action']>) {
	const next = conditions.map(c => c.id === id ? { ...c, action: { ...c.action, ...actionUpdates } } : c);
	persistConditions(next);
}

$effect(() => {
	if (conditions.length > 0 && !conditions.find(c => c.id === activeTab)) {
		activeTab = conditions[0]?.id || '';
	}
});

function handleExport() {
	const payload = JSON.stringify(conditions, null, 2);
	navigator.clipboard?.writeText(payload).catch(() => {
		const blob = new Blob([payload], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = 'conditions.json'; a.click();
		URL.revokeObjectURL(url);
	});
}

function handleImport() {
	importJson = JSON.stringify(conditions, null, 2);
	importDialogOpen = true;
}

function confirmImport() {
	try {
		const parsed = JSON.parse(importJson);
		if (!Array.isArray(parsed)) throw new Error('JSON 须为数组');
		const normalized = normalizeList(parsed as UpscaleCondition[]);
		importDialogOpen = false;
		activeTab = normalized[0]?.id ?? '';
		persistConditions(normalized);
	} catch (e) {
		alert(`导入失败: ${e instanceof Error ? e.message : e}`);
	}
}

function handleRestore() {
	const presets = getDefaultConditionPresets();
	activeTab = presets[0]?.id ?? '';
	persistConditions(presets);
}

async function handleSync() {
	try {
		// 同步当前条件到后端
		await upscaleStore.syncConditionSettings({
			conditionalUpscaleEnabled,
			conditionsList: conditions,
		});
		
		// 同时保存到 config.json
		const { getStartupConfig, saveStartupConfig } = await import('$lib/config/startupConfig');
		const config = await getStartupConfig();
		config.upscaleConditionsEnabled = conditionalUpscaleEnabled;
		config.upscaleConditions = conditions.map(c => ({
			id: c.id,
			name: c.name,
			enabled: c.enabled,
			priority: c.priority,
			minWidth: c.match.minWidth ?? 0,
			minHeight: c.match.minHeight ?? 0,
			maxWidth: c.match.maxWidth ?? 0,
			maxHeight: c.match.maxHeight ?? 0,
			modelName: c.action.model,
			scale: c.action.scale,
			tileSize: c.action.tileSize,
			noiseLevel: c.action.noiseLevel,
			skip: c.action.skip ?? false,
		}));
		await saveStartupConfig(config);
		
		console.log('✅ 条件设置已同步到后端和 config.json');
	} catch (err) {
		console.error('❌ 同步条件设置失败:', err);
	}
}
</script>

<div class="w-full space-y-3">
	{#if conditionalUpscaleEnabled}
		<ConditionHeader
			on:addBlank={addBlankCondition}
			on:addPreset={(e) => addPresetCondition(e.detail.key)}
			on:export={handleExport}
			on:import={handleImport}
			on:restore={handleRestore}
			on:sync={handleSync}
		/>

		{#if conditions.length > 0}
			<Tabs bind:value={activeTab} class="w-full">
				<TabsList class="flex flex-wrap gap-1 h-auto">
					{#each conditions as cond (cond.id)}
						<TabsTrigger value={cond.id} class="text-xs px-2 py-1 h-7 flex items-center gap-1">
							{cond.name}
							{#if !cond.enabled}<Badge variant="secondary" class="text-[8px] px-1">禁用</Badge>{/if}
							{#if cond.action.skip}<Badge variant="destructive" class="text-[8px] px-1">跳过</Badge>{/if}
						</TabsTrigger>
					{/each}
				</TabsList>

				{#each conditions as cond (cond.id)}
					<TabsContent value={cond.id} class="mt-3">
						<Card>
							<CardHeader class="py-3 px-4">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<Input
											class="h-7 w-32 text-xs"
											value={cond.name}
											onchange={(e) => updateCondition(cond.id, { name: e.currentTarget.value })}
										/>
										<label class="flex items-center gap-1 text-xs">
											<Switch
												checked={cond.enabled}
												onclick={() => updateCondition(cond.id, { enabled: !cond.enabled })}
											/>
											<span>启用</span>
										</label>
									</div>
									<div class="flex items-center gap-1">
										<Badge variant="outline" class="text-[10px]">#{cond.priority}</Badge>
										<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={() => moveCondition(cond.id, 'up')} disabled={cond.priority === 0}>
											<ArrowUp class="w-3 h-3" />
										</Button>
										<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={() => moveCondition(cond.id, 'down')} disabled={cond.priority === conditions.length - 1}>
											<ArrowDown class="w-3 h-3" />
										</Button>
										<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={() => duplicateCondition(cond)}>
											<Copy class="w-3 h-3" />
										</Button>
										<Button variant="ghost" size="sm" class="h-6 w-6 p-0 text-destructive" onclick={() => deleteCondition(cond.id)}>
											<Trash2 class="w-3 h-3" />
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent class="space-y-4 px-4 pb-4">
								<ConditionMatchEditor
									condition={cond}
									on:update={(e) => updateMatch(cond.id, e.detail.match)}
								/>
								<ConditionActionEditor
									condition={cond}
									{availableModels}
									{modelLabels}
									{gpuOptions}
									{tileSizeOptions}
									{noiseLevelOptions}
									on:update={(e) => updateAction(cond.id, e.detail.action)}
								/>
							</CardContent>
						</Card>
					</TabsContent>
				{/each}
			</Tabs>
		{:else}
			<Card class="p-4">
				<p class="text-center text-xs text-muted-foreground">暂无条件，点击添加</p>
			</Card>
		{/if}
	{:else}
		<Card class="p-4">
			<p class="text-center text-xs text-muted-foreground">启用条件超分后可配置规则</p>
		</Card>
	{/if}
</div>

<Dialog bind:open={importDialogOpen}>
	<DialogContent class="sm:max-w-xl">
		<DialogHeader>
			<DialogTitle>导入条件 JSON</DialogTitle>
			<DialogDescription>粘贴或修改 JSON 文本</DialogDescription>
		</DialogHeader>
		<textarea
			class="h-48 w-full resize-none rounded-md border bg-background p-2 font-mono text-xs"
			bind:value={importJson}
		></textarea>
		<DialogFooter class="flex gap-2">
			<Button variant="ghost" onclick={() => (importDialogOpen = false)}>取消</Button>
			<Button onclick={confirmImport}>导入</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
