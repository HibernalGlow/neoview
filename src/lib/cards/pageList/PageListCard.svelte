<script lang="ts">
/**
 * 页面列表卡片
 * 显示当前书籍的所有页面并支持跳转
 */
import { onMount, onDestroy } from 'svelte';
import { Button } from '$lib/components/ui/button';
import { Input } from '$lib/components/ui/input';
import { Slider } from '$lib/components/ui/slider';
import { Search, Grid3x3, List, Image as ImageIcon, Navigation } from '@lucide/svelte';
import { bookStore } from '$lib/stores/book.svelte';
import { thumbnailCacheStore, type ThumbnailEntry } from '$lib/stores/thumbnailCache.svelte';
import { thumbnailManager } from '$lib/utils/thumbnailManager';
import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
import { settingsManager } from '$lib/settings/settingsManager';
import type { Page } from '$lib/types';
import PageContextMenu from './PageContextMenu.svelte';
import PageIndexBadge from './PageIndexBadge.svelte';

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
let scrollContainer: HTMLDivElement | undefined;

// 跟随进度条跳转设置
let followProgress = $state(settingsManager.getSettings().panels?.pageListFollowProgress ?? true);

// 监听设置变化
settingsManager.addListener((newSettings) => {
	followProgress = newSettings.panels?.pageListFollowProgress ?? true;
});

function toggleFollowProgress() {
	const newValue = !followProgress;
	settingsManager.updateNestedSettings('panels', {
		pageListFollowProgress: newValue
	});
	followProgress = newValue;
}



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
	contextMenu = {
		visible: true,
		x: event.clientX,
		y: event.clientY,
		item
	};
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
const upscaleEnabled = $derived(upscaleStore.enabled);
const imagePoolVersion = $derived(imagePool.version);

function isPageUpscaled(pageIndex: number): boolean {
	void imagePoolVersion;
	return imagePool.hasUpscaled(pageIndex);
}

// 预览页码（用于关闭跟随时显示 Slider 位置）
let previewIndex = $state<number | null>(null);

// 当前显示的页码（跟随模式用实际页码，否则用预览页码）
const displayIndex = $derived(followProgress ? currentPageIndex : (previewIndex ?? currentPageIndex));

// 自动滚动到当前页（受 followProgress 控制）
$effect(() => {
	const idx = followProgress ? currentPageIndex : previewIndex;
	if (idx === null || idx < 0 || !scrollContainer) return;
	requestAnimationFrame(() => {
		const el = scrollContainer?.querySelector(`[data-page-index="${idx}"]`) as HTMLElement | null;
		if (el) {
			el.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}
	});
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

let updateTrigger = $state(0);

onMount(() => {
	unsubscribeThumbnailCache = thumbnailCacheStore.subscribe(() => {
		updateTrigger++;
	});
});

onDestroy(() => {
	unsubscribeThumbnailCache?.();
});

function getThumbnail(pageIndex: number): ThumbnailEntry | null {
	void updateTrigger;
	return thumbnailCacheStore.getThumbnail(pageIndex);
}

function goToPage(index: number) {
	bookStore.goToPage(index);
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
		<!-- 跟随进度开关 -->
		<Button
			variant={followProgress ? 'default' : 'ghost'}
			size="sm"
			class="h-7 w-7 p-0"
			onclick={toggleFollowProgress}
			title={followProgress ? '跟随进度：开' : '跟随进度：关'}
		>
			<Navigation class="h-3 w-3" />
		</Button>
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
	<div class="flex-1 min-h-0 overflow-y-auto" bind:this={scrollContainer}>
		{#key viewMode}
		{#if filteredItems.length === 0}
			<p class="text-center text-xs text-muted-foreground py-4">
				{items.length === 0 ? '未加载书籍' : '未找到匹配的页面'}
			</p>
		{:else if viewMode === 'list'}
			<!-- 纯文本列表 -->
			<div class="space-y-0.5">
				{#each filteredItems as item (item.index)}
					{@const isUpscaled = upscaleEnabled && isPageUpscaled(item.index)}
					{@const isCurrentAndUpscaled = currentPageIndex === item.index && isUpscaled}
					<button
						data-page-index={item.index}
						class="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors {currentPageIndex === item.index ? 'bg-primary/10' : ''} {isCurrentAndUpscaled ? 'upscaled-glow' : ''}"
						onclick={() => goToPage(item.index)}
						oncontextmenu={(e) => handleContextMenu(e, item)}
					>
						<PageIndexBadge
							pageIndex={item.index}
							showName={true}
							name={item.name}
							isCurrent={currentPageIndex === item.index}
						/>
					</button>
				{/each}
			</div>
		{:else if viewMode === 'grid'}
			<!-- 带缩略图的列表 -->
			<div class="space-y-1">
				{#each filteredItems as item (item.index)}
					{@const thumb = getThumbnail(item.index)}
					{@const isUpscaled = upscaleEnabled && isPageUpscaled(item.index)}
					{@const isCurrentAndUpscaled = currentPageIndex === item.index && isUpscaled}
					<button
						data-page-index={item.index}
						class="w-full text-left p-1.5 rounded hover:bg-muted transition-colors flex items-center gap-2 {currentPageIndex === item.index ? 'bg-primary/10' : ''} {isCurrentAndUpscaled ? 'upscaled-glow' : ''}"
						onclick={() => goToPage(item.index)}
						oncontextmenu={(e) => handleContextMenu(e, item)}
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
							<PageIndexBadge
								pageIndex={item.index}
								isCurrent={currentPageIndex === item.index}
							/>
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
					{@const isUpscaled = upscaleEnabled && isPageUpscaled(item.index)}
					{@const isCurrentAndUpscaled = currentPageIndex === item.index && isUpscaled}
					<button
						data-page-index={item.index}
						class="flex flex-col gap-1 p-1 rounded hover:bg-muted transition-colors {currentPageIndex === item.index ? 'ring-2 ring-primary' : ''} {isCurrentAndUpscaled ? 'upscaled-glow-grid' : ''}"
						onclick={() => goToPage(item.index)}
						oncontextmenu={(e) => handleContextMenu(e, item)}
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
						<PageIndexBadge
							pageIndex={item.index}
							isCurrent={currentPageIndex === item.index}
							size="sm"
						/>
					</button>
				{/each}
			</div>
		{/if}
		{/key}
	</div>

	<!-- 底部固定 Slider -->
	{#if items.length > 1}
		<div class="flex items-center gap-2 pt-2 border-t border-border shrink-0">
			<span class="text-[10px] text-muted-foreground font-mono w-6 text-right">{displayIndex + 1}</span>
			<Slider
				type="single"
				value={displayIndex}
				min={0}
				max={items.length - 1}
				step={1}
				class="flex-1"
				onValueChange={(v: number) => {
					if (followProgress) {
						// 跟随模式：直接翻页
						if (v !== currentPageIndex) {
							goToPage(v);
						}
					} else {
						// 预览模式：只更新预览位置，不翻页
						previewIndex = v;
					}
				}}
			/>
			<span class="text-[10px] text-muted-foreground font-mono w-6">{items.length}</span>
		</div>
	{/if}
</div>

<!-- 右键菜单 -->
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
		0%, 100% {
			box-shadow: 0 0 0 1.5px hsl(var(--primary)), 0 0 8px hsl(var(--primary) / 0.5), 0 0 16px hsl(var(--primary) / 0.3);
		}
		50% {
			box-shadow: 0 0 0 2px hsl(var(--primary)), 0 0 12px hsl(var(--primary) / 0.7), 0 0 24px hsl(var(--primary) / 0.4);
		}
	}
</style>
