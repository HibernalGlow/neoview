<script lang="ts">
	import { Palette } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';

	let currentSettings = $state(settingsManager.getSettings());

	settingsManager.addListener((s) => {
		currentSettings = s;
	});

	let preloadSlider = $state<number[]>([currentSettings.image.preloadCount]);

	$effect(() => {
		preloadSlider = [currentSettings.image.preloadCount];
	});
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Palette class="h-5 w-5" />
			图片设置
		</h3>
		<p class="text-muted-foreground text-sm">配置全局图片加载与超分行为</p>
	</div>

	<div class="space-y-4">
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">预加载</h4>
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="text-sm">预加载图片数量</span>
					<span class="text-muted-foreground text-xs">
						{currentSettings.image.preloadCount}
					</span>
				</div>
				<Slider
					min={0}
					max={10}
					step={1}
					value={preloadSlider}
					onValueChange={(v) => {
						preloadSlider = v;
						const next = v[0];
						if (typeof next === 'number') {
							settingsManager.updateNestedSettings('image', {
								preloadCount: Math.round(next)
							});
						}
					}}
					class="w-full max-w-md"
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				控制在翻页前预先加载的图片数量，可以平衡流畅度与内存占用。
			</p>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">启用图片超分</Label>
				<Switch
					checked={currentSettings.image.enableSuperResolution}
					onCheckedChange={(checked) =>
						settingsManager.updateNestedSettings('image', {
							enableSuperResolution: !!checked
						})}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				开启后，符合条件的图片会自动使用超分模型进行放大处理。
			</p>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">当前图片自动超分</Label>
				<Switch
					checked={currentSettings.image.currentImageUpscaleEnabled}
					onCheckedChange={(checked) =>
						settingsManager.updateNestedSettings('image', {
							currentImageUpscaleEnabled: !!checked
						})}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				控制当前打开图片是否自动使用超分效果。
			</p>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">优先使用缓存结果</Label>
				<Switch
					checked={currentSettings.image.useCachedFirst}
					onCheckedChange={(checked) =>
						settingsManager.updateNestedSettings('image', {
							useCachedFirst: !!checked
						})}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				启用后，会尽量复用已有的超分结果以提升响应速度。
			</p>
		</div>
	</div>
</div>
