<script lang="ts">
	/**
	 * 主题预览组件
	 * 显示所有主题颜色的实时预览
	 */
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
</script>

<div class="bg-background space-y-6 p-6">
	<div class="space-y-2">
		<h2 class="text-foreground text-3xl font-bold">主题预览</h2>
		<p class="text-muted-foreground">查看当前主题的所有颜色和组件样式</p>
	</div>

	<Separator />

	<!-- 颜色卡片 -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
		<!-- Primary -->
		<Card class="bg-primary text-primary-foreground p-6">
			<h3 class="mb-2 text-lg font-semibold">Primary</h3>
			<p class="text-sm opacity-90">主色调,用于主要操作和强调</p>
			<div class="mt-4 flex gap-2">
				<Button variant="secondary" size="sm">按钮</Button>
				<Badge>标签</Badge>
			</div>
		</Card>

		<!-- Secondary -->
		<Card class="bg-secondary text-secondary-foreground p-6">
			<h3 class="mb-2 text-lg font-semibold">Secondary</h3>
			<p class="text-sm opacity-90">次要色,用于辅助元素</p>
			<div class="mt-4 flex gap-2">
				<Button variant="outline" size="sm">按钮</Button>
				<Badge variant="secondary">标签</Badge>
			</div>
		</Card>

		<!-- Accent -->
		<Card class="bg-accent text-accent-foreground p-6">
			<h3 class="mb-2 text-lg font-semibold">Accent</h3>
			<p class="text-sm opacity-90">强调色,用于突出显示</p>
			<div class="mt-4 flex gap-2">
				<Button variant="ghost" size="sm">按钮</Button>
				<Badge variant="outline">标签</Badge>
			</div>
		</Card>

		<!-- Muted -->
		<Card class="bg-muted text-muted-foreground p-6">
			<h3 class="mb-2 text-lg font-semibold">Muted</h3>
			<p class="text-sm opacity-90">柔和色,用于背景和禁用状态</p>
			<div class="mt-4">
				<Input placeholder="输入框示例" disabled />
			</div>
		</Card>

		<!-- Card -->
		<Card class="bg-card text-card-foreground border p-6">
			<h3 class="mb-2 text-lg font-semibold">Card</h3>
			<p class="text-muted-foreground text-sm">卡片背景,用于内容容器</p>
			<div class="mt-4">
				<Input placeholder="输入框示例" />
			</div>
		</Card>

		<!-- Destructive -->
		<Card class="bg-destructive text-primary-foreground p-6">
			<h3 class="mb-2 text-lg font-semibold">Destructive</h3>
			<p class="text-sm opacity-90">破坏性操作,如删除、警告</p>
			<div class="mt-4">
				<Button variant="destructive" size="sm">删除</Button>
			</div>
		</Card>
	</div>

	<Separator />

	<!-- 按钮变体 -->
	<div class="space-y-4">
		<h3 class="text-xl font-semibold">按钮变体</h3>
		<div class="flex flex-wrap gap-3">
			<Button variant="default">Default</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="link">Link</Button>
			<Button variant="destructive">Destructive</Button>
		</div>
	</div>

	<Separator />

	<!-- 表单元素 -->
	<div class="space-y-4">
		<h3 class="text-xl font-semibold">表单元素</h3>
		<div class="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
			<div class="space-y-2">
				<label class="text-sm font-medium" for="theme-preview-input-normal">普通输入框</label>
				<Input id="theme-preview-input-normal" placeholder="请输入内容..." />
			</div>
			<div class="space-y-2">
				<label class="text-sm font-medium" for="theme-preview-input-disabled">禁用输入框</label>
				<Input id="theme-preview-input-disabled" placeholder="禁用状态" disabled />
			</div>
		</div>
	</div>

	<Separator />

	<!-- 文字样式 -->
	<div class="space-y-4">
		<h3 class="text-xl font-semibold">文字样式</h3>
		<div class="space-y-2">
			<p class="text-foreground">这是前景色文字 (foreground)</p>
			<p class="text-muted-foreground">这是柔和色文字 (muted-foreground)</p>
			<p class="text-primary">这是主色调文字 (primary)</p>
			<p class="text-secondary-foreground">这是次要色文字 (secondary-foreground)</p>
			<p class="text-accent-foreground">这是强调色文字 (accent-foreground)</p>
		</div>
	</div>

	<Separator />

	<!-- 边框和圆角 -->
	<div class="space-y-4">
		<h3 class="text-xl font-semibold">边框和圆角</h3>
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			<div class="rounded-sm border p-4 text-center">
				<p class="text-sm">rounded-sm</p>
			</div>
			<div class="rounded-md border p-4 text-center">
				<p class="text-sm">rounded-md</p>
			</div>
			<div class="rounded-lg border p-4 text-center">
				<p class="text-sm">rounded-lg</p>
			</div>
			<div class="rounded-xl border p-4 text-center">
				<p class="text-sm">rounded-xl</p>
			</div>
		</div>
	</div>

	<Separator />

	<!-- 阴影 -->
	<div class="space-y-4">
		<h3 class="text-xl font-semibold">阴影效果</h3>
		<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
			<div class="bg-card rounded-lg p-4 text-center shadow-sm">
				<p class="text-sm">shadow-sm</p>
			</div>
			<div class="bg-card rounded-lg p-4 text-center shadow">
				<p class="text-sm">shadow</p>
			</div>
			<div class="bg-card rounded-lg p-4 text-center shadow-md">
				<p class="text-sm">shadow-md</p>
			</div>
			<div class="bg-card rounded-lg p-4 text-center shadow-lg">
				<p class="text-sm">shadow-lg</p>
			</div>
		</div>
	</div>
</div>
