<script lang="ts">
	import { CheckCircle } from '@lucide/svelte';

	let {
		upscaledImageUrl = null
	}: {
		upscaledImageUrl?: string | null;
	} = $props();
</script>

{#if upscaledImageUrl}
	<div class="section">
		<div class="section-title">
			<CheckCircle class="w-4 h-4 text-green-500" />
			<span>超分结果</span>
		</div>
		<div class="preview-container">
			<img src={upscaledImageUrl} alt="超分结果" class="preview-image" />
		</div>
	</div>
{/if}

<style>
	.section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		padding: 1rem;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		color: hsl(var(--foreground));
	}

	.preview-container {
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.preview-image {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
