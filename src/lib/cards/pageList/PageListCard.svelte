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

<div class="flex flex-col h-full space-y-2">
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
	<div class="flex-1 min-h-0 overflow-y-auto">
		{#if filteredItems.length === 0}
			<p class="text-center text-xs text-muted-foreground py-4">
				{items.length === 0 ? '未加载书籍' : '未找到匹配的页面'}
			</p>
		{:else if viewMode === 'list'}
			<!-- 纯文本列表 -->
			<div class="space-y-0.5">
				{#each filteredItems as item (item.index)}
					<button
						class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2 {currentPageIndex === item.index ? 'bg-primary/10' : ''}"
						onclick={() => goToPage(item.index)}
					>
						<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
						<span class="truncate flex-1">{item.name}</span>
						{#if currentPageIndex === item.index}
							<span class="px-1 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded shrink-0">当前</span>
						{/if}
					</button>
				{/each}
			</div>
		{:else if viewMode === 'grid'}
			<!-- 带缩略图的列表 -->
			<div class="space-y-1">
				{#each filteredItems as item (item.index)}
					{@const thumb = getThumbnail(item.index)}
					<button
						class="w-full text-left p-1.5 rounded hover:bg-muted transition-colors flex items-center gap-2 {currentPageIndex === item.index ? 'bg-primary/10' : ''}"
						onclick={() => goToPage(item.index)}
						onmouseenter={() => requestThumbnail(item.index)}
					>
						<div class="w-12 h-16 rounded bg-muted flex items-center justify-center overflow-hidden relative shrink-0">
							{#if thumb?.url}
								<img src={thumb.url} alt="" class="absolute inset-0 w-full h-full object-contain" />
							{:else if thumbnailCacheStore.isLoading(item.index)}
								<div class="w-3 h-3 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
							{:else}
								<ImageIcon class="h-4 w-4 text-muted-foreground" />
							{/if}
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-1">
								<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
								{#if currentPageIndex === item.index}
									<span class="px-1 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded">当前</span>
								{/if}
							</div>
							<div class="text-xs truncate">{item.name}</div>
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<!-- 图片网格 -->
			<div class="grid grid-cols-3 gap-1">
				{#each filteredItems as item (item.index)}
					{@const thumb = getThumbnail(item.index)}
					<button
						class="flex flex-col gap-1 p-1 rounded hover:bg-muted transition-colors {currentPageIndex === item.index ? 'ring-2 ring-primary' : ''}"
						onclick={() => goToPage(item.index)}
						onmouseenter={() => requestThumbnail(item.index)}
					>
						<div class="bg-muted rounded overflow-hidden relative w-full aspect-3/4 flex items-center justify-center">
							{#if thumb?.url}
								<img src={thumb.url} alt="" class="absolute inset-0 w-full h-full object-contain" />
							{:else if thumbnailCacheStore.isLoading(item.index)}
								<div class="w-4 h-4 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
							{:else}
								<ImageIcon class="h-6 w-6 text-muted-foreground" />
							{/if}
						</div>
						<div class="flex items-center gap-1">
							<span class="text-[10px] font-mono font-semibold text-primary">#{item.index + 1}</span>
							{#if currentPageIndex === item.index}
								<span class="px-1 text-[8px] font-semibold bg-primary text-primary-foreground rounded">当前</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
