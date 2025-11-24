<script lang="ts">
	import { Palette } from '@lucide/svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';

	let currentSettings = $state(settingsManager.getSettings());

	settingsManager.addListener((s) => {
		currentSettings = s;
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
		<p class="text-muted-foreground text-sm">配置全局图片加载行为</p>
	</div>

	<div class="space-y-4">
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
						checked={currentSettings.image.supportedFormats.includes('webp')}
						on:click={() => toggleFormat('webp')}
						aria-label="WebP"
					/>
					<span>WebP</span>
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
	</div>
</div>
