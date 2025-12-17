<script lang="ts">
	/**
	 * DockIconWrapper - Dock 图标放大效果包装器
	 * 用于给侧边栏图标添加鼠标悬停放大效果
	 * 纯 CSS 实现，兼容 Svelte 5
	 */
	import { cn } from '$lib/utils';

	interface Props {
		/** 放大倍数 */
		magnification?: number;
		/** 影响距离（px） */
		distance?: number;
		/** 方向：horizontal 水平 | vertical 垂直 */
		direction?: 'horizontal' | 'vertical';
		/** 鼠标位置（由父组件传入） */
		mousePos?: number | null;
		/** 元素索引 */
		index?: number;
		/** 所有元素的 ref 数组 */
		itemRefs?: HTMLElement[];
		class?: string;
		/** 子内容 */
		children?: import('svelte').Snippet;
	}

	let {
		magnification = 1.4,
		distance = 80,
		direction = 'vertical',
		mousePos = null,
		index = 0,
		itemRefs = [],
		class: className = '',
		children
	}: Props = $props();

	// 计算缩放比例
	const scale = $derived.by(() => {
		if (mousePos === null || !itemRefs[index]) return 1;
		const rect = itemRefs[index].getBoundingClientRect();
		const itemCenter =
			direction === 'vertical' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
		const dist = Math.abs(mousePos - itemCenter);
		if (dist > distance) return 1;
		// 使用余弦函数实现平滑过渡
		return 1 + (magnification - 1) * Math.cos((dist / distance) * (Math.PI / 2));
	});
</script>

<div
	class={cn('flex items-center justify-center transition-transform duration-150 ease-out', className)}
	style="transform: scale({scale}); transform-origin: center;"
>
	{#if children}
		{@render children()}
	{/if}
</div>
