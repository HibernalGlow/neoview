<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
  
  【性能优化】原生滚动方案：
  - 使用浏览器原生滚动，硬件加速
  - HoverScrollLayer 直接操作 scrollLeft/scrollTop
  - 无需 transform-origin，性能最优
  
  【翻页动画】支持多种翻页动画效果：
  - 淡入淡出、滑动、缩放、翻转等
  - 通过 pageTransitionStore 控制
-->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { LayerZIndex } from '../types/layer';
	import type { Frame } from '../types/frame';
	import { getImageTransform, getClipPath } from '../utils/transform';
	import FrameImage from '../components/FrameImage.svelte';
	import FrameImageWithOverlay from '../components/FrameImageWithOverlay.svelte';
	import FrameContent from '../components/FrameContent.svelte';
	import '../styles/frameLayer.css';
	import {
		pageTransitionStore,
		easingCssMap,
		type PageTransitionSettings
	} from '$lib/stores/pageTransitionStore.svelte';

	import type { ZoomMode } from '$lib/settings/settingsManager';

	let {
		frame,
		layout = 'single',
		direction = 'ltr',
		orientation = 'horizontal',
		scale = 1,
		rotation = 0,
		viewportSize = { width: 0, height: 0 },
		imageSize = { width: 0, height: 0 },
		alignMode = 'center',
		zoomMode = 'fit' as ZoomMode,
		hoverScrollEnabled = false,
		onImageLoad
	}: {
		frame: Frame;
		layout?: 'single' | 'double' | 'panorama';
		direction?: 'ltr' | 'rtl';
		orientation?: 'horizontal' | 'vertical';
		scale?: number;
		rotation?: number;
		viewportSize?: { width: number; height: number };
		imageSize?: { width: number; height: number };
		alignMode?: 'center' | 'left' | 'right';
		zoomMode?: ZoomMode;
		hoverScrollEnabled?: boolean; // 悬停滚动是否开启
		onImageLoad?: (e: Event, index: number) => void;
	} = $props();

	// 翻页动画状态
	let transitionSettings = $state<PageTransitionSettings | null>(null);
	let animationClass = $state('');
	let animationStyle = $state('');
	
	// 记录上一次的页面索引
	let lastPageIndex = -1;
	let isFirstRender = true;
	
	// 【修复内存泄露】保存动画清理定时器的引用
	let animationCleanupTimer: ReturnType<typeof setTimeout> | null = null;
	
	// 【修复内存泄露】保存订阅取消函数
	let unsubscribeTransition: (() => void) | null = null;

	onMount(() => {
		unsubscribeTransition = pageTransitionStore.subscribe((s) => {
			transitionSettings = s;
		});
	});
	
	// 【修复内存泄露】组件销毁时清理资源
	onDestroy(() => {
		// 清理动画定时器
		if (animationCleanupTimer !== null) {
			clearTimeout(animationCleanupTimer);
			animationCleanupTimer = null;
		}
		
		// 取消订阅
		if (unsubscribeTransition) {
			unsubscribeTransition();
			unsubscribeTransition = null;
		}
	});

	// 获取当前页面索引
	function getCurrentPageIndex(): number {
		return frame?.images[0]?.physicalIndex ?? -1;
	}

	// 触发翻页动画
	async function triggerAnimation(dir: 'next' | 'prev') {
		if (!transitionSettings || transitionSettings.type === 'none') return;
		
		// 【修复内存泄露】清除上一个动画的清理定时器
		if (animationCleanupTimer !== null) {
			clearTimeout(animationCleanupTimer);
			animationCleanupTimer = null;
		}
		
		const { type, duration, easing } = transitionSettings;
		const easingCss = easingCssMap[easing];
		
		// 设置初始状态（动画起点）
		animationClass = `page-transition-${type}-enter-${dir}`;
		animationStyle = '';
		
		// 等待 DOM 更新
		await tick();
		
		// 强制重绘
		void document.body.offsetHeight;
		
		// 设置过渡并触发动画
		animationStyle = `transition: transform ${duration}ms ${easingCss}, opacity ${duration}ms ${easingCss}`;
		animationClass = `page-transition-${type}-enter-${dir} active`;
		
		// 【修复内存泄露】保存定时器引用，确保可以被清理
		animationCleanupTimer = setTimeout(() => {
			animationClass = '';
			animationStyle = '';
			animationCleanupTimer = null;
		}, duration + 50);
	}

	// 监听 frame 变化
	$effect(() => {
		const currentIndex = getCurrentPageIndex();
		
		// 跳过首次渲染和无效索引
		if (isFirstRender || currentIndex === -1) {
			isFirstRender = false;
			lastPageIndex = currentIndex;
			return;
		}
		
		// 页面没有变化
		if (currentIndex === lastPageIndex) return;
		
		// 检查动画是否启用
		if (!transitionSettings?.enabled) {
			lastPageIndex = currentIndex;
			return;
		}
		
		// 判断翻页方向并触发动画
		const dir = currentIndex > lastPageIndex ? 'next' : 'prev';
		lastPageIndex = currentIndex;
		
		triggerAnimation(dir);
	});

	/* 【性能优化】原生滚动方案：不再使用 transform-origin
	   HoverScrollLayer 直接操作容器的 scrollLeft/scrollTop */

	let layoutClass = $derived.by(() => {
		const classes: string[] = [];

		if (layout === 'double') {
			// 双页模式：始终左右排列
			classes.push('frame-double');
			if (direction === 'rtl') {
				classes.push('frame-rtl');
			}
		} else {
			classes.push('frame-single');
			// 添加对齐模式类
			if (alignMode === 'left') {
				classes.push('frame-align-left');
			} else if (alignMode === 'right') {
				classes.push('frame-align-right');
			}
		}

		// 悬停滚动模式：使用 inline-flex 支持滚动到边缘
		// 非悬停滚动模式：使用 flex 确保居中
		if (hoverScrollEnabled) {
			classes.push('hover-scroll-mode');
		}

		return classes.join(' ');
	});
</script>

{#if frame.images.length > 0}
	<!-- 【翻页动画】动画容器 -->
	<div
		class="scroll-frame-container {layoutClass} {animationClass}"
		data-layer="CurrentFrameLayer"
		data-layer-id="current"
		style:z-index={LayerZIndex.CURRENT_FRAME}
		style={animationStyle}
	>
		<FrameContent
			{frame}
			{layout}
			vpSize={viewportSize}
			{scale}
			{rotation}
			{imageSize}
			{zoomMode}
			{alignMode}
			{onImageLoad}
		/>
	</div>
{:else}
	<div
		class="scroll-frame-container frame-empty"
		data-layer="CurrentFrameLayer"
		data-layer-id="current"
		style:z-index={LayerZIndex.CURRENT_FRAME}
	>
		<span class="text-muted-foreground">暂无图片</span>
	</div>
{/if}

<style>
	/* 【性能优化】可滚动容器 - 原生滚动方案 */
	.scroll-frame-container {
		position: absolute;
		inset: 0;
		overflow: auto; /* 允许滚动 */
		/* 隐藏滚动条 */
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE/Edge */
		-webkit-overflow-scrolling: touch;
		/* 翻页动画基础 */
		backface-visibility: hidden;
		/* 【修复内存泄露】仅在动画时通过内联样式设置 will-change，避免持续占用 GPU 图层 */
	}

	/* 隐藏 Webkit 滚动条 */
	.scroll-frame-container::-webkit-scrollbar {
		display: none;
	}

	/* 
    FrameContent 的样式不再需要在这里定义，移至 FrameContent.svelte 
    保留对 .scroll-frame-content 的样式引用，因为 FrameContent 内部使用了它
    */
	:global(.scroll-frame-container .scroll-frame-content) {
		/* 这些样式移到了 FrameContent 中，但为了确保在父容器中正确表现，
           特别是 scroll-frame-container 的 flex/inline-flex 影响 */
	}

	/* 悬停滚动模式：使用 inline-flex 支持滚动到边缘 */
	.scroll-frame-container.hover-scroll-mode :global(.scroll-frame-content) {
		display: inline-flex;
	}

	.frame-empty {
		opacity: 1;
	}

	/* 双页模式（始终左右排列） */
	.scroll-frame-container.frame-double :global(.scroll-frame-content) {
		flex-direction: row;
		gap: 0;
	}

	.scroll-frame-container.frame-double.frame-rtl :global(.scroll-frame-content) {
		flex-direction: row-reverse;
	}

	/* 对齐模式 - 应用到 flex 容器 .scroll-frame-content 上 */
	.scroll-frame-container.frame-align-left :global(.scroll-frame-content) {
		justify-content: flex-start;
	}

	.scroll-frame-container.frame-align-right :global(.scroll-frame-content) {
		justify-content: flex-end;
	}

	/* ============================================
	   翻页动画样式（内联以确保优先级）
	   ============================================ */
	
	/* 淡入淡出 */
	.scroll-frame-container.page-transition-fade-enter-next,
	.scroll-frame-container.page-transition-fade-enter-prev {
		opacity: 0;
	}
	.scroll-frame-container.page-transition-fade-enter-next.active,
	.scroll-frame-container.page-transition-fade-enter-prev.active {
		opacity: 1;
	}

	/* 水平滑动 - 下一页 */
	.scroll-frame-container.page-transition-slide-enter-next {
		transform: translateX(30%);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-slide-enter-next.active {
		transform: translateX(0);
		opacity: 1;
	}

	/* 水平滑动 - 上一页 */
	.scroll-frame-container.page-transition-slide-enter-prev {
		transform: translateX(-30%);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-slide-enter-prev.active {
		transform: translateX(0);
		opacity: 1;
	}

	/* 垂直滑动 - 下一页 */
	.scroll-frame-container.page-transition-slideUp-enter-next {
		transform: translateY(30%);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-slideUp-enter-next.active {
		transform: translateY(0);
		opacity: 1;
	}

	/* 垂直滑动 - 上一页 */
	.scroll-frame-container.page-transition-slideUp-enter-prev {
		transform: translateY(-30%);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-slideUp-enter-prev.active {
		transform: translateY(0);
		opacity: 1;
	}

	/* 缩放 - 下一页 */
	.scroll-frame-container.page-transition-zoom-enter-next {
		transform: scale(0.9);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-zoom-enter-next.active {
		transform: scale(1);
		opacity: 1;
	}

	/* 缩放 - 上一页 */
	.scroll-frame-container.page-transition-zoom-enter-prev {
		transform: scale(1.1);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-zoom-enter-prev.active {
		transform: scale(1);
		opacity: 1;
	}

	/* 翻转 - 下一页 */
	.scroll-frame-container.page-transition-flip-enter-next {
		transform: perspective(1000px) rotateY(-15deg);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-flip-enter-next.active {
		transform: perspective(1000px) rotateY(0deg);
		opacity: 1;
	}

	/* 翻转 - 上一页 */
	.scroll-frame-container.page-transition-flip-enter-prev {
		transform: perspective(1000px) rotateY(15deg);
		opacity: 0;
	}
	.scroll-frame-container.page-transition-flip-enter-prev.active {
		transform: perspective(1000px) rotateY(0deg);
		opacity: 1;
	}
</style>
