<script lang="ts">
/**
 * 图像信息卡片
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
</script>

{#if imageInfo}
	<div class="space-y-2 text-sm">
		<div class="flex justify-between">
			<span class="text-muted-foreground">文件名:</span>
			<span class="font-mono text-xs" title={imageInfo.name}>
				{imageInfo.name}
			</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">格式:</span>
			<span>{imageInfo.format ?? '—'}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">尺寸:</span>
			<span>
				{#if imageInfo.width && imageInfo.height}
					{imageInfo.width} × {imageInfo.height}
				{:else}
					—
				{/if}
			</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">色深:</span>
			<span>{imageInfo.colorDepth ?? '—'}</span>
		</div>
	</div>
{:else}
	<div class="text-sm text-muted-foreground text-center py-2">
		暂无图像信息
	</div>
{/if}
