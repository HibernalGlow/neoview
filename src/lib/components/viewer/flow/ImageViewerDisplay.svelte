<script lang="ts">
	type ViewMode = 'single' | 'double' | 'panorama';

	let {
		imageData = null,
		imageData2 = null,
		upscaledImageData = null,
		viewMode = 'single',
		zoomLevel = 1,
		rotationAngle = 0
	}: {
		imageData?: string | null;
		imageData2?: string | null;
		upscaledImageData?: string | null;
		viewMode?: ViewMode;
		zoomLevel?: number;
		rotationAngle?: number;
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
	{:else}
		<img
			src={currentSrc(upscaledImageData, imageData) ?? ''}
			alt="Panorama"
			class="max-w-full max-h-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{/if}
{/if}
