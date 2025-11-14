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
	import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select';
	import { Slider } from '$lib/components/ui/slider';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Trash2, Plus, ArrowUp, ArrowDown, Copy } from '@lucide/svelte';
	import type { UpscaleCondition, ConditionExpression } from './UpscalePanel';
	import { createBlankCondition } from '$lib/utils/upscale/conditions';

	interface Props {
		conditions: UpscaleCondition[];
		conditionalUpscaleEnabled: boolean;
	}

	let {
		conditions = [],
		conditionalUpscaleEnabled = false
	}: Props = $props();

	const dispatch = createEventDispatcher();

	let activeTab = $state(conditions[0]?.id || '');

	// 可用的模型列表
	const availableModels = [
		{ value: 'real-cugan', label: 'Real-CUGAN' },
		{ value: 'realesrgan', label: 'Real-ESRGAN' },
		{ value: 'waifu2x', label: 'Waifu2x' }
	];

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

	// 添加新条件
	function addCondition() {
		const newCondition = createBlankCondition(`条件 ${conditions.length + 1}`);
		conditions = [...conditions, newCondition];
		activeTab = newCondition.id;
		persistConditions();
	}

	// 删除条件
	function deleteCondition(id: string) {
		if (conditions.length <= 1) {
			alert('至少需要保留一个条件');
			return;
		}
		
		conditions = conditions.filter(c => c.id !== id);
		if (activeTab === id) {
			activeTab = conditions[0]?.id || '';
		}
		persistConditions();
	}

	// 复制条件
	function duplicateCondition(condition: UpscaleCondition) {
		const newCondition = {
			...condition,
			id: `condition-${Date.now()}`,
			name: `${condition.name} (副本)`
		};
		conditions = [...conditions, newCondition];
		activeTab = newCondition.id;
		persistConditions();
	}

	// 移动条件优先级
	function moveCondition(id: string, direction: 'up' | 'down') {
		const index = conditions.findIndex(c => c.id === id);
		if (index === -1) return;

		const newIndex = direction === 'up' ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= conditions.length) return;

		const newConditions = [...conditions];
		[newConditions[index], newConditions[newIndex]] = [newConditions[newIndex], newConditions[index]];
		
		// 更新优先级
		newConditions.forEach((c, i) => {
			c.priority = i;
		});

		conditions = newConditions;
		persistConditions();
	}

	// 更新条件
	function updateCondition(id: string, updates: Partial<UpscaleCondition>) {
		conditions = conditions.map(c => 
			c.id === id ? { ...c, ...updates } : c
		);
		persistConditions();
	}

	// 更新匹配规则
	function updateMatch(id: string, matchUpdates: Partial<UpscaleCondition['match']>) {
		conditions = conditions.map(c => 
			c.id === id ? { ...c, match: { ...c.match, ...matchUpdates } } : c
		);
		persistConditions();
	}

	// 更新动作参数
	function updateAction(id: string, actionUpdates: Partial<UpscaleCondition['action']>) {
		conditions = conditions.map(c => 
			c.id === id ? { ...c, action: { ...c.action, ...actionUpdates } } : c
		);
		persistConditions();
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
	function persistConditions() {
		dispatch('conditionsChanged', { conditions });
	}

	// 监听条件变化，同步 activeTab
	$effect(() => {
		if (conditions.length > 0 && !conditions.find(c => c.id === activeTab)) {
			activeTab = conditions[0]?.id || '';
		}
	});
</script>

<div class="w-full space-y-4">
	{#if conditionalUpscaleEnabled}
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-semibold">超分条件</h3>
			<Button size="sm" onclick={addCondition}>
				<Plus class="w-4 h-4 mr-1" />
				添加条件
			</Button>
		</div>

		{#if conditions.length > 0}
			<Tabs bind:value={activeTab} className="w-full">
				<TabsList className="grid w-full grid-cols-{conditions.length}">
					{#each conditions as condition (condition.id)}
						<TabsTrigger value={condition.id} className="flex items-center gap-2">
							<span>{condition.name}</span>
							{#if !condition.enabled}
								<Badge variant="secondary" class="text-xs">已禁用</Badge>
							{/if}
						</TabsTrigger>
					{/each}
				</TabsList>

				{#each conditions as condition (condition.id)}
					<TabsContent value={condition.id} class="space-y-4">
						<Card>
							<CardHeader>
								<div class="flex items-center justify-between">
									<CardTitle className="text-base">{condition.name}</CardTitle>
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
							<CardContent className="space-y-6">
								<!-- 基础设置 -->
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor={`name-${condition.id}`}>条件名称</Label>
										<Input
											id={`name-${condition.id}`}
											value={condition.name}
											onchange={(e) => updateCondition(condition.id, { name: e.target.value })}
										/>
									</div>
									<div className="flex items-center space-x-2 pt-6">
										<Switch
											id={`enabled-${condition.id}`}
											checked={condition.enabled}
											onchange={(checked) => updateCondition(condition.id, { enabled: checked })}
										/>
										<Label htmlFor={`enabled-${condition.id}`}>启用此条件</Label>
									</div>
								</div>

								<!-- 匹配规则 -->
								<div className="space-y-4">
									<h4 className="text-sm font-semibold">匹配规则</h4>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label htmlFor={`minWidth-${condition.id}`}>最小宽度</Label>
											<Input
												id={`minWidth-${condition.id}`}
												type="number"
												value={condition.match.minWidth || ''}
												onchange={(e) => updateMatch(condition.id, { minWidth: Number(e.target.value) || undefined })}
												placeholder="不限制"
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`minHeight-${condition.id}`}>最小高度</Label>
											<Input
												id={`minHeight-${condition.id}`}
												type="number"
												value={condition.match.minHeight || ''}
												onchange={(e) => updateMatch(condition.id, { minHeight: Number(e.target.value) || undefined })}
												placeholder="不限制"
											/>
										</div>
									</div>

									<div className="space-y-2">
										<Label htmlFor={`regexBookPath-${condition.id}`}>书籍路径正则</Label>
										<Input
											id={`regexBookPath-${condition.id}`}
											value={condition.match.regexBookPath || ''}
											onchange={(e) => updateMatch(condition.id, { regexBookPath: e.target.value || undefined })}
											placeholder="例如: .*manga.*"
										/>
									</div>

									<div className="space-y-2">
										<Label htmlFor={`regexImagePath-${condition.id}`}>图片路径正则</Label>
										<Input
											id={`regexImagePath-${condition.id}`}
											value={condition.match.regexImagePath || ''}
											onchange={(e) => updateMatch(condition.id, { regexImagePath: e.target.value || undefined })}
											placeholder="例如: .*\\.(jpg|png)$"
										/>
									</div>

									<div className="flex items-center space-x-2">
										<Switch
											id={`excludeFromPreload-${condition.id}`}
											checked={condition.match.excludeFromPreload || false}
											onchange={(checked) => updateMatch(condition.id, { excludeFromPreload: checked })}
										/>
										<Label htmlFor={`excludeFromPreload-${condition.id}`}>排除预超分队列</Label>
									</div>

									<!-- 自定义元数据 -->
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<Label>自定义元数据</Label>
											<Button size="sm" variant="outline" onclick={() => addMetadataCondition(condition.id)}>
												<Plus class="w-4 h-4 mr-1" />
												添加条件
											</Button>
										</div>
										{#if condition.match.metadata && Object.keys(condition.match.metadata).length > 0}
											<div className="space-y-2">
												{#each Object.entries(condition.match.metadata) as [key, expression]}
													<div className="grid grid-cols-4 gap-2 items-end">
														<div className="space-y-1">
															<Label className="text-xs">键名</Label>
															<Input
																value={key}
																onchange={(e) => {
																	const { [key]: removed, ...rest } = condition.match.metadata || {};
																	const newMetadata = { ...rest, [e.target.value]: expression };
																	updateMatch(condition.id, { metadata: newMetadata });
																}}
																size="sm"
															/>
														</div>
														<div className="space-y-1">
															<Label className="text-xs">操作符</Label>
															<Select
																value={expression.operator}
																onchange={(value) => updateMetadataExpression(condition.id, key, { ...expression, operator: value })}
															>
																<SelectTrigger size="sm">
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	{#each operators as op}
																		<SelectItem value={op.value}>{op.label}</SelectItem>
																	{/each}
																</SelectContent>
															</Select>
														</div>
														<div className="space-y-1">
															<Label className="text-xs">值</Label>
															<Input
																value={String(expression.value)}
																onchange={(e) => updateMetadataExpression(condition.id, key, { ...expression, value: e.target.value })}
																size="sm"
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
											<p className="text-sm text-muted-foreground">暂无自定义元数据条件</p>
										{/if}
									</div>
								</div>

								<!-- 执行参数 -->
								<div className="space-y-4">
									<h4 className="text-sm font-semibold">执行参数</h4>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label htmlFor={`model-${condition.id}`}>模型</Label>
											<Select
												value={condition.action.model}
												onchange={(value) => updateAction(condition.id, { model: value })}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{#each availableModels as model}
														<SelectItem value={model.value}>{model.label}</SelectItem>
													{/each}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`scale-${condition.id}`}>缩放倍数: {condition.action.scale}x</Label>
											<Slider
												value={[condition.action.scale]}
												onchange={(value) => updateAction(condition.id, { scale: value[0] })}
												min={1}
												max={4}
												step={0.5}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`tileSize-${condition.id}`}>分块大小: {condition.action.tileSize}</Label>
											<Slider
												value={[condition.action.tileSize]}
												onchange={(value) => updateAction(condition.id, { tileSize: value[0] })}
												min={100}
												max={800}
												step={50}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`noiseLevel-${condition.id}`}>降噪级别: {condition.action.noiseLevel}</Label>
											<Slider
												value={[condition.action.noiseLevel]}
												onchange={(value) => updateAction(condition.id, { noiseLevel: value[0] })}
												min={-1}
												max={3}
												step={1}
											/>
										</div>
										<div className="space-y-2">
											<Label htmlFor={`gpuId-${condition.id}`}>GPU ID</Label>
											<Input
												id={`gpuId-${condition.id}`}
												type="number"
												value={condition.action.gpuId}
												onchange={(e) => updateAction(condition.id, { gpuId: Number(e.target.value) })}
											/>
										</div>
										<div className="flex items-center space-x-2 pt-6">
											<Switch
												id={`useCache-${condition.id}`}
												checked={condition.action.useCache}
												onchange={(checked) => updateAction(condition.id, { useCache: checked })}
											/>
											<Label htmlFor={`useCache-${condition.id}`}>使用缓存</Label>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
				{/each}
			</Tabs>
		{:else}
			<Card>
				<CardContent className="pt-6">
					<div className="text-center">
						<p className="text-muted-foreground mb-4">暂无超分条件</p>
						<Button onclick={addCondition}>
							<Plus class="w-4 h-4 mr-1" />
							添加第一个条件
						</Button>
					</div>
				</CardContent>
			</Card>
		{/if}
	{:else}
		<Card>
			<CardContent className="pt-6">
				<p class="text-sm text-muted-foreground">启用条件超分后可以配置多个条件规则</p>
			</CardContent>
		</Card>
	{/if}
</div>