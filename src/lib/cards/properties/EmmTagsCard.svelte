<script lang="ts">
/**
 * EMM 标签卡片
 * 显示当前书籍的 EMM 标签信息
 */
import { infoPanelStore, type ViewerBookInfo } from '$lib/stores/infoPanel.svelte';
import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';

let bookInfo = $state<ViewerBookInfo | null>(null);

$effect(() => {
	const unsubscribe = infoPanelStore.subscribe((state) => {
		bookInfo = state.bookInfo;
	});
	return unsubscribe;
});

const allTags = $derived.by(() => {
	if (!bookInfo?.emmMetadata?.tags) {
		return [] as string[];
	}
	const tags = bookInfo.emmMetadata.tags;
	// 如果 tags 是对象，提取所有值
	if (typeof tags === 'object' && !Array.isArray(tags)) {
		return Object.values(tags).flat() as string[];
	}
	return tags as string[];
});

function getTagTranslation(tag: string): string {
	const dict = emmMetadataStore.getTranslationDict();
	if (!dict) return tag;
	const record = dict[tag];
	if (record && typeof record === 'object' && 'cn' in record) {
		return (record as { cn?: string }).cn || tag;
	}
	return tag;
}
</script>

<div class="space-y-2 text-[11px]">
	{#if !bookInfo}
		<div class="text-center py-4 text-muted-foreground">
			<p>未打开书籍</p>
			<p class="text-[10px] mt-1">打开书籍后显示标签</p>
		</div>
	{:else if !bookInfo.emmMetadata}
		<div class="text-center py-4 text-muted-foreground">
			<p>无 EMM 数据</p>
			<p class="text-[10px] mt-1">此书籍没有关联的 EMM 元数据</p>
		</div>
	{:else if allTags.length === 0}
		<div class="text-center py-4 text-muted-foreground">
			<p>暂无标签</p>
		</div>
	{:else}
		<div class="flex flex-wrap gap-1">
			{#each allTags as tag}
				{@const translated = getTagTranslation(tag)}
				<span
					class="inline-flex items-center px-1.5 py-0.5 rounded border border-border text-[10px] hover:bg-muted/50"
					title={tag !== translated ? tag : undefined}
				>
					{translated}
				</span>
			{/each}
		</div>
		<div class="text-[10px] text-muted-foreground pt-1">
			共 {allTags.length} 个标签
		</div>
	{/if}
</div>
