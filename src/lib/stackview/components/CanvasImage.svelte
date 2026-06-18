<script lang="ts">
	import { onDestroy } from 'svelte';

	import { decodeImageInWorker } from '$lib/workers/imageDecoderManager';
	import { getBitmapCacheEntry, preloadBitmap } from '../utils/bitmapPreloader';

	interface Props {
		pageIndex: number;
		url: string;
		blob?: Blob;
		alt?: string;
		transform?: string;
		clipPath?: string;
		style?: string;
		class?: string;
		onload?: (e: Event) => void;
	}

	let {
		pageIndex,
		url,
		blob,
		alt = '',
		transform = '',
		clipPath = '',
		style = '',
		class: className = '',
		onload
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let hasError = $state(false);
	let renderedUrl = '';
	let pendingUrl = '';
	let settledTransform = $state('');
	let settledClipPath = $state('');
	let settledStyle = $state('');

	let displayUrl = $derived(url);

	$effect(() => {
		const currentUrl = displayUrl;
		const currentBlob = blob;
		const currentTransform = transform;
		const currentClipPath = clipPath;
		const currentStyle = style;

		if (currentUrl && currentUrl === renderedUrl) {
			pendingUrl = currentUrl;
			settledTransform = currentTransform;
			settledClipPath = currentClipPath;
			settledStyle = currentStyle;
			return;
		}

		if (currentUrl && currentUrl !== renderedUrl && currentUrl !== pendingUrl) {
			void loadAndRender(currentUrl, currentBlob);
		}
	});

	function commitRenderState(imageUrl: string): void {
		renderedUrl = imageUrl;
		settledTransform = transform;
		settledClipPath = clipPath;
		settledStyle = style;
	}

	function drawBitmap(bitmap: ImageBitmap, width: number, height: number): void {
		canvas.width = width;
		canvas.height = height;

		const ctx = canvas.getContext('2d', {
			alpha: false,
			desynchronized: true
		});

		if (!ctx) return;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, 0, 0);
	}

	function emitLoad(width: number, height: number): void {
		if (!onload) return;

		const fakeEvent = new Event('load');
		Object.defineProperty(fakeEvent, 'target', {
			value: {
				naturalWidth: width,
				naturalHeight: height,
				width,
				height
			},
			writable: false
		});
		onload(fakeEvent);
	}

	async function decodeFromBlob(
		imageBlob: Blob
	): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
		const result = await decodeImageInWorker(imageBlob);
		return {
			bitmap: result.bitmap,
			width: result.width,
			height: result.height
		};
	}

	async function loadAndRender(imageUrl: string, imageBlob?: Blob): Promise<void> {
		if (!canvas || !imageUrl) return;

		pendingUrl = imageUrl;
		hasError = false;

		try {
			const cached = getBitmapCacheEntry(imageUrl);
			if (cached?.bitmap) {
				drawBitmap(cached.bitmap, cached.width, cached.height);
				commitRenderState(imageUrl);
				emitLoad(cached.width, cached.height);
				return;
			}

			if (!imageBlob) {
				const entry = await preloadBitmap(imageUrl);
				if (pendingUrl !== imageUrl) return;
				if (entry.bitmap) {
					drawBitmap(entry.bitmap, entry.width, entry.height);
					commitRenderState(imageUrl);
					emitLoad(entry.width, entry.height);
					return;
				}
			}

			let blobToUse = imageBlob;
			if (!blobToUse) {
				const response = await fetch(imageUrl);
				if (!response.ok) {
					throw new Error(`Failed to fetch image: ${response.status}`);
				}
				blobToUse = await response.blob();
			}

			if (pendingUrl !== imageUrl) return;

			const result = await decodeFromBlob(blobToUse);
			if (pendingUrl !== imageUrl) {
				result.bitmap.close();
				return;
			}

			drawBitmap(result.bitmap, result.width, result.height);
			result.bitmap.close();
			commitRenderState(imageUrl);
			emitLoad(result.width, result.height);
		} catch (error) {
			if (pendingUrl === imageUrl) {
				console.error('CanvasImage load failed:', error);
				hasError = true;
			}
		}
	}

	onDestroy(() => {
		pendingUrl = '';
	});
</script>

<canvas
	bind:this={canvas}
	class="canvas-image {className}"
	class:error={hasError}
	style:transform={settledTransform || undefined}
	style:clip-path={settledClipPath || undefined}
	style={settledStyle || undefined}
	aria-label={alt}
	data-page-index={pageIndex}
	draggable="false"
></canvas>

<style>
	.canvas-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
		transform: translateZ(0);
		backface-visibility: hidden;
		image-rendering: auto;
		content-visibility: visible;
	}

	.canvas-image.error {
		opacity: 0.3;
	}
</style>
