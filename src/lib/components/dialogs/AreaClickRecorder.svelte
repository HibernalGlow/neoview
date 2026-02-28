<script lang="ts">
	/**
	 * 区域点击录制器
	 * 用于录制视图区域的点击操作
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { keyBindingsStore, type ViewArea } from '$lib/stores/keybindings';
	import { Target, X } from '@lucide/svelte';

	let { onComplete, onCancel } = $props();

	let selectedArea = $state<ViewArea | null>(null);
	let selectedButton = $state<'left' | 'right' | 'middle'>('left');
	let selectedAction = $state<'click' | 'double-click' | 'press'>('click');
	let isRecording = $state(true);

	// 区域配置
	const areas: { value: ViewArea; label: string; gridClass: string }[] = [
		{ value: 'top-left', label: '左上', gridClass: 'col-start-1 row-start-1' },
		{ value: 'top-center', label: '中上', gridClass: 'col-start-2 row-start-1' },
		{ value: 'top-right', label: '右上', gridClass: 'col-start-3 row-start-1' },
		{ value: 'middle-left', label: '左中', gridClass: 'col-start-1 row-start-2' },
		{ value: 'middle-center', label: '中中', gridClass: 'col-start-2 row-start-2' },
		{ value: 'middle-right', label: '右中', gridClass: 'col-start-3 row-start-2' },
		{ value: 'bottom-left', label: '左下', gridClass: 'col-start-1 row-start-3' },
		{ value: 'bottom-center', label: '中下', gridClass: 'col-start-2 row-start-3' },
		{ value: 'bottom-right', label: '右下', gridClass: 'col-start-3 row-start-3' }
	];

	// 按键选项
	const buttonOptions: Array<{ value: 'left' | 'right' | 'middle'; label: string }> = [
		{ value: 'left', label: '左键' },
		{ value: 'right', label: '右键' },
		{ value: 'middle', label: '中键' }
	];

	// 动作选项
	const actionOptions: Array<{ value: 'click' | 'double-click' | 'press'; label: string }> = [
		{ value: 'click', label: '单击' },
		{ value: 'double-click', label: '双击' },
		{ value: 'press', label: '按住' }
	];

	// 处理区域点击
	function handleAreaClick(area: ViewArea) {
		if (!isRecording) return;
		selectedArea = area;
	}

	// 完成录制
	function handleComplete() {
		if (selectedArea) {
			onComplete?.(selectedArea, selectedButton, selectedAction);
		}
	}

	// 取消录制
	function handleCancel() {
		onCancel?.();
	}

	// 重置选择
	function resetSelection() {
		selectedArea = null;
	}
</script>

<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
	<div class="bg-background border rounded-lg p-6 max-w-2xl w-full mx-4 space-y-6">
		<div class="space-y-2">
			<h4 class="font-semibold flex items-center gap-2">
				<Target class="h-4 w-4 text-orange-500" />
				录制区域点击
			</h4>
			<p class="text-sm text-muted-foreground">
				点击下方的视图区域来选择要绑定的区域，然后选择鼠标按键和动作类型。
			</p>
		</div>

		<!-- 视图区域选择 -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">1. 选择点击区域</Label>
			<div class="relative w-full h-64 bg-muted/20 border-2 border-dashed border-muted-foreground/30 rounded-lg overflow-hidden">
				<div class="absolute inset-4 grid grid-cols-3 grid-rows-3 gap-2">
					{#each areas as area}
						<button
							class="border border-muted-foreground/20 hover:bg-primary/10 transition-colors flex items-center justify-center {selectedArea === area.value ? 'bg-primary/20 border-primary' : ''} {area.gridClass}"
							onclick={() => handleAreaClick(area.value)}
						>
							<span class="text-sm font-medium {selectedArea === area.value ? 'text-primary' : 'text-muted-foreground'}">
								{area.label}
							</span>
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- 鼠标按键选择 -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">2. 选择鼠标按键</Label>
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

		<!-- 动作类型选择 -->
		<div class="space-y-3">
			<Label class="text-sm font-medium">3. 选择动作类型</Label>
			<div class="flex gap-2">
				{#each actionOptions as option}
					<Button
						variant={selectedAction === option.value ? 'default' : 'outline'}
						size="sm"
						onclick={() => (selectedAction = option.value)}
					>
						{option.label}
					</Button>
				{/each}
			</div>
		</div>

		<!-- 当前选择预览 -->
		{#if selectedArea}
			<div class="p-3 bg-muted/30 rounded-lg">
				<div class="text-sm text-muted-foreground">当前选择：</div>
				<div class="font-mono text-sm">
					{selectedButton} {areas.find(a => a.value === selectedArea)?.label} {selectedAction}
				</div>
			</div>
		{/if}

		<!-- 操作按钮 -->
		<div class="flex justify-between">
			<Button variant="outline" onclick={handleCancel}>
				<X class="h-3 w-3 mr-1" />
				取消
			</Button>
			<div class="flex gap-2">
				{#if selectedArea}
					<Button variant="outline" onclick={resetSelection}>
						重新选择
					</Button>
				{/if}
				<Button onclick={handleComplete} disabled={!selectedArea}>
					完成
				</Button>
			</div>
		</div>
	</div>
</div>