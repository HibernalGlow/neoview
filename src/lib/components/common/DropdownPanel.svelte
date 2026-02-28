<script lang="ts" module>
	/**
	 * 下拉面板触发方式类型
	 */
	export type DropdownTrigger = 'click' | 'hover';

	/**
	 * 下拉面板位置类型
	 */
	export type DropdownPosition = 'top' | 'bottom' | 'left' | 'right';

	/**
	 * 下拉面板组件属性接口
	 */
	export interface DropdownPanelProps {
		/** 触发方式 */
		trigger: DropdownTrigger;
		/** 面板位置 */
		position: DropdownPosition;
		/** 点击外部是否关闭 */
		closeOnClickOutside?: boolean;
		/** 自定义样式类 */
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * DropdownPanel - 下拉面板组件
	 * 支持点击或悬停触发，可配置弹出位置
	 */
	import type { Snippet } from 'svelte';

	interface Props extends DropdownPanelProps {
		/** 触发器内容插槽 */
		triggerContent?: Snippet;
		/** 面板内容插槽 */
		children?: Snippet;
	}

	let {
		trigger,
		position,
		closeOnClickOutside = true,
		class: className = '',
		triggerContent,
		children
	}: Props = $props();

	// 面板打开状态
	let isOpen = $state(false);
	// 容器元素引用
	let containerRef: HTMLDivElement | null = $state(null);
	// 悬停延迟定时器
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * 清除悬停定时器
	 */
	function clearHoverTimer() {
		if (hoverTimer) {
			clearTimeout(hoverTimer);
			hoverTimer = null;
		}
	}

	/**
	 * 切换面板状态（点击触发）
	 */
	function handleClick() {
		if (trigger === 'click') {
			isOpen = !isOpen;
		}
	}

	/**
	 * 鼠标进入处理（悬停触发）
	 */
	function handleMouseEnter() {
		if (trigger === 'hover') {
			clearHoverTimer();
			isOpen = true;
		}
	}

	/**
	 * 鼠标离开处理（悬停触发）
	 */
	function handleMouseLeave() {
		if (trigger === 'hover') {
			clearHoverTimer();
			hoverTimer = setTimeout(() => {
				isOpen = false;
			}, 150);
		}
	}

	/**
	 * 处理键盘事件
	 */
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			isOpen = false;
		}
		if (trigger === 'click' && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			isOpen = !isOpen;
		}
	}

	/**
	 * 处理点击外部关闭
	 */
	function handleClickOutside(event: MouseEvent) {
		if (
			closeOnClickOutside &&
			isOpen &&
			containerRef &&
			!containerRef.contains(event.target as Node)
		) {
			isOpen = false;
		}
	}

	// 监听全局点击事件
	$effect(() => {
		if (isOpen && closeOnClickOutside) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});

	// 根据位置计算面板样式
	const panelPositionClass = $derived.by(() => {
		switch (position) {
			case 'top':
				return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
			case 'bottom':
				return 'top-full left-1/2 -translate-x-1/2 mt-2';
			case 'left':
				return 'right-full top-1/2 -translate-y-1/2 mr-2';
			case 'right':
				return 'left-full top-1/2 -translate-y-1/2 ml-2';
		}
	});

	// 根据位置计算动画起始样式
	const animationOriginClass = $derived.by(() => {
		switch (position) {
			case 'top':
				return 'origin-bottom';
			case 'bottom':
				return 'origin-top';
			case 'left':
				return 'origin-right';
			case 'right':
				return 'origin-left';
		}
	});
</script>

<div
	bind:this={containerRef}
	class="relative inline-block {className}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<!-- 触发器 -->
	<button
		type="button"
		class="inline-flex items-center justify-center"
		onclick={handleClick}
		onkeydown={handleKeyDown}
		aria-expanded={isOpen}
		aria-haspopup="true"
	>
		{#if triggerContent}
			{@render triggerContent()}
		{/if}
	</button>

	<!-- 下拉面板 -->
	{#if isOpen}
		<div
			class="absolute z-50 min-w-[200px] {panelPositionClass} {animationOriginClass}"
			role="menu"
			aria-orientation="vertical"
		>
			<div
				class="bg-popover/95 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden
					   animate-in fade-in-0 zoom-in-95 duration-200"
			>
				{#if children}
					{@render children()}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* 进入动画 */
	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* 应用动画类 */
	:global(.animate-in) {
		animation: fadeIn 0.2s ease-out forwards;
	}
</style>
