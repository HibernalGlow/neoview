<script lang="ts">
	import { Palette } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Slider } from '$lib/components/ui/slider';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';

	let currentSettings = $state(settingsManager.getSettings());

	settingsManager.addListener((s) => {
		currentSettings = s;
	});

	let preloadSlider = $state<number[]>([currentSettings.image.preloadCount]);

	$effect(() => {
		preloadSlider = [currentSettings.image.preloadCount];
	});

	function toggleFormat(fmt: string) {
		const formats = new Set(currentSettings.image.supportedFormats);
		if (formats.has(fmt)) {
			formats.delete(fmt);
		} else {
			formats.add(fmt);
		}
		settingsManager.updateNestedSettings('image', {
			supportedFormats: Array.from(formats)
		});
	}
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
					type="single"
					value={preloadSlider}
					onValueChange={(v: number[]) => {
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

		<!-- 动画图片（GIF / APNG）自动播放 -->
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">自动播放 GIF / APNG</Label>
				<Switch
					checked={currentSettings.image.autoPlayAnimatedImages}
					onCheckedChange={(checked) =>
						settingsManager.updateNestedSettings('image', {
							autoPlayAnimatedImages: !!checked
						})}
				/>
			</div>
			<p class="text-muted-foreground text-xs">
				关闭后，GIF / APNG 等动图将以静态首帧显示，需手动触发播放（实现后）。
			</p>
		</div>

		<!-- 支持的图片格式 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">支持的图片格式</h4>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('jpg')}
						on:click={() => toggleFormat('jpg')}
						aria-label="JPG/JPEG"
					/>
					<span>JPG / JPEG</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('png')}
						on:click={() => toggleFormat('png')}
						aria-label="PNG"
					/>
					<span>PNG</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('webp')}
						on:click={() => toggleFormat('webp')}
						aria-label="WebP"
					/>
					<span>WebP</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('avif')}
						on:click={() => toggleFormat('avif')}
						aria-label="AVIF"
					/>
					<span>AVIF</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						checked={currentSettings.image.supportedFormats.includes('jxl')}
						on:click={() => toggleFormat('jxl')}
						aria-label="JXL"
					/>
					<span>JXL</span>
				</label>
			</div>
			<p class="text-muted-foreground text-xs">
				控制 NeoView 默认识别为图片的文件扩展名。
			</p>
		</div>

		<!-- 默认超分模型 -->
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<Label class="text-sm">默认超分模型</Label>
				<NativeSelect
					class="w-44"
					value={currentSettings.image.superResolutionModel ?? 'auto'}
					onchange={(event) => {
						const select = event.currentTarget as HTMLSelectElement;
						const value = select.value;
						settingsManager.updateNestedSettings('image', {
							superResolutionModel: value === 'auto' ? null : value
						});
					}}
				>
					<NativeSelectOption value="auto">自动选择</NativeSelectOption>
					<NativeSelectOption value="fast">快速（性能优先）</NativeSelectOption>
					<NativeSelectOption value="quality">高质量（效果优先）</NativeSelectOption>
				</NativeSelect>
			</div>
			<p class="text-muted-foreground text-xs">
				选择图片相关操作默认使用的超分模型，Upscale 面板中仍可单独调整。
			</p>
		</div>

		<!-- 长图滚动模式 -->
		<div class="space-y-3">
			<div class="flex items-center justify-between gap-2">
				<div class="space-y-1">
					<Label class="text-sm">长图滚动模式</Label>
					<p class="text-xs text-muted-foreground">
						选择长图浏览时是按整页翻动，还是连续长滚动。
					</p>
				</div>
				<NativeSelect
					class="w-44"
					value={currentSettings.image.longImageScrollMode}
					onchange={(event) => {
						const select = event.currentTarget as HTMLSelectElement;
						const value = select.value as 'page' | 'continuous';
						settingsManager.updateNestedSettings('image', {
							longImageScrollMode: value
						});
					}}
				>
					<NativeSelectOption value="page">整页滚动</NativeSelectOption>
					<NativeSelectOption value="continuous">连续长滚动</NativeSelectOption>
				</NativeSelect>
			</div>
		</div>
	</div>
</div>
