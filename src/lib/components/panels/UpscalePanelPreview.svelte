<script lang="ts">
	import { CheckCircle, Image as ImageIcon, Loader2 } from '@lucide/svelte';

	let {
		upscaledImageUrl = null,
		originalImageUrl = null,
		isProcessing = false
	}: {
		upscaledImageUrl?: string | null;
		originalImageUrl?: string | null;
		isProcessing?: boolean;
	} = $props();
</script>

{#if originalImageUrl}
	<div class="section">
		<div class="section-title">
			<ImageIcon class="w-4 h-4" />
			<span>原图预览</span>
			{#if isProcessing && !upscaledImageUrl}
				<span class="badge processing">
					<Loader2 class="w-3 h-3 animate-spin" />
					等待超分...
				</span>
			{/if}
		</div>
		<div class="preview-container">
			<img src={originalImageUrl} alt="原图" class="preview-image" />
		</div>
	</div>
{:else}
	<div class="section empty">
		<div class="section-title">
			<ImageIcon class="w-4 h-4" />
			<span>原图预览</span>
		</div>
		<div class="empty-state">
			<p>暂无原图数据，等待页面加载...</p>
		</div>
	</div>
{/if}

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

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-radius: 9999px;
		padding: 0.1rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 500;
	}

	.badge.processing {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.empty {
		text-align: center;
		color: hsl(var(--muted-foreground));
	}

	.empty-state {
		padding: 1rem;
		font-size: 0.85rem;
	}
</style>
