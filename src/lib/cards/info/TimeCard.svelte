<script lang="ts">
/**
 * 时间信息卡片
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

function formatDate(date?: string): string {
	if (!date) return '—';
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return date;
	return parsed.toLocaleString('zh-CN');
}
</script>

{#if imageInfo}
	<div class="space-y-2 text-sm">
		<div class="flex justify-between">
			<span class="text-muted-foreground">创建时间:</span>
			<span class="text-xs">{formatDate(imageInfo.createdAt)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">修改时间:</span>
			<span class="text-xs">{formatDate(imageInfo.modifiedAt)}</span>
		</div>
	</div>
{:else}
	<div class="text-sm text-muted-foreground text-center py-2">
		暂无时间信息
	</div>
{/if}
