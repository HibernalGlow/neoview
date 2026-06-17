<script lang="ts">
	/**
	 * 长按绑定录制器
	 * 用于录制长按操作的绑定配置
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Timer, X } from '@lucide/svelte';

	type HoldCaptureData = {
		device: 'keyboard' | 'mouse' | 'touch';
		key?: string;
		button?: 'left' | 'right' | 'middle';
		durationMs: number;
		moveTolerancePx?: number;
	};

	interface Props {
		oncapture?: (data: HoldCaptureData) => void;
		oncancel?: () => void;
	}

	let { oncapture, oncancel }: Props = $props();

	type Device = 'keyboard' | 'mouse' | 'touch';

	let selectedDevice = $state<Device>('keyboard');
	let selectedKey = $state('Enter');
	let selectedButton = $state<'left' | 'right' | 'middle'>('left');
	let durationMs = $state(450);
	let moveTolerancePx = $state(8);

	// 设备选项
	const deviceOptions: Array<{ value: Device; label: string }> = [
		{ value: 'keyboard', label: '键盘' },
		{ value: 'mouse', label: '鼠标' },
		{ value: 'touch', label: '触控' }
	];

	// 按键选项
	const buttonOptions: Array<{ value: 'left' | 'right' | 'middle'; label: string }> = [
		{ value: 'left', label: '左键' },
		{ value: 'right', label: '右键' },
		{ value: 'middle', label: '中键' }
	];

	// 完成录制
	function handleComplete() {
		const data: HoldCaptureData = {
			device: selectedDevice,
			durationMs
		};
		if (selectedDevice === 'keyboard') {
			data.key = selectedKey;
		} else {
			data.button = selectedButton;
			data.moveTolerancePx = moveTolerancePx;
		}
		oncapture?.(data);
	}

	// 取消录制
	function handleCancel() {
		oncancel?.();
	}

	// 键盘按键捕获
	function handleKeyDown(e: KeyboardEvent) {
		if (selectedDevice !== 'keyboard') return;
		e.preventDefault();
		const modifiers = [];
		if (e.ctrlKey) modifiers.push('Ctrl');
		if (e.shiftKey) modifiers.push('Shift');
		if (e.altKey) modifiers.push('Alt');
		const keyMap: Record<string, string> = {
			' ': 'Space',
			'+': 'Plus',
			'-': 'Minus',
			ArrowUp: '↑',
			ArrowDown: '↓',
			ArrowLeft: '←',
			ArrowRight: '→'
		};
		const key = keyMap[e.key] || e.key;
		selectedKey = [...modifiers, key].join('+');
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
	<div class="bg-background border rounded-lg p-6 max-w-2xl w-full mx-4 space-y-6">
		<div class="space-y-2">
			<h4 class="font-semibold flex items-center gap-2">
				<Timer class="h-4 w-4 text-amber-500" />
				录制长按绑定
			</h4>
			<p class="text-sm text-muted-foreground">
				选择触发设备并配置长按参数。长按指定时间后将触发绑定操作。
			</p>
		</div>

		<!-- 设备选择 -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">1. 选择触发设备</Label>
			<div class="flex gap-2">
				{#each deviceOptions as option}
					<Button
						variant={selectedDevice === option.value ? 'default' : 'outline'}
						size="sm"
						onclick={() => (selectedDevice = option.value)}
					>
						{option.label}
					</Button>
				{/each}
			</div>
		</div>

		<!-- 键盘按键输入 -->
		{#if selectedDevice === 'keyboard'}
			<div class="space-y-3">
				<Label class="text-sm font-medium">2. 按下按键（当前: {selectedKey}）</Label>
				<div class="p-3 bg-muted/30 rounded-lg border text-center">
					<span class="font-mono text-sm">{selectedKey || '等待按键...'}</span>
				</div>
				<p class="text-xs text-muted-foreground">点击此处并按下任意键以修改</p>
			</div>
		{:else}
			<!-- 鼠标/触控按键选择 -->
			<div class="space-y-3">
				<Label class="text-sm font-medium">2. 选择按键</Label>
				<div class="flex gap-2">
					{#each buttonOptions as option}
						<Button
							variant={selectedButton === option.value ? 'default' : 'outline'}
							size="sm"
							onclick={() => (selectedButton = option.value)}
						>
							{option.label}
						</Button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- 长按时间 -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">3. 长按时间 (毫秒)</Label>
			<Input
				type="number"
				bind:value={durationMs}
				min="100"
				max="5000"
				step="50"
				class="max-w-xs"
			/>
		</div>

		<!-- 移动容差（仅鼠标/触控） -->
		{#if selectedDevice !== 'keyboard'}
			<div class="space-y-3">
				<Label class="text-sm font-medium">4. 移动容差 (像素)</Label>
				<Input
					type="number"
					bind:value={moveTolerancePx}
					min="0"
					max="50"
					step="1"
					class="max-w-xs"
				/>
				<p class="text-xs text-muted-foreground">长按前允许的指针抖动范围</p>
			</div>
		{/if}

		<!-- 当前配置预览 -->
		<div class="p-3 bg-muted/30 rounded-lg">
			<div class="text-sm text-muted-foreground">当前配置：</div>
			<div class="font-mono text-sm">
				{selectedDevice === 'keyboard'
					? `长按 ${selectedKey} ${durationMs}ms`
					: selectedDevice === 'mouse'
						? `${selectedButton}键长按 ${durationMs}ms (容差 ${moveTolerancePx}px)`
						: `触控长按 ${durationMs}ms (容差 ${moveTolerancePx}px)`}
			</div>
		</div>

		<!-- 操作按钮 -->
		<div class="flex justify-between">
			<Button variant="outline" onclick={handleCancel}>
				<X class="h-3 w-3 mr-1" />
				取消
			</Button>
			<Button onclick={handleComplete}>
				完成
			</Button>
		</div>
	</div>
</div>
