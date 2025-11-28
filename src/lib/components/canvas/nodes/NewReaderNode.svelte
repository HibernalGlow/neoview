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
	let logs = $state<string[]>([]);
	let showDebug = $state(true);
	
	// 使用普通变量避免 effect 循环
	let _lastSyncedPath: string | null = null;
	let _lastPageIndex: number = -1;
	
	function log(msg: string) {
		const time = new Date().toLocaleTimeString();
		console.log(`[NewReader] ${msg}`);
		// 延迟更新日志状态
		setTimeout(() => {
			logs = [...logs.slice(-19), `[${time}] ${msg}`];
		}, 0);
	}
	
	// 监听旧系统书籍变化，自动同步
	$effect(() => {
		const oldBook = bookStore.currentBook;
		if (oldBook && oldBook.path !== _lastSyncedPath) {
			_lastSyncedPath = oldBook.path;
			syncFromOldSystem();
		}
	});
	
	// 监听旧系统页面变化，同步到新系统
	// 使用 debounce 避免循环
	let _lastOldPageIndex: number = -1;
	let _syncTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const oldBook = bookStore.currentBook;
		if (oldBook && bookState.isOpen) {
			const oldPageIndex = oldBook.currentPage;
			if (oldPageIndex !== _lastOldPageIndex && oldPageIndex !== bookState.currentIndex) {
				_lastOldPageIndex = oldPageIndex;
				// 使用 setTimeout 避免在 effect 中直接调用可能触发循环的操作
				if (_syncTimeout) clearTimeout(_syncTimeout);
				_syncTimeout = setTimeout(() => {
					bookStore2.goToPage(oldPageIndex);
					log(`同步旧系统页面: ${oldPageIndex}`);
				}, 50);
			}
		}
	});
	
	// 监听新系统页面变化，加载图片
	$effect(() => {
		const currentIndex = bookState.currentIndex;
		const isOpen = bookState.isOpen;
		const frame = bookState.currentFrame;
		
		if (isOpen && frame && currentIndex !== _lastPageIndex) {
			_lastPageIndex = currentIndex;
			log(`页面变化: ${currentIndex}`);
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
			
			log(`同步成功: ${files.length} 页`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
			log(`同步失败: ${errorMessage}`);
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
			log(`尺寸更新: ${updates.length} 页`);
			// 显示一些样本
			const sample = updates.slice(0, 3).map(u => `${u.index}:${u.width}x${u.height}`).join(', ');
			log(`样本: ${sample}`);
		} else {
			log(`警告: 没有尺寸信息可更新`);
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
				
				// 获取图片尺寸并更新
				const physicalIndex = element.virtualPage.physicalPage.index;
				const physicalPage = element.virtualPage.physicalPage;
				if (physicalPage.size.width === 0 || physicalPage.size.height === 0) {
					// 尺寸未知，从图片获取
					const img = new Image();
					img.onload = () => {
						const width = img.naturalWidth;
						const height = img.naturalHeight;
						log(`获取尺寸: ${physicalIndex} -> ${width}x${height}`);
						bookStore2.updatePageSize(physicalIndex, width, height);
					};
					img.src = currentImageUrl;
				}
			}
			log(`图片加载成功`);
		} catch (error) {
			log(`图片加载失败: ${error}`);
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
		log(`点击上一页, 当前: ${bookState.currentIndex}`);
		const result = bookStore2.prevPage();
		log(`prevPage 结果: ${result}`);
	}
	
	function handleNext() {
		log(`点击下一页, 当前: ${bookState.currentIndex}`);
		const result = bookStore2.nextPage();
		log(`nextPage 结果: ${result}`);
	}
	
	function copyLogs() {
		navigator.clipboard.writeText(logs.join('\n'));
		log('日志已复制');
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
					onclick={() => {
						const newValue = !bookState.divideLandscape;
						log(`设置分割: ${newValue}, 物理页: ${bookState.physicalPageCount}, 虚拟页: ${bookState.virtualPageCount}`);
						bookStore2.setDivideLandscape(newValue);
						// 延迟检查结果
						setTimeout(() => {
							log(`分割后: 虚拟页=${bookState.virtualPageCount}`);
						}, 100);
					}}
				>
					{bookState.divideLandscape ? '✓ 分割横向' : '分割横向'}
				</button>
				<button 
					class="rounded px-2 py-1 text-xs hover:bg-muted"
					onclick={() => bookStore2.setPageMode(bookState.pageMode === 'single' ? 'wide' : 'single')}
				>
					{bookState.pageMode === 'wide' ? '双页' : '单页'}
				</button>
				<button 
					class="rounded px-2 py-1 text-xs hover:bg-muted"
					onclick={() => {
						const newValue = !bookState.autoRotate;
						log(`设置自动旋转: ${newValue}`);
						bookStore2.setAutoRotate(newValue);
					}}
				>
					{bookState.autoRotate ? '✓ 自动旋转' : '自动旋转'}
				</button>
			</div>
			
			<!-- 图片显示区域 -->
			<div class="flex-1 flex items-center justify-center bg-black/80 overflow-hidden relative">
				{#if currentImageUrl}
					{@const element = bookState.currentFrame?.elements[0]}
					{@const isDivided = element?.virtualPage?.isDivided}
					{@const isLeftHalf = element?.virtualPage?.part === 0}
					{@const rotation = element?.virtualPage?.rotation ?? 0}
					
					{#if isDivided}
						<!-- 
							分割页面：使用 clip-path 裁剪
							- 左半边: clip-path: inset(0 50% 0 0)
							- 右半边: clip-path: inset(0 0 0 50%)
							这样图片可以正常缩放，只是显示区域被裁剪
						-->
						<img 
							src={currentImageUrl} 
							alt="Page {bookState.currentIndex + 1}"
							class="max-w-full max-h-full object-contain"
							class:opacity-50={imageLoading}
							style="clip-path: inset(0 {isLeftHalf ? '50%' : '0'} 0 {isLeftHalf ? '0' : '50%'});"
						/>
					{:else if rotation !== 0}
						<!-- 旋转页面 -->
						<img 
							src={currentImageUrl} 
							alt="Page {bookState.currentIndex + 1}"
							class="object-contain"
							class:opacity-50={imageLoading}
							style="
								transform: rotate({rotation}deg);
								{rotation === 90 || rotation === 270 ? 'max-height: 100vw; max-width: 100vh;' : 'max-width: 100%; max-height: 100%;'}
							"
						/>
					{:else}
						<!-- 普通页面 -->
						<img 
							src={currentImageUrl} 
							alt="Page {bookState.currentIndex + 1}"
							class="max-w-full max-h-full object-contain"
							class:opacity-50={imageLoading}
						/>
					{/if}
				{:else if imageLoading}
					<div class="text-white text-sm">加载中...</div>
				{:else}
					<div class="text-gray-500 text-sm">等待图片加载</div>
				{/if}
				
				<!-- 页面信息覆盖层 -->
				<div class="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded">
					物理页: {bookState.physicalPageCount} | 虚拟页: {bookState.virtualPageCount} | 
					{#if bookState.currentFrame?.elements[0]?.virtualPage?.isDivided}
						分割: {bookState.currentFrame.elements[0].virtualPage.part === 0 ? '左' : '右'}
					{:else}
						模式: {bookState.pageMode}
					{/if}
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

	<!-- 调试面板 -->
	{#if showDebug}
		<div class="absolute bottom-0 left-0 right-0 bg-black/90 text-white text-xs max-h-32 overflow-auto p-2 border-t border-gray-700">
			<div class="flex justify-between items-center mb-1">
				<span class="font-bold">调试日志</span>
				<div class="flex gap-2">
					<button class="px-2 py-0.5 bg-blue-600 rounded hover:bg-blue-700" onclick={copyLogs}>复制</button>
					<button class="px-2 py-0.5 bg-gray-600 rounded hover:bg-gray-700" onclick={() => logs = []}>清空</button>
					<button class="px-2 py-0.5 bg-gray-600 rounded hover:bg-gray-700" onclick={() => showDebug = false}>隐藏</button>
				</div>
			</div>
			<div class="font-mono">
				{#each logs as entry}
					<div class="text-gray-300">{entry}</div>
				{/each}
			</div>
		</div>
	{:else}
		<button 
			class="absolute bottom-2 right-2 px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600"
			onclick={() => showDebug = true}
		>
			显示日志
		</button>
	{/if}

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
