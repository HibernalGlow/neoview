<script lang="ts">
	export let show = false;
	export let currentPercent = 0;
	export let preUpscalePercent = 0;
	export let progressBlinking = false;
	export let progressColor = '#FDFBF7';
</script>

{#if show}
	<div class="absolute bottom-0 left-0 right-0 h-1 pointer-events-none">
		{#if preUpscalePercent > 0}
			<div
				class="absolute bottom-0 left-0 h-full transition-all duration-500"
				style={`width: ${Math.min(preUpscalePercent, 100)}%; background-color: #FCD34D; opacity: 0.6;`}
			></div>
		{/if}
		<div
			class={`absolute bottom-0 left-0 h-full transition-all duration-300 ${progressBlinking ? 'animate-pulse' : ''}`}
			style={`width: ${Math.min(currentPercent, 100)}%; background-color: ${progressColor}; opacity: 0.8;`}
		></div>
	</div>
{/if}
