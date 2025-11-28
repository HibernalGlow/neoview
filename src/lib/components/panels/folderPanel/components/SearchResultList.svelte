<script lang="ts">
/**
 * SearchResultList - 搜索结果列表组件
 * 显示后端搜索返回的文件列表
 */
import type { FsItem } from '$lib/types';
import { searchResults, isSearching, searchKeyword, viewStyle } from '../stores/folderPanelStore.svelte';
import { Loader2, Search, FolderOpen } from '@lucide/svelte';
import FileItemCard from '$lib/components/panels/file/components/FileItemCard.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';

interface Props {
	onItemClick?: (item: FsItem) => void | Promise<void>;
	onItemDoubleClick?: (item: FsItem) => void | Promise<void>;
	onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
}

let { 
	onItemClick = () => {}, 
	onItemDoubleClick = () => {}, 
	onItemContextMenu = () => {} 
}: Props = $props();

// 缩略图
let thumbnails = $derived(fileBrowserStore.getState().thumbnails);

// 视图模式
let viewMode = $derived(($viewStyle === 'thumbnail' ? 'grid' : 'list') as 'list' | 'grid');

// 加载缩略图
$effect(() => {
	const results = $searchResults;
	for (const item of results) {
		if (!item.isDir) {
			const key = item.path.replace(/\\/g, '/');
			if (!thumbnails.has(key)) {
				thumbnailManager.getThumbnail(item.path, undefined, false, 'normal').then((url) => {
					if (url) {
						fileBrowserStore.addThumbnail(key, url);
					}
				});
			}
		}
	}
});
</script>

<div class="search-result-list h-full overflow-auto">
	{#if $isSearching}
		<div class="flex flex-col items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-muted-foreground mb-4" />
			<p class="text-muted-foreground">正在搜索...</p>
		</div>
	{:else if $searchResults.length === 0 && $searchKeyword}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<Search class="h-12 w-12 text-muted-foreground/50 mb-4" />
			<p class="text-muted-foreground">未找到匹配的文件</p>
			<p class="text-muted-foreground/70 text-sm mt-1">搜索词: "{$searchKeyword}"</p>
		</div>
	{:else if $searchResults.length > 0}
		<div class="p-2">
			<div class="text-muted-foreground text-xs mb-2 px-2">
				找到 {$searchResults.length} 个结果
			</div>
			{#each $searchResults as item (item.path)}
				<FileItemCard
					{item}
					thumbnail={thumbnails.get(item.path.replace(/\\/g, '/'))}
					viewMode={viewMode}
					onClick={() => onItemClick?.(item)}
					onDoubleClick={() => onItemDoubleClick?.(item)}
					onContextMenu={(e) => onItemContextMenu?.(e, item)}
				/>
			{/each}
		</div>
	{:else}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<FolderOpen class="h-12 w-12 text-muted-foreground/50 mb-4" />
			<p class="text-muted-foreground">输入关键词开始搜索</p>
		</div>
	{/if}
</div>
