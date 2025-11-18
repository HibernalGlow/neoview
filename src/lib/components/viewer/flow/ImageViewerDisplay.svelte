<script lang="ts">
	type ViewMode = 'single' | 'double' | 'panorama' | 'vertical';

	let {
		imageData = null,
		imageData2 = null,
		upscaledImageData = null,
		viewMode = 'single',
		zoomLevel = 1,
		rotationAngle = 0,
		verticalPages = $bindable([] as Array<{ index: number; data: string | null }>)
	}: {
		imageData?: string | null;
		imageData2?: string | null;
		upscaledImageData?: string | null;
		viewMode?: ViewMode;
		zoomLevel?: number;
		rotationAngle?: number;
		verticalPages?: Array<{ index: number; data: string | null }>;
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
	{:else}
		<!-- 全景模式：当前仅显示单张图片，后续将实现相邻图片填充 -->
		<img
			src={currentSrc(upscaledImageData, imageData) ?? ''}
			alt="Panorama"
			class="max-w-full max-h-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{/if}
{/if}
