<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { readable } from 'svelte/store';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Image as ImageIcon, FileText, Search, Grid3x3, Grid2x2, LayoutGrid } from '@lucide/svelte';
	import ListSlider from '$lib/components/panels/file/components/ListSlider.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { thumbnailCacheStore, type ThumbnailEntry } from '$lib/stores/thumbnailCache.svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import type { Page } from '$lib/types';
	import type { PreloadManager } from '$lib/components/viewer/flow/preloadManager.svelte';
	import { subscribeSharedPreloadManager } from '$lib/components/viewer/flow/sharedPreloadManager';
	import { thumbnailManager } from '$lib/utils/thumbnailManager';
	import { isVideoFile } from '$lib/utils/videoUtils';

	type PageViewMode = 'text' | 'standard' | 'image';

	interface PageListItem {
		index: number;
		name: string;
		path: string;
	}

	let items = $state<PageListItem[]>([]);
	
	// 全局缩略图缓存快照
	let thumbnailSnapshot = $state<Map<number, ThumbnailEntry>>(new Map());
	
	// 订阅全局缩略图缓存变化
	let unsubscribeThumbnailCache: (() => void) | null = null;
	let searchQuery = $state('');
	let viewMode = $state<PageViewMode>('standard');
	let imageColumns = $state<number>(3);

	// 滚动状态（用于 ListSlider）
	let scrollTop = $state(0);
	let containerHeight = $state(0);
	let contentHeight = $state(0);
	let itemHeight = 80; // 估算项高度

	const filteredItems = $derived(
		searchQuery.trim()
			? items.filter((item) => {
					const q = searchQuery.toLowerCase();
					const idxStr = (item.index + 1).toString();
					return (
						item.name.toLowerCase().includes(q) ||
						item.path.toLowerCase().includes(q) ||
						idxStr.includes(q)
					);
				})
			: items
	);

	let preloadManager: PreloadManager | null = null;
	let unsubscribeShared: (() => void) | null = null;
	let listContainer = $state<HTMLDivElement | null>(null);
	let lastBookPath = $state<string | null>(null);
	const requestedVideoThumbnails = new Set<string>();

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const bookState = createAppStateStore((state) => state.book);

	// 从全局缓存获取缩略图
	function getThumbnail(pageIndex: number): ThumbnailEntry | null {
		return thumbnailSnapshot.get(pageIndex) ?? null;
	}
	
	// 检查是否正在加载
	function isLoading(pageIndex: number): boolean {
		return thumbnailCacheStore.isLoading(pageIndex);
	}
	
	// 检查是否加载失败
	function hasFailed(pageIndex: number): boolean {
		return thumbnailCacheStore.hasFailed(pageIndex);
	}

	async function requestThumbnailForPageIndex(pageIndex: number) {
		// 已有缓存则跳过
		if (thumbnailCacheStore.hasThumbnail(pageIndex)) return;
		// 正在加载则跳过
		if (thumbnailCacheStore.isLoading(pageIndex)) return;
		// 已失败则跳过（避免重复请求）
		if (thumbnailCacheStore.hasFailed(pageIndex)) return;
		
		const currentBook = bookStore.currentBook;
		const page = currentBook?.pages?.[pageIndex];
		if (!currentBook || !page) {
			thumbnailCacheStore.setFailed(pageIndex);
			return;
		}

		const isVideoPage =
			isVideoFile(page.name || '') ||
			isVideoFile(page.path || '');

		if (isVideoPage) {
			// 与底部缩略图栏保持一致：当前仅对本地书籍生成视频缩略图
			if (currentBook.type === 'archive') {
				return;
			}

			const videoKey = `${currentBook.path}::${page.path}`;
			if (requestedVideoThumbnails.has(videoKey)) {
				return;
			}
			requestedVideoThumbnails.add(videoKey);
			thumbnailCacheStore.setLoading(pageIndex);

			const MAX_ATTEMPTS = 3;
			const RETRY_DELAY_MS = 500;

			const tryLoadFromThumbnailManager = async (attempt: number) => {
				try {
					const url = await thumbnailManager.getThumbnail(page.path, undefined, false, 'immediate');
					if (url) {
						// 视频缩略图也写入全局缓存
						thumbnailCacheStore.setThumbnail(pageIndex, url, 100, 100);
						return;
					}
				} catch (error) {
					console.error('视频缩略图缓存/生成失败:', pageIndex, page.path, error);
				}

				if (attempt >= MAX_ATTEMPTS) {
					thumbnailCacheStore.setFailed(pageIndex);
					return;
				}

				setTimeout(() => {
					void tryLoadFromThumbnailManager(attempt + 1);
				}, RETRY_DELAY_MS);
			};

			void tryLoadFromThumbnailManager(0);
			return;
		}

		if (!preloadManager) {
			thumbnailCacheStore.setFailed(pageIndex);
			return;
		}

		thumbnailCacheStore.setLoading(pageIndex);
		try {
			await preloadManager.requestThumbnail(pageIndex, 'page-list');
		} catch (error) {
			console.debug('请求缩略图失败:', pageIndex, error);
			thumbnailCacheStore.setFailed(pageIndex);
		}
	}

	async function requestThumbnailsAroundCurrent() {
		if (!preloadManager || items.length === 0) return;
		const center = bookStore.currentPageIndex;
		const total = items.length;
		const radius = 40;
		const start = Math.max(0, center - radius);
		const end = Math.min(total - 1, center + radius);

		for (let i = start; i <= end; i++) {
			void requestThumbnailForPageIndex(i);
		}
	}

	function scrollToCurrent() {
		if (!listContainer) return;
		const currentIndex = bookStore.currentPageIndex;
		const el = listContainer.querySelector<HTMLButtonElement>(
			`[data-page-index="${currentIndex}"]`
		);
		if (el) {
			el.scrollIntoView({ block: 'nearest' });
		}
	}

	async function goToPage(index: number) {
		await bookStore.navigateToPage(index);
	}

	function setViewMode(mode: PageViewMode) {
		viewMode = mode;
	}

	onMount(() => {
		// 订阅全局缩略图缓存
		unsubscribeThumbnailCache = thumbnailCacheStore.subscribe(() => {
			thumbnailSnapshot = thumbnailCacheStore.getAllThumbnails();
		});
		thumbnailSnapshot = thumbnailCacheStore.getAllThumbnails();
		
		unsubscribeShared = subscribeSharedPreloadManager((manager) => {
			preloadManager = manager;
			if (preloadManager) {
				void requestThumbnailsAroundCurrent();
			}
		});
	});

	onDestroy(() => {
		if (unsubscribeShared) {
			unsubscribeShared();
			unsubscribeShared = null;
		}
		if (unsubscribeThumbnailCache) {
			unsubscribeThumbnailCache();
			unsubscribeThumbnailCache = null;
		}
	});

	$effect(() => {
		const book = bookStore.currentBook;
		const path = book?.path ?? null;
		if (path === lastBookPath) {
			return;
		}
		lastBookPath = path;
		requestedVideoThumbnails.clear();
		if (!book || !book.pages || book.pages.length === 0) {
			items = [];
			return;
		}
		const pages: Page[] = book.pages;
		items = pages.map((page, index) => ({
			index,
			name: page.name ?? `Page ${index + 1}`,
			path: page.path
		}));
		void requestThumbnailsAroundCurrent();
		setTimeout(scrollToCurrent, 50);
	});

	$effect(() => {
		const _current = bookStore.currentPageIndex;
		if (items.length === 0) return;
		setTimeout(scrollToCurrent, 0);
		void requestThumbnailsAroundCurrent();
	});
</script>

<div class="h-full flex flex-col bg-background">
	<div class="p-3 border-b space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-semibold flex items-center gap-2">
				<FileText class="h-4 w-4" />
				<span>页面列表</span>
			</h3>
			<div class="flex items-center gap-1">
				<Label class="text-[10px] text-muted-foreground mr-1">视图</Label>
				<Button
					variant={viewMode === 'text' ? 'default' : 'outline'}
					size="icon"
					class="h-6 w-6"
					onclick={() => setViewMode('text')}
					title="纯文字"
				>
					<FileText class="h-3 w-3" />
				</Button>
				<Button
					variant={viewMode === 'standard' ? 'default' : 'outline'}
					size="icon"
					class="h-6 w-6"
					onclick={() => setViewMode('standard')}
					title="标准视图"
				>
					<Grid2x2 class="h-3 w-3" />
				</Button>
				<Button
					variant={viewMode === 'image' ? 'default' : 'outline'}
					size="icon"
					class="h-6 w-6"
					onclick={() => setViewMode('image')}
					title="大图视图"
				>
					<LayoutGrid class="h-3 w-3" />
				</Button>
				{#if viewMode === 'image'}
					<div class="flex items-center gap-1 ml-2">
						<Label class="text-[10px] text-muted-foreground">每行</Label>
						<input
							type="range"
							min="1"
							max="6"
							value={imageColumns}
							class="h-4 w-20"
							oninput={(e) => {
								imageColumns = Number(e.currentTarget.value);
							}}
						/>
						<span class="text-[10px] text-muted-foreground w-4 text-center">
							{imageColumns}
						</span>
					</div>
				{/if}
			</div>
		</div>
		<div class="text-[10px] text-muted-foreground space-y-0.5">
			<div class="truncate">
				{#if $bookState.currentBookPath}
					<span>当前书籍: {$bookState.currentBookPath}</span>
				{:else}
					<span>未打开书籍</span>
				{/if}
			</div>
			<div>
				{#if bookStore.totalPages > 0}
					<span>页: {bookStore.currentPageIndex + 1} / {bookStore.totalPages}</span>
				{:else}
					<span>无页面</span>
				{/if}
			</div>
		</div>
		<div class="relative">
			<Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
			<Input
					type="text"
					placeholder="搜索页面..."
					bind:value={searchQuery}
					class="pl-7 h-8 text-xs"
				/>
		</div>
	</div>

	<div class="flex-1 flex overflow-hidden">
	<div 
		class="flex-1 overflow-y-auto" 
		bind:this={listContainer}
		onscroll={(e) => {
			const target = e.currentTarget;
			scrollTop = target.scrollTop;
			containerHeight = target.clientHeight;
			contentHeight = target.scrollHeight;
		}}
	>
		{#if !$bookState.currentBookPath}
			<div class="p-4 text-center text-sm text-muted-foreground">
				打开一本书后，这里会显示页面列表
			</div>
		{:else if filteredItems.length === 0}
			<div class="p-4 text-center text-sm text-muted-foreground">
				未找到匹配的页面
			</div>
		{:else}
			<div
				class={`p-2 ${viewMode === 'image' ? 'grid gap-2' : 'space-y-1'}`}
				style={viewMode === 'image'
					? `grid-template-columns: repeat(${imageColumns}, minmax(0, 1fr));`
					: ''}
			>
				{#each filteredItems as item}
					<button
						class="w-full p-2 rounded-md hover:bg-accent transition-colors text-left border {bookStore.currentPageIndex ===
							item.index
								? 'bg-primary/10 border-primary/40'
								: 'border-transparent'}"
						onclick={() => goToPage(item.index)}
						data-page-index={item.index}
					>
						{#if viewMode === 'text'}
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2 min-w-0">
									<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
									<div class="flex-1 min-w-0">
										<div class="text-xs text-foreground truncate" title={item.name}>
											{item.name}
										</div>
										<div class="text-[10px] text-muted-foreground truncate" title={item.path}>
											{item.path}
										</div>
									</div>
								</div>
								{#if bookStore.currentPageIndex === item.index}
									<span
										class="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded flex-shrink-0"
									>
										当前
									</span>
								{/if}
							</div>
						{:else if viewMode === 'standard'}
							<div class="flex items-center gap-3">
								<div
									class="w-16 h-20 rounded bg-muted flex items-center justify-center overflow-hidden relative flex-shrink-0"
								>
									{#if getThumbnail(item.index)}
										<img
											src={getThumbnail(item.index)?.url}
											alt={item.name}
											class="absolute inset-0 w-full h-full object-contain"
										/>
									{:else if isLoading(item.index)}
										<div class="w-4 h-4 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
									{:else if hasFailed(item.index)}
										<span class="text-[10px] text-destructive">ERR</span>
									{:else}
										<ImageIcon class="h-5 w-5 text-muted-foreground" />
									{/if}
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
										{#if bookStore.currentPageIndex === item.index}
											<span
												class="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded"
											>
												当前
											</span>
										{/if}
									</div>
									<div class="text-xs text-foreground truncate" title={item.name}>
										{item.name}
									</div>
									<div class="text-[10px] text-muted-foreground truncate" title={item.path}>
										{item.path}
									</div>
								</div>
							</div>
						{:else}
							<div class="flex flex-col gap-2">
								<div
									class="bg-muted rounded overflow-hidden relative w-full aspect-[3/4] flex items-center justify-center"
								>
									{#if getThumbnail(item.index)}
										<img
											src={getThumbnail(item.index)?.url}
											alt={item.name}
											class="absolute inset-0 w-full h-full object-contain"
										/>
									{:else if isLoading(item.index)}
										<div class="w-6 h-6 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
									{:else if hasFailed(item.index)}
										<span class="text-[10px] text-destructive">ERR</span>
									{:else}
										<ImageIcon class="h-8 w-8 text-muted-foreground" />
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<span class="text-xs font-mono font-semibold text-primary">#{item.index + 1}</span>
									{#if bookStore.currentPageIndex === item.index}
										<span
											class="px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded"
										>
											当前
										</span>
									{/if}
								</div>
								<div class="text-xs text-foreground truncate" title={item.name}>
									{item.name}
								</div>
							</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ListSlider -->
	{#if filteredItems.length > 0}
		<div class="py-1 pr-0.5">
			<ListSlider
				totalItems={filteredItems.length}
				currentIndex={bookStore.currentPageIndex}
				visibleStart={Math.floor(scrollTop / itemHeight)}
				visibleEnd={Math.min(filteredItems.length - 1, Math.floor((scrollTop + containerHeight) / itemHeight))}
				scrollProgress={contentHeight > containerHeight ? scrollTop / (contentHeight - containerHeight) : 0}
				onJumpToIndex={(index) => {
					if (index >= 0 && index < filteredItems.length) {
						goToPage(filteredItems[index].index);
					}
				}}
				onScrollToProgress={(progress) => {
					if (listContainer && contentHeight > containerHeight) {
						listContainer.scrollTop = progress * (contentHeight - containerHeight);
					}
				}}
			/>
		</div>
	{/if}
</div>

	<div class="p-2 border-t text-[10px] text-muted-foreground text-center">
		{#if bookStore.totalPages > 0}
			<span>共 {bookStore.totalPages} 页</span>
		{:else}
			<span>没有页面</span>
		{/if}
	</div>
</div>

<style>
	button {
		position: relative;
	}
</style>
