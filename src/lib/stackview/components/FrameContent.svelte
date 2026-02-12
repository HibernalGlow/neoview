<script lang="ts">
	import type { Frame } from '../types/frame';
	import { getImageTransform, getClipPath } from '../utils/transform';
	import FrameImageWithOverlay from './FrameImageWithOverlay.svelte';
	import type { ZoomMode } from '$lib/settings/settingsManager';

	let {
		frame,
		layout = 'single',
		vpSize, // viewportSize renamed for brevity
		scale = 1,
		rotation = 0,
		imageSize = { width: 0, height: 0 },
		zoomMode = 'fit',
		alignMode = 'center',
		onImageLoad
	}: {
		frame: Frame;
		layout?: 'single' | 'double' | 'panorama';
		vpSize?: { width: number; height: number };
		scale?: number;
		rotation?: number;
		imageSize?: { width: number; height: number };
		zoomMode?: ZoomMode;
		alignMode?: 'center' | 'left' | 'right';
		onImageLoad?: (e: Event, index: number) => void;
	} = $props();

	// 本地存储图片实际尺寸（从 onload 事件获取）
	let loadedImageSize = $state<{ width: number; height: number }>({ width: 0, height: 0 });

	// 计算 transform（只包含 scale 和 rotation）
	let transformStyle = $derived.by(() => {
		const parts: string[] = [];
		if (scale !== 1) parts.push(`scale(${scale})`);
		if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);
		return parts.length > 0 ? parts.join(' ') : 'none';
	});

	// 计算单张图片的显示样式
	function getImageDisplayStyle(img: typeof frame.images[0], _index: number): string {
		const imgWidth = img.width ?? 0;
		const imgHeight = img.height ?? 0;
		const imgScale = img.scale ?? 1.0;
		
		const displayWidth = imgWidth * imgScale;
		const displayHeight = imgHeight * imgScale;
		
		let vp = vpSize || { width: 0, height: 0 };
		
		if (!displayWidth || !displayHeight || !vp.width || !vp.height) {
			return 'max-width: 100%; max-height: 100%;';
		}
		
		// 双页模式
		if (layout === 'double' && frame.images.length === 2) {
			const img1 = frame.images[0];
			const img2 = frame.images[1];
			const w1 = (img1.width ?? 0) * (img1.scale ?? 1);
			const h1 = (img1.height ?? 0) * (img1.scale ?? 1);
			const w2 = (img2.width ?? 0) * (img2.scale ?? 1);
			const h2 = (img2.height ?? 0) * (img2.scale ?? 1);
			
			const totalWidth = w1 + w2;
			const maxHeight = Math.max(h1, h2);
			
			if (totalWidth > 0 && maxHeight > 0) {
				const scaleX = vp.width / totalWidth;
				const scaleY = vp.height / maxHeight;
				const frameScale = Math.min(scaleX, scaleY);
				
				const finalWidth = displayWidth * frameScale;
				const finalHeight = displayHeight * frameScale;
				
				return `width: ${finalWidth}px; height: ${finalHeight}px; max-width: none; max-height: none; object-fit: fill;`;
			}
		}
		
		// 单页模式
		const imgAspect = displayWidth / displayHeight;
		const splitFactor = img.splitHalf ? 2 : 1;

		switch (zoomMode) {
			case 'fit':
			case 'fitLeftAlign':
			case 'fitRightAlign': {
				const vpAspect = vp.width / vp.height;
				if (imgAspect > vpAspect) {
					const height = vp.width / imgAspect;
					return `width: ${vp.width * splitFactor}px; height: ${height}px; max-width: none; max-height: none;`;
				} else {
					const width = vp.height * imgAspect;
					return `width: ${width * splitFactor}px; height: ${vp.height}px; max-width: none; max-height: none;`;
				}
			}
			case 'fill': {
				const vpAspect = vp.width / vp.height;
				if (imgAspect > vpAspect) {
					const width = vp.height * imgAspect;
					return `width: ${width * splitFactor}px; height: ${vp.height}px; max-width: none; max-height: none;`;
				} else {
					const height = vp.width / imgAspect;
					return `width: ${vp.width * splitFactor}px; height: ${height}px; max-width: none; max-height: none;`;
				}
			}
			case 'fitWidth': {
				const height = vp.width / imgAspect;
				return `width: ${vp.width * splitFactor}px; height: ${height}px; max-width: none; max-height: none;`;
			}
			case 'fitHeight': {
				const width = vp.height * imgAspect;
				return `width: ${width * splitFactor}px; height: ${vp.height}px; max-width: none; max-height: none;`;
			}
			case 'original': {
				return `width: ${displayWidth * splitFactor}px; height: ${displayHeight}px; max-width: none; max-height: none;`;
			}
			default:
				return 'max-width: 100%; max-height: 100%;';
		}
	}

	function handleImageLoad(e: Event, index: number) {
		const img = e.target as HTMLImageElement;
		if (img && img.naturalWidth && img.naturalHeight) {
			loadedImageSize = { width: img.naturalWidth, height: img.naturalHeight };
		}
		onImageLoad?.(e, index);
	}
</script>

<div
	class="scroll-frame-content"
	style:transform={transformStyle}
>
	{#each frame.images as img, i (img.physicalIndex)}
		<FrameImageWithOverlay
			pageIndex={img.physicalIndex}
			url={img.url}
			alt="Frame Content {i}"
			transform={getImageTransform(img)}
			clipPath={getClipPath(img.splitHalf)}
			style={getImageDisplayStyle(img, i)}
			imageWidth={img.width ?? 0}
			imageHeight={img.height ?? 0}
			onload={(e) => handleImageLoad(e, i)}
		/>
	{/each}
</div>

<style>
	.scroll-frame-content {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 100%;
		min-height: 100%;
		transform: translateZ(0);
	}
</style>
