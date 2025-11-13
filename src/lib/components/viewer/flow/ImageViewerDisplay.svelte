<script lang="ts">
	type ViewMode = 'single' | 'double' | 'panorama';

	let {
		imageData = null,
		imageData2 = null,
		imageBitmap = null,
		imageBitmap2 = null,
		upscaledImageData = null,
		viewMode = 'single',
		zoomLevel = 1,
		rotationAngle = 0
	}: {
		imageData?: string | null;
		imageData2?: string | null;
		imageBitmap?: ImageBitmap | null;
		imageBitmap2?: ImageBitmap | null;
		upscaledImageData?: string | null;
		viewMode?: ViewMode;
		zoomLevel?: number;
		rotationAngle?: number;
	} = $props();

	// Canvas 引用
	let canvas1: HTMLCanvasElement;
	let canvas2: HTMLCanvasElement;

	// 当 ImageBitmap 更新时，绘制到 Canvas
	$effect(() => {
		if (imageBitmap && canvas1) {
			const ctx = canvas1.getContext('2d')!;
			
			// 先保存当前状态
			ctx.save();
			
			// 完全清理画布 - 重置变换矩阵
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas1.width, canvas1.height);
			
			// 设置新尺寸
			canvas1.width = imageBitmap.width;
			canvas1.height = imageBitmap.height;
			
			// 再次清理确保完全清除
			ctx.clearRect(0, 0, canvas1.width, canvas1.height);
			
			// 绘制新图像
			ctx.drawImage(imageBitmap, 0, 0);
			
			// 恢复状态
			ctx.restore();
		}
	});

	$effect(() => {
		if (imageBitmap2 && canvas2) {
			const ctx = canvas2.getContext('2d')!;
			
			// 先保存当前状态
			ctx.save();
			
			// 完全清理画布 - 重置变换矩阵
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas2.width, canvas2.height);
			
			// 设置新尺寸
			canvas2.width = imageBitmap2.width;
			canvas2.height = imageBitmap2.height;
			
			// 再次清理确保完全清除
			ctx.clearRect(0, 0, canvas2.width, canvas2.height);
			
			// 绘制新图像
			ctx.drawImage(imageBitmap2, 0, 0);
			
			// 恢复状态
			ctx.restore();
		}
	});
</script>

{#if imageBitmap || imageData}
	<!-- 单页模式 -->
	{#if viewMode === 'single'}
		{#if imageBitmap}
			<canvas
				bind:this={canvas1}
				alt="Current page"
				class="w-full h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			></canvas>
		{:else}
			<img
				src={upscaledImageData || imageData}
				alt="Current page"
				class="max-w-full max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		{/if}
	<!-- 双页模式 -->
	{:else if viewMode === 'double'}
		<div class="flex gap-4 items-center justify-center">
			{#if imageBitmap}
				<canvas
				bind:this={canvas1}
				alt="Current page"
				class="max-w-[45%] max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			></canvas>
			{:else}
				<img
					src={upscaledImageData || imageData}
					alt="Current page"
					class="max-w-[45%] max-h-full object-contain"
					style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				/>
			{/if}
			{#if imageBitmap2 || imageData2}
				{#if imageBitmap2}
					<canvas
					bind:this={canvas2}
					alt="Next page"
					class="max-w-[45%] max-h-full object-contain"
					style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
				></canvas>
				{:else if imageData2}
					<img
						src={imageData2}
						alt="Next page"
						class="max-w-[45%] max-h-full object-contain"
						style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
					/>
				{/if}
			{/if}
		</div>
	<!-- 全景模式 -->
	{:else if viewMode === 'panorama'}
		{#if imageBitmap}
			<canvas
				bind:this={canvas1}
				alt="Panorama"
				class="max-w-full max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			></canvas>
		{:else}
			<img
				src={upscaledImageData || imageData}
				alt="Panorama"
				class="max-w-full max-h-full object-contain"
				style={`transform: scale(${zoomLevel}) rotate(${rotationAngle}deg); transition: transform 0.2s;`}
			/>
		{/if}
	{/if}
{/if}
