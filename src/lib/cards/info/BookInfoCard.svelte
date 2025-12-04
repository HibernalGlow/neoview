<script lang="ts">
/**
 * 书籍信息卡片
 * 从 InfoPanel 提取
 */
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';

let bookInfo = $state<ViewerBookInfo | null>(null);

$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		bookInfo = state.bookInfo;
	});
	return unsubscribe;
});

function formatBookType(type?: string): string {
	if (!type) return '未知';
	switch (type.toLowerCase()) {
		case 'folder': return '文件夹';
		case 'archive': return '压缩包';
		case 'pdf': return 'PDF';
		case 'media': return '媒体';
		default: return type;
	}
}
</script>

{#if bookInfo}
	<div class="space-y-2 text-sm">
		<div class="flex justify-between">
			<span class="text-muted-foreground">名称:</span>
			<span
				class={bookInfo.emmMetadata?.translatedTitle && bookInfo.emmMetadata.translatedTitle !== bookInfo.name
					? 'break-words max-w-[200px] rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs text-primary text-right'
					: 'font-medium break-words max-w-[200px]'}
				title={bookInfo.emmMetadata?.translatedTitle || bookInfo.name}
			>
				{bookInfo.emmMetadata?.translatedTitle || bookInfo.name}
			</span>
		</div>
		{#if bookInfo.emmMetadata?.translatedTitle && bookInfo.emmMetadata.translatedTitle !== bookInfo.name}
			<div class="flex justify-between">
				<span class="text-muted-foreground">原名:</span>
				<span class="font-mono text-xs break-words max-w-[200px]" title={bookInfo.name}>
					{bookInfo.name}
				</span>
			</div>
		{/if}
		<div class="flex justify-between">
			<span class="text-muted-foreground">路径:</span>
			<span class="font-mono text-xs break-words max-w-[200px]" title={bookInfo.path}>
				{bookInfo.path}
			</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">类型:</span>
			<span>{formatBookType(bookInfo.type)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">页码:</span>
			<span>{bookInfo.currentPage} / {bookInfo.totalPages}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-muted-foreground">进度:</span>
			<span>
				{#if bookInfo.totalPages > 0}
					{((Math.min(bookInfo.currentPage, bookInfo.totalPages) / bookInfo.totalPages) * 100).toFixed(1)}%
				{:else}
					—
				{/if}
			</span>
		</div>
	</div>
{:else}
	<div class="text-sm text-muted-foreground text-center py-2">
		暂无书籍信息
	</div>
{/if}
