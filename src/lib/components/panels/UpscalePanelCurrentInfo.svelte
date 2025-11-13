<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Sparkles, Zap } from '@lucide/svelte';
	import { createEventDispatcher } from 'svelte';

	let {
		currentImageResolution = '',
		currentImageSize = '',
		processingTime = 0,
		status = '',
		isProcessing = false,
		currentImagePath = '',
		progress = 0,
		progressColorClass = '',
		statusClass = ''
	} = $props();

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
