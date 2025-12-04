<script lang="ts">
/**
 * 历史记录卡片
 * 简化版历史记录列表
 */
import { onMount } from 'svelte';
import { Clock, Trash2, ExternalLink, Search } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { historyStore, type HistoryEntry } from '$lib/stores/history.svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { openFileSystemItem } from '$lib/utils/navigationUtils';

let history = $state<HistoryEntry[]>([]);
let searchQuery = $state('');

const filteredHistory = $derived(
	searchQuery.trim()
		? history.filter(
				(entry) =>
					entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					entry.path.toLowerCase().includes(searchQuery.toLowerCase())
			)
		: history
);

onMount(() => {
	const unsubscribe = historyStore.subscribe((entries) => {
		history = entries;
	});
	return unsubscribe;
});

async function openEntry(entry: HistoryEntry) {
	await openFileSystemItem(entry.path, false);
}

function removeEntry(entry: HistoryEntry, e: MouseEvent) {
	e.stopPropagation();
	historyStore.remove(entry.id);
}

function clearHistory() {
	if (confirm('确定要清空所有历史记录吗？')) {
		historyStore.clear();
	}
}

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	
	if (diff < 60000) return '刚刚';
	if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
	if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
	return date.toLocaleDateString();
}
</script>

<div class="flex flex-col h-full space-y-2">
	<!-- 搜索和操作 -->
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
			<Input
				type="text"
				placeholder="搜索历史..."
				bind:value={searchQuery}
				class="pl-7 h-7 text-xs"
			/>
		</div>
		<Button variant="ghost" size="sm" class="h-7 w-7 p-0" onclick={clearHistory} title="清空历史">
			<Trash2 class="h-3 w-3" />
		</Button>
	</div>

	<!-- 统计 -->
	<div class="text-[10px] text-muted-foreground">
		共 {history.length} 条 {searchQuery ? `(显示 ${filteredHistory.length})` : ''}
	</div>

	<!-- 列表 -->
	<div class="flex-1 min-h-0 overflow-y-auto space-y-0.5">
		{#if filteredHistory.length === 0}
			<p class="text-center text-xs text-muted-foreground py-4">
				{history.length === 0 ? '暂无历史记录' : '未找到匹配的记录'}
			</p>
		{:else}
			{#each filteredHistory.slice(0, 50) as entry (entry.path)}
				<div
					class="px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2 group cursor-pointer"
					onclick={() => openEntry(entry)}
					onkeydown={(e) => e.key === 'Enter' && openEntry(entry)}
					role="button"
					tabindex="0"
				>
					<Clock class="h-3 w-3 text-muted-foreground shrink-0" />
					<div class="flex-1 min-w-0">
						<div class="truncate font-medium">{entry.name}</div>
						<div class="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</div>
					</div>
					<button
						class="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded flex items-center justify-center"
						onclick={(e) => removeEntry(entry, e)}
						title="删除"
					>
						<Trash2 class="h-3 w-3 text-destructive" />
					</button>
				</div>
			{/each}
			{#if filteredHistory.length > 50}
				<p class="text-center text-[10px] text-muted-foreground py-2">
					显示前 50 条，共 {filteredHistory.length} 条
				</p>
			{/if}
		{/if}
	</div>
</div>
