<script lang="ts">
/**
 * 超分状态信息卡片
 */
import { Loader2 } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import {
	isProcessing,
	progress,
	status,
	processingTime,
	errorMessage,
	currentImagePath,
	currentImageResolution,
	currentImageSize,
	formatFileSize
} from '$lib/stores/upscale/upscalePanelStore.svelte';
import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';

function getProgressColor(prog: number): string {
	if (prog < 30) return 'bg-yellow-500';
	if (prog < 70) return 'bg-blue-500';
	return 'bg-green-500';
}

function getFileName(path: string): string {
	if (!path) return '';
	return path.split(/[/\\]/).pop() || path;
}

async function handleManualUpscale() {
	if (!currentImagePath.value || isProcessing.value) return;
	
	try {
		isProcessing.value = true;
		status.value = '正在超分...';
		progress.value = 0;
		
		// 调用 PyO3 超分
		const result = await pyo3UpscaleManager.upscaleCurrentImage(currentImagePath.value);
		
		if (result) {
			status.value = '超分完成';
			progress.value = 100;
		} else {
			status.value = '超分失败';
		}
	} catch (err) {
		status.value = '超分失败';
		errorMessage.value = err instanceof Error ? err.message : String(err);
	} finally {
		isProcessing.value = false;
	}
}
</script>

<div class="space-y-3 text-xs">
	<!-- 当前图片信息 -->
	{#if currentImagePath.value}
		<div class="space-y-1">
			<p class="text-muted-foreground truncate" title={currentImagePath.value}>
				{getFileName(currentImagePath.value)}
			</p>
			<div class="flex gap-2 text-[10px] text-muted-foreground">
				{#if currentImageResolution.value}
					<span>{currentImageResolution.value}</span>
				{/if}
				{#if currentImageSize.value}
					<span>{currentImageSize.value}</span>
				{/if}
			</div>
		</div>
	{:else}
		<p class="text-muted-foreground text-center py-2">未选择图片</p>
	{/if}

	<!-- 处理状态 -->
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<span class="text-muted-foreground">状态</span>
			<span class="flex items-center gap-1">
				{#if isProcessing.value}
					<Loader2 class="h-3 w-3 animate-spin" />
				{/if}
				{status.value}
			</span>
		</div>

		{#if isProcessing.value}
			<div class="w-full bg-muted rounded-full h-1.5 overflow-hidden">
				<div
					class="h-full transition-all duration-300 {getProgressColor(progress.value)}"
					style="width: {progress.value}%"
				></div>
			</div>
			<p class="text-[10px] text-muted-foreground text-center">{progress.value}%</p>
		{/if}

		{#if errorMessage.value}
			<p class="text-[10px] text-destructive">{errorMessage.value}</p>
		{/if}

		{#if processingTime.value > 0}
			<p class="text-[10px] text-muted-foreground">
				处理时间: {(processingTime.value / 1000).toFixed(1)}s
			</p>
		{/if}
	</div>

	<!-- 手动超分按钮 -->
	<Button
		variant="outline"
		size="sm"
		class="w-full h-7 text-xs"
		disabled={!currentImagePath.value || isProcessing.value}
		onclick={handleManualUpscale}
	>
		{#if isProcessing.value}
			<Loader2 class="h-3 w-3 mr-1 animate-spin" />
			处理中...
		{:else}
			手动超分当前图片
		{/if}
	</Button>
</div>
