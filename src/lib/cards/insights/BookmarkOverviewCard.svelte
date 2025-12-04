<script lang="ts">
/**
 * 书签概览卡片
 */
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { Badge } from '$lib/components/ui/badge';
import { Progress } from '$lib/components/ui/progress';

let bookmarks = $state<ReturnType<typeof bookmarkStore.getAll>>([]);

$effect(() => {
	const unsubscribe = bookmarkStore.subscribe((value) => {
		bookmarks = value ?? [];
	});
	return unsubscribe;
});

function buildBookmarkStats() {
	const total = bookmarks.length;
	const byType: Record<string, number> = {};
	for (const bm of bookmarks) {
		const type = bm.type ?? 'unknown';
		byType[type] = (byType[type] ?? 0) + 1;
	}
	const topTypes = Object.entries(byType)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3);
	return { total, topTypes };
}

const stats = $derived(buildBookmarkStats());
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<span class="text-xs text-muted-foreground">总计书签</span>
		<span class="text-lg font-semibold">{stats.total}</span>
	</div>
	{#if stats.topTypes.length > 0}
		<div class="space-y-2">
			{#each stats.topTypes as [type, count]}
				<div class="flex items-center gap-2">
					<Badge variant="outline" class="text-[10px]">{type}</Badge>
					<Progress value={(count / stats.total) * 100} class="h-1.5 flex-1" />
					<span class="text-xs text-muted-foreground">{count}</span>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-xs text-muted-foreground text-center py-4">暂无书签数据</p>
	{/if}
</div>
