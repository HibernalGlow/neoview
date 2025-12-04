<script lang="ts">
/**
 * ImageRenderer - 支持 img/canvas 两种渲染模式
 */
import { onMount, onDestroy } from 'svelte';
import { loadModeStore } from '$lib/stores/loadModeStore.svelte';

export let src: string | null = null;
export let alt: string = '';
export let className: string = '';
export let onLoad: ((width: number, height: number) => void) | null = null;

let imgElement: HTMLImageElement;
let canvasElement: HTMLCanvasElement;
let imageWidth = 0;
let imageHeight = 0;

// 响应式获取渲染模式
let isCanvasMode = $derived(loadModeStore.isCanvasMode);

// 当 src 或渲染模式变化时重新渲染
$effect(() => {
	if (src) {
		loadImage(src);
	}
});

function loadImage(url: string) {
	const img = new Image();
	img.onload = () => {
		imageWidth = img.naturalWidth;
		imageHeight = img.naturalHeight;
		
		if (isCanvasMode && canvasElement) {
			renderToCanvas(img);
		}
		
		onLoad?.(imageWidth, imageHeight);
	};
	img.onerror = () => {
		console.error('Failed to load image:', url);
	};
	img.src = url;
}

function renderToCanvas(img: HTMLImageElement) {
	if (!canvasElement) return;
	
	canvasElement.width = img.naturalWidth;
	canvasElement.height = img.naturalHeight;
	
	const ctx = canvasElement.getContext('2d');
	if (ctx) {
		ctx.drawImage(img, 0, 0);
	}
}

// 当切换到 canvas 模式时，如果已有图片，重新渲染
$effect(() => {
	if (isCanvasMode && src && canvasElement && imageWidth > 0) {
		const img = new Image();
		img.onload = () => renderToCanvas(img);
		img.src = src;
	}
});
</script>

{#if isCanvasMode}
	<canvas
		bind:this={canvasElement}
		class={className}
		width={imageWidth}
		height={imageHeight}
		role="img"
		aria-label={alt}
	></canvas>
{:else}
	<img
		bind:this={imgElement}
		src={src ?? ''}
		{alt}
		class={className}
		draggable="false"
	/>
{/if}
