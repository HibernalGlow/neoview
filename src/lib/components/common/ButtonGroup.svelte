<script lang="ts" module>
	/**
	 * 按钮组方向类型
	 */
	export type ButtonGroupOrientation = 'horizontal' | 'vertical';

	/**
	 * 按钮组组件属性接口
	 */
	export interface ButtonGroupProps {
		/** 排列方向 */
		orientation: ButtonGroupOrientation;
		/** 按钮间距（像素） */
		gap?: number;
		/** 自定义样式类 */
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * ButtonGroup - 按钮组组件
	 * 用于将多个按钮组合在一起，支持水平和垂直排列
	 */
	import type { Snippet } from 'svelte';

	interface Props extends ButtonGroupProps {
		/** 按钮组内容插槽 */
		children?: Snippet;
	}

	let { orientation, gap = 4, class: className = '', children }: Props = $props();

	// 计算 flex 方向样式
	const flexDirection = $derived(orientation === 'horizontal' ? 'flex-row' : 'flex-col');

	// 计算间距样式（使用 CSS 变量）
	const gapStyle = $derived(`gap: ${gap}px`);
</script>

<div
	class="flex items-center {flexDirection} {className}"
	style={gapStyle}
	role="group"
	aria-label="按钮组"
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	/* 按钮组内的按钮样式优化 - 水平方向 */
	:global(.button-group-horizontal > button:not(:first-child):not(:last-child)) {
		border-radius: 0;
	}

	:global(.button-group-horizontal > button:first-child) {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
	}

	:global(.button-group-horizontal > button:last-child) {
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	/* 按钮组内的按钮样式优化 - 垂直方向 */
	:global(.button-group-vertical > button:not(:first-child):not(:last-child)) {
		border-radius: 0;
	}

	:global(.button-group-vertical > button:first-child) {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	:global(.button-group-vertical > button:last-child) {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
</style>
