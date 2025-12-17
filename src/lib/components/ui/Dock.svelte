<script lang="ts">
	/**
	 * Dock - MacOS 风格的 Dock 菜单组件
	 * 参考 https://animation-svelte.vercel.app/magic/dock
	 */
	// @ts-ignore - svelte-motion 类型定义问题
	import { Motion } from 'svelte-motion';
	import { cva, type VariantProps } from 'class-variance-authority';
	import { cn } from '$lib/utils';

	type Direction = 'top' | 'middle' | 'bottom';

	interface Props {
		class?: string;
		/** 放大倍数 */
		magnification?: number;
		/** 影响距离 */
		distance?: number;
		/** 对齐方向 */
		direction?: Direction;
		/** 子内容 */
		children?: import('svelte').Snippet<[{ mouseX: number; magnification: number; distance: number }]>;
	}

	let {
		class: className = '',
		magnification = 60,
		distance = 140,
		direction = 'middle',
		children
	}: Props = $props();

	const dockVariants = cva(
		'mx-auto w-max mt-8 h-[58px] p-2 flex gap-2 rounded-2xl border supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 backdrop-blur-md'
	);

	let mouseX = $state(Infinity);

	function handleMouseMove(e: MouseEvent) {
		mouseX = e.pageX;
	}

	function handleMouseLeave() {
		mouseX = Infinity;
	}

	const dockClass = $derived(
		cn(dockVariants({ className }), {
			'items-start': direction === 'top',
			'items-center': direction === 'middle',
			'items-end': direction === 'bottom'
		})
	);
</script>

<Motion let:motion>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:motion
		onmousemove={handleMouseMove}
		onmouseleave={handleMouseLeave}
		class={dockClass}
	>
		{#if children}
			{@render children({ mouseX, magnification, distance })}
		{:else}
			<span>Default</span>
		{/if}
	</div>
</Motion>
