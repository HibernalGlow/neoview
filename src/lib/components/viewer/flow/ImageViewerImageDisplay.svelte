<script lang="ts">
	export let loadingVisible = false;
	export let error: string | null = null;
	export let imageData: string | null = null;
	export let imageData2: string | null = null;
	export let viewMode: 'single' | 'double' | 'panorama' | string = 'single';
	export let zoomLevel = 1;
	export let rotationAngle = 0;
	export let upscaledImageData: string | null = null;
</script>

<div class="image-container flex-1 flex items-center justify-center overflow-auto" data-viewer="true">
	{#if loadingVisible}
		<div class="text-white">Loading...</div>
	{:else if error}
		<div class="text-red-500">Error: {error}</div>
	{:else if imageData}
		{#if viewMode === 'single'}
			<img
				src={upscaledImageData || imageData}
				alt="Current page"
				class="max-w-full max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
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
		{:else if viewMode === 'panorama'}
			<img
				src={upscaledImageData || imageData}
				alt="Current page"
				class="w-full h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		{:else}
			<img
				src={upscaledImageData || imageData}
				alt="Current page"
				class="max-w-full max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		{/if}
	{/if}
</div>
