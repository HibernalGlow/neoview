<script lang="ts">
	import { CheckCircle, Image as ImageIcon, Loader2 } from '@lucide/svelte';

	let {
		upscaledImageUrl = null,
		originalImageUrl = null,
	isProcessing = false,
	showOriginal = false,
	showUpscaled = false
	}: {
		upscaledImageUrl?: string | null;
		originalImageUrl?: string | null;
	isProcessing?: boolean;
	showOriginal?: boolean;
	showUpscaled?: boolean;
	} = $props();
</script>

<div class="space-y-3">
	{#if showOriginal}
		<div class="preview-section">
			<div class="flex items-center gap-2 text-sm font-medium mb-2">
				<ImageIcon class="w-4 h-4" />
				<span>原图预览</span>
				{#if isProcessing && !upscaledImageUrl && showUpscaled}
					<span class="badge processing">
						<Loader2 class="w-3 h-3 animate-spin" />
						等待超分...
					</span>
				{/if}
			</div>
			{#if originalImageUrl}
				<div class="preview-container">
					<img src={originalImageUrl} alt="原图" class="preview-image" />
				</div>
			{:else}
				<div class="empty-state">
					<p>暂无原图数据，等待页面加载...</p>
				</div>
			{/if}
		</div>
	{/if}

	{#if showUpscaled}
		<div class="preview-section">
			<div class="flex items-center gap-2 text-sm font-medium mb-2">
				<CheckCircle class="w-4 h-4 {upscaledImageUrl ? 'text-green-500' : ''}" />
				<span>超分结果</span>
			</div>
			{#if upscaledImageUrl}
				<div class="preview-container">
					<img src={upscaledImageUrl} alt="超分结果" class="preview-image" />
				</div>
			{:else}
				<div class="empty-state">
					<p>尚未生成超分结果。</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
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

	.empty-state {
		padding: 1rem;
		font-size: 0.85rem;
		text-align: center;
		color: hsl(var(--muted-foreground));
	}
</style>
