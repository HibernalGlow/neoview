<script lang="ts">
	/**
	 * ProjectCard - 项目卡片组件
	 * 展示 NeoView 项目 GitHub 信息
	 */
	import {
		Github,
		Star,
		Eye,
		GitFork,
		ExternalLink,
		Code2,
		Palette,
		Zap,
		Image
	} from '@lucide/svelte';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	const projectInfo = {
		name: 'NeoView',
		fullName: 'HibernalGlow/neoview',
		description: '桌面端图片 / 漫画查看器应用',
		longDescription: '基于 Tauri 2 + Svelte 5 + Rust + PyO3，复刻 NeeView 阅读器的核心体验',
		url: 'https://github.com/HibernalGlow/neoview',
		license: 'MIT',
		techStack: ['Tauri 2', 'Svelte 5', 'Rust', 'SQLite'],
		features: [
			{ icon: Image, text: '高性能图库浏览', color: 'text-blue-500' },
			{ icon: Zap, text: '缩略图缓存系统', color: 'text-yellow-500' },
			{ icon: Palette, text: '多套预设主题', color: 'text-purple-500' },
			{ icon: Code2, text: '超分增强支持', color: 'text-green-500' }
		]
	};

	function openGitHub() {
		window.open(projectInfo.url, '_blank');
	}
</script>

<div
	class="project-card group {className}"
	role="button"
	tabindex="0"
	onclick={openGitHub}
	onkeydown={(e) => e.key === 'Enter' && openGitHub()}
>
	<!-- 背景装饰 -->
	<div
		class="from-primary/5 to-accent/5 absolute inset-0 rounded-xl bg-gradient-to-br via-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
	></div>

	<!-- 卡片内容 -->
	<div class="relative z-10 p-6">
		<!-- 头部：Logo + 标题 居中 -->
		<div class="mb-4 flex flex-col items-center justify-center">
			<div class="mb-2 flex items-center gap-3">
				<div
					class="from-primary/20 to-primary/5 border-primary/20 shadow-primary/5 rounded-xl border bg-gradient-to-br p-2.5 shadow-lg"
				>
					<Github class="text-primary h-6 w-6" />
				</div>
				<div class="text-center">
					<h3 class="text-foreground group-hover:text-primary text-xl font-bold transition-colors">
						{projectInfo.name}
					</h3>
					<p class="text-muted-foreground font-mono text-xs">
						{projectInfo.fullName}
					</p>
				</div>
			</div>
			<div
				class="text-muted-foreground group-hover:text-primary flex items-center gap-1 transition-colors"
			>
				<ExternalLink class="h-4 w-4" />
				<span class="text-xs">在 GitHub 上查看</span>
			</div>
		</div>

		<!-- 描述 -->
		<p class="text-muted-foreground mb-4 text-sm leading-relaxed">
			{projectInfo.longDescription}
		</p>

		<!-- 特性网格 -->
		<div class="mb-4 grid grid-cols-2 gap-2">
			{#each projectInfo.features as feature}
				<div
					class="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
				>
					<feature.icon class="h-4 w-4 {feature.color}" />
					<span class="text-foreground/80 text-xs">{feature.text}</span>
				</div>
			{/each}
		</div>

		<!-- 技术栈标签 -->
		<div class="mb-4 flex flex-wrap gap-1.5">
			{#each projectInfo.techStack as tech}
				<span
					class="bg-primary/10 text-primary border-primary/20 rounded-full border px-2 py-0.5 text-xs font-medium"
				>
					{tech}
				</span>
			{/each}
		</div>

		<!-- 底部：统计信息 + License -->
		<div class="border-border/50 flex items-center justify-between border-t pt-3">
			<div class="text-muted-foreground flex items-center gap-4 text-xs">
				<div class="flex cursor-pointer items-center gap-1 transition-colors hover:text-yellow-500">
					<Star class="h-3.5 w-3.5" />
					<span>Star</span>
				</div>
				<div class="flex cursor-pointer items-center gap-1 transition-colors hover:text-blue-500">
					<Eye class="h-3.5 w-3.5" />
					<span>Watch</span>
				</div>
				<div class="flex cursor-pointer items-center gap-1 transition-colors hover:text-green-500">
					<GitFork class="h-3.5 w-3.5" />
					<span>Fork</span>
				</div>
			</div>
			<span class="text-muted-foreground bg-muted/50 rounded px-2 py-0.5 text-xs">
				{projectInfo.license}
			</span>
		</div>
	</div>

	<!-- 悬停光效 -->
	<div
		class="from-primary/0 via-primary/5 to-primary/0 pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100"
	></div>
</div>

<style>
	.project-card {
		position: relative;
		max-width: 28rem;
		border-radius: 0.75rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border) / 0.5);
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.05),
			0 2px 4px -2px rgb(0 0 0 / 0.05);
		cursor: pointer;
		transition: all 0.3s ease;
		overflow: hidden;
	}

	.project-card:hover {
		border-color: hsl(var(--primary) / 0.3);
		box-shadow:
			0 10px 25px -5px rgb(0 0 0 / 0.1),
			0 8px 10px -6px rgb(0 0 0 / 0.05),
			0 0 0 1px hsl(var(--primary) / 0.1);
		transform: translateY(-2px);
	}

	.project-card:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: 2px;
	}
</style>
