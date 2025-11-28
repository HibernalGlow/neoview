<!--
  ImageViewerDisplay2 - 新版图片显示组件
  
  忒休斯之船重构：保持与 ImageViewerDisplay 相同的接口，
  但内部使用新的 ImageRenderer 组件
  
  接口兼容：
  - imageData, imageData2, upscaledImageData
  - viewMode, zoomLevel, rotationAngle
  - orientation, panX, panY
  - horizontalSplitHalf, treatHorizontalAsDoublePage
  - panoramaPages (bindable)
-->
<script lang="ts">
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ReadingDirection } from '$lib/settings/settingsManager';
	import { hoverScroll } from '$lib/utils/scroll/hoverScroll';
	import { mapLogicalHalfToPhysical } from '$lib/utils/viewer/horizontalPageLayout';
	import type { HorizontalSplitHalf } from '$lib/utils/viewer/horizontalPageLayout';
	
	// 导入新的 ImageRenderer
	import ImageRenderer from '$lib/viewer/ImageRenderer.svelte';

	type ViewMode = 'single' | 'double' | 'panorama';

	let {
		imageData = null,
		imageData2 = null,
		upscaledImageData = null,
		viewMode = 'single',
		zoomLevel = 1,
		rotationAngle = 0,
		orientation = 'horizontal',
		panoramaPages = $bindable(
			[] as Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>
		),
		panX = 0,
		panY = 0,
		horizontalSplitHalf = null,
		treatHorizontalAsDoublePage = false
	}: {
		imageData?: string | null;
		imageData2?: string | null;
		upscaledImageData?: string | null;
		viewMode?: ViewMode;
		zoomLevel?: number;
		rotationAngle?: number;
		orientation?: 'horizontal' | 'vertical';
		panoramaPages?: Array<{
			index: number;
			data: string | null;
			position: 'left' | 'center' | 'right';
		}>;
		panX?: number;
		panY?: number;
		horizontalSplitHalf?: HorizontalSplitHalf | null;
		treatHorizontalAsDoublePage?: boolean;
	} = $props();

	let settings = $state(settingsManager.getSettings());
	let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);
	let physicalSplitHalf = $derived<ReturnType<typeof mapLogicalHalfToPhysical> | null>(
		horizontalSplitHalf ? mapLogicalHalfToPhysical(horizontalSplitHalf, readingDirection) : null
	);
	let hoverScrollEnabled = $derived(settings.image.hoverScrollEnabled ?? true);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 计算当前显示的图片 URL
	let currentSrc = $derived(upscaledImageData || imageData);
	
	// 计算旋转角度（转换为 ImageRenderer 支持的类型）
	let normalizedRotation = $derived.by(() => {
		const r = rotationAngle % 360;
		if (r === 0 || r === 90 || r === 180 || r === 270) {
			return r as 0 | 90 | 180 | 270;
		}
		return 0 as const;
	});
	
	// 计算分割半边
	let splitHalf = $derived.by(() => {
		if (!horizontalSplitHalf) return null;
		return physicalSplitHalf as 'left' | 'right' | null;
	});

	// 全景模式相关
	let hasPanoramaImages = $state(false);
	let scrollContainer = $state<HTMLElement | null>(null);

	$effect(() => {
		if (viewMode === 'panorama') {
			hasPanoramaImages = panoramaPages.some((p) => !!p.data);
		} else {
			hasPanoramaImages = false;
		}
	});

	function scrollToCenter(
		node: HTMLElement,
		params: { isCenter: boolean; orientation: 'horizontal' | 'vertical' }
	) {
		let { isCenter, orientation: orient } = params;

		const scrollToNodeCenter = () => {
			if (!isCenter) return;
			const container = node.parentElement as HTMLElement | null;
			if (!container) return;

			const containerRect = container.getBoundingClientRect();
			const nodeRect = node.getBoundingClientRect();

			if (orient === 'horizontal') {
				const containerCenter = containerRect.left + containerRect.width / 2;
				const nodeCenter = nodeRect.left + nodeRect.width / 2;
				const delta = nodeCenter - containerCenter;
				container.scrollLeft = container.scrollLeft + delta;
			} else {
				const containerCenter = containerRect.top + containerRect.height / 2;
				const nodeCenter = nodeRect.top + nodeRect.height / 2;
				const delta = nodeCenter - containerCenter;
				container.scrollTop = container.scrollTop + delta;
			}
		};

		if (isCenter) {
			requestAnimationFrame(() => {
				scrollToNodeCenter();
			});
		}

		return {
			update(newParams: { isCenter: boolean; orientation: 'horizontal' | 'vertical' }) {
				isCenter = newParams.isCenter;
				orient = newParams.orientation;
				if (isCenter) {
					scrollToNodeCenter();
				}
			}
		};
	}
</script>

{#if viewMode === 'panorama'}
	<!-- 全景模式：保持原有实现 -->
	<div
		class={`relative flex h-full w-full ${
			orientation === 'horizontal' ? 'items-center overflow-x-auto' : 'items-start overflow-y-auto'
		}`}
		style={`transform: scale(${zoomLevel});`}
	>
		{#if hasPanoramaImages}
			<div
				class={orientation === 'horizontal'
					? `flex h-full min-w-full items-center justify-start overflow-x-auto py-0 ${
							readingDirection === 'right-to-left' ? 'flex-row-reverse' : ''
						}`
					: 'flex min-h-full w-full flex-col items-center justify-start overflow-y-auto py-0'}
				bind:this={scrollContainer}
				use:hoverScroll={{
					enabled: hoverScrollEnabled,
					axis: 'both'
				}}
			>
				{#each panoramaPages as page (page.index)}
					{#if page.data}
						<img
							src={page.data}
							alt={`Page ${page.index + 1}`}
							class={orientation === 'horizontal'
								? 'h-full w-auto shrink-0 object-cover'
								: 'h-auto w-full object-cover'}
							style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s; ${
								orientation === 'horizontal' ? 'margin: 0 -1px;' : 'margin: -1px 0;'
							}`}
							use:scrollToCenter={{ isCenter: page.position === 'center', orientation }}
						/>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="flex h-full min-w-full items-center justify-center">
				{#if currentSrc}
					<ImageRenderer
						src={currentSrc}
						rotation={normalizedRotation}
						scale={1}
						offset={{ x: 0, y: 0 }}
						fitMode="contain"
					/>
				{/if}
			</div>
		{/if}
	</div>
{:else if currentSrc}
	{#if viewMode === 'single'}
		<!-- 单页模式：使用新的 ImageRenderer -->
		<div class="flex h-full w-full items-center justify-center">
			<ImageRenderer
				src={currentSrc}
				rotation={normalizedRotation}
				scale={zoomLevel}
				offset={{ x: panX, y: panY }}
				fitMode="contain"
				splitHalf={splitHalf}
			/>
		</div>
	{:else if viewMode === 'double'}
		{#if treatHorizontalAsDoublePage}
			<!-- 横向页面视为双页 -->
			<div class="flex h-full w-full items-center justify-center">
				<ImageRenderer
					src={currentSrc}
					rotation={normalizedRotation}
					scale={zoomLevel}
					offset={{ x: panX, y: panY }}
					fitMode="contain"
				/>
			</div>
		{:else}
			<!-- 双页模式 -->
			<div class="flex items-center justify-center gap-0">
				{#if readingDirection === 'right-to-left'}
					{#if imageData2}
						<ImageRenderer
							src={imageData2}
							rotation={normalizedRotation}
							scale={zoomLevel}
							offset={{ x: panX, y: panY }}
							fitMode="contain"
						/>
					{/if}
					<ImageRenderer
						src={currentSrc}
						rotation={normalizedRotation}
						scale={zoomLevel}
						offset={{ x: panX, y: panY }}
						fitMode="contain"
					/>
				{:else}
					<ImageRenderer
						src={currentSrc}
						rotation={normalizedRotation}
						scale={zoomLevel}
						offset={{ x: panX, y: panY }}
						fitMode="contain"
					/>
					{#if imageData2}
						<ImageRenderer
							src={imageData2}
							rotation={normalizedRotation}
							scale={zoomLevel}
							offset={{ x: panX, y: panY }}
							fitMode="contain"
						/>
					{/if}
				{/if}
			</div>
		{/if}
	{:else}
		<!-- 默认单页模式 -->
		<div class="flex h-full w-full items-center justify-center">
			<ImageRenderer
				src={currentSrc}
				rotation={normalizedRotation}
				scale={zoomLevel}
				offset={{ x: panX, y: panY }}
				fitMode="contain"
			/>
		</div>
	{/if}
{/if}
