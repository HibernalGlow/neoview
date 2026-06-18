<script lang="ts">
	/**
	 * 页面列表卡片
	 * 显示当前书籍的所有页面并支持跳转
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Slider } from '$lib/components/ui/slider';
	import { Search, Grid3x3, List, Image as ImageIcon, Navigation, Sparkles } from '@lucide/svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import {
		unifiedThumbnailStore,
		generateThumbKey,
		type ThumbnailSource,
		type ThumbnailEntry
	} from '$lib/stores/unifiedThumbnailStore.svelte';

	import { upscaleStore } from '$lib/stackview/stores/upscaleStore.svelte';
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
	let searchQuery = $state('');
	let viewMode = $state<ViewMode>('list');
	let scrollContainer: HTMLDivElement | undefined;
	let prefetching = $state(false);
	let prefetchDone = $state(false);
	let prefetchError = $state<string | null>(null);

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
	const upscaleStoreVersion = $derived(upscaleStore.version);

	function isPageUpscaled(pageIndex: number): boolean {
		void upscaleStoreVersion;
		return upscaleStore.isPageUpscaled(pageIndex);
	}

	// 预览页码（用于关闭跟随时显示 Slider 位置）
	let previewIndex = $state<number | null>(null);

	// 当前显示的页码（跟随模式用实际页码，否则用预览页码）
	const displayIndex = $derived(
		followProgress ? currentPageIndex : (previewIndex ?? currentPageIndex)
	);

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
			prefetchDone = false;
			prefetchError = null;
		} else {
			items = [];
		}
	});

	onMount(() => {
		// unifiedThumbnailStore uses SvelteMap (reactive), no manual subscription needed
	});

	onDestroy(() => {
		// No manual cleanup needed for unifiedThumbnailStore
	});

	function getPageThumbnailSource(
		pageIndex: number
	): { source: ThumbnailSource; page: Page } | null {
		const book = bookStore.currentBook;
		const page = book?.pages?.[pageIndex];
		if (!book || !page) return null;

		const source: ThumbnailSource =
			book.type === 'archive' || book.type === 'epub'
				? {
						kind: 'archiveEntry',
						archivePath: book.path,
						innerPath: page.innerPath ?? page.path,
						entryIndex: page.entryIndex,
						fileSize: page.size
					}
				: {
						kind: 'bookPage',
						bookPath: book.path,
						pageIndex,
						pagePath: page.path,
						fileSize: page.size
					};
		return { source, page };
	}

	function getThumbnail(pageIndex: number): ThumbnailEntry | null {
		const result = getPageThumbnailSource(pageIndex);
		if (!result) return null;
		const key = generateThumbKey(result.source, 256);
		return unifiedThumbnailStore.getEntry(key);
	}

	function goToPage(index: number) {
		bookStore.goToPage(index);
	}

	async function requestThumbnail(pageIndex: number) {
		const result = getPageThumbnailSource(pageIndex);
		if (!result) return;
		const { source } = result;
		const key = generateThumbKey(source, 256);
		if (unifiedThumbnailStore.hasThumbnail(key)) return;
		if (unifiedThumbnailStore.isLoading(key)) return;

		await unifiedThumbnailStore.requestThumbnails(
			[{ key, source, maxSize: 256 }],
			`pageList-${bookStore.currentBook!.path}`,
			'visible'
		);
	}

	/** 请求当前过滤后可见页面缩略图（避免仅 hover 才加载） */
	function requestFilteredThumbnails() {
		const book = bookStore.currentBook;
		if (!book?.pages?.length || viewMode === 'list') return;

		const requests: { key: string; source: ThumbnailSource; maxSize: number }[] = [];
		for (const item of filteredItems) {
			const result = getPageThumbnailSource(item.index);
			if (!result) continue;
			const key = generateThumbKey(result.source, 256);
			if (unifiedThumbnailStore.hasThumbnail(key)) continue;
			if (unifiedThumbnailStore.isLoading(key)) continue;
			requests.push({ key, source: result.source, maxSize: 256 });
		}

		if (requests.length === 0) return;
		unifiedThumbnailStore.requestThumbnails(requests, `pageList-${book.path}`, 'visible');
	}

	// 当页面数据、视图模式或搜索过滤变化时，自动请求缩略图
	$effect(() => {
		// 读取依赖以建立响应式追踪
		const _items = filteredItems;
		const _mode = viewMode;
		if (_mode === 'list') return;
		queueMicrotask(() => requestFilteredThumbnails());
	});

	async function prefetchAllThumbnails() {
		const book = bookStore.currentBook;
		if (!book?.pages?.length) return;
		if (prefetching) return;

		prefetching = true;
		prefetchError = null;

		try {
			const items = book.pages.map((page, pageIndex) => {
				const source: ThumbnailSource =
					book.type === 'archive' || book.type === 'epub'
						? {
								kind: 'archiveEntry',
								archivePath: book.path,
								innerPath: page.innerPath ?? page.path,
								entryIndex: page.entryIndex,
								fileSize: page.size
							}
						: {
								kind: 'bookPage',
								bookPath: book.path,
								pageIndex,
								pagePath: page.path,
								fileSize: page.size
							};
				return { key: generateThumbKey(source, 256), source, maxSize: 256 };
			});
			await unifiedThumbnailStore.requestThumbnails(items, `pageList-${book.path}`, 'background');
			prefetchDone = true;
		} catch (err) {
			prefetchError = err instanceof Error ? err.message : String(err);
		} finally {
			prefetching = false;
		}
	}
</script>

<div class="flex h-full flex-col space-y-2">
	<!-- 搜索和视图切换 -->
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<Search class="text-muted-foreground absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2" />
			<Input
				type="text"
				placeholder="搜索页面..."
				bind:value={searchQuery}
				class="h-7 pl-7 text-xs"
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
		<Button
			variant="secondary"
			size="sm"
			class="h-7 px-2"
			disabled={prefetching || items.length === 0}
			onclick={() => void prefetchAllThumbnails()}
		>
			<Sparkles class="h-3 w-3" />
		</Button>
	</div>

	<!-- 页面统计 -->
	<div class="text-muted-foreground text-[10px]">
		共 {items.length} 页 {searchQuery ? `(显示 ${filteredItems.length})` : ''}
	</div>
	{#if prefetching}
		<div class="text-muted-foreground text-[10px]">正在预加载全部缩略图...</div>
	{:else if prefetchDone}
		<div class="text-muted-foreground text-[10px]">全部缩略图已预加载</div>
	{:else if prefetchError}
		<div class="text-destructive text-[10px]">预加载失败: {prefetchError}</div>
	{/if}

	<!-- 页面列表 -->
	<div class="min-h-0 flex-1 overflow-y-auto" bind:this={scrollContainer}>
		{#key viewMode}
			{#if filteredItems.length === 0}
				<p class="text-muted-foreground py-4 text-center text-xs">
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
							class="hover:bg-muted w-full rounded px-2 py-1.5 text-left text-xs transition-colors {currentPageIndex ===
							item.index
								? 'bg-primary/10'
								: ''} {isCurrentAndUpscaled ? 'upscaled-glow' : ''}"
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
							class="hover:bg-muted flex w-full items-center gap-2 rounded p-1.5 text-left transition-colors {currentPageIndex ===
							item.index
								? 'bg-primary/10'
								: ''} {isCurrentAndUpscaled ? 'upscaled-glow' : ''}"
							onclick={() => goToPage(item.index)}
							oncontextmenu={(e) => handleContextMenu(e, item)}
							onmouseenter={() => requestThumbnail(item.index)}
						>
							<div
								class="bg-muted relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded"
							>
								{#if thumb?.url}
									<img
										src={thumb.url}
										alt=""
										class="absolute inset-0 h-full w-full object-contain"
									/>
								{:else if thumb?.status === 'loading'}
									<div
										class="border-muted-foreground/40 border-t-foreground h-3 w-3 animate-spin rounded-full border-2"
									></div>
								{:else}
									<ImageIcon class="text-muted-foreground h-4 w-4" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<PageIndexBadge
									pageIndex={item.index}
									isCurrent={currentPageIndex === item.index}
								/>
								<div class="truncate text-xs">{item.name}</div>
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
							class="hover:bg-muted flex flex-col gap-1 rounded p-1 transition-colors {currentPageIndex ===
							item.index
								? 'ring-primary ring-2'
								: ''} {isCurrentAndUpscaled ? 'upscaled-glow-grid' : ''}"
							onclick={() => goToPage(item.index)}
							oncontextmenu={(e) => handleContextMenu(e, item)}
							onmouseenter={() => requestThumbnail(item.index)}
						>
							<div
								class="bg-muted relative flex aspect-3/4 w-full items-center justify-center overflow-hidden rounded"
							>
								{#if thumb?.url}
									<img
										src={thumb.url}
										alt=""
										class="absolute inset-0 h-full w-full object-contain"
									/>
								{:else if thumb?.status === 'loading'}
									<div
										class="border-muted-foreground/40 border-t-foreground h-4 w-4 animate-spin rounded-full border-2"
									></div>
								{:else}
									<ImageIcon class="text-muted-foreground h-6 w-6" />
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
		<div class="border-border flex shrink-0 items-center gap-2 border-t pt-2">
			<span class="text-muted-foreground w-6 text-right font-mono text-[10px]"
				>{displayIndex + 1}</span
			>
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
			<span class="text-muted-foreground w-6 font-mono text-[10px]">{items.length}</span>
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
		box-shadow:
			0 0 0 1.5px hsl(var(--primary)),
			0 0 8px hsl(var(--primary) / 0.5),
			0 0 16px hsl(var(--primary) / 0.3);
		animation: upscaled-pulse 2s ease-in-out infinite;
	}

	:global(.upscaled-glow-grid) {
		box-shadow:
			0 0 0 2px hsl(var(--primary)),
			0 0 10px hsl(var(--primary) / 0.6),
			0 0 20px hsl(var(--primary) / 0.3);
		animation: upscaled-pulse 2s ease-in-out infinite;
	}

	@keyframes upscaled-pulse {
		0%,
		100% {
			box-shadow:
				0 0 0 1.5px hsl(var(--primary)),
				0 0 8px hsl(var(--primary) / 0.5),
				0 0 16px hsl(var(--primary) / 0.3);
		}
		50% {
			box-shadow:
				0 0 0 2px hsl(var(--primary)),
				0 0 12px hsl(var(--primary) / 0.7),
				0 0 24px hsl(var(--primary) / 0.4);
		}
	}
</style>
