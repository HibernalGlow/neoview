<script lang="ts">
	/**
	 * Magnifier - 放大镜组件
	 * 显示一个跟随鼠标的放大镜，内部渲染当前帧的放大视图
	 */
	import type { Frame } from '../../stackview/types/frame';
	import FrameContent from '../../stackview/components/FrameContent.svelte';
	import { spring } from 'svelte/motion';
	import type { ZoomMode } from '$lib/settings/settingsManager';
	import { onDestroy } from 'svelte';

	let {
		frame,
		layout = 'single',
		vpSize,
		scale = 1,
		rotation = 0,
		imageSize = { width: 0, height: 0 },
		zoomMode = 'fit',
		alignMode = 'center',
		zoom = 2.0,
		size = 200,
		enabled = false,
        onImageLoad,
		containerRect = null
	}: {
		frame: Frame;
		layout?: 'single' | 'double' | 'panorama';
		vpSize: { width: number; height: number };
		scale?: number;
		rotation?: number;
		imageSize?: { width: number; height: number };
		zoomMode?: ZoomMode;
		alignMode?: 'center' | 'left' | 'right';
		zoom?: number; // 放大倍率
		size?: number; // 镜片直径
		enabled?: boolean;
        onImageLoad?: (e: Event, index: number) => void;
        containerRect?: { left: number; top: number; width: number; height: number; } | null;
	} = $props();

	// 鼠标位置状态
	let mouseX = $state(0);
	let mouseY = $state(0);
	let isVisible = $state(false);

	// 使用 spring 动画使跟随更平滑
	const pos = spring({ x: 0, y: 0 }, {
		stiffness: 0.2,
		damping: 0.8
	});

	function handleMouseMove(e: MouseEvent) {
		if (!enabled) return;
		mouseX = e.clientX;
		mouseY = e.clientY;
		pos.set({ x: mouseX, y: mouseY });
		isVisible = true;
	}

	function handleMouseEnter() {
		if (enabled) isVisible = true;
	}

	function handleMouseLeave() {
		isVisible = false;
	}

	// 监听 window 上的鼠标移动，或者由父组件传入事件？
	// 为了简单起见，这里假设父组件是全屏的 StackView，我们在 window 上监听
	// 但这可能会干扰其他 UI。最好是监听 StackView 的容器。
    // 这里我们先提供事件处理函数，由父组件调用，或者在 mount 时绑定到 window（如果 enabled）

    $effect(() => {
        if (enabled) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseenter', handleMouseEnter); // window 通常不会触发 enter/leave 用于显示隐藏
            window.addEventListener('mouseout', handleMouseLeave); // 使用 mouseout 检测离开窗口
        } else {
            isVisible = false;
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseenter', handleMouseEnter);
            window.removeEventListener('mouseout', handleMouseLeave);
        };
    });

	// 计算内部内容的 transform
	// 目标：让 lens 中心显示的图片内容 = 鼠标下显示的图片内容 * zoom
	// 
	// 原理：
	// lens 绝对定位到 (mouseX - size/2, mouseY - size/2)
	// lens 内部有一个 content，它是原来 content 的克隆
	//我们需要移动内部 content，使得 (mouseX, mouseY) 这个点在 lens 中心
	// 
	// 设 P 为鼠标点在屏幕坐标系中的位置 (x, y)
	// 内部 content 需要缩放 zoom 倍
	// 且在 lens 中心点 (size/2, size/2) 显示 P点的内容
	// 
	// CSS transform origin 默认为 50% 50% (content 中心)
	// 但这里我们希望以 (0,0) 为基准更容易计算? 或者直接计算 translate
	// 
	// 假设 content 放在 (0,0)
	// P 点在 content 中的位置也是 (x, y) (因为 content 是全屏的)
	// 放大后，P 点在 (x*zoom, y*zoom)
	// 我们希望这个点出现在 lens 的 (size/2, size/2)
	// 所以 content 需要 translate:
	// tx = size/2 - x*zoom
	// ty = size/2 - y*zoom
	
	let innerTransform = $derived.by(() => {
		const x = $pos.x - (containerRect?.left ?? 0);
		const y = $pos.y - (containerRect?.top ?? 0);
		const tx = size / 2 - x * zoom;
		const ty = size / 2 - y * zoom;
		return `translate(${tx}px, ${ty}px) scale(${zoom})`;
	});

    // 镜片位置
	let lensStyle = $derived(`
        width: ${size}px; 
        height: ${size}px; 
        left: ${$pos.x - size / 2}px; 
        top: ${$pos.y - size / 2}px;
        display: ${isVisible && enabled ? 'block' : 'none'};
    `);

</script>

<div class="magnifier-lens" style={lensStyle}>
	<div 
        class="magnifier-content" 
        style:transform={innerTransform}
        style:width="{vpSize.width}px"
        style:height="{vpSize.height}px"
    >
		<FrameContent
			{frame}
			{layout}
			{vpSize}
			{scale}
			{rotation}
			{imageSize}
			{zoomMode}
			{alignMode}
            {onImageLoad}
		/>
	</div>
</div>

<style>
	.magnifier-lens {
		position: fixed;
		z-index: 1000; /* 高层级 */
		border-radius: 50%; /* 圆形镜片 */
		border: 2px solid rgba(255, 255, 255, 0.5);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3), inset 0 0 20px rgba(0,0,0,0.1);
		overflow: hidden;
		pointer-events: none; /* 不阻挡鼠标事件 */
		background-color: var(--background); /* 防止透视背景 */
        will-change: transform, left, top;
	}

	.magnifier-content {
		position: absolute;
		top: 0;
		left: 0;
		/* width/height set by style to match vpSize */
		transform-origin: 0 0;
        will-change: transform;
	}
    
    /* 
    注意：FrameContent 内部是 flex center。
    在 Magnifier 中，我们需要 FrameContent 填满整个屏幕区域(100vw/100vh)，
    以便和主视图对齐。
    FrameContent 的 .scroll-frame-content 已经是 min-width: 100%; min-height: 100%;
    所以 magnifier-content 设置为 100vw/100vh 应能匹配。
    */
</style>
