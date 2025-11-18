<script lang="ts">
	/**
	 * NeoView - Upscale Panel Condition Tabs
	 * 超分条件管理界面组件
	 */
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Slider } from '$lib/components/ui/slider';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Trash2, Plus, ArrowUp, ArrowDown, Copy, Upload, Download, RotateCcw } from '@lucide/svelte';
	import type { UpscaleCondition, ConditionExpression } from './UpscalePanel';
	import type { ConditionPresetKey } from '$lib/utils/upscale/conditions';
	import {
		createBlankCondition,
		CONDITION_PRESET_OPTIONS,
		createPresetCondition,
		getDefaultConditionPresets,
		normalizeCondition
	} from '$lib/utils/upscale/conditions';
	import UpscaleConditionActionEditor from './UpscaleConditionActionEditor.svelte';

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

	const presetOptions = CONDITION_PRESET_OPTIONS;
	const dimensionModeOptions = [
		{ value: 'and', label: '同时满足' },
		{ value: 'or', label: '任一满足' }
	];
	let importDialogOpen = $state(false);
	let importJson = $state('');

	// 操作符列表
	const operators = [
		{ value: 'eq', label: '等于' },
		{ value: 'ne', label: '不等于' },
		{ value: 'gt', label: '大于' },
		{ value: 'gte', label: '大于等于' },
		{ value: 'lt', label: '小于' },
		{ value: 'lte', label: '小于等于' },
		{ value: 'regex', label: '正则匹配' },
		{ value: 'contains', label: '包含' }
	];

	function normalizeList(list: UpscaleCondition[]): UpscaleCondition[] {
		return list.map((condition, index) =>
			normalizeCondition(
				{
					...condition,
					priority: index
				},
				index
			)
		);
	}

	function persistConditions(nextList?: UpscaleCondition[]) {
		const normalized = normalizeList(nextList ?? conditions);
		conditions = normalized;
		dispatch('conditionsChanged', { conditions: normalized });
	}

	// 添加新条件
	function addBlankCondition() {
		const newCondition = createBlankCondition(`条件 ${conditions.length + 1}`);
		newCondition.priority = conditions.length;
		persistConditions([...conditions, newCondition]);
		activeTab = newCondition.id;
	}

	function addConditionFromPreset(key: ConditionPresetKey) {
		const preset = createPresetCondition(key, conditions.length);
		if (!preset) return;
		preset.priority = conditions.length;
		persistConditions([...conditions, preset]);
		activeTab = preset.id;
	}

	// 删除条件
	function deleteCondition(id: string) {
		if (conditions.length <= 1) {
			alert('至少需要保留一个条件');
			return;
		}
		
		const next = conditions.filter(c => c.id !== id);
		persistConditions(next);
		if (activeTab === id) {
			activeTab = next[0]?.id || '';
		}
	}

	// 复制条件
	function duplicateCondition(condition: UpscaleCondition) {
		const newCondition = normalizeCondition(
			{
				...condition,
				id: '',
				name: `${condition.name} (副本)`
			},
			conditions.length
		);
		newCondition.priority = conditions.length;
		persistConditions([...conditions, newCondition]);
		activeTab = newCondition.id;
	}

	// 移动条件优先级
	function moveCondition(id: string, direction: 'up' | 'down') {
		const index = conditions.findIndex(c => c.id === id);
		if (index === -1) return;

		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= conditions.length) return;

		const newConditions = [...conditions];
		[newConditions[index], newConditions[newIndex]] = [newConditions[newIndex], newConditions[index]];
		persistConditions(newConditions);
	}

	// 更新条件
	function updateCondition(id: string, updates: Partial<UpscaleCondition>) {
		const next = conditions.map(c =>
			c.id === id ? normalizeCondition({ ...c, ...updates }, c.priority) : c
		);
		persistConditions(next);
	}

	// 更新匹配规则
	function updateMatch(id: string, matchUpdates: Partial<UpscaleCondition['match']>) {
		const next = conditions.map(c =>
			c.id === id
				? {
						...c,
						match: {
							...c.match,
							...matchUpdates
						}
					}
				: c
		);
		persistConditions(next);
	}

	// 更新动作参数
	function updateAction(id: string, actionUpdates: Partial<UpscaleCondition['action']>) {
		const next = conditions.map(c =>
			c.id === id
				? {
						...c,
						action: {
							...c.action,
							...actionUpdates
						}
					}
				: c
		);
		persistConditions(next);
	}

	// 添加元数据条件
	function addMetadataCondition(id: string) {
		const condition = conditions.find(c => c.id === id);
		if (!condition) return;

		const newKey = `key_${Object.keys(condition.match.metadata || {}).length + 1}`;
		const newExpression: ConditionExpression = {
			operator: 'eq',
			value: ''
		};

		updateMatch(id, {
			metadata: {
				...condition.match.metadata,
				[newKey]: newExpression
			}
		});
	}

	// 删除元数据条件
	function deleteMetadataCondition(id: string, key: string) {
		const condition = conditions.find(c => c.id === id);
		if (!condition || !condition.match.metadata) return;

		const { [key]: removed, ...restMetadata } = condition.match.metadata;
		updateMatch(id, { metadata: restMetadata });
	}

	// 更新元数据表达式
	function updateMetadataExpression(id: string, key: string, expression: ConditionExpression) {
		const condition = conditions.find(c => c.id === id);
		if (!condition || !condition.match.metadata) return;

		updateMatch(id, {
			metadata: {
				...condition.match.metadata,
				[key]: expression
			}
		});
	}

	// 持久化条件
	// 监听条件变化，同步 activeTab
	$effect(() => {
		if (conditions.length > 0 && !conditions.find(c => c.id === activeTab)) {
			activeTab = conditions[0]?.id || '';
		}
	});

	function parseNumericInput(value: string): number | undefined {
		if (value === '' || value === null || value === undefined) {
			return undefined;
		}
		const parsed = Number(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	function handleExportConditions() {
		const payload = JSON.stringify(conditions, null, 2);
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard
				.writeText(payload)
				.then(() => {
					console.log('已复制条件 JSON');
				})
				.catch(() => triggerJsonDownload(payload));
		} else {
			triggerJsonDownload(payload);
		}
	}

	function triggerJsonDownload(payload: string) {
		const blob = new Blob([payload], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'conditional-upscale.json';
		link.click();
		URL.revokeObjectURL(url);
	}

	function openImportModal() {
		importJson = JSON.stringify(conditions, null, 2);
		importDialogOpen = true;
	}

	function handleImportConfirm() {
		try {
			const parsed = JSON.parse(importJson);
			if (!Array.isArray(parsed)) {
				throw new Error('JSON 须为数组');
			}
			const normalized = normalizeList(parsed as UpscaleCondition[]);
			importDialogOpen = false;
			activeTab = normalized[0]?.id ?? '';
			persistConditions(normalized);
		} catch (error) {
			alert(`导入失败: ${error instanceof Error ? error.message : error}`);
		}
	}

	function handleRestorePresets() {
		const presets = getDefaultConditionPresets();
		activeTab = presets[0]?.id ?? '';
		persistConditions(presets);
	}
</script>

<div class="w-full space-y-4">
{#if conditionalUpscaleEnabled}
	<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
		<div>
			<h3 class="text-lg font-semibold">条件策略</h3>
			<p class="text-xs text-muted-foreground">根据尺寸 / 路径自动选择模型或跳过超分</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button size="sm">
						<Plus class="w-4 h-4 mr-1" />
						添加条件
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent class="w-72">
					<DropdownMenuLabel>快速预设</DropdownMenuLabel>
					{#each presetOptions as preset}
						<DropdownMenuItem onclick={() => addConditionFromPreset(preset.key as ConditionPresetKey)}>
							<div class="space-y-1">
								<p class="text-sm font-medium">{preset.name}</p>
								<p class="text-xs text-muted-foreground">{preset.description}</p>
							</div>
						</DropdownMenuItem>
					{/each}
					<DropdownMenuSeparator />
					<DropdownMenuItem onclick={addBlankCondition}>
						<Plus class="w-3.5 h-3.5 mr-2" />
						<span>空白条件</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button variant="outline" size="sm" onclick={handleExportConditions}>
				<Download class="w-4 h-4 mr-1" />
				导出 JSON
			</Button>
			<Button variant="outline" size="sm" onclick={openImportModal}>
				<Upload class="w-4 h-4 mr-1" />
				导入 JSON
			</Button>
			<Button variant="ghost" size="sm" onclick={handleRestorePresets}>
				<RotateCcw class="w-4 h-4 mr-1" />
				恢复预设
			</Button>
		</div>
	</div>

		{#if conditions.length > 0}
			<Tabs bind:value={activeTab} class="w-full">
				<TabsList class="flex flex-wrap gap-2">
					{#each conditions as condition (condition.id)}
						<TabsTrigger
							value={condition.id}
							class="flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm data-[state=active]:border-border data-[state=active]:bg-muted"
						>
							<span>{condition.name}</span>
							{#if !condition.enabled}
								<Badge variant="secondary" class="text-[10px]">已禁用</Badge>
							{/if}
							{#if condition.action.skip}
								<Badge variant="destructive" class="text-[10px]">不超分</Badge>
							{/if}
						</TabsTrigger>
					{/each}
				</TabsList>

				{#each conditions as condition (condition.id)}
					<TabsContent value={condition.id} class="space-y-4">
						<Card>
							<CardHeader>
								<div class="flex items-center justify-between">
									<CardTitle class="text-base">{condition.name}</CardTitle>
									<div class="flex items-center gap-2">
										<Badge variant="outline">优先级: {condition.priority}</Badge>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => moveCondition(condition.id, 'up')}
											disabled={condition.priority === 0}
										>
											<ArrowUp class="w-4 h-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => moveCondition(condition.id, 'down')}
											disabled={condition.priority === conditions.length - 1}
										>
											<ArrowDown class="w-4 h-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => duplicateCondition(condition)}
										>
											<Copy class="w-4 h-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => deleteCondition(condition.id)}
										>
											<Trash2 class="w-4 h-4" />
										</Button>
									</div>
								</div>
								<CardDescription>配置超分条件和执行参数</CardDescription>
							</CardHeader>
							<CardContent class="space-y-6">
								<!-- 基础设置 -->
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-2">
										<Label for={`name-${condition.id}`}>条件名称</Label>
										<Input
											id={`name-${condition.id}`}
											value={condition.name}
											onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
												updateCondition(condition.id, {
													name: event.currentTarget.value
												})}
										/>
									</div>
									<div class="flex items-center space-x-2 pt-6">
										<Switch
											id={`enabled-${condition.id}`}
											checked={condition.enabled}
											onclick={() =>
												updateCondition(condition.id, { enabled: !condition.enabled })}
										/>
										<Label for={`enabled-${condition.id}`}>启用此条件</Label>
									</div>
								</div>

								<!-- 匹配规则 -->
								<div class="space-y-4">
									<h4 class="text-sm font-semibold">匹配规则</h4>
									<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div class="space-y-2">
											<Label for={`minWidth-${condition.id}`}>最小宽度</Label>
											<Input
												id={`minWidth-${condition.id}`}
												type="number"
												value={condition.match.minWidth || ''}
												onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
													updateMatch(condition.id, {
														minWidth: parseNumericInput(event.currentTarget.value)
													})}
												placeholder="不限制"
											/>
										</div>
										<div class="space-y-2">
											<Label for={`minHeight-${condition.id}`}>最小高度</Label>
											<Input
												id={`minHeight-${condition.id}`}
												type="number"
												value={condition.match.minHeight || ''}
												onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
													updateMatch(condition.id, {
														minHeight: parseNumericInput(event.currentTarget.value)
													})}
												placeholder="不限制"
											/>
										</div>
										<div class="space-y-2">
											<Label for={`maxWidth-${condition.id}`}>最大宽度</Label>
											<Input
												id={`maxWidth-${condition.id}`}
												type="number"
												value={condition.match.maxWidth || ''}
												onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
													updateMatch(condition.id, {
														maxWidth: parseNumericInput(event.currentTarget.value)
													})}
												placeholder="不限制"
											/>
										</div>
										<div class="space-y-2">
											<Label for={`maxHeight-${condition.id}`}>最大高度</Label>
											<Input
												id={`maxHeight-${condition.id}`}
												type="number"
												value={condition.match.maxHeight || ''}
												onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
													updateMatch(condition.id, {
														maxHeight: parseNumericInput(event.currentTarget.value)
													})}
												placeholder="不限制"
											/>
										</div>
									</div>

									<div class="space-y-2">
										<Label>宽高判定逻辑</Label>
										<div class="flex gap-2">
											{#each dimensionModeOptions as option}
												<Button
													type="button"
													size="sm"
													variant={condition.match.dimensionMode === option.value ? 'default' : 'outline'}
													onclick={() => updateMatch(condition.id, { dimensionMode: option.value as 'and' | 'or' })}
												>
													{option.label}
												</Button>
											{/each}
										</div>
										<p class="text-xs text-muted-foreground">
											例如基础 A 预设使用 OR，以宽度或高度任一超出即触发。
										</p>
									</div>

									<div class="space-y-2">
										<Label for={`regexBookPath-${condition.id}`}>书籍路径正则</Label>
										<Input
											id={`regexBookPath-${condition.id}`}
											value={condition.match.regexBookPath || ''}
											onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
												updateMatch(condition.id, {
													regexBookPath: event.currentTarget.value || undefined
												})}
											placeholder="例如: .*manga.*"
										/>
									</div>

									<div class="space-y-2">
										<Label for={`regexImagePath-${condition.id}`}>图片路径正则</Label>
										<Input
											id={`regexImagePath-${condition.id}`}
											value={condition.match.regexImagePath || ''}
											onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
												updateMatch(condition.id, {
													regexImagePath: event.currentTarget.value || undefined
												})}
											placeholder="例如: .*\\.(jpg|png)$"
										/>
									</div>

									<div class="flex items-center space-x-2">
										<Switch
											id={`excludeFromPreload-${condition.id}`}
											checked={condition.match.excludeFromPreload || false}
											onclick={() =>
												updateMatch(condition.id, {
													excludeFromPreload: !condition.match.excludeFromPreload
												})}
										/>
										<Label for={`excludeFromPreload-${condition.id}`}>排除预超分队列</Label>
									</div>

									<!-- 自定义元数据 -->
									<div class="space-y-2">
										<div class="flex items-center justify-between">
											<Label>自定义元数据</Label>
											<Button size="sm" variant="outline" onclick={() => addMetadataCondition(condition.id)}>
												<Plus class="w-4 h-4 mr-1" />
												添加条件
											</Button>
										</div>
										{#if condition.match.metadata && Object.keys(condition.match.metadata).length > 0}
											<div class="space-y-2">
												{#each Object.entries(condition.match.metadata) as [key, expression]}
													<div class="grid grid-cols-4 gap-2 items-end">
														<div class="space-y-1">
															<Label class="text-xs">键名</Label>
															<Input
																value={key}
																onchange={(event: Event & { currentTarget: HTMLInputElement }) => {
																	const { [key]: removed, ...rest } = condition.match.metadata || {};
																	const newMetadata = { ...rest, [event.currentTarget.value]: expression };
																	updateMatch(condition.id, { metadata: newMetadata });
																}}
															/>
														</div>
														<div class="space-y-1">
															<Label class="text-xs">操作符</Label>
															<NativeSelect
																value={expression.operator}
																onchange={(event: Event & { currentTarget: HTMLSelectElement }) =>
																	updateMetadataExpression(condition.id, key, {
																		...expression,
																		operator: event.currentTarget.value as ConditionExpression['operator']
																	})}
																class="w-full"
															>
																{#each operators as op}
																	<NativeSelectOption value={op.value}>
																		{op.label}
																	</NativeSelectOption>
																{/each}
															</NativeSelect>
														</div>
														<div class="space-y-1">
															<Label class="text-xs">值</Label>
															<Input
																value={String(expression.value)}
																onchange={(event: Event & { currentTarget: HTMLInputElement }) =>
																	updateMetadataExpression(condition.id, key, {
																		...expression,
																		value: event.currentTarget.value
																	})}
															/>
														</div>
														<Button
															variant="ghost"
															size="sm"
															onclick={() => deleteMetadataCondition(condition.id, key)}
														>
															<Trash2 class="w-4 h-4" />
														</Button>
													</div>
												{/each}
											</div>
										{:else}
											<p class="text-sm text-muted-foreground">暂无自定义元数据条件</p>
										{/if}
									</div>
								</div>

								<!-- 执行参数 -->
								<div class="space-y-4">
									<h4 class="text-sm font-semibold">执行参数</h4>
									<UpscaleConditionActionEditor
										condition={condition}
										availableModels={availableModels}
										modelLabels={modelLabels}
										gpuOptions={gpuOptions}
										tileSizeOptions={tileSizeOptions}
										noiseLevelOptions={noiseLevelOptions}
										on:apply={(event) => updateAction(condition.id, event.detail.action)}
									/>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				{/each}
			</Tabs>
		{:else}
			<Card>
				<CardContent class="pt-6">
					<div class="text-center">
						<p class="text-muted-foreground mb-4">暂无超分条件</p>
						<Button onclick={addBlankCondition}>
							<Plus class="w-4 h-4 mr-1" />
							添加第一个条件
						</Button>
					</div>
				</CardContent>
			</Card>
		{/if}
	{:else}
		<Card>
			<CardContent class="pt-6">
				<p class="text-sm text-muted-foreground">启用条件超分后可以配置多个条件规则</p>
			</CardContent>
		</Card>
	{/if}
</div>

<Dialog bind:open={importDialogOpen}>
	<DialogContent class="sm:max-w-2xl">
		<DialogHeader>
			<DialogTitle>导入条件 JSON</DialogTitle>
			<DialogDescription>粘贴或修改 JSON 文本，确认后将覆盖当前的条件列表。</DialogDescription>
		</DialogHeader>
		<textarea
			class="h-64 w-full resize-none rounded-md border border-border bg-background p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
			bind:value={importJson}
			placeholder="[&#123; 'name': '条件A', ... &#125;]"
		></textarea>
		<DialogFooter class="flex gap-2">
			<Button variant="ghost" onclick={() => (importDialogOpen = false)}>取消</Button>
			<Button onclick={handleImportConfirm}>导入</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>