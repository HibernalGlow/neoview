<script lang="ts">
	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ReadingDirection } from '$lib/settings/settingsManager';
	import { hoverScroll } from '$lib/utils/scroll/hoverScroll';
	
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
		)
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
	} = $props();

	let settings = $state(settingsManager.getSettings());
	let readingDirection: ReadingDirection = $derived(settings.book.readingDirection);
	let hoverScrollEnabled = $derived(settings.image.hoverScrollEnabled ?? true);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	let hasPanoramaImages = $state(false);

	function currentSrc(source: string | null, fallback: string | null) {
		return source || fallback;
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
				class={
					orientation === 'horizontal'
						? `flex h-full min-w-full items-center justify-start py-0 overflow-x-auto ${
								readingDirection === 'right-to-left' ? 'flex-row-reverse' : ''
							}`
						: 'flex w-full min-h-full flex-col items-center justify-start py-0 overflow-y-auto'
				}
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
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		</div>
	{:else if viewMode === 'double'}
		<div class="flex items-center justify-center gap-0">
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
		<div class="flex h-full w-full items-center justify-center">
			<img
				src={currentSrc(upscaledImageData, imageData) ?? ''}
				alt="Current page"
				class="max-h-full max-w-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		</div>
	{/if}
{/if}
