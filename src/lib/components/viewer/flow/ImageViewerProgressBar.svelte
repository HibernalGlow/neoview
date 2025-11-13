<script lang="ts">
	export let showProgressBar = true;
	export let totalPages = 0;
	export let currentPageIndex = 0;
	export let preUpscaleProgress = 0;
	export let totalPreUpscalePages = 0;
	export let progressBlinking = false;
	export let progressColor = '#FDFBF7';
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
