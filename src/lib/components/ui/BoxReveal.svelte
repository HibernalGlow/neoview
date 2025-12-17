<script lang="ts">
	/**
	 * BoxReveal - 盒子揭示动画组件
	 * 纯 CSS 实现，兼容 Svelte 5 runes 模式
	 * 参考 https://animation-svelte.vercel.app/magic/box-reveal
	 */
	import { cn } from '$lib/utils';

	interface Props {
		/** 容器宽度 */
		width?: string;
		/** 遮罩颜色 */
		boxColor?: string;
		/** 动画持续时间（秒） */
		duration?: number;
		/** 自定义类名 */
		class?: string;
		/** 子内容 */
		children?: import('svelte').Snippet;
	}

	let {
		width = 'fit-content',
		boxColor = 'var(--color-primary)',
		duration = 0.5,
		class: className = '',
		children
	}: Props = $props();

	let isVisible = $state(false);
	let containerRef = $state<HTMLDivElement | null>(null);

	// 使用 IntersectionObserver 检测元素进入视口
	$effect(() => {
		if (!containerRef) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					isVisible = entry.isIntersecting;
				});
			},
			{ threshold: 0.1 }
		);

		observer.observe(containerRef);

		return () => observer.disconnect();
	});
</script>

<div
	bind:this={containerRef}
	class={cn('relative overflow-hidden', className)}
	style="width: {width};"
>
	<!-- 内容区域 -->
	<div
		class="box-content"
		class:visible={isVisible}
		style="--duration: {duration}s;"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>

	<!-- 遮罩盒子 -->
	<div
		class="box-mask"
		class:animate={isVisible}
		style="--duration: {duration}s; --box-color: {boxColor};"
	></div>
</div>

<style>
	.box-content {
		opacity: 0;
		transform: translateY(20px);
		transition:
			opacity 0.01s,
			transform calc(var(--duration) * 0.5);
		transition-delay: calc(var(--duration) * 0.5);
	}

	.box-content.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.box-mask {
		position: absolute;
		inset: 0;
		background: var(--box-color);
		transform: scaleX(0);
		transform-origin: left;
		z-index: 10;
	}

	.box-mask.animate {
		animation: box-reveal calc(var(--duration) * 1) ease-in-out forwards;
	}

	@keyframes box-reveal {
		0% {
			transform: scaleX(0);
			transform-origin: left;
		}
		50% {
			transform: scaleX(1);
			transform-origin: left;
		}
		50.01% {
			transform-origin: right;
		}
		100% {
			transform: scaleX(0);
			transform-origin: right;
		}
	}
</style>
