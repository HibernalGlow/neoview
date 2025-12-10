<script lang="ts">
/**
 * 来源拆分卡片
 */
import { unifiedHistoryStore, type UnifiedHistoryEntry } from '$lib/stores/unifiedHistory.svelte';
import { Progress } from '$lib/components/ui/progress';

let historyEntries = $state<UnifiedHistoryEntry[]>([]);

$effect(() => {
	const unsubscribe = unifiedHistoryStore.subscribe((value) => {
		historyEntries = value ?? [];
	});
	return unsubscribe;
});

function buildSourceStats() {
	const bySource: Record<string, number> = {};
	for (const entry of historyEntries) {
		// 从路径推断来源类型
		const path = entry.pathStack?.[0]?.path || '';
		let source = '本地';
		if (path.includes('.zip') || path.includes('.cbz') || path.includes('.cbr') || path.includes('.rar')) {
			source = '压缩包';
		} else if (path.includes('.pdf')) {
			source = 'PDF';
		}
		bySource[source] = (bySource[source] ?? 0) + 1;
	}
	const total = historyEntries.length;
	const sorted = Object.entries(bySource)
		.sort((a, b) => b[1] - a[1])
		.map(([source, count]) => ({
			source,
			count,
			percent: total > 0 ? Math.round((count / total) * 100) : 0
		}));
	return { sorted, total };
}

const stats = $derived(buildSourceStats());
</script>

<div class="space-y-3">
	{#if stats.sorted.length > 0}
		{#each stats.sorted as item}
			<div class="space-y-1">
				<div class="flex items-center justify-between text-xs">
					<span>{item.source}</span>
					<span class="text-muted-foreground">{item.count} ({item.percent}%)</span>
				</div>
				<Progress value={item.percent} class="h-1.5" />
			</div>
		{/each}
	{:else}
		<p class="text-xs text-muted-foreground text-center py-4">暂无来源数据</p>
	{/if}
</div>
