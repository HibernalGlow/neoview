<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
  
  整合 StackViewer 优化：
  - 支持超分图无缝替换
  - GPU 加速
  - 支持单页/双页/全景布局
-->
<script lang="ts">
	import { LayerZIndex } from '../types/layer';
	import type { Frame } from '../types/frame';
	import { getImageTransform, getClipPath } from '../utils/transform';
	import FrameImage from '../components/FrameImage.svelte';
	import '../styles/frameLayer.css';

	let {
		frame,
		layout = 'single',
		direction = 'ltr',
		orientation = 'horizontal',
		scale = 1,
		rotation = 0,
		// 视口位置百分比（0-100）
		viewPositionX = 50,
		viewPositionY = 50,
		// 视口和图片尺寸（用于计算边界）
		viewportSize = { width: 0, height: 0 },
		imageSize = { width: 0, height: 0 },
		// 对齐模式：center（默认居中）、left（居左）、right（居右）
		alignMode = 'center',
		onImageLoad
	}: {
		frame: Frame;
		layout?: 'single' | 'double' | 'panorama';
		direction?: 'ltr' | 'rtl';
		orientation?: 'horizontal' | 'vertical';
		scale?: number;
		rotation?: number;
		viewPositionX?: number;
		viewPositionY?: number;
		viewportSize?: { width: number; height: number };
		imageSize?: { width: number; height: number };
		alignMode?: 'center' | 'left' | 'right';
		onImageLoad?: (e: Event, index: number) => void;
	} = $props();

	// 【性能优化】使用 CSS 变量传递位置，避免高频 DOM 属性更新
	// transform-origin 通过 CSS var() 在样式中引用

	// 计算 transform（只包含 scale 和 rotation）
	let transformStyle = $derived.by(() => {
		const parts: string[] = [];
		if (scale !== 1) parts.push(`scale(${scale})`);
		if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
		return parts.length > 0 ? parts.join(' ') : 'none';
	});

	let layoutClass = $derived.by(() => {
		const classes: string[] = [];

		if (layout === 'double') {
			// 双页模式：始终左右排列，不受 orientation 影响
			classes.push('frame-double');
			if (direction === 'rtl') {
				classes.push('frame-rtl');
			}
		} else if (layout === 'panorama') {
			// 全景模式：orientation 控制滚动方向
			classes.push('frame-panorama');
			if (orientation === 'vertical') {
				classes.push('frame-vertical');
			}
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

		return classes.join(' ');
	});
</script>

{#if frame.images.length > 0}
	<div
		class="frame-layer current-frame-layer {layoutClass}"
		data-layer="CurrentFrameLayer"
		data-layer-id="current"
		style:z-index={LayerZIndex.CURRENT_FRAME}
		style:transform={transformStyle}
		style:--view-x="{viewPositionX}%"
		style:--view-y="{viewPositionY}%"
	>
		{#each frame.images as img, i (i)}
			<FrameImage
				pageIndex={img.physicalIndex}
				url={img.url}
				alt="Current {i}"
				transform={getImageTransform(img)}
				clipPath={getClipPath(img.splitHalf)}
				onload={(e) => onImageLoad?.(e, i)}
			/>
		{/each}
	</div>
{:else}
	<div
		class="frame-layer current-frame-layer frame-empty"
		data-layer="CurrentFrameLayer"
		data-layer-id="current"
		style:z-index={LayerZIndex.CURRENT_FRAME}
	>
		<span class="text-muted-foreground">暂无图片</span>
	</div>
{/if}

<style>
	/* 当前帧层特有样式（基础样式来自 frameLayer.css） */
	.current-frame-layer {
		opacity: 1;
		transition: opacity 0.15s ease;
	}
</style>
