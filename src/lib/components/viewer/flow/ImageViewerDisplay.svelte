<script lang="ts">
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ReadingDirection } from '$lib/settings/settingsManager';
	import { hoverScroll } from '$lib/utils/scroll/hoverScroll';
	import { mapLogicalHalfToPhysical } from '$lib/utils/viewer/horizontalPageLayout';
	import type { HorizontalSplitHalf } from '$lib/utils/viewer/horizontalPageLayout';

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

	let hasPanoramaImages = $state(false);
	let scrollContainer = $state<HTMLElement | null>(null);
	let scrollWidth = $state(0);
	let scrollHeight = $state(0);
	let clientWidth = $state(0);
	let clientHeight = $state(0);
	let scrollLeft = $state(0);
	let scrollTop = $state(0);

	function updateScrollMetrics(node: HTMLElement) {
		scrollWidth = node.scrollWidth;
		scrollHeight = node.scrollHeight;
		clientWidth = node.clientWidth;
		clientHeight = node.clientHeight;
		scrollLeft = node.scrollLeft;
		scrollTop = node.scrollTop;
	}

	function handleScroll(event: Event) {
		const target = event.currentTarget as HTMLElement;
		updateScrollMetrics(target);
	}

	const horizontalViewportWidthPercent = $derived(() => {
		if (!scrollWidth || !clientWidth) return 100;
		return Math.min(100, (clientWidth / scrollWidth) * 100);
	});

	const horizontalViewportLeftPercent = $derived(() => {
		if (!scrollWidth || !clientWidth) return 0;
		const maxScroll = scrollWidth - clientWidth;
		if (maxScroll <= 0) return 0;
		return Math.max(
			0,
			Math.min(
				100 - horizontalViewportWidthPercent,
				(scrollLeft / maxScroll) * (100 - horizontalViewportWidthPercent)
			)
		);
	});

	const verticalViewportHeightPercent = $derived(() => {
		if (!scrollHeight || !clientHeight) return 100;
		return Math.min(100, (clientHeight / scrollHeight) * 100);
	});

	const verticalViewportTopPercent = $derived(() => {
		if (!scrollHeight || !clientHeight) return 0;
		const maxScroll = scrollHeight - clientHeight;
		if (maxScroll <= 0) return 0;
		return Math.max(
			0,
			Math.min(
				100 - verticalViewportHeightPercent,
				(scrollTop / maxScroll) * (100 - verticalViewportHeightPercent)
			)
		);
	});

	$effect(() => {
		if (viewMode === 'panorama' && scrollContainer) {
			updateScrollMetrics(scrollContainer);
		}
	});

	function currentSrc(source: string | null, fallback: string | null) {
		return source || fallback;
	}

	function scrollToCenter(
		node: HTMLElement,
		params: { isCenter: boolean; orientation: 'horizontal' | 'vertical' }
	) {
		let { isCenter, orientation } = params;

		// 将目标图片的中心对齐到滚动容器的中心（无任何平滑动画）
		const scrollToNodeCenter = () => {
			if (!isCenter) return;
			const container = node.parentElement as HTMLElement | null;
			if (!container) return;

			const containerRect = container.getBoundingClientRect();
			const nodeRect = node.getBoundingClientRect();

			if (orientation === 'horizontal') {
				const containerCenter = containerRect.left + containerRect.width / 2;
				const nodeCenter = nodeRect.left + nodeRect.width / 2;
				const delta = nodeCenter - containerCenter;
				// 直接修改 scrollLeft，避免 scrollTo/scroll-behavior 带来的平滑动画
				container.scrollLeft = container.scrollLeft + delta;
			} else {
				const containerCenter = containerRect.top + containerRect.height / 2;
				const nodeCenter = nodeRect.top + nodeRect.height / 2;
				const delta = nodeCenter - containerCenter;
				container.scrollTop = container.scrollTop + delta;
			}
		};

		if (isCenter) {
			// 首次加载：立即对齐中心
			requestAnimationFrame(() => {
				scrollToNodeCenter();
			});
		}

		// 返回 update 函数，当参数变化时重新执行
		return {
			update(newParams: { isCenter: boolean; orientation: 'horizontal' | 'vertical' }) {
				isCenter = newParams.isCenter;
				orientation = newParams.orientation;
				if (isCenter) {
					// 翻页或方向切换时立即对齐中心（无平滑动画）
					scrollToNodeCenter();
				}
			}
		};
	}

	// 监控 panoramaPages 变化
	$effect(() => {
		if (viewMode === 'panorama') {
			hasPanoramaImages = panoramaPages.some((p) => !!p.data);
		} else {
			hasPanoramaImages = false;
		}
	});
</script>

{#if viewMode === 'panorama'}
	<!-- 全景模式：使用相邻图片填充边框空隙，支持横向/纵向两种布局 -->
	<div
		class={`relative flex h-full w-full ${
			orientation === 'horizontal' ? 'items-center overflow-x-auto' : 'items-start overflow-y-auto'
		}`}
		style={`transform: scale(${zoomLevel});`}
	>
		{#if hasPanoramaImages}
			<!-- 使用相邻图片填充 -->
			<div
				class={orientation === 'horizontal'
					? `flex h-full min-w-full items-center justify-start overflow-x-auto py-0 ${
							readingDirection === 'right-to-left' ? 'flex-row-reverse' : ''
						}`
					: 'flex min-h-full w-full flex-col items-center justify-start overflow-y-auto py-0'}
				bind:this={scrollContainer}
				onscroll={handleScroll}
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
			<!-- 回退到单张图片显示 -->
			<div class="flex h-full min-w-full items-center justify-center">
				<img
					src={currentSrc(upscaledImageData, imageData) ?? ''}
					alt="Panorama"
					class="max-h-full max-w-full object-contain"
					style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
			</div>
		{/if}
	</div>
{:else if currentSrc(upscaledImageData, imageData)}
	{#if viewMode === 'single'}
		<div class="flex h-full w-full items-center justify-center">
			<img
				src={currentSrc(upscaledImageData, imageData) ?? ''}
				alt="Current page"
				class="max-h-full max-w-full object-contain"
				style={`transform: translate(${panX}px, ${panY}px) ${horizontalSplitHalf ? (physicalSplitHalf === 'left' ? 'translateX(25%)' : 'translateX(-25%)') : ''} scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s; ${
					horizontalSplitHalf
						? physicalSplitHalf === 'left'
							? 'clip-path: inset(0 50% 0 0);'
							: 'clip-path: inset(0 0 0 50%);'
						: ''
				}`}
			/>
		</div>
	{:else if viewMode === 'double'}
		{#if treatHorizontalAsDoublePage}
			<!-- 横向页面视为双页：当前页独占整幅跨页 -->
			<div class="flex h-full w-full items-center justify-center">
				<img
					src={currentSrc(upscaledImageData, imageData) ?? ''}
					alt="Current page"
					class="max-h-full max-w-full object-contain"
					style={`transform: translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
			</div>
		{:else}
			<div class="flex items-center justify-center gap-0">
				{#if readingDirection === 'right-to-left'}
					<!-- 右开阅读：反向排列 -->
					{#if imageData2}
						<img
							src={imageData2}
							alt="Previous page"
							class="max-h-full max-w-[45%] object-contain"
							style={`transform: translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
						/>
					{/if}
					<img
						src={currentSrc(upscaledImageData, imageData) ?? ''}
						alt="Current page"
						class="max-h-full max-w-[45%] object-contain"
						style={`transform: translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
					/>
				{:else}
					<!-- 左开阅读：正常排列 -->
					<img
						src={currentSrc(upscaledImageData, imageData) ?? ''}
						alt="Current page"
						class="max-h-full max-w-[45%] object-contain"
						style={`transform: translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
					/>
					{#if imageData2}
						<img
							src={imageData2}
							alt="Next page"
							class="max-h-full max-w-[45%] object-contain"
							style={`transform: translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
						/>
					{/if}
				{/if}
			</div>
		{/if}
	{:else}
		<!-- 默认单页模式 -->
		<div class="flex h-full w-full items-center justify-center">
			<img
				src={currentSrc(upscaledImageData, imageData) ?? ''}
				alt="Current page"
				class="max-h-full max-w-full object-contain"
				style={`transform: translate(${panX}px, ${panY}px) scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		</div>
	{/if}
{/if}
