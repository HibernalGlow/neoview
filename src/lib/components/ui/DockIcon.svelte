<script lang="ts">
	/**
	 * DockIcon - Dock 图标组件，带放大效果
	 * 参考 https://animation-svelte.vercel.app/magic/dock
	 */
	import { cn } from '$lib/utils';
	// @ts-ignore - svelte-motion 类型定义问题
	import { Motion, useMotionValue, useSpring, useTransform } from 'svelte-motion';

	interface Props {
		/** 放大倍数 */
		magnification?: number;
		/** 影响距离 */
		distance?: number;
		/** 鼠标 X 坐标 */
		mouseX?: number;
		class?: string;
		/** 子内容 */
		children?: import('svelte').Snippet;
	}

	let {
		magnification = 60,
		distance = 160,
		mouseX = 0,
		class: className = '',
		children
	}: Props = $props();

	let mint = useMotionValue(mouseX);
	$effect(() => {
		mint.set(mouseX);
	});

	let iconElement: HTMLDivElement;

	let distanceCalc = useTransform(mint, (val: number) => {
		const bounds = iconElement?.getBoundingClientRect() ?? { x: 0, width: 0 };
		return val - bounds.x - bounds.width / 2;
	});

	let widthSync = useTransform(distanceCalc, [-distance, 0, distance], [38, magnification, 38]);

	let width = useSpring(widthSync, {
		mass: 0.1,
		stiffness: 150,
		damping: 12
	});

	const iconClass = $derived(
		cn('flex aspect-square cursor-pointer items-center justify-center rounded-full', className)
	);
</script>

<Motion style={{ width: width }} let:motion>
	<div use:motion bind:this={iconElement} class={iconClass}>
		{#if children}
			{@render children()}
		{/if}
	</div>
</Motion>
