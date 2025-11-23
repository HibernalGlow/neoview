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
			[] as Array<{
				index: number;
				data: string | null;
				position: 'left' | 'center' | 'right';
				slot: number;
			}>
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
			slot: number;
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
			// 优先使用标记为 data-panorama-scroll 的外层容器
			const container =
				(node.closest('[data-panorama-scroll="true"]') as HTMLElement | null) ||
				(node.parentElement as HTMLElement | null);
			if (!container) return;

			// 使用 offset 计算：目标 scrollLeft = 图片中心 - 容器宽度一半
			const containerWidth = container.clientWidth;
			const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
			const targetScrollLeft = Math.max(0, nodeCenter - containerWidth / 2);

			// 直接设置 scrollLeft，避免平滑动画导致的位置偏移
			container.scrollLeft = targetScrollLeft;
		};

		let cleanup: (() => void) | null = null;

		const setup = () => {
			if (!isCenter) return;
			// 初次挂载时先尝试居中一次
			requestAnimationFrame(() => {
				scrollToNodeCenter();
			});
			// 图片加载完成后再居中一次，使用真实尺寸
			node.addEventListener('load', scrollToNodeCenter);
			cleanup = () => {
				node.removeEventListener('load', scrollToNodeCenter);
				cleanup = null;
			};
		};

		if (isCenter) {
			setup();
		}

		// 返回 update/destroy 函数，当 isCenter 或节点状态变化时重新执行
		return {
			update(newIsCenter: boolean) {
				isCenter = newIsCenter;
				if (!newIsCenter) {
					cleanup?.();
					return;
				}
				// 翻页或中心图片变化时，重新绑定 load 事件并居中
				cleanup?.();
				setup();
			},
			destroy() {
				cleanup?.();
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
		data-panorama-scroll="true"
	>
		{#if hasPanoramaImages}
			<!-- 使用相邻图片填充 -->
			<div 
				class={`flex h-full min-w-full items-center justify-start gap-0 py-0 ${readingDirection === 'right-to-left' ? 'flex-row-reverse' : ''}`}
			>
				{#each panoramaPages as page (page.slot)}
					{#if page.data}
						<img
							src={page.data}
							alt={`Page ${page.index + 1}`}
							class="h-full w-auto flex-shrink-0 rounded-sm object-cover shadow-2xl"
							style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s;`}
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
