<script lang="ts">
	/**
	 * NewReaderNode - Flow 画布中的新系统阅读器节点
	 * 
	 * 使用新的 NeeView 风格页面系统，支持图片显示
	 */
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { bookStore2 } from '$lib/stores/bookStore2';
	import { bookStore } from '$lib/stores/book.svelte';
	import { bookInfoToFileList } from '$lib/stores/bookBridge';
	import { createImageLoader, createThumbnailLoader } from '$lib/core/tauriIntegration';

	type $$Props = NodeProps;
	
	let bookState = $derived($bookStore2);
	let isLoading = $state(false);
	let errorMessage = $state('');
	let currentImageUrl = $state<string | null>(null);
	let imageLoading = $state(false);
	
	// 监听旧系统书籍变化，自动同步
	$effect(() => {
		const oldBook = bookStore.currentBook;
		if (oldBook && !bookState.isOpen) {
			syncFromOldSystem();
		}
	});
	
	// 监听页面变化，加载图片
	$effect(() => {
		if (bookState.isOpen && bookState.currentFrame) {
			loadCurrentImage();
		}
	});
	
	async function syncFromOldSystem() {
		const oldBook = bookStore.currentBook;
		if (!oldBook || isLoading) return;
		
		try {
			isLoading = true;
			errorMessage = '';
			
			const files = bookInfoToFileList(oldBook);
			const isArchive = /\.(zip|rar|7z|cbz|cbr)$/i.test(oldBook.path);
			
			bookStore2.setLoadFunctions(
				createImageLoader(oldBook.path, isArchive),
				createThumbnailLoader(oldBook.path)
			);
			
			await bookStore2.openBook(oldBook.path, files, {
				isArchive,
				startIndex: oldBook.currentPage,
			});
			
			// 获取尺寸信息
			fetchImageSizes(oldBook);
			
			console.log('[NewReaderNode] 同步成功');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
			console.error('[NewReaderNode] 同步失败:', error);
		} finally {
			isLoading = false;
		}
	}
	
	async function fetchImageSizes(oldBook: typeof bookStore.currentBook) {
		if (!oldBook?.pages) return;
		
		const updates: Array<{ index: number; width: number; height: number }> = [];
		for (let i = 0; i < oldBook.pages.length; i++) {
			const page = oldBook.pages[i];
			if (page.width && page.height && page.width > 0 && page.height > 0) {
				updates.push({ index: i, width: page.width, height: page.height });
			}
		}
		
		if (updates.length > 0) {
			bookStore2.updatePageSizes(updates);
		}
	}
	
	async function loadCurrentImage() {
		if (!bookState.currentFrame || bookState.currentFrame.elements.length === 0) return;
		
		const element = bookState.currentFrame.elements[0];
		if (!element || element.isDummy) return;
		
		imageLoading = true;
		
		try {
			// 先尝试缓存
			let blob = bookStore2.getImageCache(element.virtualPage.virtualIndex);
			
			// 没有缓存则请求加载
			if (!blob) {
				blob = await bookStore2.requestImage(element.virtualPage.virtualIndex);
			}
			
			if (blob) {
				// 释放旧 URL
				if (currentImageUrl) {
					URL.revokeObjectURL(currentImageUrl);
				}
				currentImageUrl = URL.createObjectURL(blob);
			}
		} catch (error) {
			console.error('[NewReaderNode] 加载图片失败:', error);
		} finally {
			imageLoading = false;
		}
	}
	
	function handleClose() {
		if (currentImageUrl) {
			URL.revokeObjectURL(currentImageUrl);
			currentImageUrl = null;
		}
		bookStore2.closeBook();
	}
	
	function handlePrev() {
		bookStore2.prevPage();
	}
	
	function handleNext() {
		bookStore2.nextPage();
	}
</script>

<div
	class="new-reader-node-wrapper nodrag"
	style="width: 100%; height: 100%; min-width: 600px; min-height: 400px;"
>
	<div class="bg-background h-full w-full overflow-hidden rounded-md border shadow-sm flex flex-col">
		{#if bookState.isOpen}
			<!-- 工具栏 -->
			<div class="flex items-center justify-between border-b bg-muted/30 px-3 py-2 flex-shrink-0">
				<div class="text-sm font-medium truncate max-w-[200px]">{bookState.bookName}</div>
				<div class="text-xs text-muted-foreground">
					{bookState.currentIndex + 1} / {bookState.virtualPageCount}
					{#if bookState.divideLandscape}
						<span class="ml-2 text-blue-400">(分割)</span>
					{/if}
				</div>
			</div>
			
			<!-- 控制按钮 -->
			<div class="flex items-center gap-2 border-b bg-muted/20 px-3 py-1 flex-shrink-0">
				<button 
					class="rounded px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
					onclick={handlePrev}
					disabled={bookState.currentIndex <= 0}
				>
					◀ 上一页
				</button>
				<button 
					class="rounded px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
					onclick={handleNext}
					disabled={bookState.currentIndex >= bookState.virtualPageCount - 1}
				>
					下一页 ▶
				</button>
				<span class="mx-2 text-muted-foreground">|</span>
				<button 
					class="rounded px-2 py-1 text-xs hover:bg-muted"
					onclick={() => bookStore2.setDivideLandscape(!bookState.divideLandscape)}
				>
					{bookState.divideLandscape ? '✓ 分割横向' : '分割横向'}
				</button>
				<button 
					class="rounded px-2 py-1 text-xs hover:bg-muted"
					onclick={() => bookStore2.setPageMode(bookState.pageMode === 'single' ? 'wide' : 'single')}
				>
					{bookState.pageMode === 'wide' ? '双页' : '单页'}
				</button>
			</div>
			
			<!-- 图片显示区域 -->
			<div class="flex-1 flex items-center justify-center bg-black/80 overflow-hidden relative">
				{#if currentImageUrl}
					<img 
						src={currentImageUrl} 
						alt="Page {bookState.currentIndex + 1}"
						class="max-w-full max-h-full object-contain"
						class:opacity-50={imageLoading}
					/>
				{:else if imageLoading}
					<div class="text-white text-sm">加载中...</div>
				{:else}
					<div class="text-gray-500 text-sm">等待图片加载</div>
				{/if}
				
				<!-- 页面信息覆盖层 -->
				<div class="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded">
					物理页: {bookState.physicalPageCount} | 虚拟页: {bookState.virtualPageCount} | 模式: {bookState.pageMode}
				</div>
			</div>
		{:else if isLoading}
			<div class="flex h-full w-full items-center justify-center">
				<div class="text-center">
					<div class="mb-2 text-lg">⏳</div>
					<p class="text-muted-foreground text-sm">加载中...</p>
				</div>
			</div>
		{:else if errorMessage}
			<div class="flex h-full w-full items-center justify-center">
				<div class="text-center">
					<div class="mb-2 text-lg">❌</div>
					<p class="text-destructive text-sm">{errorMessage}</p>
					<button 
						class="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
						onclick={syncFromOldSystem}
					>
						重试
					</button>
				</div>
			</div>
		{:else}
			<div class="flex h-full w-full items-center justify-center">
				<div class="text-center">
					<div class="mb-2 text-4xl">📖</div>
					<p class="text-muted-foreground mb-4">新系统阅读器</p>
					<p class="text-muted-foreground text-sm">
						在旧系统中打开书籍后，这里会自动同步
					</p>
					{#if bookStore.hasBook}
						<button 
							class="mt-4 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
							onclick={syncFromOldSystem}
						>
							同步当前书籍
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- 拖拽手柄 -->
	<div
		class="drag-handle bg-muted/50 absolute -top-6 left-0 flex h-6 w-full cursor-move items-center justify-center rounded-t-md"
	>
		<span class="text-muted-foreground text-xs">🧪 New Reader (NeeView Style)</span>
		{#if bookState.isOpen}
			<button 
				class="ml-2 text-xs text-red-400 hover:text-red-300"
				onclick={handleClose}
			>
				✕
			</button>
		{/if}
	</div>

	<Handle type="source" position={Position.Bottom} class="bg-primary!" />
	<Handle type="target" position={Position.Top} class="bg-primary!" />
</div>

<style>
	.new-reader-node-wrapper {
		height: 100%;
		width: 100%;
	}
</style>
