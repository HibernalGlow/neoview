<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Loader2, Sparkles, Zap } from '@lucide/svelte';
	import { createEventDispatcher } from 'svelte';
	import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';

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

	// 订阅全局 upscaleState，同步状态
	$effect(() => {
		if (upscaleState.isUpscaling) {
			isProcessing = true;
			status = upscaleState.currentTask || '处理中';
			progress = upscaleState.progress;
			
			// 根据模式设置不同的颜色
			if (upscaleState.mode === 'auto') {
				progressColorClass = 'bg-yellow-500';
				statusClass = 'text-yellow-600';
			} else {
				progressColorClass = 'bg-blue-500';
				statusClass = 'text-blue-600';
			}
		} else if (upscaleState.error) {
			isProcessing = false;
			status = '处理失败';
			statusClass = 'text-red-600';
			progressColorClass = 'bg-red-500';
		} else if (progress === 100) {
			isProcessing = false;
			status = '转换完成';
			statusClass = 'text-green-600';
			progressColorClass = 'bg-green-500';
		} else {
			isProcessing = false;
			status = '就绪';
			statusClass = '';
			progressColorClass = '';
		}
	});
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
