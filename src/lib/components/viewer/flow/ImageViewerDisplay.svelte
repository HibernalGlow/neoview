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
		panoramaPages = $bindable([] as Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>)
	}: {
		imageData?: string | null;
		imageData2?: string | null;
		upscaledImageData?: string | null;
		viewMode?: ViewMode;
		zoomLevel?: number;
		rotationAngle?: number;
		verticalPages?: Array<{ index: number; data: string | null }>;
		panoramaPages?: Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>;
	} = $props();

	function currentSrc(source: string | null, fallback: string | null) {
		return source || fallback;
	}
</script>

{#if currentSrc(upscaledImageData, imageData)}
	{#if viewMode === 'single'}
		<img
			src={currentSrc(upscaledImageData, imageData) ?? ''}
			alt="Current page"
			class="max-w-full max-h-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{:else if viewMode === 'double'}
		<div class="flex gap-4 items-center justify-center">
			<img
				src={currentSrc(upscaledImageData, imageData) ?? ''}
				alt="Current page"
				class="max-w-[45%] max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
			{#if imageData2}
				<img
					src={imageData2}
					alt="Next page"
					class="max-w-[45%] max-h-full object-contain"
					style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
			{/if}
		</div>
	{:else if viewMode === 'vertical'}
		<!-- 纵向滚动模式：垂直排列多张图片 -->
		<div class="flex flex-col items-center w-full h-full overflow-y-auto" style={`transform: scale(${zoomLevel});`}>
			{#each verticalPages as page (page.index)}
				{#if page.data}
					<img
						src={page.data}
						alt={`Page ${page.index + 1}`}
						class="w-full object-contain mb-2"
						style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s;`}
						loading="lazy"
					/>
				{/if}
			{/each}
		</div>
	{:else if viewMode === 'panorama'}
		<!-- 全景模式：使用相邻图片填充边框空隙 -->
		<div class="relative w-full h-full flex items-center justify-center overflow-hidden" style={`transform: scale(${zoomLevel});`}>
			{#if panoramaPages.length > 0}
				<!-- 使用相邻图片填充 -->
				<div class="flex items-center justify-center h-full">
					{#each panoramaPages as page (page.index)}
						{#if page.data}
							<img
								src={page.data}
								alt={`Page ${page.index + 1}`}
								class="h-full object-contain"
								class:opacity-50={page.position !== 'center'}
								class:absolute={page.position !== 'center'}
								class:left-0={page.position === 'left'}
								class:right-0={page.position === 'right'}
								style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s; z-index: ${page.position === 'center' ? 10 : page.position === 'left' ? 5 : 5};`}
							/>
						{/if}
					{/each}
				</div>
			{:else}
				<!-- 回退到单张图片显示 -->
				<img
					src={currentSrc(upscaledImageData, imageData) ?? ''}
					alt="Panorama"
					class="max-w-full max-h-full object-contain"
					style={`transform: rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
			{/if}
		</div>
	{:else}
		<!-- 默认单页模式 -->
		<img
			src={currentSrc(upscaledImageData, imageData) ?? ''}
			alt="Current page"
			class="max-w-full max-h-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{/if}
{/if}
