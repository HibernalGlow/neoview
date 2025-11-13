<script lang="ts">
	type ViewMode = 'single' | 'double' | 'panorama';

	export let imageData: string | null = null;
	export let imageData2: string | null = null;
	export let upscaledImageData: string | null = null;
	export let viewMode: ViewMode = 'single';
	export let zoomLevel = 1;
	export let rotationAngle = 0;
</script>

{#if imageData}
	<!-- 单页模式 -->
	{#if viewMode === 'single'}
		<img
			src={upscaledImageData || imageData}
			alt="Current page"
			class="max-w-full max-h-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	<!-- 双页模式 -->
	{:else if viewMode === 'double'}
		<div class="flex gap-4 items-center justify-center">
			<img
				src={upscaledImageData || imageData}
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
	<!-- 全景模式 -->
	{:else if viewMode === 'panorama'}
		<img
			src={upscaledImageData || imageData}
			alt="Current page"
			class="w-full h-full object-contain"
			style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
		/>
	{/if}
{/if}
