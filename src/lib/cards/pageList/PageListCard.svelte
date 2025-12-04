<script lang="ts">
/**
 * 页面列表卡片
 * 显示当前书籍的所有页面并支持跳转
 */
import { onMount, onDestroy } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Search, Grid3x3, List, Image as ImageIcon } from '@lucide/svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { thumbnailCacheStore, type ThumbnailEntry } from '$lib/stores/thumbnailCache.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import type { Page } from '$lib/types';

type ViewMode = 'list' | 'grid' | 'thumb';

interface PageItem {
	index: number;
	name: string;
	path: string;
}

let items = $state<PageItem[]>([]);
let thumbnailSnapshot = $state<Map<number, ThumbnailEntry>>(new Map());
let unsubscribeThumbnailCache: (() => void) | null = null;
let searchQuery = $state('');
let viewMode = $state<ViewMode>('list');

const filteredItems = $derived(
	searchQuery.trim()
		? items.filter((item) => {
				const q = searchQuery.toLowerCase();
				return item.name.toLowerCase().includes(q) || (item.index + 1).toString().includes(q);
			})
		: items
);

const currentPageIndex = $derived(bookStore.currentPageIndex);

// 监听书籍变化
$effect(() => {
	const book = bookStore.currentBook;
	if (book?.pages) {
		items = book.pages.map((page: Page, index: number) => ({
			index,
			name: page.name || `第 ${index + 1} 页`,
			path: page.path || page.url || ''
		}));
	} else {
		items = [];
	}
});

// 强制更新触发器
let updateTrigger = $state(0);

onMount(() => {
	// 订阅缩略图缓存变化
	unsubscribeThumbnailCache = thumbnailCacheStore.subscribe(() => {
		updateTrigger++;
	});
});

onDestroy(() => {
	unsubscribeThumbnailCache?.();
});

function getThumbnail(pageIndex: number): ThumbnailEntry | null {
	// 依赖 updateTrigger 触发响应式更新
	void updateTrigger;
	return thumbnailCacheStore.getThumbnail(pageIndex);
}

function goToPage(index: number) {
	bookStore.setCurrentPage(index);
}

async function requestThumbnail(pageIndex: number) {
	if (thumbnailCacheStore.hasThumbnail(pageIndex)) return;
	if (thumbnailCacheStore.isLoading(pageIndex)) return;
	
	const book = bookStore.currentBook;
	const page = book?.pages?.[pageIndex];
	if (!book || !page) return;
	
	thumbnailCacheStore.setLoading(pageIndex);
	try {
		const pagePath = page.path || page.url || '';
		const url = await thumbnailManager.getThumbnail(pagePath);
		if (url) {
			thumbnailCacheStore.setThumbnail(pageIndex, url, 0, 0);
		} else {
			thumbnailCacheStore.setFailed(pageIndex);
		}
	} catch {
		thumbnailCacheStore.setFailed(pageIndex);
	}
}
</script>

<div class="space-y-2">
	<!-- 搜索和视图切换 -->
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
			<Input
				type="text"
				placeholder="搜索页面..."
				bind:value={searchQuery}
				class="pl-7 h-7 text-xs"
			/>
		</div>
		<div class="flex gap-0.5">
			<Button
				variant={viewMode === 'list' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 w-7 p-0"
				onclick={() => (viewMode = 'list')}
			>
				<List class="h-3 w-3" />
			</Button>
			<Button
				variant={viewMode === 'grid' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 w-7 p-0"
				onclick={() => (viewMode = 'grid')}
			>
				<Grid3x3 class="h-3 w-3" />
			</Button>
			<Button
				variant={viewMode === 'thumb' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 w-7 p-0"
				onclick={() => (viewMode = 'thumb')}
			>
				<ImageIcon class="h-3 w-3" />
			</Button>
		</div>
	</div>

	<!-- 页面统计 -->
	<div class="text-[10px] text-muted-foreground">
		共 {items.length} 页 {searchQuery ? `(显示 ${filteredItems.length})` : ''}
	</div>

	<!-- 页面列表 -->
	<div class="max-h-[400px] overflow-y-auto">
		{#if filteredItems.length === 0}
			<p class="text-center text-xs text-muted-foreground py-4">
				{items.length === 0 ? '未加载书籍' : '未找到匹配的页面'}
			</p>
		{:else if viewMode === 'list'}
			<div class="space-y-0.5">
				{#each filteredItems as item (item.index)}
					<button
						class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2 {currentPageIndex === item.index ? 'bg-primary/10 text-primary' : ''}"
						onclick={() => goToPage(item.index)}
					>
						<span class="w-6 text-muted-foreground text-right">{item.index + 1}</span>
						<span class="truncate flex-1">{item.name}</span>
					</button>
				{/each}
			</div>
		{:else if viewMode === 'grid'}
			<div class="grid grid-cols-4 gap-1">
				{#each filteredItems as item (item.index)}
					<button
						class="aspect-square rounded border text-xs flex items-center justify-center hover:bg-muted transition-colors {currentPageIndex === item.index ? 'border-primary bg-primary/10' : ''}"
						onclick={() => goToPage(item.index)}
					>
						{item.index + 1}
					</button>
				{/each}
			</div>
		{:else}
			<div class="grid grid-cols-3 gap-1">
				{#each filteredItems as item (item.index)}
					{@const thumb = getThumbnail(item.index)}
					<button
						class="aspect-3/4 rounded border overflow-hidden relative hover:ring-2 ring-primary transition-all {currentPageIndex === item.index ? 'ring-2 ring-primary' : ''}"
						onclick={() => goToPage(item.index)}
						onmouseenter={() => requestThumbnail(item.index)}
					>
						{#if thumb?.url}
							<img src={thumb.url} alt="" class="w-full h-full object-cover" />
						{:else}
							<div class="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
								{item.index + 1}
							</div>
						{/if}
						<span class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 truncate">
							{item.index + 1}
						</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
