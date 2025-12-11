<script lang="ts">
/**
 * SearchResultList - 搜索结果列表组件
 * 显示后端搜索返回的文件列表，支持排序和 ListSlider
 */
import type { FsItem } from '$lib/types';
import type { Readable } from 'svelte/store';
import { tabSearchResults, tabIsSearching, tabSearchKeyword, tabViewStyle, tabSortConfig, tabThumbnailWidthPercent } from '../stores/folderTabStore.svelte';
import { Loader2, Search, FolderOpen, ArrowUpDown } from '@lucide/svelte';
import FileItemCard from '$lib/components/panels/file/components/FileItemCard.svelte';
import ListSlider from '$lib/components/panels/file/components/ListSlider.svelte';
import { fileBrowserStore } from '$lib/stores/fileBrowser.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import { Button } from '$lib/components/ui/button';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

interface Props {
	onItemClick?: (item: FsItem) => void | Promise<void>;
	onItemDoubleClick?: (item: FsItem) => void | Promise<void>;
	onItemContextMenu?: (event: MouseEvent, item: FsItem) => void;
	// 支持外部传入搜索结果（虚拟路径使用）
	externalSearchResults?: Readable<FsItem[]>;
	externalIsSearching?: Readable<boolean>;
	externalSearchKeyword?: Readable<string>;
}

let { 
	onItemClick = () => {}, 
	onItemDoubleClick = () => {}, 
	onItemContextMenu = () => {},
	externalSearchResults,
	externalIsSearching,
	externalSearchKeyword
}: Props = $props();

// 使用外部 store 或全局 store
const searchResults = externalSearchResults ?? tabSearchResults;
const isSearching = externalIsSearching ?? tabIsSearching;
const searchKeyword = externalSearchKeyword ?? tabSearchKeyword;
const viewStyle = tabViewStyle;
const sortConfig = tabSortConfig;
const thumbnailWidthPercent = tabThumbnailWidthPercent;

// 滚动状态
let scrollContainer = $state<HTMLDivElement | null>(null);
let scrollProgress = $state(0);
let visibleStart = $state(0);
let visibleEnd = $state(0);
let currentIndex = $state(0);

// 处理滚动
function handleScroll(e: Event) {
	const target = e.target as HTMLDivElement;
	const { scrollTop, scrollHeight, clientHeight } = target;
	const maxScroll = scrollHeight - clientHeight;
	scrollProgress = maxScroll > 0 ? scrollTop / maxScroll : 0;
	
	// 估算可见范围
	const itemHeight = 80; // 估算每项高度
	visibleStart = Math.floor(scrollTop / itemHeight);
	visibleEnd = Math.min(sortedResults.length - 1, Math.ceil((scrollTop + clientHeight) / itemHeight));
	currentIndex = visibleStart;
}

// 跳转到指定索引
function handleJumpToIndex(index: number) {
	if (!scrollContainer) return;
	const itemHeight = 80;
	scrollContainer.scrollTop = index * itemHeight;
	currentIndex = index;
}

// 滚动到指定百分比
function handleScrollToProgress(progress: number) {
	if (!scrollContainer) return;
	const { scrollHeight, clientHeight } = scrollContainer;
	const maxScroll = scrollHeight - clientHeight;
	scrollContainer.scrollTop = progress * maxScroll;
}

// 排序后的结果
let sortedResults = $derived.by(() => {
	const results = [...$searchResults];
	const { field, order } = $sortConfig;
	
	results.sort((a, b) => {
		// 文件夹优先
		if (a.isDir !== b.isDir) {
			return a.isDir ? -1 : 1;
		}
		
		let cmp = 0;
		switch (field) {
			case 'name':
				cmp = a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
				break;
			case 'size':
				cmp = (a.size || 0) - (b.size || 0);
				break;
			case 'date':
				cmp = (a.modified || 0) - (b.modified || 0);
				break;
			case 'type':
				const extA = a.name.includes('.') ? a.name.split('.').pop() || '' : '';
				const extB = b.name.includes('.') ? b.name.split('.').pop() || '' : '';
				cmp = extA.localeCompare(extB);
				break;
			case 'rating':
				cmp = ((a as any).rating || 0) - ((b as any).rating || 0);
				break;
			case 'path':
				cmp = a.path.localeCompare(b.path, 'zh-CN', { numeric: true });
				break;
			case 'random':
				cmp = Math.random() - 0.5;
				break;
			case 'collectTagCount':
				cmp = ((a as any).collectTagCount || 0) - ((b as any).collectTagCount || 0);
				break;
			default:
				cmp = a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
		}
		
		return order === 'asc' ? cmp : -cmp;
	});
	
	return results;
});


// 缩略图
let thumbnails = $derived(fileBrowserStore.getState().thumbnails);

// 视图模式 - 支持 list/content/banner/thumbnail 四种模式
let viewMode = $derived($viewStyle as 'list' | 'content' | 'banner' | 'thumbnail');

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
		const videoExts = ['.mp4', '.mkv', '.avi', '.mov', 'nov', '.flv', '.webm', '.wmv', '.m4v', '.mpg', '.mpeg'];

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

<div class="search-result-list flex h-full">
	<!-- 主内容区 -->
	<div 
		bind:this={scrollContainer}
		class="flex-1 overflow-auto"
		onscroll={handleScroll}
	>
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
		{:else if sortedResults.length > 0}
			<div class="p-2">
				<div class="text-muted-foreground text-xs mb-2 px-2">
					找到 {sortedResults.length} 个结果
				</div>
				<div 
					class={viewMode === 'thumbnail' ? 'grid gap-2' : 'flex flex-col gap-1'}
					style={viewMode === 'thumbnail' ? `grid-template-columns: repeat(auto-fill, minmax(${$thumbnailWidthPercent}%, 1fr))` : ''}
				>
					{#each sortedResults as item (item.path)}
						<div class="search-result-item">
							<FileItemCard
								{item}
								thumbnail={thumbnails.get(item.path.replace(/\\/g, '/'))}
								viewMode={viewMode}
								onClick={() => onItemClick?.(item)}
								onDoubleClick={() => onItemDoubleClick?.(item)}
								onContextMenu={(e) => onItemContextMenu?.(e, item)}
							/>
							<!-- 搜索结果显示完整路径 -->
							<div class="px-1 pb-1">
								<p class="text-[10px] text-muted-foreground/70 truncate" title={item.path}>
									{item.path}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<FolderOpen class="h-12 w-12 text-muted-foreground/50 mb-4" />
				<p class="text-muted-foreground">输入关键词开始搜索</p>
			</div>
		{/if}
	</div>

	<!-- ListSlider（有结果时显示） -->
	{#if sortedResults.length > 0}
		<div class="w-4 shrink-0 border-l">
			<ListSlider
				totalItems={sortedResults.length}
				{currentIndex}
				{visibleStart}
				{visibleEnd}
				{scrollProgress}
				onJumpToIndex={handleJumpToIndex}
				onScrollToProgress={handleScrollToProgress}
			/>
		</div>
	{/if}
</div>
