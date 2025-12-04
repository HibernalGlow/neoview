<script lang="ts">
/**
 * 存储信息卡片
 * 从 InfoPanel 提取
 */
import { infoPanelStore, type ViewerImageInfo } from '$lib/stores/infoPanel.svelte';

let imageInfo = $state<ViewerImageInfo | null>(null);

$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		imageInfo = state.imageInfo;
	});
	return unsubscribe;
});

function formatFileSize(bytes?: number): string {
	if (bytes === undefined) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
</script>

{#if imageInfo}
	<div class="space-y-2 text-sm">
		<div class="flex justify-between">
			<span class="text-muted-foreground">路径:</span>
			<span class="font-mono text-xs break-words max-w-[200px]" title={imageInfo.path}>
				{imageInfo.path ?? '—'}
			</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">大小:</span>
			<span>{formatFileSize(imageInfo.fileSize)}</span>
		</div>
	</div>
{:else}
	<div class="text-sm text-muted-foreground text-center py-2">
		暂无存储信息
	</div>
{/if}
