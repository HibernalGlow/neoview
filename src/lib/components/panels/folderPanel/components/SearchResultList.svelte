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

// 加载缩略图 - 参考 FolderStack 的优化实现
$effect(() => {
	const results = $searchResults;
	if (results.length === 0) return;

	// 过滤出需要缩略图的项目
	const itemsNeedingThumbnails = results.filter((item) => {
		const name = item.name.toLowerCase();
		const isDir = item.isDir;

		// 支持的图片扩展名
		const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.jxl', '.tiff', '.tif'];
		// 支持的压缩包扩展名
		const archiveExts = ['.zip', '.rar', '.7z', '.cbz', '.cbr', '.cb7'];
		// 支持的视频扩展名
		const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg'];

		const ext = name.substring(name.lastIndexOf('.'));

		// 文件夹或支持的文件类型
		return isDir || imageExts.includes(ext) || archiveExts.includes(ext) || videoExts.includes(ext);
	});

	// 预加载数据库索引
	const paths = itemsNeedingThumbnails.map((item) => item.path);
	thumbnailManager.preloadDbIndex(paths).catch((err) => {
		console.debug('预加载数据库索引失败:', err);
	});

	// 为所有项目加载缩略图
	itemsNeedingThumbnails.forEach((item) => {
		if (item.isDir) {
			// 文件夹
			thumbnailManager.getThumbnail(item.path, undefined, false, 'normal');
		} else {
			// 文件：检查是否为压缩包
			const nameLower = item.name.toLowerCase();
			const isArchive =
				nameLower.endsWith('.zip') ||
				nameLower.endsWith('.cbz') ||
				nameLower.endsWith('.rar') ||
				nameLower.endsWith('.cbr') ||
				nameLower.endsWith('.7z') ||
				nameLower.endsWith('.cb7');

			thumbnailManager.getThumbnail(item.path, undefined, isArchive, 'normal');
		}
	});
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
