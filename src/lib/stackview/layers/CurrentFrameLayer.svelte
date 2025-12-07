<!--
  CurrentFrameLayer - 当前帧层
  z-index: 40
  
  【性能优化】原生滚动方案：
  - 使用浏览器原生滚动，硬件加速
  - HoverScrollLayer 直接操作 scrollLeft/scrollTop
  - 无需 transform-origin，性能最优
-->
<script lang="ts">
	import { LayerZIndex } from '../types/layer';
	import type { Frame } from '../types/frame';
	import { getImageTransform, getClipPath } from '../utils/transform';
	import FrameImage from '../components/FrameImage.svelte';
	import '../styles/frameLayer.css';

	import type { ZoomMode } from '$lib/settings/settingsManager';

	let {
		frame,
		layout = 'single',
		direction = 'ltr',
		orientation = 'horizontal',
		scale = 1,
		rotation = 0,
		// 视口和图片尺寸（用于计算边界）
		viewportSize = { width: 0, height: 0 },
		imageSize = { width: 0, height: 0 },
		// 对齐模式：center（默认居中）、left（居左）、right（居右）
		alignMode = 'center',
		// 缩放模式：用于决定图片如何填充视口
		zoomMode = 'fit' as ZoomMode,
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
		onImageLoad?: (e: Event, index: number) => void;
	} = $props();

	// 【性能优化】原生滚动方案：不再使用 transform-origin
	// HoverScrollLayer 直接操作容器的 scrollLeft/scrollTop

	// 本地存储图片实际尺寸（从 onload 事件获取）
	let loadedImageSize = $state<{ width: number; height: number }>({ width: 0, height: 0 });

	// 优先使用 loadedImageSize，其次使用 props 传入的 imageSize
	let effectiveImageSize = $derived({
		width: loadedImageSize.width || imageSize.width,
		height: loadedImageSize.height || imageSize.height
	});

	// 计算 transform（只包含 scale 和 rotation）
	let transformStyle = $derived.by(() => {
		const parts: string[] = [];
		if (scale !== 1) parts.push(`scale(${scale})`);
		if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
		return parts.length > 0 ? parts.join(' ') : 'none';
	});

	// 计算图片尺寸（用于滚动区域）
	// 原生滚动方案：根据 zoomMode 决定填充方式
	let imageDisplayStyle = $derived.by(() => {
		const size = effectiveImageSize;
		const vp = viewportSize;
		
		if (!size.width || !size.height || !vp.width || !vp.height) {
			// 没有尺寸信息时使用默认 contain 模式
			return 'max-width: 100%; max-height: 100%;';
		}
		
		const imgAspect = size.width / size.height;
		
		switch (zoomMode) {
			case 'fit':
			case 'fitLeftAlign':
			case 'fitRightAlign':
				// Fit: 图片完全适应视口，不滚动
				return 'max-width: 100%; max-height: 100%;';
			
			case 'fill': {
				// Fill: 图片填满视口（cover模式），可滚动查看溢出部分
				const vpAspect = vp.width / vp.height;
				if (imgAspect > vpAspect) {
					// 横向图片：高度填满，宽度溢出可滚动
					const width = vp.height * imgAspect;
					return `width: ${width}px; height: ${vp.height}px;`;
				} else {
					// 竖向图片：宽度填满，高度溢出可滚动
					const height = vp.width / imgAspect;
					return `width: ${vp.width}px; height: ${height}px;`;
				}
			}
			
			case 'fitWidth': {
				// FitWidth: 宽度填满，高度可滚动
				const height = vp.width / imgAspect;
				return `width: ${vp.width}px; height: ${height}px;`;
			}
			
			case 'fitHeight': {
				// FitHeight: 高度填满，宽度可滚动
				const width = vp.height * imgAspect;
				return `width: ${width}px; height: ${vp.height}px;`;
			}
			
			case 'original': {
				// Original: 原始尺寸，两个方向都可滚动
				return `width: ${size.width}px; height: ${size.height}px;`;
			}
			
			default:
				return 'max-width: 100%; max-height: 100%;';
		}
	});

	// 图片加载完成时更新本地尺寸
	function handleImageLoad(e: Event, index: number) {
		const img = e.target as HTMLImageElement;
		if (img && img.naturalWidth && img.naturalHeight) {
			loadedImageSize = { width: img.naturalWidth, height: img.naturalHeight };
		}
		onImageLoad?.(e, index);
	}

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
	<!-- 【性能优化】可滚动容器，用于原生滚动 -->
	<div
		class="scroll-frame-container {layoutClass}"
		data-layer="CurrentFrameLayer"
		data-layer-id="current"
		style:z-index={LayerZIndex.CURRENT_FRAME}
	>
		<div
			class="scroll-frame-content"
			style:transform={transformStyle}
		>
			{#each frame.images as img, i (i)}
				<FrameImage
					pageIndex={img.physicalIndex}
					url={img.url}
					alt="Current {i}"
					transform={getImageTransform(img)}
					clipPath={getClipPath(img.splitHalf)}
					style={imageDisplayStyle}
					onload={(e) => handleImageLoad(e, i)}
				/>
			{/each}
		</div>
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
		display: flex;
		align-items: center;
		justify-content: center;
		/* GPU 加速 */
		will-change: scroll-position;
		-webkit-overflow-scrolling: touch;
	}

	/* 隐藏 Webkit 滚动条 */
	.scroll-frame-container::-webkit-scrollbar {
		display: none;
	}

	.scroll-frame-content {
		display: flex;
		align-items: center;
		justify-content: center;
		/* 确保内容区域有足够的尺寸 */
		width: max-content;
		height: max-content;
		min-width: 100%;
		min-height: 100%;
		/* GPU 加速 */
		will-change: transform;
		transform: translateZ(0);
		backface-visibility: hidden;
	}

	.frame-empty {
		opacity: 1;
	}

	/* 双页模式 */
	.scroll-frame-container.frame-double .scroll-frame-content {
		flex-direction: row;
		gap: 4px;
	}

	.scroll-frame-container.frame-double.frame-rtl .scroll-frame-content {
		flex-direction: row-reverse;
	}

	/* 对齐模式 */
	.scroll-frame-container.frame-align-left {
		justify-content: flex-start;
	}

	.scroll-frame-container.frame-align-right {
		justify-content: flex-end;
	}
</style>
