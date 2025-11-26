<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { readable } from 'svelte/store';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Image as ImageIcon, FileText, Search, Grid3x3, Grid2x2, LayoutGrid } from '@lucide/svelte';
	import { bookStore } from '$lib/stores/book.svelte';
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
		thumbUrl: string | null;
		loading: boolean;
		error: boolean;
	}

	let items = $state<PageListItem[]>([]);
	let searchQuery = $state('');
	let viewMode = $state<PageViewMode>('standard');
	let imageColumns = $state<number>(3);

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
	let unsubscribeThumbs: (() => void) | null = null;
	let listContainer = $state<HTMLDivElement | null>(null);
	let lastBookPath = $state<string | null>(null);
	const requestedVideoThumbnails = new Set<string>();

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const bookState = createAppStateStore((state) => state.book);

	function setItemState(index: number, patch: Partial<PageListItem>) {
		if (index < 0 || index >= items.length) return;
		const current = items[index];
		items[index] = { ...current, ...patch };
		items = [...items];
	}

	function handleThumbnailReady(pageIndex: number, dataURL: string, source?: string) {
		if (!dataURL) return;
		if (pageIndex < 0 || pageIndex >= items.length) return;
		setItemState(pageIndex, {
			thumbUrl: dataURL,
			loading: false,
			error: false
		});
	}

	async function requestThumbnailForPageIndex(pageIndex: number) {
		const currentBook = bookStore.currentBook;
		const page = currentBook?.pages?.[pageIndex];
		if (!currentBook || !page) {
			setItemState(pageIndex, { loading: false, error: true });
			return;
		}

		const isVideoPage =
			isVideoFile(page.name || '') ||
			isVideoFile(page.path || '');

		if (isVideoPage) {
			// 与底部缩略图栏保持一致：当前仅对本地书籍生成视频缩略图
			if (currentBook.type === 'archive') {
				setItemState(pageIndex, { loading: false, error: false, thumbUrl: null });
				return;
			}

			const videoKey = `${currentBook.path}::${page.path}`;
			if (requestedVideoThumbnails.has(videoKey)) {
				// 已经尝试过该视频（成功或失败），避免重复请求
				setItemState(pageIndex, { loading: false });
				return;
			}
			requestedVideoThumbnails.add(videoKey);

			const MAX_ATTEMPTS = 3;
			const RETRY_DELAY_MS = 500;

			const tryLoadFromThumbnailManager = async (attempt: number) => {
				try {
					const url = await thumbnailManager.getThumbnail(page.path, undefined, false, 'immediate');
					if (url) {
						setItemState(pageIndex, {
							thumbUrl: url,
							loading: false,
							error: false
						});
						return;
					}
				} catch (error) {
					console.error('视频缩略图缓存/生成失败:', pageIndex, page.path, error);
				}

				if (attempt >= MAX_ATTEMPTS) {
					setItemState(pageIndex, { loading: false, error: true });
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
			setItemState(pageIndex, { loading: false, error: true });
			return;
		}

		try {
			await preloadManager.requestThumbnail(pageIndex, 'page-list');
		} catch (error) {
			console.debug('请求缩略图失败:', pageIndex, error);
			setItemState(pageIndex, { loading: false, error: true });
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
			const item = items[i];
			if (!item || item.thumbUrl || item.loading || item.error) continue;
			setItemState(i, { loading: true, error: false });
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
		unsubscribeShared = subscribeSharedPreloadManager((manager) => {
			if (unsubscribeThumbs) {
				unsubscribeThumbs();
				unsubscribeThumbs = null;
			}
			preloadManager = manager;
			if (preloadManager) {
				unsubscribeThumbs = preloadManager.addThumbnailListener((pageIndex, dataURL, source) => {
					handleThumbnailReady(pageIndex, dataURL, source);
				});
				void requestThumbnailsAroundCurrent();
			}
		});
	});

	onDestroy(() => {
		if (unsubscribeShared) {
			unsubscribeShared();
			unsubscribeShared = null;
		}
		if (unsubscribeThumbs) {
			unsubscribeThumbs();
			unsubscribeThumbs = null;
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
			path: page.path,
			thumbUrl: null,
			loading: false,
			error: false
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
							on:input={(e) => {
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

	<div class="flex-1 overflow-y-auto" bind:this={listContainer}>
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
				class={`p-2 ${viewMode === 'image' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2' : 'space-y-1'}`}
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
									{#if item.thumbUrl}
										<img
											src={item.thumbUrl}
											alt={item.name}
											class="absolute inset-0 w-full h-full object-contain"
										/>
									{:else if item.loading}
										<div class="w-4 h-4 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
									{:else if item.error}
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
									{#if item.thumbUrl}
										<img
											src={item.thumbUrl}
											alt={item.name}
											class="absolute inset-0 w-full h-full object-contain"
										/>
									{:else if item.loading}
										<div class="w-6 h-6 border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin"></div>
									{:else if item.error}
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
