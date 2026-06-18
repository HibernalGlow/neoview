<script lang="ts">
	import { onDestroy } from 'svelte';
	import { LayerZIndex } from '../types/layer';
	import type { PanoramaImage, PanoramaUnit } from '../stores/panoramaStore.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import FrameImage from '../components/FrameImage.svelte';
	import { getClipPathFromCropRect } from '../utils/transform';
	import '../styles/frameLayer.css';
	import type { WidePageStretch } from '$lib/settings/settingsManager';

	export interface PanoramaScrollDetail {
		visiblePageIndex: number;
		visiblePart?: number;
		preloadPageIndex?: number;
		nearStart?: boolean;
		nearEnd?: boolean;
	}

	let {
		units = [],
		pageMode = 'single',
		orientation = 'horizontal',
		direction = 'ltr',
		currentPageIndex = 0,
		currentPart = 0,
		viewportSize = { width: 0, height: 0 },
		widePageStretch = 'uniformHeight',
		onScroll
	}: {
		units: PanoramaUnit[];
		pageMode?: 'single' | 'double';
		orientation?: 'horizontal' | 'vertical';
		direction?: 'ltr' | 'rtl';
		currentPageIndex?: number;
		currentPart?: number;
		viewportSize?: { width: number; height: number };
		widePageStretch?: WidePageStretch;
		onScroll?: (e: CustomEvent<PanoramaScrollDetail>) => void;
	} = $props();

	let containerRef: HTMLDivElement | null = $state(null);
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
	let preloadTimeout: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (scrollTimeout) clearTimeout(scrollTimeout);
		if (preloadTimeout) clearTimeout(preloadTimeout);
	});

	function handleScroll() {
		if (preloadTimeout) {
			clearTimeout(preloadTimeout);
		}

		preloadTimeout = setTimeout(() => {
			if (!containerRef || units.length === 0) return;

			const visibleUnitIndex = calculateVisibleUnitIndex();
			const visibleUnit = units[visibleUnitIndex];
			if (!visibleUnit) return;

			const visiblePageIndex = visibleUnit.startIndex;
			if (visiblePageIndex !== bookStore.currentPageIndex) {
				bookStore.setCurrentPageIndexLocal(visiblePageIndex);
			}

			const edgeInfo = checkNearEdge(visibleUnitIndex);
			emitScroll({
				visiblePageIndex,
				visiblePart: visibleUnit.position.part,
				preloadPageIndex: edgeInfo.needsPreload ? edgeInfo.targetPageIndex : undefined,
				nearStart: edgeInfo.nearStart,
				nearEnd: edgeInfo.nearEnd
			});
		}, 80);
	}

	function emitScroll(detail: PanoramaScrollDetail) {
		onScroll?.(new CustomEvent<PanoramaScrollDetail>('panorama-scroll', { detail }));
	}

	function calculateVisibleUnitIndex(): number {
		if (!containerRef || units.length === 0) return 0;

		const unitElements = containerRef.querySelectorAll('.panorama-unit');
		if (unitElements.length === 0) return 0;

		const containerRect = containerRef.getBoundingClientRect();
		const containerCenter =
			orientation === 'vertical'
				? containerRect.top + containerRect.height / 2
				: containerRect.left + containerRect.width / 2;

		let closestIndex = 0;
		let closestDistance = Infinity;

		unitElements.forEach((el, index) => {
			const rect = el.getBoundingClientRect();
			const unitCenter =
				orientation === 'vertical' ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
			const distance = Math.abs(unitCenter - containerCenter);

			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = index;
			}
		});

		return closestIndex;
	}

	function checkNearEdge(visibleUnitIndex: number): {
		needsPreload: boolean;
		targetPageIndex: number;
		nearEnd: boolean;
		nearStart: boolean;
	} {
		if (units.length === 0) {
			return { needsPreload: false, targetPageIndex: 0, nearEnd: false, nearStart: false };
		}

		const preloadThreshold = Math.min(3, Math.max(1, Math.floor(units.length / 3)));
		const nearArrayEnd = visibleUnitIndex >= units.length - preloadThreshold;
		const nearArrayStart = visibleUnitIndex < preloadThreshold;
		const totalPages = bookStore.totalPages;
		const firstUnit = units[0];
		const lastUnit = units[units.length - 1];

		if (nearArrayEnd && getLastPageIndex(lastUnit) < totalPages - 1) {
			return {
				needsPreload: true,
				targetPageIndex: getLastPageIndex(lastUnit),
				nearEnd: true,
				nearStart: false
			};
		}

		if (nearArrayStart && firstUnit.startIndex > 0) {
			return {
				needsPreload: true,
				targetPageIndex: firstUnit.startIndex,
				nearEnd: false,
				nearStart: true
			};
		}

		return { needsPreload: false, targetPageIndex: 0, nearEnd: false, nearStart: false };
	}

	function getLastPageIndex(unit: PanoramaUnit): number {
		return unit.images.reduce((max, image) => Math.max(max, image.pageIndex), unit.startIndex);
	}

	$effect(() => {
		const idx = currentPageIndex;

		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
		}

		scrollTimeout = setTimeout(() => {
			if (!containerRef || units.length === 0) return;

			const unitElements = containerRef.querySelectorAll('.panorama-unit');
			const targetUnit = findUnitIndexForPage(idx, currentPart);

			if (targetUnit >= 0 && targetUnit < unitElements.length) {
				unitElements[targetUnit].scrollIntoView({
					behavior: 'instant',
					block: orientation === 'vertical' ? 'center' : 'nearest',
					inline: orientation === 'horizontal' ? 'center' : 'nearest'
				});
			}
		}, 60);
	});

	function findUnitIndexForPage(pageIndex: number, part = 0): number {
		const positionExact = units.findIndex(
			(unit) => unit.position.index === pageIndex && unit.position.part === part
		);
		if (positionExact >= 0) return positionExact;

		const exact = units.findIndex(
			(unit) =>
				unit.startIndex === pageIndex || unit.images.some((image) => image.pageIndex === pageIndex)
		);
		if (exact >= 0) return exact;

		let closestIndex = 0;
		let closestDistance = Infinity;
		units.forEach((unit, index) => {
			const distance = Math.abs(unit.startIndex - pageIndex);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = index;
			}
		});
		return closestIndex;
	}

	function getUnitFitScale(unit: PanoramaUnit): number {
		const vp = viewportSize;
		if (!vp.width || !vp.height || unit.images.length === 0) return 1;

		let totalWidth = 0;
		let maxHeight = 0;

		unit.images.forEach((image) => {
			const size = getVisibleImageSize(image);
			totalWidth += size.width;
			maxHeight = Math.max(maxHeight, size.height);
		});

		if (totalWidth <= 0 || maxHeight <= 0) return 1;
		return Math.min(vp.width / totalWidth, vp.height / maxHeight, 1);
	}

	function getVisibleImageSize(img: PanoramaImage): { width: number; height: number } {
		const width = img.width ?? 0;
		const height = img.height ?? 0;
		const cropWidth = img.cropRect?.width ?? 1;
		const cropHeight = img.cropRect?.height ?? 1;
		const scale = img.scale ?? 1;

		return {
			width: width * cropWidth * scale,
			height: height * cropHeight * scale
		};
	}

	function getImageStyle(img: PanoramaImage, unit: PanoramaUnit): string {
		const vp = viewportSize;
		const width = img.width ?? 0;
		const height = img.height ?? 0;

		if (!vp.width || !vp.height || !width || !height) {
			const maxWidth = Math.max(1, Math.round(vp.width || 0));
			const maxHeight = Math.max(1, Math.round(vp.height || 0));
			return `max-width: ${maxWidth}px; max-height: ${maxHeight}px; width: auto; height: auto; object-fit: contain;`;
		}

		const fitScale = getUnitFitScale(unit);
		const contentScale = img.scale ?? 1;
		const splitFactor =
			img.cropRect && img.cropRect.width > 0 && img.cropRect.width < 1 ? 1 / img.cropRect.width : 1;

		const displayWidth = width * contentScale * fitScale * splitFactor;
		const displayHeight = height * contentScale * fitScale;

		return `width: ${displayWidth}px; height: ${displayHeight}px; max-width: none; max-height: none; object-fit: contain;`;
	}

	function getImageTransform(img: PanoramaImage): string {
		const crop = img.cropRect;
		if (!crop || crop.width >= 0.999) return 'none';
		return crop.x > 0 ? 'translateX(-25%)' : 'translateX(25%)';
	}

	let containerClass = $derived.by(() => {
		const classes = ['panorama-frame-layer'];

		if (orientation === 'vertical') classes.push('vertical');
		if (direction === 'rtl') classes.push('rtl');
		if (pageMode === 'double') classes.push('double-mode');
		if (widePageStretch !== 'none') classes.push(`wide-stretch-${widePageStretch}`);

		return classes.join(' ');
	});
</script>

{#if units.length > 0}
	<div
		bind:this={containerRef}
		class="scroll-frame-container {containerClass}"
		data-layer="PanoramaFrameLayer"
		style:z-index={LayerZIndex.CURRENT_FRAME}
		onscroll={handleScroll}
	>
		<div class="scroll-frame-content">
			{#each units as unit (unit.id)}
				<div class="panorama-unit" data-unit-id={unit.id}>
					{#each unit.images as img, i (`${unit.id}-${img.pageIndex}-${i}`)}
						<FrameImage
							pageIndex={img.pageIndex}
							url={img.url}
							alt="Page {img.pageIndex + 1}"
							class="panorama-image"
							transform={getImageTransform(img)}
							clipPath={getClipPathFromCropRect(img.cropRect)}
							style={getImageStyle(img, unit)}
						/>
					{/each}
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div
		class="scroll-frame-container panorama-frame-layer empty"
		data-layer="PanoramaFrameLayer"
		style:z-index={LayerZIndex.CURRENT_FRAME}
	>
		<span class="text-muted-foreground">Loading...</span>
	</div>
{/if}

<style>
	.scroll-frame-container {
		position: absolute;
		inset: 0;
		overflow: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}

	.scroll-frame-container::-webkit-scrollbar {
		display: none;
	}

	.scroll-frame-content {
		display: inline-flex;
		flex-direction: row;
		gap: 0;
		min-width: 100%;
		min-height: 100%;
		align-items: center;
		justify-content: flex-start;
		transform: translateZ(0);
		backface-visibility: hidden;
	}

	.scroll-frame-content::before,
	.scroll-frame-content::after {
		content: '';
		flex: 0 0 50vw;
	}

	.panorama-frame-layer.vertical .scroll-frame-content {
		flex-direction: column;
		width: 100%;
		min-height: max-content;
	}

	.panorama-frame-layer.vertical .scroll-frame-content::before,
	.panorama-frame-layer.vertical .scroll-frame-content::after {
		flex-basis: 50vh;
	}

	.panorama-frame-layer.rtl .scroll-frame-content {
		flex-direction: row-reverse;
	}

	.panorama-frame-layer.vertical.rtl .scroll-frame-content {
		flex-direction: column-reverse;
	}

	.panorama-unit {
		flex: 0 0 auto;
		display: flex;
		flex-direction: row;
		gap: 0;
		align-items: center;
		justify-content: center;
		scroll-snap-align: center;
	}

	.panorama-frame-layer:not(.vertical) .panorama-unit {
		min-height: 100%;
	}

	.panorama-frame-layer.vertical .panorama-unit {
		min-width: 100%;
	}

	.panorama-frame-layer.double-mode .panorama-unit,
	.panorama-frame-layer.double-mode.vertical .panorama-unit {
		flex-direction: row;
	}

	.panorama-frame-layer.double-mode.rtl .panorama-unit {
		flex-direction: row-reverse;
	}

	.panorama-image {
		flex: 0 0 auto;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
	}

	.panorama-frame-layer.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted-foreground);
	}
</style>
