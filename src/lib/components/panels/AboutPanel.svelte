<script lang="ts">
	/**
	 * AboutPanel - 关于面板
	 * 使用 BoxReveal 动画展示项目信息
	 */
	import { Info, Github, Heart, Code, Sparkles } from '@lucide/svelte';
	import BoxReveal from '$lib/components/ui/BoxReveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { open } from '@tauri-apps/plugin-shell';

	const version = __APP_VERSION__;

	// 技术栈标签
	const tags = [
		{ label: 'Tauri 2', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
		{ label: 'Svelte 5', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
		{ label: 'TypeScript', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
		{ label: 'Rust', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
		{ label: 'TailwindCSS', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
		{ label: 'shadcn-svelte', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' }
	];

	// 主要功能
	const features = [
		'高性能图像浏览',
		'压缩包直接预览',
		'AI 超分辨率增强',
		'自定义主题与布局',
		'键盘快捷键支持',
		'多格式支持'
	];

	async function openGithub() {
		await open('https://github.com/HibernalGlow/NeoView');
	}
</script>

<div class="space-y-6 p-6">
	<!-- 标题区域 -->
	<div class="space-y-4">
		<BoxReveal duration={0.5} boxColor="var(--color-primary)">
			<h1 class="text-4xl font-bold tracking-tight">
				NeoView
				<span class="text-primary">.</span>
			</h1>
		</BoxReveal>

		<BoxReveal duration={0.5} boxColor="var(--color-primary)">
			<p class="text-muted-foreground text-lg">现代化的桌面图像浏览器</p>
		</BoxReveal>

		<BoxReveal duration={0.5} boxColor="var(--color-primary)">
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<Sparkles class="h-4 w-4 text-primary" />
				<span>版本 {version}</span>
			</div>
		</BoxReveal>
	</div>

	<!-- 技术栈标签 -->
	<BoxReveal duration={0.5} boxColor="var(--color-primary)">
		<div class="space-y-3">
			<h3 class="flex items-center gap-2 text-sm font-semibold">
				<Code class="h-4 w-4" />
				技术栈
			</h3>
			<div class="flex flex-wrap gap-2">
				{#each tags as tag}
					<span
						class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all hover:scale-105 {tag.color}"
					>
						{tag.label}
					</span>
				{/each}
			</div>
		</div>
	</BoxReveal>

	<!-- 功能特性 -->
	<BoxReveal duration={0.5} boxColor="var(--color-primary)">
		<div class="space-y-3">
			<h3 class="flex items-center gap-2 text-sm font-semibold">
				<Info class="h-4 w-4" />
				主要功能
			</h3>
			<div class="grid grid-cols-2 gap-2">
				{#each features as feature}
					<div class="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm">
						<span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
						{feature}
					</div>
				{/each}
			</div>
		</div>
	</BoxReveal>

	<!-- 操作按钮 -->
	<BoxReveal duration={0.5} boxColor="var(--color-primary)">
		<div class="flex gap-3 pt-2">
			<Button variant="default" class="gap-2" onclick={openGithub}>
				<Github class="h-4 w-4" />
				GitHub
			</Button>
			<Button variant="outline" class="gap-2">
				<Heart class="h-4 w-4 text-red-500" />
				支持项目
			</Button>
		</div>
	</BoxReveal>

	<!-- 版权信息 -->
	<BoxReveal duration={0.5} boxColor="var(--color-primary)">
		<p class="border-t pt-4 text-xs text-muted-foreground">
			© 2024-2025 HibernalGlow. 基于 MIT 许可证开源。
		</p>
	</BoxReveal>
</div>
