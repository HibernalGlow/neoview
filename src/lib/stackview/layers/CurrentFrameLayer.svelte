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

	// 计算单张图片的显示样式
	// 双页模式下，每张图片有独立的 scale（用于高度对齐）
	function getImageDisplayStyle(img: typeof frame.images[0], _index: number): string {
		// 使用图片自带的尺寸和 scale
		const imgWidth = img.width ?? 0;
		const imgHeight = img.height ?? 0;
		const imgScale = img.scale ?? 1.0;
		
		// 应用 scale 后的显示尺寸
		const displayWidth = imgWidth * imgScale;
		const displayHeight = imgHeight * imgScale;
		
		let vp = viewportSize;
		
		if (!displayWidth || !displayHeight || !vp.width || !vp.height) {
			// 没有尺寸信息时使用默认 contain 模式
			return 'max-width: 100%; max-height: 100%;';
		}
		
		// 双页模式：计算组合后的总尺寸，然后整体适应视口
		if (layout === 'double' && frame.images.length === 2) {
			// 计算两张图片的总宽度和最大高度
			const img1 = frame.images[0];
			const img2 = frame.images[1];
			const w1 = (img1.width ?? 0) * (img1.scale ?? 1);
			const h1 = (img1.height ?? 0) * (img1.scale ?? 1);
			const w2 = (img2.width ?? 0) * (img2.scale ?? 1);
			const h2 = (img2.height ?? 0) * (img2.scale ?? 1);
			
			const totalWidth = w1 + w2;
			const maxHeight = Math.max(h1, h2);
			
			if (totalWidth > 0 && maxHeight > 0) {
				// 计算整体缩放比例以适应视口
				const scaleX = vp.width / totalWidth;
				const scaleY = vp.height / maxHeight;
				const frameScale = Math.min(scaleX, scaleY);
				
				// 应用帧缩放到当前图片
				const finalWidth = displayWidth * frameScale;
				const finalHeight = displayHeight * frameScale;
				
				return `width: ${finalWidth}px; height: ${finalHeight}px;`;
			}
		}
		
		// 单页模式：使用原有逻辑
		const imgAspect = displayWidth / displayHeight;
		
		switch (zoomMode) {
			case 'fit':
			case 'fitLeftAlign':
			case 'fitRightAlign': {
				const vpAspect = vp.width / vp.height;
				if (imgAspect > vpAspect) {
					const height = vp.width / imgAspect;
					return `width: ${vp.width}px; height: ${height}px;`;
				} else {
					const width = vp.height * imgAspect;
					return `width: ${width}px; height: ${vp.height}px;`;
				}
			}
			
			case 'fill': {
				const vpAspect = vp.width / vp.height;
				if (imgAspect > vpAspect) {
					const width = vp.height * imgAspect;
					return `width: ${width}px; height: ${vp.height}px; max-width: none; max-height: none;`;
				} else {
					const height = vp.width / imgAspect;
					return `width: ${vp.width}px; height: ${height}px; max-width: none; max-height: none;`;
				}
			}
			
			case 'fitWidth': {
				const height = vp.width / imgAspect;
				return `width: ${vp.width}px; height: ${height}px; max-width: none; max-height: none;`;
			}
			
			case 'fitHeight': {
				const width = vp.height * imgAspect;
				return `width: ${width}px; height: ${vp.height}px; max-width: none; max-height: none;`;
			}
			
			case 'original': {
				return `width: ${displayWidth}px; height: ${displayHeight}px; max-width: none; max-height: none;`;
			}
			
			default:
				return 'max-width: 100%; max-height: 100%;';
		}
	}

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
					style={getImageDisplayStyle(img, i)}
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
		/* GPU 加速 */
		will-change: scroll-position;
		-webkit-overflow-scrolling: touch;
	}

	/* 隐藏 Webkit 滚动条 */
	.scroll-frame-container::-webkit-scrollbar {
		display: none;
	}

	.scroll-frame-content {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* 居中：当内容小于容器时居中，大于容器时可滚动到边缘 */
		min-width: 100%;
		min-height: 100%;
		/* GPU 加速 */
		will-change: transform;
		transform: translateZ(0);
	}

	.frame-empty {
		opacity: 1;
	}

	/* 双页模式（始终左右排列） */
	.scroll-frame-container.frame-double .scroll-frame-content {
		flex-direction: row;
		gap: 0;
	}

	.scroll-frame-container.frame-double.frame-rtl .scroll-frame-content {
		flex-direction: row-reverse;
	}

	/* 对齐模式 - 应用到 flex 容器 .scroll-frame-content 上 */
	.scroll-frame-container.frame-align-left .scroll-frame-content {
		justify-content: flex-start;
	}

	.scroll-frame-container.frame-align-right .scroll-frame-content {
		justify-content: flex-end;
	}
</style>
