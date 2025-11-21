<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { Palette } from '@lucide/svelte';
</script>

<div class="flex flex-col gap-6 p-6">
	<!-- 标题 -->
	<div class="flex items-center gap-3">
		<Palette class="h-6 w-6" />
		<div>
			<h2 class="text-2xl font-bold">主题管理</h2>
			<p class="text-muted-foreground text-sm">从 tweakcn.com 选择或自定义主题</p>
		</div>
	</div>

	<Separator />

	<!-- 当前主题 -->
	<div class="bg-card rounded-lg border p-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="font-semibold">当前主题</h3>
				<p class="text-muted-foreground text-sm">Amethyst Haze</p>
			</div>
		</div>
	</div>

	<!-- 预设主题 -->
	<div class="space-y-4">
		<div>
			<h3 class="mb-2 text-lg font-semibold">预设主题</h3>
			<p class="text-muted-foreground mb-4 text-sm">点击应用来自 tweakcn.com 的精选主题</p>
		</div>

		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<button
				class="hover:bg-accent hover:text-accent-foreground flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors"
			>
				<h4 class="font-medium">Amethyst Haze</h4>
				<p class="text-muted-foreground text-sm">优雅的紫色调主题</p>
			</button>

			<button
				class="hover:bg-accent hover:text-accent-foreground flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors"
			>
				<h4 class="font-medium">Ocean Breeze</h4>
				<p class="text-muted-foreground text-sm">清新的海洋蓝主题</p>
			</button>

			<button
				class="hover:bg-accent hover:text-accent-foreground flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors"
			>
				<h4 class="font-medium">Forest Mist</h4>
				<p class="text-muted-foreground text-sm">自然的森林绿主题</p>
			</button>

			<button
				class="hover:bg-accent hover:text-accent-foreground flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors"
			>
				<h4 class="font-medium">Sunset Glow</h4>
				<p class="text-muted-foreground text-sm">温暖的日落橙主题</p>
			</button>
		</div>
	</div>

	<Separator />

	<!-- 颜色预览 -->
	<div class="space-y-4">
		<h3 class="text-lg font-semibold">颜色预览</h3>
		<div class="grid grid-cols-2 gap-3">
			<div class="bg-primary text-primary-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Primary</p>
			</div>
			<div class="bg-secondary text-secondary-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Secondary</p>
			</div>
			<div class="bg-accent text-accent-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Accent</p>
			</div>
			<div class="bg-muted text-muted-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Muted</p>
			</div>
			<div class="bg-card text-card-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Card</p>
			</div>
			<div class="bg-destructive text-primary-foreground rounded-lg border p-3">
				<p class="text-sm font-medium">Destructive</p>
			</div>
		</div>
	</div>

	<!-- 提示 -->
	<div class="border-primary/20 bg-primary/5 rounded-lg border p-4">
		<p class="text-sm">
			<strong>💡 提示:</strong> 主题功能正在开发中。当前显示的是 Amethyst Haze 紫色主题。
		</p>
	</div>

	<!-- 在线编辑器链接 -->
	<div class="space-y-4">
		<h3 class="text-lg font-semibold">创建自定义主题</h3>
		<Button
			onclick={() => window.open('https://tweakcn.com/editor/theme', '_blank')}
			variant="outline"
			class="w-full"
		>
			打开 Tweakcn 主题编辑器
		</Button>
	</div>
</div>
