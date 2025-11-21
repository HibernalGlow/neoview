<script lang="ts">
	import { Settings } from '@lucide/svelte';
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
			<h4 class="text-sm font-semibold">语言</h4>
			<select class="w-full max-w-xs rounded-md border p-2">
				<option value="zh-CN">简体中文</option>
				<option value="en-US">English</option>
				<option value="ja-JP">日本語</option>
			</select>
		</div>

		<!-- 主题设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">主题</h4>
			<select class="w-full max-w-xs rounded-md border p-2">
				<option value="light">浅色</option>
				<option value="dark">深色</option>
				<option value="auto">跟随系统</option>
			</select>
		</div>

		<!-- 启动设置 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">启动</h4>
			<label class="flex items-center gap-2">
				<input type="checkbox" class="rounded" />
				<span class="text-sm">启动时打开上次的文件</span>
			</label>
			<label class="flex items-center gap-2">
				<input type="checkbox" class="rounded" />
				<span class="text-sm">最小化到系统托盘</span>
			</label>
		</div>

		<!-- 文件关联 -->
		<div class="space-y-2">
			<h4 class="text-sm font-semibold">文件关联</h4>
			<div class="space-y-1">
				<label class="flex items-center gap-2">
					<input type="checkbox" class="rounded" checked />
					<span class="text-sm">图像文件 (jpg, png, webp, avif, jxl)</span>
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" class="rounded" checked />
					<span class="text-sm">压缩包 (zip, cbz, rar, cbr)</span>
				</label>
				<label class="flex items-center gap-2">
					<input type="checkbox" class="rounded" />
					<span class="text-sm">PDF 文件</span>
				</label>
			</div>
		</div>
	</div>
</div>
