<script lang="ts">
	/**
	 * 统一的操作绑定面板
	 * 参考 NeeView：键盘、鼠标、触摸手势统一管理
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { keyBindingsStore, type InputBinding, type KeyBinding, type MouseGesture, type TouchGesture } from '$lib/stores/keybindings.svelte';
	import { Keyboard, Mouse, Hand, Plus, Trash2, Search, RotateCcw } from '@lucide/svelte';
	import GestureVisualizer from './GestureVisualizer.svelte';
	import MouseRecordingArea from './MouseRecordingArea.svelte';

	let searchQuery = $state('');
	let editingAction = $state<string | null>(null);
	let editingType = $state<'keyboard' | 'mouse' | 'touch' | null>(null);
	let capturedInput = $state('');
	let showGestureVisualizer = $state(false);
	let showMouseOptions = $state(false);
	let showMouseRecordingArea = $state(false);

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

	// 开始编辑
	function startEditing(action: string, type: 'keyboard' | 'mouse' | 'touch') {
		editingAction = action;
		editingType = type;
		capturedInput = '';
		
		if (type === 'mouse') {
			// 显示鼠标录制区域
			showMouseRecordingArea = true;
		} else if (type === 'touch') {
			showGestureVisualizer = true;
		}
	}

	// 取消编辑
	function cancelEditing() {
		editingAction = null;
		editingType = null;
		capturedInput = '';
		showGestureVisualizer = false;
		showMouseOptions = false;
		showMouseRecordingArea = false;
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

	// 保存绑定
	function saveBinding() {
		if (editingAction && editingType && capturedInput) {
			let binding: InputBinding;

			if (editingType === 'keyboard') {
				binding = { type: 'keyboard', key: capturedInput };
			} else if (editingType === 'mouse') {
				binding = { type: 'mouse', gesture: capturedInput.gesture, button: capturedInput.button, action: capturedInput.action };
			} else {
				binding = { type: 'touch', gesture: capturedInput };
			}

			keyBindingsStore.addBinding(editingAction, binding);
			cancelEditing();
		}
	}

	// 处理鼠标选项选择
	function handleMouseOption(gesture: string, button: 'left' | 'right' | 'middle', action: string) {
		capturedInput = { gesture, button, action };
		saveBinding();
	}

	// 处理鼠标录制完成
	function handleMouseRecordingComplete(gesture: string, button: string, action: string) {
		capturedInput = { gesture, button, action: button as 'left' | 'right' | 'middle', action };
		showMouseRecordingArea = false;
		saveBinding();
	}

	// 处理鼠标录制取消
	function handleMouseRecordingCancel() {
		showMouseRecordingArea = false;
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

	// 删除绑定
	function removeBinding(action: string, index: number) {
		keyBindingsStore.removeBinding(action, index);
	}

	// 重置
	function resetAll() {
		if (confirm('确定要重置所有绑定为默认设置吗？')) {
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
			default:
				return 'text-muted-foreground';
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="h-full flex flex-col bg-background">
	<!-- 头部 -->
	<div class="p-6 border-b space-y-4">
		<div class="space-y-2">
			<h3 class="text-lg font-semibold flex items-center gap-2">
				<Keyboard class="h-5 w-5" />
				操作绑定
			</h3>
			<p class="text-sm text-muted-foreground">
				为每个操作配置键盘按键、鼠标手势和触摸手势。一个操作可以绑定多个输入方式。
			</p>
		</div>

		<!-- 搜索栏 -->
		<div class="relative max-w-md">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			<Input
				type="text"
				placeholder="搜索操作..."
				bind:value={searchQuery}
				class="pl-9"
			/>
		</div>

		<!-- 工具栏 -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4 text-xs text-muted-foreground">
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
			</div>
			<Button variant="outline" size="sm" onclick={resetAll}>
				<RotateCcw class="h-3 w-3 mr-1" />
				重置全部
			</Button>
		</div>
	</div>

	<!-- 操作列表 -->
	<div class="flex-1 overflow-y-auto">
		{#each categories as category}
			{@const categoryBindings = keyBindingsStore.getBindingsByCategory(category).filter(b => 
				!searchQuery || filteredActions.some(f => f.action === b.action)
			)}
			
			{#if categoryBindings.length > 0}
				<div class="p-6 border-b">
					<h4 class="text-sm font-semibold text-muted-foreground mb-4">{category}</h4>
					<div class="space-y-3">
						{#each categoryBindings as binding}
							<div class="border rounded-lg p-4 space-y-3">
								<!-- 操作信息 -->
								<div class="flex items-start justify-between">
									<div class="space-y-1">
										<div class="font-medium">{binding.name}</div>
										<div class="text-xs text-muted-foreground">{binding.description}</div>
										<div class="text-[10px] text-muted-foreground font-mono">
											{binding.action}
										</div>
									</div>
								</div>

								<!-- 绑定列表 -->
								<div class="space-y-2">
									{#if binding.bindings && binding.bindings.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each binding.bindings as inputBinding, index}
												{@const Icon = getBindingIcon(inputBinding.type)}
												<div
													class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs border group hover:border-primary transition-colors"
												>
													<Icon class="h-3 w-3 {getBindingColor(inputBinding.type)}" />
													<span class="font-mono">
														{keyBindingsStore.formatBinding(inputBinding)}
													</span>
													<button
														class="opacity-0 group-hover:opacity-100 ml-1 text-destructive hover:text-destructive/80 transition-opacity"
														onclick={() => removeBinding(binding.action, index)}
														title="删除"
													>
														<Trash2 class="h-3 w-3" />
													</button>
												</div>
											{/each}
										</div>
									{:else}
										<div class="text-xs text-muted-foreground italic">暂无绑定</div>
									{/if}

									<!-- 添加绑定按钮 -->
									<div class="flex gap-2">
										<button
											class="inline-flex items-center justify-center gap-1 h-7 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
											onclick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												startEditing(binding.action, 'keyboard');
											}}
										>
											<Keyboard class="h-3 w-3" />
											添加按键
										</button>
										<button
											class="inline-flex items-center justify-center gap-1 h-7 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
											onclick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												startEditing(binding.action, 'mouse');
											}}
										>
											<Mouse class="h-3 w-3" />
											录制鼠标
										</button>
										<button
											class="inline-flex items-center justify-center gap-1 h-7 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
											onclick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												startEditing(binding.action, 'touch');
											}}
										>
											<Hand class="h-3 w-3" />
											添加触摸
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>

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

	<!-- 鼠标录制区域 -->
	{#if showMouseRecordingArea && editingAction && editingType === 'mouse'}
		<MouseRecordingArea
			onComplete={handleMouseRecordingComplete}
			onCancel={handleMouseRecordingCancel}
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
