<script lang="ts">
	/**
	 * 超分条件 Tab 组件
	 */
	import { createEventDispatcher } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, Trash2, ArrowUp, ArrowDown, Settings, Filter, Target } from '@lucide/svelte';
	import type { UpscaleCondition } from '$lib/types/upscaleConditions';
	import { createBlankCondition } from '$lib/types/upscaleConditions';
	import { getConditionDisplayName } from '$lib/utils/upscale/conditions';

	// Props
	let {
		conditionsList = $bindable<UpscaleCondition[]>([]),
		availableModels = [],
		modelLabels = {},
		gpuOptions = [],
		tileSizeOptions = [],
		noiseLevelOptions = []
	} = $props();

	const dispatch = createEventDispatcher();
	let activeTab = $state('0');

	// 模型选项
	const modelOptions = availableModels.map(model => ({
		value: model,
		label: modelLabels[model] || model
	}));

	function addCondition() {
		const newCondition = createBlankCondition(`条件 ${conditionsList.length + 1}`);
		// 设置优先级为当前最大值 + 1
		const maxPriority = Math.max(...conditionsList.map(c => c.priority), -1);
		newCondition.priority = maxPriority + 1;
		
		conditionsList = [...conditionsList, newCondition];
		activeTab = String(conditionsList.length - 1);
		persistChanges();
	}

	function removeCondition(index: number) {
		if (conditionsList.length <= 1) {
			console.warn('至少需要保留一个条件');
			return;
		}
		
		conditionsList = conditionsList.filter((_, i) => i !== index);
		if (activeTab === String(index)) {
			activeTab = '0';
		}
		persistChanges();
	}

	function moveConditionUp(index: number) {
		if (index <= 0) return;
		
		const newConditions = [...conditionsList];
		[newConditions[index - 1], newConditions[index]] = [newConditions[index], newConditions[index - 1]];
		conditionsList = newConditions;
		persistChanges();
	}

	function moveConditionDown(index: number) {
		if (index >= conditionsList.length - 1) return;
		
		const newConditions = [...conditionsList];
		[newConditions[index], newConditions[index + 1]] = [newConditions[index + 1], newConditions[index]];
		conditionsList = newConditions;
		persistChanges();
	}

	function updateCondition(index: number, updates: Partial<UpscaleCondition>) {
		conditionsList = conditionsList.map((c, i) => 
			i === index ? { ...c, ...updates } : c
		);
		persistChanges();
	}

	function updateConditionMatch(index: number, matchUpdates: Partial<UpscaleCondition['match']>) {
		conditionsList = conditionsList.map((c, i) => 
			i === index ? { ...c, match: { ...c.match, ...matchUpdates } } : c
		);
		persistChanges();
	}

	function updateConditionAction(index: number, actionUpdates: Partial<UpscaleCondition['action']>) {
		conditionsList = conditionsList.map((c, i) => 
			i === index ? { ...c, action: { ...c.action, ...actionUpdates } } : c
		);
		persistChanges();
	}

	function persistChanges() {
		dispatch('change');
	}

	function addMetadataRule(index: number) {
		const condition = conditionsList[index];
		const metadata = condition.match.metadata || {};
		const newKey = `key_${Object.keys(metadata).length + 1}`;
		
		updateConditionMatch(index, {
			metadata: {
				...metadata,
				[newKey]: { operator: 'eq', value: '' }
			}
		});
	}

	function removeMetadataRule(index: number, key: string) {
		const condition = conditionsList[index];
		const metadata = { ...condition.match.metadata };
		delete metadata[key];
		
		updateConditionMatch(index, { metadata });
	}

	function updateMetadataRule(index: number, key: string, updates: Partial<{ operator: string; value: string }>) {
		const condition = conditionsList[index];
		const metadata = condition.match.metadata || {};
		
		updateConditionMatch(index, {
			metadata: {
				...metadata,
				[key]: { ...metadata[key], ...updates }
			}
		});
	}

	function renameMetadataKey(conditionIndex: number, oldKey: string, newKey: string) {
		const trimmed = newKey.trim();
		if (!trimmed || trimmed === oldKey) return;

		const condition = conditionsList[conditionIndex];
		const metadata = condition.match.metadata || {};
		
		if (!metadata[oldKey]) return;

		const newMetadata = { ...metadata };
		newMetadata[trimmed] = newMetadata[oldKey];
		delete newMetadata[oldKey];
		
		updateConditionMatch(conditionIndex, { metadata: newMetadata });
	}
</script>

<Card class="w-full">
	<CardHeader>
		<div class="flex items-center justify-between">
			<div>
				<CardTitle class="flex items-center gap-2">
					<Target class="w-5 h-5" />
					条件超分配置
				</CardTitle>
				<CardDescription>
					设置不同条件下的超分参数，按优先级顺序匹配
				</CardDescription>
			</div>
			<Button onclick={addCondition} variant="outline" size="sm">
				<Plus class="w-4 h-4 mr-1" />
				添加条件
			</Button>
		</div>
	</CardHeader>

	<CardContent>
		<Tabs bind:value={activeTab} class="w-full">
			<TabsList class="grid w-full grid-cols-{Math.min(conditionsList.length, 4)} auto-cols-fr">
				{#each conditionsList as condition, index (condition.id)}
					<TabsTrigger value={String(index)} class="flex items-center gap-2">
						<span class="truncate max-w-20">{getConditionDisplayName(condition)}</span>
						{#if !condition.enabled}
							<Badge variant="secondary" class="text-xs">禁用</Badge>
						{/if}
					</TabsTrigger>
				{/each}
			</TabsList>

			{#each conditionsList as condition, index (condition.id)}
				<TabsContent value={String(index)} class="space-y-4 mt-4">
					<Card>
						<CardHeader class="pb-3">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<Switch 
										bind:checked={condition.enabled} 
										onchange={() => updateCondition(index, { enabled: condition.enabled })}
									/>
									<Input
										bind:value={condition.name}
										placeholder="条件名称"
										class="w-40"
										onchange={() => updateCondition(index, { name: condition.name })}
									/>
									<Badge variant="outline">优先级: {condition.priority}</Badge>
								</div>
								<div class="flex items-center gap-1">
									<Button
										onclick={() => moveConditionUp(index)}
										variant="ghost"
										size="sm"
										disabled={index === 0}
									>
										<ArrowUp class="w-4 h-4" />
									</Button>
									<Button
										onclick={() => moveConditionDown(index)}
										variant="ghost"
										size="sm"
										disabled={index === conditionsList.length - 1}
									>
										<ArrowDown class="w-4 h-4" />
									</Button>
									<Button
										onclick={() => removeCondition(index)}
										variant="ghost"
										size="sm"
										disabled={conditionsList.length <= 1}
									>
										<Trash2 class="w-4 h-4" />
									</Button>
								</div>
							</div>
						</CardHeader>

						<CardContent class="space-y-4">
							<!-- 匹配规则 -->
							<div class="space-y-3">
								<h4 class="text-sm font-medium flex items-center gap-2">
									<Filter class="w-4 h-4" />
									匹配规则
								</h4>
								
								<div class="grid grid-cols-2 gap-3">
									<div>
										<Label for="min-width-{index}" class="text-xs">最小宽度</Label>
										<Input
											id="min-width-{index}"
											type="number"
											min="0"
											bind:value={condition.match.minWidth}
											placeholder="0"
											onchange={() => updateConditionMatch(index, { minWidth: Number(condition.match.minWidth) || undefined })}
										/>
									</div>
									<div>
										<Label for="min-height-{index}" class="text-xs">最小高度</Label>
										<Input
											id="min-height-{index}"
											type="number"
											min="0"
											bind:value={condition.match.minHeight}
											placeholder="0"
											onchange={() => updateConditionMatch(index, { minHeight: Number(condition.match.minHeight) || undefined })}
										/>
									</div>
								</div>

								<div class="space-y-2">
									<Label for="book-path-{index}" class="text-xs">书籍路径正则</Label>
									<Input
										id="book-path-{index}"
										bind:value={condition.match.regexBookPath}
										placeholder="例如: .*\.cbz$"
										onchange={() => updateConditionMatch(index, { regexBookPath: condition.match.regexBookPath || undefined })}
									/>
								</div>

								<div class="space-y-2">
									<Label for="image-path-{index}" class="text-xs">图片路径正则</Label>
									<Input
										id="image-path-{index}"
										bind:value={condition.match.regexImagePath}
										placeholder="例如: .*page.*\.jpg"
										onchange={() => updateConditionMatch(index, { regexImagePath: condition.match.regexImagePath || undefined })}
									/>
								</div>

								<div class="flex items-center gap-2">
									<Switch 
										bind:checked={condition.match.excludeFromPreload}
										onchange={() => updateConditionMatch(index, { excludeFromPreload: condition.match.excludeFromPreload })}
									/>
									<Label class="text-xs">从预超分队列排除</Label>
								</div>

								<!-- 元数据规则 -->
								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<Label class="text-xs">元数据规则</Label>
										<Button onclick={() => addMetadataRule(index)} variant="outline" size="sm">
											<Plus class="w-3 h-3 mr-1" />
											添加规则
										</Button>
									</div>
									
									{#each Object.entries(condition.match.metadata || {}) as [key, rule] (key)}
										<div class="flex items-center gap-2 p-2 border rounded">
											<Input
												value={key}
												placeholder="键名"
												class="w-24"
												onchange={(event) => renameMetadataKey(index, key, event.currentTarget.value)}
											/>
											<Select
												bind:value={rule.operator}
												onchange={() => updateMetadataRule(index, key, { operator: rule.operator })}
											>
												<SelectTrigger class="w-24">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="eq">等于</SelectItem>
													<SelectItem value="ne">不等于</SelectItem>
													<SelectItem value="gt">大于</SelectItem>
													<SelectItem value="gte">大于等于</SelectItem>
													<SelectItem value="lt">小于</SelectItem>
													<SelectItem value="lte">小于等于</SelectItem>
													<SelectItem value="regex">正则</SelectItem>
													<SelectItem value="contains">包含</SelectItem>
												</SelectContent>
											</Select>
											<Input
												bind:value={rule.value}
												placeholder="值"
												class="flex-1"
												onchange={() => updateMetadataRule(index, key, { value: rule.value })}
											/>
											<Button
												onclick={() => removeMetadataRule(index, key)}
												variant="ghost"
												size="sm"
											>
												<Trash2 class="w-3 h-3" />
											</Button>
										</div>
									{/each}
								</div>
							</div>

							<!-- 动作设置 -->
							<div class="space-y-3 border-t pt-3">
								<h4 class="text-sm font-medium flex items-center gap-2">
									<Settings class="w-4 h-4" />
									超分参数
								</h4>
								
								<div class="grid grid-cols-2 gap-3">
									<div>
										<Label for="model-{index}" class="text-xs">模型</Label>
										<Select
											bind:value={condition.action.model}
											onchange={() => updateConditionAction(index, { model: condition.action.model })}
										>
											<SelectTrigger id="model-{index}">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{#each modelOptions as option}
													<SelectItem value={option.value}>{option.label}</SelectItem>
												{/each}
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label for="scale-{index}" class="text-xs">放大倍数</Label>
										<Select
											bind:value={condition.action.scale}
											onchange={() => updateConditionAction(index, { scale: Number(condition.action.scale) })}
										>
											<SelectTrigger id="scale-{index}">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="1">1x</SelectItem>
												<SelectItem value="2">2x</SelectItem>
												<SelectItem value="3">3x</SelectItem>
												<SelectItem value="4">4x</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>

								<div class="grid grid-cols-2 gap-3">
									<div>
										<Label for="tilesize-{index}" class="text-xs">Tile Size</Label>
										<Select
											bind:value={condition.action.tileSize}
											onchange={() => updateConditionAction(index, { tileSize: Number(condition.action.tileSize) })}
										>
											<SelectTrigger id="tilesize-{index}">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{#each tileSizeOptions as option}
													<SelectItem value={option.value}>
														{option.label}
													</SelectItem>
												{/each}
											</SelectContent>
										</Select>
									</div>
									<div>
										<Label for="noise-{index}" class="text-xs">降噪等级</Label>
										<Select
											bind:value={condition.action.noiseLevel}
											onchange={() => updateConditionAction(index, { noiseLevel: Number(condition.action.noiseLevel) })}
										>
											<SelectTrigger id="noise-{index}">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{#each noiseLevelOptions as option}
													<SelectItem value={option.value}>
														{option.label}
													</SelectItem>
												{/each}
											</SelectContent>
										</Select>
									</div>
								</div>

								<div class="grid grid-cols-2 gap-3">
									<div>
										<Label for="gpu-{index}" class="text-xs">GPU</Label>
										<Select
											bind:value={condition.action.gpuId}
											onchange={() => updateConditionAction(index, { gpuId: Number(condition.action.gpuId) })}
										>
											<SelectTrigger id="gpu-{index}">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{#each gpuOptions as option}
													<SelectItem value={option.value}>
														{option.label}
													</SelectItem>
												{/each}
											</SelectContent>
										</Select>
									</div>
									<div class="flex items-center gap-2">
										<Switch 
											bind:checked={condition.action.useCache}
											onchange={() => updateConditionAction(index, { useCache: condition.action.useCache })}
										/>
										<Label for="usecache-{index}" class="text-xs">使用缓存</Label>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			{/each}
		</Tabs>
	</CardContent>
</Card>

<style>
	:global(.grid-cols-1) { grid-template-columns: repeat(1, minmax(0, 1fr)); }
	:global(.grid-cols-2) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	:global(.grid-cols-3) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	:global(.grid-cols-4) { grid-template-columns: repeat(4, minmax(0, 1fr)); }
</style>