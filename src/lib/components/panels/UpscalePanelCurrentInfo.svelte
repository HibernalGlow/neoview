<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Sparkles, Zap } from '@lucide/svelte';
	import { createEventDispatcher } from 'svelte';

	export let currentImageResolution = '';
	export let currentImageSize = '';
	export let processingTime = 0;
	export let status = '';
	export let isProcessing = false;
	export let currentImagePath = '';
	export let progress = 0;
	export let progressColorClass = '';
export let statusClass = '';

	const dispatch = createEventDispatcher();

	function handlePerformClick() {
		dispatch('perform');
	}
</script>

<div class="section">
	<div class="section-title">
		<Zap class="w-4 h-4" />
		<span>当前图片</span>
	</div>

	<div class="info-grid">
		<div class="info-item">
			<span class="info-label">分辨率：</span>
			<span class="info-value">{currentImageResolution || '-'}</span>
		</div>
		<div class="info-item">
			<span class="info-label">大小：</span>
			<span class="info-value">{currentImageSize || '-'}</span>
		</div>
		<div class="info-item">
			<span class="info-label">耗时：</span>
			<span class="info-value">{processingTime.toFixed(1)}s</span>
		</div>
		<div class="info-item">
			<span class="info-label">状态：</span>
			<span class={`info-value ${statusClass}`}>
				{status || '就绪'}
			</span>
		</div>
	</div>

	<Button
		onclick={handlePerformClick}
		class="w-full mt-3"
		disabled={isProcessing || !currentImagePath}
	>
		{#if isProcessing}
			<Loader2 class="w-4 h-4 mr-2 animate-spin" />
			处理中...
		{:else}
			<Sparkles class="w-4 h-4 mr-2" />
			执行超分
		{/if}
	</Button>

	{#if isProcessing}
		<div class="progress-container">
			<div class="progress-bar">
				<div class={`progress-fill ${progressColorClass}`} style={`width: ${progress}%`}></div>
			</div>
			<span class="progress-text">{progress.toFixed(0)}%</span>
		</div>
	{/if}
</div>

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

	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.info-value {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.progress-container {
		margin-top: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: hsl(var(--muted));
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		transition: width 0.3s ease, background-color 0.3s ease;
	}

	.progress-text {
		font-size: 0.75rem;
		font-weight: 600;
		min-width: 40px;
		text-align: right;
	}
</style>
