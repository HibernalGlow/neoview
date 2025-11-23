<script lang="ts">
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ReadingDirection } from '$lib/settings/settingsManager';
	
	type ViewMode = 'single' | 'double' | 'panorama' | 'vertical';

	let {
		imageData = null,
		imageData2 = null,
		upscaledImageData = null,
		viewMode = 'single',
		zoomLevel = 1,
		rotationAngle = 0,
		verticalPages = $bindable([] as Array<{ index: number; data: string | null }>),
		panoramaPages = $bindable(
			[] as Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>
		)
	}: {
		imageData?: string | null;
		imageData2?: string | null;
		upscaledImageData?: string | null;
		viewMode?: ViewMode;
		zoomLevel?: number;
		rotationAngle?: number;
		verticalPages?: Array<{ index: number; data: string | null }>;
		panoramaPages?: Array<{
			index: number;
			data: string | null;
			position: 'left' | 'center' | 'right';
		}>;
	} = $props();

	let settings = $state(settingsManager.getSettings());
	let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	let hasPanoramaImages = $state(false);

	function currentSrc(source: string | null, fallback: string | null) {
		return source || fallback;
	}

	function scrollToCenter(node: HTMLElement, isCenter: boolean) {
		// 将目标图片的中心对齐到滚动容器的中心（无任何平滑动画）
		const scrollToNodeCenter = () => {
			if (!isCenter) return;
			const container = node.parentElement as HTMLElement | null;
			if (!container) return;

			const containerRect = container.getBoundingClientRect();
			const nodeRect = node.getBoundingClientRect();
			const containerCenter = containerRect.left + containerRect.width / 2;
			const nodeCenter = nodeRect.left + nodeRect.width / 2;
			const delta = nodeCenter - containerCenter;

			// 直接修改 scrollLeft，避免 scrollTo/scroll-behavior 带来的平滑动画
			container.scrollLeft = container.scrollLeft + delta;
		};

		if (isCenter) {
			// 首次加载：立即对齐中心
			requestAnimationFrame(() => {
				scrollToNodeCenter();
			});
		}

		// 返回 update 函数，当 isCenter 变化时重新执行
		return {
			update(newIsCenter: boolean) {
				isCenter = newIsCenter;
				if (newIsCenter) {
					// 翻页时也立即对齐到中心（无平滑动画）
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
	<!-- 全景模式：使用相邻图片填充边框空隙 -->
	<div
		class="relative flex h-full w-full items-center overflow-x-auto"
		style={`transform: scale(${zoomLevel});`}
	>
		{#if hasPanoramaImages}
			<!-- 使用相邻图片填充 -->
			<div 
				class={`flex h-full min-w-full items-center justify-start py-0 overflow-x-auto ${readingDirection === 'right-to-left' ? 'flex-row-reverse' : ''}`}
			>
				{#each panoramaPages as page (page.index)}
					{#if page.data}
						<img
							src={page.data}
							alt={`Page ${page.index + 1}`}
							class="h-full w-auto shrink-0 object-cover"
							style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s; margin: 0 -1px;`}
							use:scrollToCenter={page.position === 'center'}
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
{:else if viewMode === 'vertical'}
	<!-- 纵向滚动模式：垂直排列多张图片 -->
	<div
		class="flex h-full w-full flex-col items-center overflow-y-auto"
		style={`transform: scale(${zoomLevel});`}
	>
		{#each verticalPages as page (page.index)}
			{#if page.data}
				<img
					src={page.data}
					alt={`Page ${page.index + 1}`}
					class="mb-2 w-full object-contain"
					style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s;`}
					loading="lazy"
				/>
			{/if}
		{/each}
	</div>
{:else if currentSrc(upscaledImageData, imageData)}
	{#if viewMode === 'single'}
		<img
			src={currentSrc(upscaledImageData, imageData) ?? ''}
			alt="Current page"
			class="max-h-full max-w-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{:else if viewMode === 'double'}
		<div class="flex items-center {readingDirection === 'right-to-left' ? 'justify-end' : 'justify-center'} gap-4">
			{#if readingDirection === 'right-to-left'}
				<!-- 右开阅读：反向排列 -->
				{#if imageData2}
					<img
						src={imageData2}
						alt="Previous page"
						class="max-h-full max-w-[45%] object-contain"
						style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
					/>
				{/if}
				<img
					src={currentSrc(upscaledImageData, imageData) ?? ''}
					alt="Current page"
					class="max-h-full max-w-[45%] object-contain"
					style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
			{:else}
				<!-- 左开阅读：正常排列 -->
				<img
					src={currentSrc(upscaledImageData, imageData) ?? ''}
					alt="Current page"
					class="max-h-full max-w-[45%] object-contain"
					style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
				{#if imageData2}
					<img
						src={imageData2}
						alt="Next page"
						class="max-h-full max-w-[45%] object-contain"
						style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
					/>
				{/if}
			{/if}
		</div>
	{:else}
		<!-- 默认单页模式 -->
		<img
			src={currentSrc(upscaledImageData, imageData) ?? ''}
			alt="Current page"
			class="max-h-full max-w-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{/if}
{/if}
