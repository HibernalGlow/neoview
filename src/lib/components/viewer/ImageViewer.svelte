<script lang="ts">
	/**
	 * NeoView - Image Viewer Component
	 * 图像查看器主组件 (Svelte 5 Runes)
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { zoomLevel, zoomIn, zoomOut, resetZoom } from '$lib/stores';
	import {
		keyBindings,
		generateKeyCombo,
		findCommandByKeys
	} from '$lib/stores/keyboard.svelte';
	import { loadImage } from '$lib/api/fs';
	import { loadImageFromArchive } from '$lib/api/filesystem';
	import { FileSystemAPI } from '$lib/api';
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, X, Grid, Maximize2, PanelLeft } from '@lucide/svelte';

	let imageData = $state<string | null>(null);
	let imageData2 = $state<string | null>(null); // 双页模式的第二张图
	let loading = $state(false);
	let error = $state<string | null>(null);
	let viewMode = $state<'single' | 'double' | 'panorama'>('single'); // 视图模式
	let showThumbnails = $state(false); // 是否显示缩略图栏
	let thumbnails = $state<Map<number, string>>(new Map()); // 缓存缩略图

	// 监听当前页面变化
	$effect(() => {
		const currentPage = bookStore.currentPage;
		if (currentPage) {
			loadCurrentImage();
			// 如果缩略图栏打开，加载可见的缩略图
			if (showThumbnails) {
				loadVisibleThumbnails();
			}
		} else {
			imageData = null;
		}
	});

	async function loadCurrentImage() {
		const currentPage = bookStore.currentPage;
		const currentBook = bookStore.currentBook;
		if (!currentPage || !currentBook) return;

		loading = true;
		error = null;
		imageData = null;
		imageData2 = null;

		try {
			// 加载当前页
			let data: string;
			if (currentBook.type === 'archive') {
				console.log('Loading image from archive:', currentPage.path);
				data = await loadImageFromArchive(currentBook.path, currentPage.path);
			} else {
				console.log('Loading image from file system:', currentPage.path);
				data = await loadImage(currentPage.path);
			}
			imageData = data;

			// 双页模式：加载下一页
			if (viewMode === 'double' && bookStore.canNextPage) {
				const nextPage = bookStore.currentPageIndex + 1;
				const nextPageInfo = currentBook.pages[nextPage];
				
				if (nextPageInfo) {
					let data2: string;
					if (currentBook.type === 'archive') {
						data2 = await loadImageFromArchive(currentBook.path, nextPageInfo.path);
					} else {
						data2 = await loadImage(nextPageInfo.path);
					}
					imageData2 = data2;
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load image';
			console.error('Failed to load image:', err);
		} finally {
			loading = false;
		}
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		try {
			// 双页模式：跳过两页
			if (viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.min(currentIndex + 2, bookStore.totalPages - 1);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.nextPage();
			}
		} catch (err) {
			console.error('Failed to go to next page:', err);
		}
	}

	async function handlePreviousPage() {
		if (!bookStore.canPreviousPage) return;
		try {
			// 双页模式：后退两页
			if (viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.max(currentIndex - 2, 0);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.previousPage();
			}
		} catch (err) {
			console.error('Failed to go to previous page:', err);
		}
	}

	function handleClose() {
		bookStore.closeBook();
	}

	function toggleViewMode() {
		if (viewMode === 'single') {
			viewMode = 'double';
		} else if (viewMode === 'double') {
			viewMode = 'panorama';
		} else {
			viewMode = 'single';
		}
		// 重新加载当前页以适应新模式
		loadCurrentImage();
	}

	function toggleThumbnails() {
		showThumbnails = !showThumbnails;
		// 如果打开缩略图栏，预加载当前可见的缩略图
		if (showThumbnails) {
			loadVisibleThumbnails();
		}
	}

	// 加载可见的缩略图
	async function loadVisibleThumbnails() {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		// 预加载当前页前后各5页的缩略图
		const start = Math.max(0, bookStore.currentPageIndex - 5);
		const end = Math.min(currentBook.pages.length - 1, bookStore.currentPageIndex + 5);

		for (let i = start; i <= end; i++) {
			if (!thumbnails.has(i)) {
				loadThumbnail(i);
			}
		}
	}

	// 加载单个缩略图
	async function loadThumbnail(pageIndex: number) {
		const currentBook = bookStore.currentBook;
		if (!currentBook || !currentBook.pages[pageIndex]) return;

		console.log(`🖼️ Loading thumbnail for page ${pageIndex}`);
		
		try {
			const page = currentBook.pages[pageIndex];
			let thumbnail: string;

			if (currentBook.type === 'archive') {
				console.log(`📦 Loading archive thumbnail for: ${page.path}`);
				thumbnail = await FileSystemAPI.generateArchiveThumbnail(
					currentBook.path,
					page.path,
					128 // 缩略图大小
				);
			} else {
				console.log(`📁 Loading file thumbnail for: ${page.path}`);
				thumbnail = await FileSystemAPI.generateFileThumbnail(page.path);
			}

			console.log(`✅ Thumbnail loaded for page ${pageIndex}, size: ${thumbnail.length}`);
			thumbnails.set(pageIndex, thumbnail);
		} catch (err) {
			console.error(`❌ Failed to load thumbnail for page ${pageIndex}:`, err);
		}
	}

	// 执行命令
	function executeCommand(command: string) {
		const commands: Record<string, () => void> = {
			next_page: handleNextPage,
			previous_page: handlePreviousPage,
			zoom_in: zoomIn,
			zoom_out: zoomOut,
			zoom_reset: resetZoom
			// 更多命令可以在这里添加
		};

		const handler = commands[command];
		if (handler) {
			handler();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// 生成按键组合
		const keyCombo = generateKeyCombo(e);

		// 查找对应的命令
		const command = findCommandByKeys(keyCombo, $keyBindings);

		if (command) {
			e.preventDefault();
			executeCommand(command);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="h-full w-full flex flex-col bg-black">
	<!-- 工具栏 -->
	<div class="bg-secondary/50 p-2 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Button variant="ghost" size="icon" onclick={handleClose}>
				<X class="h-5 w-5" />
			</Button>
			
			{#if bookStore.currentBook}
				<span class="text-sm text-muted-foreground">
					{bookStore.currentBook.name} - Page {bookStore.currentPageIndex + 1} / {bookStore.totalPages}
				</span>
			{/if}
		</div>
		
		<div class="flex items-center gap-2">
			<Button
				variant="ghost"
				size="icon"
				onclick={handlePreviousPage}
				disabled={!bookStore.canPreviousPage}
			>
				<ChevronLeft class="h-5 w-5" />
			</Button>

			<Button variant="ghost" size="icon" onclick={zoomOut}>
				<ZoomOut class="h-5 w-5" />
			</Button>

			<Button variant="ghost" size="icon" onclick={resetZoom}>
				<span class="text-sm font-mono">{($zoomLevel * 100).toFixed(0)}%</span>
			</Button>

			<Button variant="ghost" size="icon" onclick={zoomIn}>
				<ZoomIn class="h-5 w-5" />
			</Button>

			<!-- 视图模式切换 -->
			<Button variant="ghost" size="icon" onclick={toggleViewMode} title="切换视图模式">
				{#if viewMode === 'single'}
					<PanelLeft class="h-5 w-5" />
				{:else if viewMode === 'double'}
					<Grid class="h-5 w-5" />
				{:else}
					<Maximize2 class="h-5 w-5" />
				{/if}
			</Button>

			<!-- 缩略图切换 -->
			<Button variant="ghost" size="icon" onclick={toggleThumbnails} title="缩略图">
				<Grid class="h-5 w-5" />
			</Button>

			<Button variant="ghost" size="icon" onclick={handleNextPage} disabled={!bookStore.canNextPage}>
				<ChevronRight class="h-5 w-5" />
			</Button>
		</div>
	</div>

	<!-- 图像显示区域 -->
	<div class="flex-1 flex items-center justify-center overflow-auto">
		{#if loading}
			<div class="text-white">Loading...</div>
		{:else if error}
			<div class="text-red-500">Error: {error}</div>
		{:else if imageData}
			<!-- 单页模式 -->
			{#if viewMode === 'single'}
				<img
					src={imageData}
					alt="Current page"
					class="max-w-full max-h-full object-contain"
					style="transform: scale({$zoomLevel}); transition: transform 0.2s;"
				/>
			<!-- 双页模式 -->
			{:else if viewMode === 'double'}
				<div class="flex gap-4 items-center justify-center">
					<img
						src={imageData}
						alt="Current page"
						class="max-w-[45%] max-h-full object-contain"
						style="transform: scale({$zoomLevel}); transition: transform 0.2s;"
					/>
					{#if imageData2}
						<img
							src={imageData2}
							alt="Next page"
							class="max-w-[45%] max-h-full object-contain"
							style="transform: scale({$zoomLevel}); transition: transform 0.2s;"
						/>
					{/if}
				</div>
			<!-- 全景模式 -->
			{:else if viewMode === 'panorama'}
				<img
					src={imageData}
					alt="Current page"
					class="w-full h-full object-contain"
					style="transform: scale({$zoomLevel}); transition: transform 0.2s;"
				/>
			{/if}
		{:else}
			<div class="text-white/50">No image to display</div>
		{/if}
	</div>

	<!-- 缩略图底栏 -->
	{#if showThumbnails && bookStore.currentBook}
		<div class="bg-secondary/80 border-t p-2">
			<div class="flex gap-2 overflow-x-auto" onscroll={(e) => {
				const container = e.target as HTMLElement;
				// 滚动时加载可见的缩略图
				const scrollLeft = container.scrollLeft;
				const containerWidth = container.clientWidth;
				
				// 计算可见的缩略图范围
				const thumbnailElements = container.querySelectorAll('button');
				thumbnailElements.forEach((el, i) => {
					const rect = el.getBoundingClientRect();
					const containerRect = container.getBoundingClientRect();
					
					if (rect.left >= containerRect.left - 100 && rect.right <= containerRect.right + 100) {
						if (!thumbnails.has(i)) {
							loadThumbnail(i);
						}
					}
				});
			}}>
				{#each bookStore.currentBook.pages as page, index (page.path)}
					<button
						class="flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 {index === bookStore.currentPageIndex ? 'border-primary' : 'border-transparent'} hover:border-primary/50 transition-colors"
						onclick={() => bookStore.navigateToPage(index)}
						title="Page {index + 1}"
					>
						{#if thumbnails.has(index)}
							<img
								src={thumbnails.get(index)}
								alt="Page {index + 1}"
								class="w-full h-full object-cover"
							/>
						{:else}
							<div class="w-full h-full flex items-center justify-center bg-gray-700 text-xs text-gray-300">
								{index + 1}
							</div>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
