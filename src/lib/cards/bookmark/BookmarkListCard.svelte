<script lang="ts">
/**
 * 书签列表卡片
 * 简化版书签列表
 */
import { onMount } from 'svelte';
import { Bookmark, Trash2, Search, Star } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { bookmarkStore } from '$lib/stores/bookmark.svelte';
import { openFileSystemItem } from '$lib/utils/navigationUtils';

interface BookmarkEntry {
	id: string;
	path: string;
	name: string;
	type: 'file' | 'folder';
	createdAt: Date;
}

let bookmarks = $state<BookmarkEntry[]>([]);
let searchQuery = $state('');

const filteredBookmarks = $derived(
	searchQuery.trim()
		? bookmarks.filter(
				(entry) =>
					entry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
					entry.path.toLowerCase().includes(searchQuery.toLowerCase())
			)
		: bookmarks
);

onMount(() => {
	const unsubscribe = bookmarkStore.subscribe((entries: BookmarkEntry[]) => {
		bookmarks = entries;
	});
	return unsubscribe;
});

async function openEntry(entry: BookmarkEntry) {
	await openFileSystemItem(entry.path, entry.type === 'folder');
}

function removeEntry(entry: BookmarkEntry, e: MouseEvent) {
	e.stopPropagation();
	bookmarkStore.remove(entry.id);
}

function clearBookmarks() {
	if (confirm('确定要清空所有书签吗？')) {
		bookmarkStore.clear();
	}
}

function formatTime(date: Date): string {
	return new Date(date).toLocaleDateString();
}
</script>

<div class="flex flex-col h-full space-y-2">
	<!-- 搜索和操作 -->
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
			<Input
				type="text"
				placeholder="搜索书签..."
				bind:value={searchQuery}
				class="pl-7 h-7 text-xs"
			/>
		</div>
		<Button variant="ghost" size="sm" class="h-7 w-7 p-0" onclick={clearBookmarks} title="清空书签">
			<Trash2 class="h-3 w-3" />
		</Button>
	</div>

	<!-- 统计 -->
	<div class="text-[10px] text-muted-foreground">
		共 {bookmarks.length} 个 {searchQuery ? `(显示 ${filteredBookmarks.length})` : ''}
	</div>

	<!-- 列表 -->
	<div class="flex-1 min-h-0 overflow-y-auto space-y-0.5">
		{#if filteredBookmarks.length === 0}
			<p class="text-center text-xs text-muted-foreground py-4">
				{bookmarks.length === 0 ? '暂无书签' : '未找到匹配的书签'}
			</p>
		{:else}
			{#each filteredBookmarks.slice(0, 50) as entry (entry.path)}
				<div
					class="px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2 group cursor-pointer"
					onclick={() => openEntry(entry)}
					onkeydown={(e) => e.key === 'Enter' && openEntry(entry)}
					role="button"
					tabindex="0"
				>
					<Star class="h-3 w-3 text-yellow-500 shrink-0" />
					<div class="flex-1 min-w-0">
						<div class="truncate font-medium">{entry.name}</div>
						<div class="text-[10px] text-muted-foreground">{formatTime(entry.createdAt)}</div>
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
			{#if filteredBookmarks.length > 50}
				<p class="text-center text-[10px] text-muted-foreground py-2">
					显示前 50 个，共 {filteredBookmarks.length} 个
				</p>
			{/if}
		{/if}
	</div>
</div>
