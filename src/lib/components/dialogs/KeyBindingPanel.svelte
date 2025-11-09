<script lang="ts">
	/**
	 * NeoView - Key Binding Panel
	 * 操作绑定配置面板
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte.ts';
	import { RotateCcw, Plus, X, Keyboard, Mouse, Hand } from '@lucide/svelte';

	let searchQuery = $state('');
	let selectedAction = $state<string | null>(null);
	let recordingType = $state<'keyboard' | 'mouse' | 'touch' | null>(null);

	// 获取所有绑定
	$: allBindings = keyBindingsStore.bindings;
	$: categories = keyBindingsStore.getCategories();
	$: filteredBindings = searchQuery 
		? allBindings.filter(b => 
			b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
			b.action.toLowerCase().includes(searchQuery.toLowerCase())
		)
		: allBindings;

	// 开始录制
	function startRecording(action: string, type: 'keyboard' | 'mouse' | 'touch') {
		selectedAction = action;
		recordingType = type;
	}

	// 取消录制
	function cancelRecording() {
		selectedAction = null;
		recordingType = null;
	}

	// 处理键盘录制
	function handleKeyDown(event: KeyboardEvent) {
		if (recordingType !== 'keyboard' || !selectedAction) return;

		event.preventDefault();
		event.stopPropagation();

		// 忽略单独的修饰键
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
			return;
		}

		const modifiers = [];
		if (event.ctrlKey) modifiers.push('Ctrl');
		if (event.shiftKey) modifiers.push('Shift');
		if (event.altKey) modifiers.push('Alt');
		if (event.metaKey) modifiers.push('Meta');

		const keyCombo = modifiers.length > 0 
			? `${modifiers.join('+')}+${event.key}`
			: event.key;

		keyBindingsStore.addBinding(selectedAction, {
			type: 'keyboard',
			key: keyCombo
		});

		cancelRecording();
	}

	// 处理鼠标手势录制
	let mouseStartPos = $state<{ x: number; y: number } | null>(null);
	let mouseGesture = $state<string>('');

	function handleMouseDown(event: MouseEvent) {
		if (recordingType !== 'mouse' || !selectedAction) return;

		event.preventDefault();
		mouseStartPos = { x: event.clientX, y: event.clientY };
		mouseGesture = '';
	}

	function handleMouseMove(event: MouseEvent) {
		if (!mouseStartPos || recordingType !== 'mouse') return;

		const dx = event.clientX - mouseStartPos.x;
		const dy = event.clientY - mouseStartPos.y;
		const threshold = 30;

		if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
			if (Math.abs(dx) > Math.abs(dy)) {
				mouseGesture = dx > 0 ? 'R' : 'L';
			} else {
				mouseGesture = dy > 0 ? 'D' : 'U';
			}
		}
	}

	function handleMouseUp(event: MouseEvent) {
		if (!mouseStartPos || recordingType !== 'mouse' || !selectedAction) return;

		const button = event.button === 0 ? 'left' : event.button === 1 ? 'middle' : 'right';
		
		if (mouseGesture) {
			keyBindingsStore.addBinding(selectedAction, {
				type: 'mouse',
				gesture: mouseGesture,
				button: button as 'left' | 'right' | 'middle'
			});
		}

		mouseStartPos = null;
		mouseGesture = '';
		cancelRecording();
	}

	// 处理触摸手势录制
	let touchStartPos = $state<{ x: number; y: number } | null>(null);
	let touchStartTime = $state<number>(0);
	let touchGesture = $state<string>('');

	function handleTouchStart(event: TouchEvent) {
		if (recordingType !== 'touch' || !selectedAction) return;

		event.preventDefault();
		const touch = event.touches[0];
		touchStartPos = { x: touch.clientX, y: touch.clientY };
		touchStartTime = Date.now();
		touchGesture = '';
	}

	function handleTouchMove(event: TouchEvent) {
		if (!touchStartPos || recordingType !== 'touch') return;

		event.preventDefault();
		const touch = event.touches[0];
		const dx = touch.clientX - touchStartPos.x;
		const dy = touch.clientY - touchStartPos.y;
		const threshold = 30;

		if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
			if (Math.abs(dx) > Math.abs(dy)) {
				touchGesture = dx > 0 ? 'swipe-right' : 'swipe-left';
			} else {
				touchGesture = dy > 0 ? 'swipe-down' : 'swipe-up';
			}
		}
	}

	function handleTouchEnd(event: TouchEvent) {
		if (!touchStartPos || recordingType !== 'touch' || !selectedAction) return;

		event.preventDefault();
		const duration = Date.now() - touchStartTime;

		if (duration < 200 && !touchGesture) {
			touchGesture = 'tap';
		}

		if (touchGesture) {
			keyBindingsStore.addBinding(selectedAction, {
				type: 'touch',
				gesture: touchGesture
			});
		}

		touchStartPos = null;
		touchGesture = '';
		cancelRecording();
	}

	// 移除绑定
	function removeBinding(action: string, bindingIndex: number) {
		keyBindingsStore.removeBinding(action, bindingIndex);
	}

	// 格式化绑定显示
	function formatBinding(binding: import('$lib/stores/keybindings.svelte.ts').InputBinding): string {
		return keyBindingsStore.formatBinding(binding);
	}

	// 获取绑定图标
	function getBindingIcon(type: string) {
		switch (type) {
			case 'keyboard': return Keyboard;
			case 'mouse': return Mouse;
			case 'touch': return Hand;
			default: return Keyboard;
		}
	}

	// 重置为默认
	function resetToDefault() {
		if (confirm('确定要重置所有绑定为默认设置吗？')) {
			keyBindingsStore.resetToDefault();
		}
	}
</script>

<svelte:window 
	onkeydown={handleKeyDown}
	onmousedown={handleMouseDown}
	onmousemove={handleMouseMove}
	onmouseup={handleMouseUp}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
/>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-semibold">操作绑定设置</h3>
		<Button variant="outline" size="sm" onclick={resetToDefault}>
			<RotateCcw class="h-4 w-4 mr-2" />
			重置为默认
		</Button>
	</div>

	<!-- 搜索框 -->
	<Input 
		type="text" 
		placeholder="搜索操作..." 
		bind:value={searchQuery} 
		class="mb-4"
	/>

	<!-- 操作绑定列表 -->
	<div class="space-y-6">
		{#each categories as category}
			<div class="space-y-2">
				<h4 class="text-sm font-medium text-muted-foreground uppercase">{category}</h4>
				<div class="space-y-3">
					{#each filteredBindings.filter(b => b.category === category) as binding}
						<div class="border rounded-lg p-4">
							<div class="flex items-start justify-between mb-3">
								<div class="flex-1">
									<div class="text-sm font-medium">{binding.name}</div>
									<div class="text-xs text-muted-foreground">{binding.description}</div>
									<div class="text-xs text-muted-foreground mt-1">ID: {binding.action}</div>
								</div>
							</div>

							<!-- 当前绑定列表 -->
							<div class="space-y-2 mb-3">
								{#each binding.bindings as bind, i}
									<div class="flex items-center gap-2">
										{@const IconComponent = getBindingIcon(bind.type)}
										<IconComponent class="h-3 w-3 text-muted-foreground" />
										<Badge variant="secondary" class="text-xs">
											{formatBinding(bind)}
										</Badge>
										<Button
											variant="ghost"
											size="sm"
											class="h-6 w-6 p-0"
											onclick={() => removeBinding(binding.action, i)}
										>
											<X class="h-3 w-3" />
										</Button>
									</div>
								{/each}
							</div>

							<!-- 添加绑定按钮 -->
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									class={recordingType === 'keyboard' && selectedAction === binding.action ? 'animate-pulse' : ''}
									onclick={() => startRecording(binding.action, 'keyboard')}
								>
									<Keyboard class="h-3 w-3 mr-1" />
									{recordingType === 'keyboard' && selectedAction === binding.action 
										? '按下按键...' 
										: '添加键盘'}
								</Button>
								<Button
									variant="outline"
									size="sm"
									class={recordingType === 'mouse' && selectedAction === binding.action ? 'animate-pulse' : ''}
									onclick={() => startRecording(binding.action, 'mouse')}
								>
									<Mouse class="h-3 w-3 mr-1" />
									{recordingType === 'mouse' && selectedAction === binding.action 
										? '拖动手势...' 
										: '添加鼠标'}
								</Button>
								<Button
									variant="outline"
									size="sm"
									class={recordingType === 'touch' && selectedAction === binding.action ? 'animate-pulse' : ''}
									onclick={() => startRecording(binding.action, 'touch')}
								>
									<Hand class="h-3 w-3 mr-1" />
									{recordingType === 'touch' && selectedAction === binding.action 
										? '触摸手势...' 
										: '添加触控'}
								</Button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- 录制状态提示 -->
	{#if recordingType && selectedAction}
		<div class="fixed bottom-4 right-4 p-4 bg-card border rounded-lg shadow-lg max-w-sm">
			<p class="text-sm mb-2">
				{#if recordingType === 'keyboard'}
					正在录制键盘快捷键，按下任意组合键...
				{:else if recordingType === 'mouse'}
					正在录制鼠标手势，按住并拖动鼠标...
				{:else if recordingType === 'touch'}
					正在录制触摸手势，在触摸屏上操作...
				{/if}
			</p>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={cancelRecording}>取消</Button>
			</div>
		</div>
	{/if}
</div>