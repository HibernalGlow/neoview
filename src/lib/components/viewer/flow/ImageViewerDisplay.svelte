<script lang="ts">
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

	let hasPanoramaImages = $state(false);

	function currentSrc(source: string | null, fallback: string | null) {
		return source || fallback;
	}

	function scrollToCenter(node: HTMLElement, isCenter: boolean) {
		if (isCenter) {
			// 使用 setTimeout 确保 DOM 布局完成后再滚动
			setTimeout(() => {
				node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
			}, 0);
		}
		
		// 返回 update 函数，当 isCenter 变化时重新执行
		return {
			update(newIsCenter: boolean) {
				if (newIsCenter) {
					setTimeout(() => {
						node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
					}, 0);
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
			<div class="flex h-full min-w-full items-center justify-center gap-4 py-0 px-4">
				{#each panoramaPages as page (page.index)}
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
		<div class="flex items-center justify-center gap-4">
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
