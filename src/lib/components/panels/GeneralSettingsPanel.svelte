<script lang="ts">
	import { Settings } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
</script>

<div class="space-y-6 p-6">
	<div class="space-y-2">
		<h3 class="flex items-center gap-2 text-lg font-semibold">
			<Settings class="h-5 w-5" />
			通用设置
		</h3>
		<p class="text-muted-foreground text-sm">配置 NeoView 的基本行为和外观</p>
	</div>

	<div class="space-y-4">
		<!-- 语言设置 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">语言</Label>
			<NativeSelect class="w-full max-w-xs" value="zh-CN">
				<NativeSelectOption value="zh-CN">简体中文</NativeSelectOption>
				<NativeSelectOption value="en-US">English</NativeSelectOption>
				<NativeSelectOption value="ja-JP">日本語</NativeSelectOption>
			</NativeSelect>
		</div>

		<!-- 主题设置 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">主题</Label>
			<NativeSelect class="w-full max-w-xs" value="auto">
				<NativeSelectOption value="light">浅色</NativeSelectOption>
				<NativeSelectOption value="dark">深色</NativeSelectOption>
				<NativeSelectOption value="auto">跟随系统</NativeSelectOption>
			</NativeSelect>
		</div>

		<!-- 启动设置 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">启动</Label>
			<label class="flex items-center justify-between gap-2">
				<span class="text-sm">启动时打开上次的文件</span>
				<Checkbox aria-label="启动时打开上次的文件" />
			</label>
			<label class="flex items-center justify-between gap-2">
				<span class="text-sm">最小化到系统托盘</span>
				<Checkbox aria-label="最小化到系统托盘" />
			</label>
		</div>

		<!-- 文件关联 -->
		<div class="space-y-2">
			<Label class="text-sm font-semibold">文件关联</Label>
			<div class="space-y-1">
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">图像文件 (jpg, png, webp, avif, jxl)</span>
					<Checkbox checked aria-label="图像文件 (jpg, png, webp, avif, jxl)" />
				</label>
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">压缩包 (zip, cbz, rar, cbr)</span>
					<Checkbox checked aria-label="压缩包 (zip, cbz, rar, cbr)" />
				</label>
				<label class="flex items-center justify-between gap-2">
					<span class="text-sm">PDF 文件</span>
					<Checkbox aria-label="PDF 文件" />
				</label>
			</div>
		</div>
	</div>
</div>
