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
	import { Keyboard, Mouse, Hand, Trash2, Search, RotateCcw, Target, Layers, X } from '@lucide/svelte';
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
	let showContextSelector = $state(false); // 显示上下文选择器

	// 当前选中的分类 Tab
	let activeCategory = $state<string | null>(null);

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

	// 初始化默认分类
	$effect(() => {
		if (activeCategory === null && categories.length > 0) {
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

	// 获取上下文颜色
	function getContextColor(context: BindingContext): string {
		const colors: Record<string, string> = {
			global: 'bg-gray-500',
			viewer: 'bg-blue-500',
			fileBrowser: 'bg-green-500',
			thumbnailBar: 'bg-purple-500',
			videoPlayer: 'bg-red-500',
			zoomed: 'bg-yellow-500',
			sidebar: 'bg-cyan-500',
			settings: 'bg-orange-500'
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
		<div class="flex items-center gap-4">
			<div class="relative flex-1 max-w-xs">
				<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					type="text"
					placeholder="搜索操作..."
					bind:value={searchQuery}
					class="pl-9 h-8"
				/>
			</div>
			<div class="flex items-center gap-3 text-xs text-muted-foreground">
				<div class="flex items-center gap-1">
					<Keyboard class="h-3 w-3 text-blue-500" />
					<span>键盘</span>
				</div>
				<div class="flex items-center gap-1">
					<Mouse class="h-3 w-3 text-green-500" />
					<span>鼠标</span>
				</div>
				<div class="flex items-center gap-1">
					<Hand class="h-3 w-3 text-purple-500" />
					<span>触摸</span>
				</div>
				<div class="flex items-center gap-1">
					<Target class="h-3 w-3 text-orange-500" />
					<span>区域</span>
				</div>
				<div class="flex items-center gap-1">
					<Layers class="h-3 w-3 text-cyan-500" />
					<span>上下文</span>
				</div>
			</div>
		</div>

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

					<!-- 绑定列表 -->
					<div class="space-y-2">
						<!-- 全局绑定 -->
						{#if binding.bindings && binding.bindings.length > 0}
							<div class="space-y-1">
								<div class="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
									<span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
									全局
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each binding.bindings as inputBinding, index}
										{@const Icon = getBindingIcon(inputBinding.type)}
										<div
											class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-xs border group hover:border-primary transition-colors"
										>
											<Icon class="h-3 w-3 {getBindingColor(inputBinding.type)}" />
											<span class="font-mono text-[11px]">
												{keyBindingsStore.formatBinding(inputBinding)}
											</span>
											<button
												class="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
												onclick={() => removeBinding(binding.action, index, false)}
												title="删除"
											>
												<X class="h-3 w-3" />
											</button>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- 上下文绑定 -->
						{#if binding.contextBindings && binding.contextBindings.length > 0}
							{@const groupedByContext = binding.contextBindings.reduce((acc, cb) => {
								if (!acc[cb.context]) acc[cb.context] = [];
								acc[cb.context].push(cb);
								return acc;
							}, {} as Record<string, typeof binding.contextBindings>)}
							
							{#each Object.entries(groupedByContext) as [context, contextBindings]}
								<div class="space-y-1">
									<div class="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
										<span class="w-1.5 h-1.5 rounded-full {getContextColor(context)}"></span>
										{keyBindingsStore.formatContext(context)}
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each contextBindings as cb, index}
											{@const Icon = getBindingIcon(cb.input.type)}
											<div
												class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-xs border group hover:border-primary transition-colors"
											>
												<Icon class="h-3 w-3 {getBindingColor(cb.input.type)}" />
												<span class="font-mono text-[11px]">
													{keyBindingsStore.formatBinding(cb.input)}
												</span>
												<button
													class="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
													onclick={() => removeBinding(binding.action, index, true, context)}
													title="删除"
												>
													<X class="h-3 w-3" />
												</button>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						{/if}

						<!-- 无绑定提示 -->
						{#if (!binding.bindings || binding.bindings.length === 0) && (!binding.contextBindings || binding.contextBindings.length === 0)}
							<div class="text-xs text-muted-foreground italic">暂无绑定</div>
						{/if}

						<!-- 添加绑定按钮区域 -->
						<div class="pt-2 border-t mt-2">
							<div class="flex items-center gap-2 mb-2">
								<span class="text-xs text-muted-foreground">添加到:</span>
								<select 
									class="text-xs border rounded px-2 py-1 bg-background"
									bind:value={editingContext}
								>
									{#each availableContexts as ctx}
										<option value={ctx}>{keyBindingsStore.formatContext(ctx)}</option>
									{/each}
								</select>
							</div>
							<div class="flex gap-1.5 flex-wrap">
								<button
									class="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input bg-background hover:bg-accent transition-colors"
									onclick={(e) => {
										e.preventDefault();
										startEditing(binding.action, 'keyboard', editingContext);
									}}
								>
									<Keyboard class="h-3 w-3" />
									按键
								</button>
								<button
									class="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input bg-background hover:bg-accent transition-colors"
									onclick={(e) => {
										e.preventDefault();
										editingAction = binding.action;
										editingType = 'mouse';
										capturedInput = '';
										showMouseGestureRecorder = true;
									}}
								>
									<Mouse class="h-3 w-3" />
									手势
								</button>
								<button
									class="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input bg-background hover:bg-accent transition-colors"
									onclick={(e) => {
										e.preventDefault();
										editingAction = binding.action;
										editingType = 'mouse';
										capturedInput = '';
										showMouseKeyRecorder = true;
									}}
								>
									<Mouse class="h-3 w-3" />
									鼠标键
								</button>
								<button
									class="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input bg-background hover:bg-accent transition-colors"
									onclick={(e) => {
										e.preventDefault();
										startEditing(binding.action, 'touch', editingContext);
									}}
								>
									<Hand class="h-3 w-3" />
									触摸
								</button>
								<button
									class="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded border border-input bg-background hover:bg-accent transition-colors"
									onclick={(e) => {
										e.preventDefault();
										startEditing(binding.action, 'area', editingContext);
									}}
								>
									<Target class="h-3 w-3" />
									区域
								</button>
							</div>
						</div>
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
