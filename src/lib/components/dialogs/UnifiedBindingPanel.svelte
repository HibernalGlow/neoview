<script lang="ts">
	/**
	 * 统一的操作绑定面板
	 * 参考 NeeView：键盘、鼠标、触摸手势统一管理
	 * 支持上下文感知的绑定配置
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import { keyBindingsStore, type InputBinding, type KeyBinding, type MouseGesture, type TouchGesture, type AreaClick, type BindingContext } from '$lib/stores/keybindings.svelte';
	import { Keyboard, Mouse, Hand, Trash2, Search, RotateCcw, Target, Layers, X, CheckCircle, AlertTriangle } from '@lucide/svelte';
	import GestureVisualizer from './GestureVisualizer.svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import MouseGestureRecorder from './MouseGestureRecorder.svelte';
	import MouseKeyRecorder from './MouseKeyRecorder.svelte';
	import AreaClickRecorder from './AreaClickRecorder.svelte';

	let searchQuery = $state('');
	let editingAction = $state<string | null>(null);
	let editingType = $state<'keyboard' | 'mouse' | 'touch' | 'area' | null>(null);
	let editingContext = $state<BindingContext>('global'); // 当前编辑的上下文
	let capturedInput = $state<string | { gesture?: string; button?: string; action?: string; area?: string }>('');
	let showGestureVisualizer = $state(false);
	let showMouseGestureRecorder = $state(false);
	let showMouseKeyRecorder = $state(false);
	let showAreaClickRecorder = $state(false);
	// 展开的上下文选择器 key: `${action}-${context}-${isContextBinding}`
	let expandedContextSelector = $state<string | null>(null);

	// 当前选中的分类 Tab
	let activeCategory = $state<string>('');

	// 过滤操作
	const filteredActions = $derived(
		searchQuery.trim()
			? keyBindingsStore.bindings.filter(
					(b) =>
						b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
						b.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
						b.description.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: keyBindingsStore.bindings
	);

	// 获取分类
	const categories = $derived(keyBindingsStore.getCategories());

	// 可用上下文列表
	const availableContexts = $derived(keyBindingsStore.getAvailableContexts());

	// 检测所有冲突
	type ConflictInfo = { action1: string; action2: string; binding: string; context: BindingContext };
	const allConflicts = $derived.by(() => {
		const conflicts: ConflictInfo[] = [];
		const bindingMap = new Map<string, { action: string; context: BindingContext }>();
		
		for (const actionBinding of keyBindingsStore.bindings) {
			// 检查全局绑定
			if (actionBinding.bindings) {
				for (const b of actionBinding.bindings) {
					const key = `global:${JSON.stringify(b)}`;
					const existing = bindingMap.get(key);
					if (existing && existing.action !== actionBinding.action) {
						conflicts.push({
							action1: existing.action,
							action2: actionBinding.action,
							binding: keyBindingsStore.formatBinding(b),
							context: 'global'
						});
					} else {
						bindingMap.set(key, { action: actionBinding.action, context: 'global' });
					}
				}
			}
			// 检查上下文绑定
			if (actionBinding.contextBindings) {
				for (const cb of actionBinding.contextBindings) {
					const key = `${cb.context}:${JSON.stringify(cb.input)}`;
					const existing = bindingMap.get(key);
					if (existing && existing.action !== actionBinding.action) {
						conflicts.push({
							action1: existing.action,
							action2: actionBinding.action,
							binding: keyBindingsStore.formatBinding(cb.input),
							context: cb.context as BindingContext
						});
					} else {
						bindingMap.set(key, { action: actionBinding.action, context: cb.context as BindingContext });
					}
				}
			}
		}
		return conflicts;
	});

	// 初始化默认分类
	$effect(() => {
		if (activeCategory === '' && categories.length > 0) {
			activeCategory = categories[0];
		}
	});

	// 当前分类下的操作
	const currentCategoryActions = $derived(
		activeCategory
			? keyBindingsStore.getBindingsByCategory(activeCategory).filter(b =>
					!searchQuery ||
					b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					b.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
					b.description.toLowerCase().includes(searchQuery.toLowerCase())
				)
			: []
	);

	// 根据分类获取默认上下文
	function getDefaultContextForCategory(category: string): BindingContext {
		if (category === '视频') return 'videoPlayer';
		return 'global';
	}

	// 开始编辑（支持上下文）
	function startEditing(action: string, type: 'keyboard' | 'mouse' | 'touch' | 'area', context: BindingContext = 'global') {
		editingAction = action;
		editingType = type;
		editingContext = context;
		capturedInput = '';
		
		if (type === 'touch') {
			showGestureVisualizer = true;
		} else if (type === 'area') {
			showAreaClickRecorder = true;
		}
	}

	// 取消编辑
	function cancelEditing() {
		editingAction = null;
		editingType = null;
		capturedInput = '';
		showGestureVisualizer = false;
		showMouseGestureRecorder = false;
		showMouseKeyRecorder = false;
		showAreaClickRecorder = false;
	}

	// 键盘按键捕获
	function handleKeyDown(e: KeyboardEvent) {
		if (editingAction && editingType === 'keyboard') {
			e.preventDefault();

			// 构建按键字符串
			const modifiers = [];
			if (e.ctrlKey) modifiers.push('Ctrl');
			if (e.shiftKey) modifiers.push('Shift');
			if (e.altKey) modifiers.push('Alt');

			// 特殊键映射
			const keyMap: Record<string, string> = {
				' ': 'Space',
				'+': 'Plus',
				'-': 'Minus',
				'ArrowUp': '↑',
				'ArrowDown': '↓',
				'ArrowLeft': '←',
				'ArrowRight': '→'
			};

			const key = keyMap[e.key] || e.key;
			capturedInput = [...modifiers, key].join('+');
		}
	}

	// 辅助类型
	type CapturedInputObject = { gesture?: string; button?: string; action?: string; area?: string };

	// 创建绑定对象的辅助函数
	function createBindingFromInput(): InputBinding | null {
		if (!capturedInput) return null;
		
		if (editingType === 'keyboard') {
			const key = typeof capturedInput === 'string' ? capturedInput : '';
			if (!key) return null;
			return { type: 'keyboard', key };
		} else if (editingType === 'mouse') {
			const obj = capturedInput as CapturedInputObject;
			return { 
				type: 'mouse', 
				gesture: obj.gesture || '', 
				button: (obj.button as 'left' | 'right' | 'middle') || 'left', 
				action: obj.action 
			} as MouseGesture;
		} else if (editingType === 'area') {
			const obj = capturedInput as CapturedInputObject;
			return { 
				type: 'area', 
				area: obj.area as any, 
				button: (obj.button as 'left' | 'right' | 'middle') || 'left', 
				action: (obj.action as 'click' | 'double-click' | 'press') || 'click'
			};
		} else if (editingType === 'touch') {
			const gesture = typeof capturedInput === 'string' ? capturedInput : '';
			if (!gesture) return null;
			return { type: 'touch', gesture };
		}
		return null;
	}

	// 保存绑定（支持上下文）
	function saveBinding() {
		if (!editingAction || !editingType || !capturedInput) return;
		
		const binding = createBindingFromInput();
		if (!binding) return;

		// 使用上下文感知的添加方法
		const conflict = keyBindingsStore.addContextBinding(editingAction, binding, editingContext);
		if (conflict) {
			// 处理冲突：提示用户
			handleConflict(conflict);
		} else {
			cancelEditing();
		}
	}

	// 处理绑定冲突
	async function handleConflict(conflict: { input: InputBinding; context: BindingContext; existingAction: string; newAction: string }) {
		const existingBinding = keyBindingsStore.getBinding(conflict.existingAction);
		const confirmed = await confirm({
			title: '绑定冲突',
			description: `此输入已绑定到 "${existingBinding?.name || conflict.existingAction}"。\n是否要替换现有绑定？`,
			confirmText: '替换',
			cancelText: '取消',
			variant: 'warning'
		});

		if (confirmed && editingAction && capturedInput) {
			const binding = createBindingFromInput();
			if (binding) {
				// 强制添加，移除冲突
				keyBindingsStore.forceAddContextBinding(editingAction, binding, editingContext);
			}
		}
		cancelEditing();
	}

	// 处理区域点击录制完成
	function handleAreaClickComplete(area: string, button: string, action: string) {
		capturedInput = { area, button, action };
		showAreaClickRecorder = false;
		saveBinding();
	}

	// 处理区域点击录制取消
	function handleAreaClickCancel() {
		showAreaClickRecorder = false;
		cancelEditing();
	}

	// 处理鼠标选项选择
	function handleMouseOption(gesture: string, button: 'left' | 'right' | 'middle', action: string) {
		capturedInput = { gesture, button, action };
		saveBinding();
	}

	// 处理鼠标手势录制完成
	function handleMouseGestureComplete(gesture: string, button: string, action: string) {
		capturedInput = { gesture, button, action };
		showMouseGestureRecorder = false;
		saveBinding();
	}

	// 处理鼠标手势录制取消
	function handleMouseGestureCancel() {
		showMouseGestureRecorder = false;
	}

	// 处理鼠标按键录制完成
	function handleMouseKeyComplete(gesture: string, button: string, action: string) {
		capturedInput = { gesture, button, action };
		showMouseKeyRecorder = false;
		saveBinding();
	}

	// 处理鼠标按键录制取消
	function handleMouseKeyCancel() {
		showMouseKeyRecorder = false;
	}

	// 处理手势完成
	function handleGestureComplete(gesture: string) {
		capturedInput = gesture;
		showGestureVisualizer = false;
		saveBinding();
	}

	// 处理手势取消
	function handleGestureCancel() {
		showGestureVisualizer = false;
		cancelEditing();
	}

	// 删除绑定（支持上下文）
	function removeBinding(action: string, index: number, isContextBinding: boolean, context?: BindingContext) {
		if (isContextBinding && context) {
			keyBindingsStore.removeContextBinding(action, context, index);
		} else {
			keyBindingsStore.removeBinding(action, index);
		}
	}

	// 切换绑定的上下文
	function changeBindingContext(action: string, inputBinding: InputBinding, currentContext: BindingContext, index: number, isContextBinding: boolean, newContext: BindingContext) {
		if (currentContext === newContext) {
			expandedContextSelector = null;
			return;
		}
		// 先删除旧绑定
		if (isContextBinding) {
			keyBindingsStore.removeContextBinding(action, currentContext, index);
		} else {
			keyBindingsStore.removeBinding(action, index);
		}
		// 添加到新上下文
		keyBindingsStore.addContextBinding(action, inputBinding, newContext);
		expandedContextSelector = null;
	}

	// 切换上下文选择器展开状态
	function toggleContextSelector(key: string) {
		expandedContextSelector = expandedContextSelector === key ? null : key;
	}

	// 获取上下文颜色
	function getContextColor(context: BindingContext): string {
		const colors: Record<BindingContext, string> = {
			global: 'bg-gray-500',
			viewer: 'bg-blue-500',
			videoPlayer: 'bg-red-500'
		};
		return colors[context] ?? 'bg-gray-500';
	}

	// 重置
	async function resetAll() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要重置所有绑定为默认设置吗？',
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			keyBindingsStore.resetToDefault();
		}
	}

	// 获取绑定图标
	function getBindingIcon(type: string) {
		switch (type) {
			case 'keyboard':
				return Keyboard;
			case 'mouse':
				return Mouse;
			case 'touch':
				return Hand;
			case 'area':
				return Target;
			default:
				return Keyboard;
		}
	}

	// 获取绑定颜色
	function getBindingColor(type: string): string {
		switch (type) {
			case 'keyboard':
				return 'text-blue-500';
			case 'mouse':
				return 'text-green-500';
			case 'touch':
				return 'text-purple-500';
			case 'area':
				return 'text-orange-500';
			default:
				return 'text-muted-foreground';
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="h-full flex flex-col bg-background">
	<!-- 头部 -->
	<div class="p-4 border-b space-y-3">
		<div class="flex items-center justify-between">
			<div class="space-y-1">
				<h3 class="text-lg font-semibold flex items-center gap-2">
					<Keyboard class="h-5 w-5" />
					操作绑定
				</h3>
				<p class="text-xs text-muted-foreground">
					配置快捷键、鼠标手势和触摸手势。支持为不同上下文配置相同按键的不同操作。
				</p>
			</div>
			<Button variant="outline" size="sm" onclick={resetAll}>
				<RotateCcw class="h-3 w-3 mr-1" />
				重置全部
			</Button>
		</div>

		<!-- 搜索栏和图例 -->
		<div class="flex items-center justify-between gap-4">
			<div class="relative flex-1 max-w-xs">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					type="text"
					placeholder="搜索操作..."
					bind:value={searchQuery}
					class="pl-9 h-8"
				/>
			</div>
			<!-- 上下文颜色图例 -->
			<div class="flex items-center gap-3 text-xs text-muted-foreground border rounded-md px-3 py-1.5 bg-muted/30">
				<span class="font-medium">上下文:</span>
				{#each availableContexts as ctx}
					<div class="flex items-center gap-1">
						<span class="w-2 h-2 rounded-full {getContextColor(ctx)}"></span>
						<span>{keyBindingsStore.formatContext(ctx)}</span>
					</div>
				{/each}
			</div>
			<!-- 冲突状态 -->
			{#if allConflicts.length === 0}
				<div class="flex items-center gap-1 text-xs text-green-600 border border-green-200 rounded-md px-2 py-1 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
					<CheckCircle class="h-3.5 w-3.5" />
					<span>无冲突</span>
				</div>
			{:else}
				<div class="flex items-center gap-1 text-xs text-amber-600 border border-amber-200 rounded-md px-2 py-1 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 cursor-pointer" title="点击查看冲突详情">
					<AlertTriangle class="h-3.5 w-3.5" />
					<span>{allConflicts.length} 个冲突</span>
				</div>
			{/if}
		</div>

		<!-- 冲突详情（如果有） -->
		{#if allConflicts.length > 0}
			<div class="border border-amber-200 rounded-md p-2 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
				<div class="text-xs text-amber-700 dark:text-amber-400 space-y-1">
					{#each allConflicts as conflict}
						<div class="flex items-center gap-1">
							<span class="w-2 h-2 rounded-full {getContextColor(conflict.context)}"></span>
							<span class="font-mono">{conflict.binding}</span>
							<span class="text-muted-foreground">:</span>
							<span class="font-medium">{conflict.action1}</span>
							<span class="text-muted-foreground">与</span>
							<span class="font-medium">{conflict.action2}</span>
							<span class="text-muted-foreground">冲突</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

	</div>

	<!-- 使用 shadcn Tabs 组件 -->
	<Tabs.Root bind:value={activeCategory} class="flex-1 flex flex-col overflow-hidden">
		<!-- 分类 Tab 列表 -->
		<div class="px-4 pt-2">
			<Tabs.List class="w-full flex-wrap h-auto gap-1">
				{#each categories as category}
					<Tabs.Trigger value={category} class="text-xs">
						{category}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>

		<!-- 当前分类的操作列表 -->
		{#each categories as category}
			{@const categoryActions = keyBindingsStore.getBindingsByCategory(category).filter(b =>
				!searchQuery ||
				b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				b.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
				b.description.toLowerCase().includes(searchQuery.toLowerCase())
			)}
			<Tabs.Content value={category} class="flex-1 overflow-y-auto p-4">
				<div class="space-y-3">
			{#each categoryActions as binding}
				<div class="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors">
					<!-- 操作信息 -->
					<div class="flex items-start justify-between">
						<div class="space-y-0.5">
							<div class="font-medium">{binding.name}</div>
							<div class="text-xs text-muted-foreground">{binding.description}</div>
						</div>
						<div class="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
							{binding.action}
						</div>
					</div>

					<!-- 绑定列表 - 按上下文分组 -->
					<div class="space-y-1.5">
						{#each availableContexts as ctx}
							{@const globalBindings = ctx === 'global' ? (binding.bindings || []) : []}
							{@const contextBindings = ctx !== 'global' ? (binding.contextBindings?.filter(cb => cb.context === ctx) || []) : []}
							{@const hasBindings = globalBindings.length > 0 || contextBindings.length > 0}
							
							{#if hasBindings}
								<div class="flex items-start gap-2">
									<!-- 上下文标签 -->
									<div class="flex items-center gap-1 text-[10px] text-muted-foreground min-w-[50px] pt-0.5">
										<span class="w-2 h-2 rounded-full {getContextColor(ctx)}"></span>
										<span>{keyBindingsStore.formatContext(ctx)}</span>
									</div>
									<!-- 该上下文的绑定 -->
									<div class="flex flex-wrap gap-1.5 flex-1">
										{#if ctx === 'global'}
											{#each globalBindings as inputBinding, index}
												{@const Icon = getBindingIcon(inputBinding.type)}
												{@const selectorKey = `${binding.action}-global-${index}`}
												<div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-xs border group hover:border-primary transition-colors">
													<button
														class="w-2 h-2 rounded-full bg-gray-500 hover:ring-2 hover:ring-gray-400 transition-all"
														onclick={() => toggleContextSelector(selectorKey)}
														title="点击切换上下文"
													></button>
													{#if expandedContextSelector === selectorKey}
														<div class="flex items-center gap-0.5 animate-in slide-in-from-left-2 duration-150">
															{#each availableContexts.filter(c => c !== 'global') as targetCtx}
																<button
																	class="w-2 h-2 rounded-full {getContextColor(targetCtx)} hover:ring-2 hover:ring-offset-1 transition-all"
																	onclick={() => changeBindingContext(binding.action, inputBinding, 'global', index, false, targetCtx)}
																	title={keyBindingsStore.formatContext(targetCtx)}
																></button>
															{/each}
														</div>
													{/if}
													<Icon class="h-3 w-3 {getBindingColor(inputBinding.type)}" />
													<span class="font-mono text-[11px]">{keyBindingsStore.formatBinding(inputBinding)}</span>
													<button
														class="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
														onclick={() => removeBinding(binding.action, index, false)}
														title="删除"
													><X class="h-3 w-3" /></button>
												</div>
											{/each}
										{:else}
											{#each contextBindings as cb, index}
												{@const Icon = getBindingIcon(cb.input.type)}
												{@const selectorKey = `${binding.action}-${ctx}-${index}`}
												<div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-xs border group hover:border-primary transition-colors">
													<button
														class="w-2 h-2 rounded-full {getContextColor(ctx)} hover:ring-2 hover:ring-offset-1 transition-all"
														onclick={() => toggleContextSelector(selectorKey)}
														title="点击切换上下文"
													></button>
													{#if expandedContextSelector === selectorKey}
														<div class="flex items-center gap-0.5 animate-in slide-in-from-left-2 duration-150">
															{#each availableContexts.filter(c => c !== ctx) as targetCtx}
																<button
																	class="w-2 h-2 rounded-full {getContextColor(targetCtx)} hover:ring-2 hover:ring-offset-1 transition-all"
																	onclick={() => changeBindingContext(binding.action, cb.input, ctx, index, true, targetCtx)}
																	title={keyBindingsStore.formatContext(targetCtx)}
																></button>
															{/each}
														</div>
													{/if}
													<Icon class="h-3 w-3 {getBindingColor(cb.input.type)}" />
													<span class="font-mono text-[11px]">{keyBindingsStore.formatBinding(cb.input)}</span>
													<button
														class="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
														onclick={() => removeBinding(binding.action, index, true, ctx)}
														title="删除"
													><X class="h-3 w-3" /></button>
												</div>
											{/each}
										{/if}
									</div>
								</div>
							{/if}
						{/each}

						<!-- 无绑定提示 -->
						{#if (!binding.bindings || binding.bindings.length === 0) && (!binding.contextBindings || binding.contextBindings.length === 0)}
							<div class="text-xs text-muted-foreground italic">暂无绑定</div>
						{/if}
					</div>

						<!-- 添加绑定区域 - 单行布局 -->
						<div class="flex items-center gap-2 pt-2 border-t mt-2 flex-wrap">
							<span class="text-[10px] text-muted-foreground shrink-0">添加到</span>
							<select 
								class="text-[10px] border rounded px-1.5 py-0.5 bg-background h-6"
								bind:value={editingContext}
							>
								{#each availableContexts as ctx}
									<option value={ctx}>{keyBindingsStore.formatContext(ctx)}</option>
								{/each}
							</select>
							<span class="text-muted-foreground/30">|</span>
							<button
								class="inline-flex items-center gap-0.5 h-6 px-1.5 text-[10px] rounded border border-input bg-background hover:bg-accent transition-colors"
								onclick={(e) => { e.preventDefault(); startEditing(binding.action, 'keyboard', editingContext); }}
							>
								<Keyboard class="h-3 w-3" />
								键盘
							</button>
							<button
								class="inline-flex items-center gap-0.5 h-6 px-1.5 text-[10px] rounded border border-input bg-background hover:bg-accent transition-colors"
								onclick={(e) => { e.preventDefault(); editingAction = binding.action; editingType = 'mouse'; capturedInput = ''; showMouseGestureRecorder = true; }}
							>
								<Mouse class="h-3 w-3" />
								手势
							</button>
							<button
								class="inline-flex items-center gap-0.5 h-6 px-1.5 text-[10px] rounded border border-input bg-background hover:bg-accent transition-colors"
								onclick={(e) => { e.preventDefault(); editingAction = binding.action; editingType = 'mouse'; capturedInput = ''; showMouseKeyRecorder = true; }}
							>
								<Mouse class="h-3 w-3" />
								鼠标键
							</button>
							<button
								class="inline-flex items-center gap-0.5 h-6 px-1.5 text-[10px] rounded border border-input bg-background hover:bg-accent transition-colors"
								onclick={(e) => { e.preventDefault(); startEditing(binding.action, 'touch', editingContext); }}
							>
								<Hand class="h-3 w-3" />
								触摸
							</button>
							<button
								class="inline-flex items-center gap-0.5 h-6 px-1.5 text-[10px] rounded border border-input bg-background hover:bg-accent transition-colors"
								onclick={(e) => { e.preventDefault(); startEditing(binding.action, 'area', editingContext); }}
							>
								<Target class="h-3 w-3" />
								区域
							</button>
						</div>
				</div>
			{/each}

			{#if categoryActions.length === 0}
				<div class="text-center py-8 text-muted-foreground">
					{#if searchQuery}
						没有找到匹配的操作
					{:else}
						此分类暂无操作
					{/if}
				</div>
			{/if}
			</div>
		</Tabs.Content>
		{/each}
	</Tabs.Root>

	<!-- 编辑对话框 -->
	{#if editingAction && editingType && editingType === 'keyboard'}
		<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div class="bg-background border rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
				<div class="space-y-2">
					<h4 class="font-semibold flex items-center gap-2">
						<Keyboard class="h-4 w-4 text-blue-500" />
						添加键盘按键
					</h4>
					<p class="text-sm text-muted-foreground">
						按下任意键或组合键
					</p>
				</div>

				<div class="p-4 border rounded-lg bg-muted/50 text-center">
					<div class="text-lg font-mono font-semibold">
						{capturedInput || '等待按键...'}
					</div>
				</div>

				<div class="flex justify-end gap-2">
					<Button variant="outline" onclick={cancelEditing}>取消</Button>
					<Button onclick={saveBinding} disabled={!capturedInput}>保存</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- 鼠标手势录制器 -->
	{#if showMouseGestureRecorder && editingAction && editingType === 'mouse'}
		<MouseGestureRecorder
			onComplete={handleMouseGestureComplete}
			onCancel={handleMouseGestureCancel}
		/>
	{/if}

	<!-- 区域点击录制器 -->
	{#if showAreaClickRecorder && editingAction && editingType === 'area'}
		<AreaClickRecorder
			onComplete={handleAreaClickComplete}
			onCancel={handleAreaClickCancel}
		/>
	{/if}

	<!-- 鼠标按键录制器 -->
	{#if showMouseKeyRecorder && editingAction && editingType === 'mouse'}
		<MouseKeyRecorder
			onComplete={handleMouseKeyComplete}
			onCancel={handleMouseKeyCancel}
		/>
	{/if}

	<!-- 手势可视化器 -->
	{#if showGestureVisualizer && editingAction && editingType === 'touch'}
		<GestureVisualizer
			type={editingType}
			onGestureComplete={handleGestureComplete}
			onCancel={handleGestureCancel}
		/>
	{/if}
</div>
