<script lang="ts">
	/**
	 * NeoView - Viewer Settings Panel
	 * 查看器设置面板
	 */
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';

	let backgroundColor = $state('#000000');
	let showGrid = $state(false);
	let smoothZoom = $state(true);
	// 使用数组形式以适配 bits-ui Slider 的值类型
	let defaultZoom = $state<number[]>([100]);
</script>

<div class="space-y-6">
	<h3 class="text-lg font-semibold">查看器设置</h3>

	<!-- 背景颜色 -->
	<div class="space-y-2">
		<Label for="bg-color">背景颜色</Label>
		<div class="flex gap-2">
			<Input id="bg-color" type="color" bind:value={backgroundColor} class="w-20 h-10" />
			<Input type="text" bind:value={backgroundColor} class="flex-1" />
		</div>
	</div>

	<!-- 显示网格 -->
	<div class="flex items-center justify-between">
		<div class="space-y-1">
			<Label>显示网格</Label>
			<p class="text-sm text-muted-foreground">在图像背景显示网格</p>
		</div>
		<Switch bind:checked={showGrid} />
	</div>

	<!-- 平滑缩放 -->
	<div class="flex items-center justify-between">
		<div class="space-y-1">
			<Label>平滑缩放</Label>
			<p class="text-sm text-muted-foreground">启用平滑的缩放动画</p>
		</div>
		<Switch bind:checked={smoothZoom} />
	</div>

	<!-- 默认缩放 -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<Label>默认缩放级别</Label>
			<span class="text-sm text-muted-foreground">{defaultZoom[0]}%</span>
		</div>
		<Slider min={10} max={500} step={10} type="single"  />
	</div>
</div>
