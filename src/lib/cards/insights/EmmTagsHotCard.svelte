<script lang="ts">
/**
 * EMM 标签热度卡片
 */
import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
import { Badge } from '$lib/components/ui/badge';
import type { EMMCollectTag } from '$lib/api/emm';

let collectTags = $state<EMMCollectTag[]>([]);

$effect(() => {
	const unsubscribe = emmMetadataStore.subscribe((value) => {
		collectTags = value.collectTags ?? [];
	});
	return unsubscribe;
});

function buildEmmTagStats() {
	const total = collectTags.length;
	const byLetter: Record<string, number> = {};
	for (const tag of collectTags) {
		const letter = tag.letter || 'other';
		byLetter[letter] = (byLetter[letter] ?? 0) + 1;
	}
	const topLetters = Object.entries(byLetter)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);
	const previewTags = collectTags.slice(0, 6);
	return { total, topLetters, previewTags };
}

const stats = $derived(buildEmmTagStats());
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between text-xs">
		<span class="text-muted-foreground">收藏标签总数</span>
		<span class="font-semibold">{stats.total}</span>
	</div>
	
	{#if stats.topLetters.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each stats.topLetters as [letter, count]}
				<Badge variant="secondary" class="text-[10px]">
					{letter}: {count}
				</Badge>
			{/each}
		</div>
	{/if}
	
	{#if stats.previewTags.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each stats.previewTags as tag}
				<span class="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
					{tag.tag}
				</span>
			{/each}
			{#if stats.total > 6}
				<span class="text-[10px] text-muted-foreground">+{stats.total - 6} 更多</span>
			{/if}
		</div>
	{:else}
		<p class="text-xs text-muted-foreground text-center py-4">暂无 EMM 标签数据</p>
	{/if}
</div>
