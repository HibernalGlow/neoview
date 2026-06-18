<script lang="ts">
	/**
	 * NeoView - Gesture Settings Panel
	 * 触摸手势设置面板
	 */
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { gestureBindings } from '$lib/stores';
	import type { GestureBinding } from '$lib/types/keyboard';
	import { RotateCcw, Trash2, Plus, Info } from '@lucide/svelte';
	import { confirm } from '$lib/stores/confirmDialog.svelte';
	import { showInfoToast } from '$lib/utils/toast';

	// 设置状态
	let touchGestureEnabled = $state(true);
	let swipeThreshold = $state(50);
	let longPressDuration = $state(500);
	let doubleTapDelay = $state(300);
	let pinchSensitivity = $state(1.0);
	let rotateSensitivity = $state(1.0);

	// 分类手势
	const gesturesByCategory = $derived(() => {
		const grouped: Record<string, GestureBinding[]> = {};
		$gestureBindings.forEach((binding) => {
			if (!grouped[binding.category]) {
				grouped[binding.category] = [];
			}
			grouped[binding.category].push(binding);
		});
		return grouped;
	});

	async function resetGestureSettings() {
		const confirmed = await confirm({
			title: '确认重置',
			description: '确定要重置所有手势设置为默认值吗？',
			confirmText: '重置',
			cancelText: '取消',
			variant: 'warning'
		});
		if (confirmed) {
			touchGestureEnabled = true;
			swipeThreshold = 50;
			longPressDuration = 500;
			doubleTapDelay = 300;
			pinchSensitivity = 1.0;
			rotateSensitivity = 1.0;
		}
	}

	function deleteGesture(gesture: string) {
		gestureBindings.update((bindings) => bindings.filter((b) => b.gesture !== gesture));
	}

	function getGestureIcon(gesture: string): string {
		const iconMap: Record<string, string> = {
			'swipe-left': '👈',
			'swipe-right': '👉',
			'swipe-up': '👆',
			'swipe-down': '👇',
			'pinch-in': '🤏',
			'pinch-out': '👐',
			'rotate-clockwise': '↻',
			'rotate-counter-clockwise': '↺',
			'two-finger-swipe-left': '👈👈',
			'two-finger-swipe-right': '👉👉',
			'two-finger-swipe-up': '👆👆',
			'two-finger-swipe-down': '👇👇',
			'three-finger-swipe-left': '👈👈👈',
			'three-finger-swipe-right': '👉👉👉',
			'three-finger-swipe-up': '👆👆👆',
			'three-finger-swipe-down': '👇👇👇',
			tap: '👆',
			'double-tap': '👆👆',
			'long-press': '👆⏱'
		};
		return iconMap[gesture] || '✋';
	}

	function getGestureName(gesture: string): string {
		const nameMap: Record<string, string> = {
			'swipe-left': '向左滑动',
			'swipe-right': '向右滑动',
			'swipe-up': '向上滑动',
			'swipe-down': '向下滑动',
			'pinch-in': '捏合',
			'pinch-out': '张开',
			'rotate-clockwise': '顺时针旋转',
			'rotate-counter-clockwise': '逆时针旋转',
			'two-finger-swipe-left': '双指向左滑动',
			'two-finger-swipe-right': '双指向右滑动',
			'two-finger-swipe-up': '双指向上滑动',
			'two-finger-swipe-down': '双指向下滑动',
			'three-finger-swipe-left': '三指向左滑动',
			'three-finger-swipe-right': '三指向右滑动',
			'three-finger-swipe-up': '三指向上滑动',
			'three-finger-swipe-down': '三指向下滑动',
			tap: '单击',
			'double-tap': '双击',
			'long-press': '长按'
		};
		return nameMap[gesture] || gesture;
	}

	function getCategoryName(category: string): string {
		const nameMap: Record<string, string> = {
			navigation: '导航',
			zoom: '缩放',
			transform: '变换',
			view: '视图',
			file: '文件'
		};
		return nameMap[category] || category;
	}
</script>

<div class="space-y-6 p-4">
	<div class="space-y-4">
		<div>
			<h3 class="text-lg font-semibold">触摸手势</h3>
			<p class="text-muted-foreground text-sm">支持多指手势操作（需要触摸屏设备）</p>
		</div>

		<!-- 手势开关 -->
		<div class="flex items-center justify-between">
			<Label for="touch-enabled">启用触摸手势</Label>
			<Switch id="touch-enabled" bind:checked={touchGestureEnabled} />
		</div>

		<Separator />

		<!-- 手势参数 -->
		<div class="space-y-4">
			<div class="space-y-2">
				<Label for="swipe-threshold">滑动识别距离 (像素)</Label>
				<div class="flex items-center gap-2">
					<Input
						id="swipe-threshold"
						type="number"
						min="20"
						max="150"
						bind:value={swipeThreshold}
						class="w-24"
					/>
					<span class="text-muted-foreground text-sm">{swipeThreshold}px</span>
				</div>
				<p class="text-muted-foreground text-xs">手指滑动超过此距离才会被识别</p>
			</div>

			<div class="space-y-2">
				<Label for="long-press">长按时长 (毫秒)</Label>
				<div class="flex items-center gap-2">
					<Input
						id="long-press"
						type="number"
						min="300"
						max="2000"
						step="100"
						bind:value={longPressDuration}
						class="w-24"
					/>
					<span class="text-muted-foreground text-sm">{longPressDuration}ms</span>
				</div>
				<p class="text-muted-foreground text-xs">按住屏幕超过此时间触发长按</p>
			</div>

			<div class="space-y-2">
				<Label for="double-tap">双击延迟 (毫秒)</Label>
				<div class="flex items-center gap-2">
					<Input
						id="double-tap"
						type="number"
						min="100"
						max="500"
						step="50"
						bind:value={doubleTapDelay}
						class="w-24"
					/>
					<span class="text-muted-foreground text-sm">{doubleTapDelay}ms</span>
				</div>
				<p class="text-muted-foreground text-xs">两次点击间隔小于此时间识别为双击</p>
			</div>

			<div class="space-y-2">
				<Label for="pinch-sensitivity">捏合灵敏度</Label>
				<div class="flex items-center gap-2">
					<Input
						id="pinch-sensitivity"
						type="number"
						min="0.5"
						max="2.0"
						step="0.1"
						bind:value={pinchSensitivity}
						class="w-24"
					/>
					<span class="text-muted-foreground text-sm">×{pinchSensitivity.toFixed(1)}</span>
				</div>
				<p class="text-muted-foreground text-xs">值越大，缩放速度越快</p>
			</div>

			<div class="space-y-2">
				<Label for="rotate-sensitivity">旋转灵敏度</Label>
				<div class="flex items-center gap-2">
					<Input
						id="rotate-sensitivity"
						type="number"
						min="0.5"
						max="2.0"
						step="0.1"
						bind:value={rotateSensitivity}
						class="w-24"
					/>
					<span class="text-muted-foreground text-sm">×{rotateSensitivity.toFixed(1)}</span>
				</div>
				<p class="text-muted-foreground text-xs">值越大，旋转速度越快</p>
			</div>
		</div>

		<Separator />

		<!-- 手势绑定列表 -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h4 class="text-sm font-medium">手势绑定</h4>
				<Button variant="outline" size="sm" onclick={resetGestureSettings}>
					<RotateCcw class="mr-2 h-3 w-3" />
					重置
				</Button>
			</div>

			{#each Object.entries(gesturesByCategory()) as [category, bindings]}
				<div class="space-y-2">
					<h5 class="text-muted-foreground text-xs font-medium uppercase">
						{getCategoryName(category)}
					</h5>
					<div class="space-y-1">
						{#each bindings as binding}
							<div
								class="hover:bg-accent flex items-center justify-between rounded-lg border p-3 transition-colors"
							>
								<div class="flex flex-1 items-center gap-3">
									<span class="text-2xl">{getGestureIcon(binding.gesture)}</span>
									<div>
										<div class="text-sm font-medium">
											{getGestureName(binding.gesture)}
										</div>
										<div class="text-muted-foreground text-xs">
											{binding.description} ({binding.command})
										</div>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									class="h-8 w-8"
									onclick={() => deleteGesture(binding.gesture)}
								>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						{/each}
					</div>
				</div>
			{/each}

			<Button
				variant="outline"
				class="w-full"
				onclick={() => showInfoToast('添加新手势绑定功能即将推出')}
			>
				<Plus class="mr-2 h-4 w-4" />
				添加手势绑定
			</Button>
		</div>
	</div>

	<Separator />

	<!-- 使用提示 -->
	<div class="bg-muted/50 rounded-lg border p-4">
		<div class="flex gap-2">
			<Info class="text-muted-foreground h-5 w-5 shrink-0" />
			<div class="space-y-2">
				<h4 class="text-sm font-medium">使用提示</h4>
				<ul class="text-muted-foreground space-y-1 text-xs">
					<li>• 单指滑动：在图像上滑动翻页</li>
					<li>• 双指捏合/张开：缩放图像</li>
					<li>• 双指旋转：旋转图像</li>
					<li>• 双指滑动：快速跳转到首页/末页</li>
					<li>• 三指滑动：执行高级操作</li>
					<li>• 双击：全屏切换</li>
					<li>• 长按：显示上下文菜单</li>
				</ul>
			</div>
		</div>
	</div>

	<!-- 测试手势 -->
	<div class="space-y-2">
		<Button
			variant="outline"
			class="w-full"
			onclick={() => showInfoToast('手势测试功能需要在图像查看器中进行')}
		>
			测试手势识别
		</Button>
		<p class="text-muted-foreground text-center text-xs">
			在图像查看器中尝试各种手势，查看是否被正确识别
		</p>
	</div>
</div>
