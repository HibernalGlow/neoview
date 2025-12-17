<script lang="ts">
	/**
	 * BoxReveal - 盒子揭示动画组件
	 * 参考 https://animation-svelte.vercel.app/magic/box-reveal
	 * 使用 IntersectionObserver + CSS 动画实现
	 */
	import { cn } from '$lib/utils';

	interface Props {
		/** 容器宽度 */
		width?: string;
		/** 遮罩颜色，默认使用主题色 */
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
		boxColor = 'hsl(var(--primary))',
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
					if (entry.isIntersecting) {
						isVisible = true;
					}
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
	<!-- 内容区域：从下方滑入并淡入 -->
	<div
		class="content-wrapper"
		class:visible={isVisible}
		style="--duration: {duration}s;"
	>
		{#if children}
			{@render children()}
		{/if}
	</div>

	<!-- 遮罩盒子：从左到右滑过 -->
	<div
		class="mask-box"
		class:animate={isVisible}
		style="--duration: {duration}s; background-color: {boxColor};"
	></div>
</div>

<style>
	/* 内容初始状态：隐藏并向下偏移 */
	.content-wrapper {
		opacity: 0;
		transform: translateY(75px);
	}

	/* 内容显示状态：延迟后淡入并上移 */
	.content-wrapper.visible {
		animation: content-reveal var(--duration) ease-out 0.25s forwards;
	}

	@keyframes content-reveal {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* 遮罩盒子 */
	.mask-box {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 0;
		right: 0;
		z-index: 20;
		transform: translateX(-100%);
	}

	/* 遮罩动画：从左滑入再从右滑出 */
	.mask-box.animate {
		animation: mask-slide var(--duration) ease-in forwards;
	}

	@keyframes mask-slide {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(0%);
		}
		100% {
			transform: translateX(100%);
		}
	}
</style>
