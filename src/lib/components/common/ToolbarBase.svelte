<script lang="ts" module>
	/**
	 * 工具栏位置类型
	 */
	export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

	/**
	 * 工具栏基础组件属性接口
	 */
	export interface ToolbarBaseProps {
		/** 工具栏位置 */
		position: ToolbarPosition;
		/** 是否自动隐藏 */
		autoHide?: boolean;
		/** 自动隐藏延迟时间（毫秒） */
		autoHideDelay?: number;
		/** 自定义样式类 */
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * ToolbarBase - 工具栏基础组件
	 * 支持四个方向定位和自动隐藏功能
	 */
	import type { Snippet } from 'svelte';

	interface Props extends ToolbarBaseProps {
		/** 工具栏内容插槽 */
		children?: Snippet;
	}

	let {
		position,
		autoHide = false,
		autoHideDelay = 500,
		class: className = '',
		children
	}: Props = $props();

	// 可见性状态
	let isVisible = $state(true);

	$effect(() => {
		isVisible = !autoHide;
	});
	// 隐藏定时器
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * 清除隐藏定时器
	 */
	function clearHideTimer() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}

	/**
	 * 鼠标进入处理 - 显示工具栏
	 */
	function handleMouseEnter() {
		clearHideTimer();
		isVisible = true;
	}

	/**
	 * 鼠标离开处理 - 延迟隐藏工具栏
	 */
	function handleMouseLeave() {
		if (!autoHide) return;

		clearHideTimer();
		hideTimer = setTimeout(() => {
			isVisible = false;
		}, autoHideDelay);
	}

	// 根据位置计算触发区域样式
	const triggerPositionClass = $derived.by(() => {
		switch (position) {
			case 'top':
				return 'top-0 left-0 right-0 h-2';
			case 'bottom':
				return 'bottom-0 left-0 right-0 h-2';
			case 'left':
				return 'left-0 top-0 bottom-0 w-2';
			case 'right':
				return 'right-0 top-0 bottom-0 w-2';
		}
	});

	// 根据位置计算工具栏容器样式
	const containerPositionClass = $derived.by(() => {
		switch (position) {
			case 'top':
				return 'top-0 left-0 right-0';
			case 'bottom':
				return 'bottom-0 left-0 right-0';
			case 'left':
				return 'left-0 top-0 bottom-0';
			case 'right':
				return 'right-0 top-0 bottom-0';
		}
	});

	// 根据位置计算隐藏时的变换样式
	const hideTransformClass = $derived.by(() => {
		if (isVisible) return 'translate-x-0 translate-y-0 opacity-100';

		switch (position) {
			case 'top':
				return '-translate-y-full opacity-0';
			case 'bottom':
				return 'translate-y-full opacity-0';
			case 'left':
				return '-translate-x-full opacity-0';
			case 'right':
				return 'translate-x-full opacity-0';
		}
	});

	// 判断是否为水平方向
	const isHorizontal = $derived(position === 'top' || position === 'bottom');
</script>

<!-- 自动隐藏模式下的触发区域 -->
{#if autoHide && !isVisible}
	<div
		class="fixed z-40 hover:bg-primary/10 transition-colors {triggerPositionClass}"
		onmouseenter={handleMouseEnter}
		role="presentation"
		aria-label="显示工具栏"
	></div>
{/if}

<!-- 工具栏容器 -->
<div
	class="fixed z-50 transition-all duration-300 ease-out {containerPositionClass} {hideTransformClass} {className}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="toolbar"
	tabindex="0"
>
	<div
		class="bg-background/95 backdrop-blur-sm border shadow-lg {isHorizontal
			? position === 'top'
				? 'border-b'
				: 'border-t'
			: position === 'left'
				? 'border-r'
				: 'border-l'}"
	>
		<div
			class="flex items-center {isHorizontal
				? 'flex-row h-12 px-4 gap-4'
				: 'flex-col w-12 py-4 gap-4'}"
		>
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
</div>
