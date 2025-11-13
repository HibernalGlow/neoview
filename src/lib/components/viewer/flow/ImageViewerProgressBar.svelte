<script lang="ts">
	let {
		showProgressBar = true,
		totalPages = 0,
		currentPageIndex = 0,
		preUpscaleProgress = 0,
		totalPreUpscalePages = 0,
		progressBlinking = false,
		progressColor = '#FDFBF7'
	} = $props();
</script>

{#if showProgressBar && totalPages > 0}
	<div class="absolute bottom-0 left-0 right-0 h-1 pointer-events-none">
		{#if preUpscaleProgress > 0}
			<div
				class="absolute bottom-0 left-0 h-full transition-all duration-500"
				style={`width: ${((currentPageIndex + 1 + (preUpscaleProgress / 100) * totalPreUpscalePages) / totalPages) * 100}%; background-color: #FCD34D; opacity: 0.6;`}
			></div>
		{/if}
		<div
			class={`absolute bottom-0 left-0 h-full transition-all duration-300 ${progressBlinking ? 'animate-pulse' : ''}`}
			style={`width: ${((currentPageIndex + 1) / totalPages) * 100}%; background-color: ${progressColor}; opacity: 0.8;`}
		></div>
	</div>
{/if}
