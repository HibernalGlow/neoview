<script lang="ts">
	/**
	 * NeoView - Mouse Settings Panel
	 * 鼠标设置面板
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import { mouseGestureBindings, mouseWheelBindings } from '$lib/stores';
	import type { MouseGestureBinding, MouseWheelBinding } from '$lib/types/keyboard';
	import { RotateCcw, Trash2, Plus } from '@lucide/svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import { showInfoToast } from '$lib/utils/toast';

	// 设置状态
	let mouseGestureEnabled = $state(true);
	let gestureMinDistance = $state(50);
	let gestureStrokeWidth = $state(3);
	let gestureStrokeColor = $state('#3b82f6');

	// 编辑状态
	let editingGesture = $state<string | null>(null);
	let editingWheel = $state<string | null>(null);

	// 录制手势
	let recordingGesture = $state<MouseGestureBinding | null>(null);

	// 分类手势
	const gesturesByCategory = $derived(() => {
		const grouped: Record<string, MouseGestureBinding[]> = {};
		$mouseGestureBindings.forEach((binding) => {
			if (!grouped[binding.category]) {
				grouped[binding.category] = [];
			}
			grouped[binding.category].push(binding);
		});
		return grouped;
	});

	// 分类滚轮
	const wheelBindingsList = $derived(() => {
		return $mouseWheelBindings.map((binding) => ({
			...binding,
			id: `${binding.direction}-${binding.modifiers?.ctrl ? 'ctrl-' : ''}${binding.modifiers?.shift ? 'shift-' : ''}${binding.modifiers?.alt ? 'alt-' : ''}`
		}));
	});

	function startRecordingGesture(binding: MouseGestureBinding) {
		recordingGesture = binding;
		// 手势录制通过事件系统在 GestureLayer 中实现
		window.dispatchEvent(new CustomEvent('neoview-start-gesture-recording', {
			detail: { binding, callback: (pattern: string) => {
				if (pattern && recordingGesture) {
					mouseGestureBindings.update(bindings => 
						bindings.map(b => b.pattern === recordingGesture!.pattern ? { ...b, pattern } : b)
					);
				}
				recordingGesture = null;
			}}
		}));
		showInfoToast('请在图像查看器中右键拖拽来录制手势');
	}

	function deleteGesture(pattern: string) {
		mouseGestureBindings.update((bindings) =>
			bindings.filter((b) => b.pattern !== pattern)
		);
	}

	function deleteWheelBinding(id: string) {
		const [direction, ...modParts] = id.split('-');
		mouseWheelBindings.update((bindings) =>
			bindings.filter((b) => {
				const bindingId = `${b.direction}-${b.modifiers?.ctrl ? 'ctrl-' : ''}${b.modifiers?.shift ? 'shift-' : ''}${b.modifiers?.alt ? 'alt-' : ''}`;
				return bindingId !== id;
			})
		);
	}

	async function resetMouseSettings() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要重置所有鼠标设置为默认值吗？',
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			// 重置所有鼠标设置为默认值
			mouseGestureEnabled = true;
			gestureMinDistance = 50;
			gestureStrokeWidth = 3;
			gestureStrokeColor = '#3b82f6';
			mouseGestureBindings.set([]);
			mouseWheelBindings.set([]);
			showInfoToast('鼠标设置已重置');
		}
	}

	function getGestureDirectionName(pattern: string): string {
		const map: Record<string, string> = {
			U: '↑',
			D: '↓',
			L: '←',
			R: '→',
			UL: '↖',
			UR: '↗',
			DL: '↙',
			DR: '↘'
		};
		return pattern
			.split('')
			.map((char) => map[char] || char)
			.join(' ');
	}

	function getModifiersText(modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean }): string {
		if (!modifiers) return '';
		const parts: string[] = [];
		if (modifiers.ctrl) parts.push('Ctrl');
		if (modifiers.shift) parts.push('Shift');
		if (modifiers.alt) parts.push('Alt');
		return parts.length > 0 ? parts.join('+') + '+' : '';
	}
</script>

<div class="space-y-6 p-4">
	<div class="space-y-4">
		<div>
			<h3 class="text-lg font-semibold">鼠标手势</h3>
			<p class="text-sm text-muted-foreground">右键拖拽执行快捷操作</p>
		</div>

		<!-- 手势开关 -->
		<div class="flex items-center justify-between">
			<Label for="gesture-enabled">启用鼠标手势</Label>
			<Switch id="gesture-enabled" bind:checked={mouseGestureEnabled} />
		</div>

		<Separator />

		<!-- 手势参数 -->
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="gesture-distance">最小识别距离 (像素)</Label>
				<div class="flex items-center gap-2">
					<Input
						id="gesture-distance"
						type="number"
						min="20"
						max="100"
						bind:value={gestureMinDistance}
						class="w-24"
					/>
					<span class="text-sm text-muted-foreground">{gestureMinDistance}px</span>
				</div>
			</div>

			<div class="space-y-2">
				<Label for="gesture-width">轨迹线条粗细</Label>
				<div class="flex items-center gap-2">
					<Input
						id="gesture-width"
						type="number"
						min="1"
						max="10"
						bind:value={gestureStrokeWidth}
						class="w-24"
					/>
					<span class="text-sm text-muted-foreground">{gestureStrokeWidth}px</span>
				</div>
			</div>

			<div class="space-y-2">
				<Label for="gesture-color">轨迹颜色</Label>
				<div class="flex items-center gap-2">
					<Input
						id="gesture-color"
						type="color"
						bind:value={gestureStrokeColor}
						class="w-24 h-10"
					/>
					<span class="text-xs text-muted-foreground font-mono">{gestureStrokeColor}</span>
				</div>
			</div>
		</div>

		<Separator />

		<!-- 手势绑定列表 -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h4 class="text-sm font-medium">手势绑定</h4>
				<Button variant="outline" size="sm" onclick={resetMouseSettings}>
					<RotateCcw class="h-3 w-3 mr-2" />
					重置
				</Button>
			</div>

			{#each Object.entries(gesturesByCategory()) as [category, bindings]}
				<div class="space-y-2">
					<h5 class="text-xs font-medium text-muted-foreground uppercase">{category}</h5>
					<div class="space-y-1">
						{#each bindings as binding}
							<div
								class="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
							>
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<span class="text-2xl">{getGestureDirectionName(binding.pattern)}</span>
										<div>
											<div class="text-sm font-medium">{binding.description}</div>
											<div class="text-xs text-muted-foreground">{binding.command}</div>
										</div>
									</div>
								</div>
								<div class="flex items-center gap-1">
									<Button
										variant="outline"
										size="sm"
										onclick={() => startRecordingGesture(binding)}
										disabled={recordingGesture !== null}
									>
										{#if recordingGesture?.pattern === binding.pattern}
											<span class="text-primary">录制中...</span>
										{:else}
											重新录制
										{/if}
									</Button>
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8"
										onclick={() => deleteGesture(binding.pattern)}
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}

			<Button variant="outline" class="w-full" onclick={() => showInfoToast('添加新手势功能即将推出')}>
				<Plus class="h-4 w-4 mr-2" />
				添加新手势
			</Button>
		</div>
	</div>

	<Separator />

	<!-- 鼠标滚轮设置 -->
	<div class="space-y-4">
		<div>
			<h3 class="text-lg font-semibold">鼠标滚轮</h3>
			<p class="text-sm text-muted-foreground">配置滚轮行为和快捷键</p>
		</div>

		<div class="space-y-2">
			{#each wheelBindingsList() as binding}
				<div
					class="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
				>
					<div class="flex-1">
						<div class="text-sm font-medium">
							{getModifiersText(binding.modifiers)}滚轮{binding.direction === 'up'
								? '向上 ↑'
								: '向下 ↓'}
						</div>
						<div class="text-xs text-muted-foreground">
							{binding.description} ({binding.command})
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						class="h-8 w-8"
						onclick={() => deleteWheelBinding(binding.id)}
					>
						<Trash2 class="h-4 w-4" />
					</Button>
				</div>
			{/each}
		</div>

		<Button variant="outline" class="w-full" onclick={() => showInfoToast('添加新滚轮绑定功能即将推出')}>
			<Plus class="h-4 w-4 mr-2" />
			添加滚轮绑定
		</Button>
	</div>

	{#if recordingGesture}
		<div class="fixed bottom-4 right-4 p-4 bg-card border rounded-lg shadow-lg">
			<p class="text-sm mb-2">正在录制手势: {recordingGesture.description}</p>
			<p class="text-xs text-muted-foreground mb-3">请在图像查看器中右键拖拽</p>
			<Button variant="outline" size="sm" onclick={() => (recordingGesture = null)}>取消</Button>
		</div>
	{/if}
</div>
