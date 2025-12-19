<script lang="ts">
/**
 * 页面列表卡片
 * 显示当前书籍的所有页面并支持跳转
 * 使用简单的虚拟滚动 + ListSlider 纵向滑块
 */
import { onMount, onDestroy } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Search, Grid3x3, List, Image as ImageIcon } from '@lucide/svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { thumbnailCacheStore, type ThumbnailEntry } from '$lib/stores/thumbnailCache.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import type { Page } from '$lib/types';
import PageContextMenu from './PageContextMenu.svelte';
import ListSlider from '$lib/components/panels/file/components/ListSlider.svelte';

type ViewMode = 'list' | 'grid' | 'thumb';

interface PageItem {
	index: number;
	name: string;
	path: string;
	innerPath?: string;
}

let items = $state<PageItem[]>([]);
let unsubscribeThumbnailCache: (() => void) | null = null;
let searchQuery = $state('');
let viewMode = $state<ViewMode>('list');
let scrollContainer: HTMLDivElement | undefined = $state();

// 虚拟滚动状态
let scrollTop = $state(0);
let containerHeight = $state(300);
let scrollProgress = $state(0);
let updateTrigger = $state(0);

// 右键菜单状态
let contextMenu = $state<{
	visible: boolean;
	x: number;
	y: number;
	item: PageItem | null;
}>({
	visible: false,
	x: 0,
	y: 0,
	item: null
});

function handleContextMenu(event: MouseEvent, item: PageItem) {
	event.preventDefault();
	contextMenu = { visible: true, x: event.clientX, y: event.clientY, item };
}

function closeContextMenu() {
	contextMenu = { ...contextMenu, visible: false, item: null };
}

const filteredItems = $derived(
	searchQuery.trim()
		? items.filter((item) => {
				const q = searchQuery.toLowerCase();
				return item.name.toLowerCase().includes(q) || (item.index + 1).toString().includes(q);
			})
		: items
);

const currentPageIndex = $derived(bookStore.currentPageIndex);

// 超分状态
const upscaleEnabled = $derived(upscaleStore.enabled);
const imagePoolVersion = $derived(imagePool.version);
const upscaleStoreVersion = $derived(upscaleStore.version);

function isPageUpscaled(pageIndex: number): boolean {
	void imagePoolVersion;
	return imagePool.hasUpscaled(pageIndex);
}

type UpscaleStatusType = 'none' | 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';

function getPageUpscaleStatus(pageIndex: number): UpscaleStatusType {
	void imagePoolVersion;
	void upscaleStoreVersion;
	if (!upscaleEnabled) return 'none';
	if (imagePool.hasUpscaled(pageIndex)) return 'completed';
	const status = upscaleStore.getPageStatus(pageIndex);
	if (status === 'pending' || status === 'checking') return 'pending';
	if (status === 'processing') return 'processing';
	if (status === 'skipped') return 'skipped';
	if (status === 'failed') return 'failed';
	return 'none';
}

function getPageConditionName(pageIndex: number): string | null {
	void upscaleStoreVersion;
	if (!upscaleEnabled) return null;
	return upscaleStore.getPageConditionName(pageIndex);
}

const statusConfig: Record<UpscaleStatusType, { label: string; class: string } | null> = {
	'none': null,
	'pending': { label: '队列中', class: 'bg-amber-500/80 text-white' },
	'processing': { label: '处理中', class: 'bg-blue-500/80 text-white animate-pulse' },
	'completed': { label: '已超分', class: 'bg-green-500/80 text-white' },
	'skipped': { label: '已跳过', class: 'bg-gray-500/80 text-white' },
	'failed': { label: '失败', class: 'bg-red-500/80 text-white' },
};

// 虚拟滚动计算
const itemHeight = $derived(viewMode === 'list' ? 32 : viewMode === 'grid' ? 72 : 100);
const columns = $derived(viewMode === 'thumb' ? 3 : 1);
const rowCount = $derived(Math.ceil(filteredItems.length / columns));
const totalHeight = $derived(rowCount * itemHeight);
const overscan = 3;

// 计算可见范围
const startRow = $derived(Math.max(0, Math.floor(scrollTop / itemHeight) - overscan));
const endRow = $derived(Math.min(rowCount - 1, Math.floor((scrollTop + containerHeight) / itemHeight) + overscan));
const visibleRows = $derived.by(() => {
	const rows: number[] = [];
	for (let i = startRow; i <= endRow; i++) {
		rows.push(i);
	}
	return rows;
});

const visibleStart = $derived(startRow * columns);
const visibleEnd = $derived(Math.min((endRow + 1) * columns - 1, filteredItems.length - 1));
const showSlider = $derived(filteredItems.length > 5);

// ResizeObserver
let resizeObserver: ResizeObserver | null = null;

onMount(() => {
	unsubscribeThumbnailCache = thumbnailCacheStore.subscribe(() => {
		updateTrigger++;
	});
});

onDestroy(() => {
	unsubscribeThumbnailCache?.();
	resizeObserver?.disconnect();
});

$effect(() => {
	if (scrollContainer) {
		containerHeight = scrollContainer.clientHeight || 300;
		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				containerHeight = entry.contentRect.height || 300;
			}
		});
		resizeObserver.observe(scrollContainer);
	}
});

// 监听书籍变化
$effect(() => {
	const book = bookStore.currentBook;
	if (book?.pages) {
		items = book.pages.map((page: Page, index: number) => ({
			index,
			name: page.name || `第 ${index + 1} 页`,
			path: page.path || '',
			innerPath: page.innerPath
		}));
	} else {
		items = [];
	}
});

function getThumbnail(pageIndex: number): ThumbnailEntry | null {
	void updateTrigger;
	return thumbnailCacheStore.getThumbnail(pageIndex);
}

function goToPage(index: number) {
	bookStore.goToPage(index);
}

function handleScroll() {
	if (!scrollContainer) return;
	scrollTop = scrollContainer.scrollTop;
	const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
	scrollProgress = maxScroll > 0 ? scrollTop / maxScroll : 0;
}

function handleSliderJump(index: number) {
	if (index < 0 || index >= filteredItems.length) return;
	const item = filteredItems[index];
	if (item) goToPage(item.index);
}

function handleSliderScroll(progress: number) {
	if (!scrollContainer) return;
	const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
	scrollContainer.scrollTop = progress * maxScroll;
}

async function requestThumbnail(pageIndex: number) {
	if (thumbnailCacheStore.hasThumbnail(pageIndex)) return;
	if (thumbnailCacheStore.isLoading(pageIndex)) return;
	const book = bookStore.currentBook;
	const page = book?.pages?.[pageIndex];
	if (!book || !page) return;
	thumbnailCacheStore.setLoading(pageIndex);
	try {
		const pagePath = page.path || '';
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

// 获取行内的项目
function getRowItems(rowIndex: number): PageItem[] {
	const result: PageItem[] = [];
	for (let col = 0; col < columns; col++) {
		const idx = rowIndex * columns + col;
		if (idx < filteredItems.length) {
			result.push(filteredItems[idx]);
		}
	}
	return result;
}
</script>

<div class="flex flex-col h-full space-y-2">
	<!-- 搜索和视图切换 -->
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
			<Input type="text" placeholder="搜索页面..." bind:value={searchQuery} class="pl-7 h-7 text-xs" />
		</div>
		<div class="flex gap-0.5">
			<Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" class="h-7 w-7 p-0" onclick={() => (viewMode = 'list')}>
				<List class="h-3 w-3" />
			</Button>
			<Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" class="h-7 w-7 p-0" onclick={() => (viewMode = 'grid')}>
				<Grid3x3 class="h-3 w-3" />
			</Button>
			<Button variant={viewMode === 'thumb' ? 'default' : 'ghost'} size="sm" class="h-7 w-7 p-0" onclick={() => (viewMode = 'thumb')}>
				<ImageIcon class="h-3 w-3" />
			</Button>
		</div>
	</div>

	<!-- 页面统计 -->
	<div class="text-[10px] text-muted-foreground">
		共 {items.length} 页 {searchQuery ? `(显示 ${filteredItems.length})` : ''}
	</div>

	<!-- 页面列表 + 侧边滑块 -->
	<div class="flex-1 min-h-0 flex">
		<div bind:this={scrollContainer} class="flex-1 overflow-y-auto" onscroll={handleScroll}>
			{#if filteredItems.length === 0}
				<p class="text-center text-xs text-muted-foreground py-4">
					{items.length === 0 ? '未加载书籍' : '未找到匹配的页面'}
				</p>
			{:else}
				<!-- 虚拟滚动容器 -->
				<div style="height: {totalHeight}px; position: relative;">
					{#each visibleRows as rowIndex (rowIndex)}
						{@const rowItems = getRowItems(rowIndex)}
						<div style="position: absolute; top: {rowIndex * itemHeight}px; left: 0; right: 0; height: {itemHeight}px; display: flex;">
							{#each rowItems as item (item.index)}
								{@const isUpscaled = upscaleEnabled && isPageUpscaled(item.index)}
								{@const isCurrentAndUpscaled = currentPageIndex === item.index && isUpscaled}
								{@const upscaleStatus = getPageUpscaleStatus(item.index)}
								{@const statusCfg = statusConfig[upscaleStatus]}
								{@const conditionName = getPageConditionName(item.index)}
								{@const thumb = getThumbnail(item.index)}

								{#if viewMode === 'list'}
									<button
										data-page-index={item.index}
										class="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted transition-colors flex items-center gap-2 {currentPageIndex === item.index ? 'bg-primary/10' : ''} {isCurrentAndUpscaled ? 'upscaled-glow' : ''}"
										onclick={() => goToPage(item.index)}
										oncontextmenu={(e) => handleContextMenu(e, item)}
									>
										<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
										<span class="truncate flex-1">{item.name}</span>
										{#if conditionName}
											<span class="px-1 py-0.5 text-[10px] font-medium rounded shrink-0 bg-purple-500/80 text-white">{conditionName}</span>
										{/if}
										{#if statusCfg}
											<span class="px-1 py-0.5 text-[10px] font-medium rounded shrink-0 {statusCfg.class}">{statusCfg.label}</span>
										{/if}
										{#if currentPageIndex === item.index}
											<span class="px-1 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded shrink-0">当前</span>
										{/if}
									</button>
								{:else if viewMode === 'grid'}
									<button
										data-page-index={item.index}
										class="w-full text-left p-1 rounded hover:bg-muted transition-colors flex items-center gap-2 {currentPageIndex === item.index ? 'bg-primary/10' : ''} {isCurrentAndUpscaled ? 'upscaled-glow' : ''}"
										onclick={() => goToPage(item.index)}
										oncontextmenu={(e) => handleContextMenu(e, item)}
										onmouseenter={() => requestThumbnail(item.index)}
									>
										<div class="w-10 h-14 rounded bg-muted flex items-center justify-center overflow-hidden relative shrink-0">
											{#if thumb?.url}
												<img src={thumb.url} alt="" class="absolute inset-0 w-full h-full object-contain" />
											{:else if thumbnailCacheStore.isLoading(item.index)}
												<div class="w-3 h-3 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
											{:else}
												<ImageIcon class="h-4 w-4 text-muted-foreground" />
											{/if}
										</div>
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-1 flex-wrap">
												<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
												{#if statusCfg}
													<span class="px-1 py-0.5 text-[10px] font-medium rounded {statusCfg.class}">{statusCfg.label}</span>
												{/if}
												{#if currentPageIndex === item.index}
													<span class="px-1 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded">当前</span>
												{/if}
											</div>
											<div class="text-[10px] truncate text-muted-foreground">{item.name}</div>
										</div>
									</button>
								{:else}
									<div class="flex-1 p-0.5">
										<button
											data-page-index={item.index}
											class="w-full flex flex-col gap-0.5 p-1 rounded hover:bg-muted transition-colors {currentPageIndex === item.index ? 'ring-2 ring-primary' : ''} {isCurrentAndUpscaled ? 'upscaled-glow-grid' : ''}"
											onclick={() => goToPage(item.index)}
											oncontextmenu={(e) => handleContextMenu(e, item)}
											onmouseenter={() => requestThumbnail(item.index)}
										>
											<div class="bg-muted rounded overflow-hidden relative w-full aspect-[3/4] flex items-center justify-center">
												{#if thumb?.url}
													<img src={thumb.url} alt="" class="absolute inset-0 w-full h-full object-contain" />
												{:else if thumbnailCacheStore.isLoading(item.index)}
													<div class="w-4 h-4 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
												{:else}
													<ImageIcon class="h-5 w-5 text-muted-foreground" />
												{/if}
											</div>
											<div class="flex items-center gap-1 justify-center">
												<span class="text-[9px] font-mono font-semibold text-primary">#{item.index + 1}</span>
												{#if currentPageIndex === item.index}
													<span class="px-0.5 text-[8px] font-semibold bg-primary text-primary-foreground rounded">当前</span>
												{/if}
											</div>
										</button>
									</div>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{#if showSlider}
			<div class="h-full">
				<ListSlider
					totalItems={filteredItems.length}
					currentIndex={(() => {
						const idx = filteredItems.findIndex(i => i.index === currentPageIndex);
						return idx >= 0 ? idx : 0;
					})()}
					{visibleStart}
					{visibleEnd}
					{scrollProgress}
					onJumpToIndex={handleSliderJump}
					onScrollToProgress={handleSliderScroll}
				/>
			</div>
		{/if}
	</div>
</div>

<PageContextMenu
	item={contextMenu.item}
	x={contextMenu.x}
	y={contextMenu.y}
	visible={contextMenu.visible}
	onClose={closeContextMenu}
	onGoToPage={goToPage}
/>

<style>
	:global(.upscaled-glow) {
		box-shadow: 0 0 0 1.5px hsl(var(--primary)), 0 0 8px hsl(var(--primary) / 0.5), 0 0 16px hsl(var(--primary) / 0.3);
		animation: upscaled-pulse 2s ease-in-out infinite;
	}
	:global(.upscaled-glow-grid) {
		box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 10px hsl(var(--primary) / 0.6), 0 0 20px hsl(var(--primary) / 0.3);
		animation: upscaled-pulse 2s ease-in-out infinite;
	}
	@keyframes upscaled-pulse {
		0%, 100% { box-shadow: 0 0 0 1.5px hsl(var(--primary)), 0 0 8px hsl(var(--primary) / 0.5), 0 0 16px hsl(var(--primary) / 0.3); }
		50% { box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 12px hsl(var(--primary) / 0.7), 0 0 24px hsl(var(--primary) / 0.4); }
	}
</style>
