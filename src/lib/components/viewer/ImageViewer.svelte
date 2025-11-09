<script lang="ts">
	/**
	 * NeoView - Image Viewer Component
	 * 图像查看器主组件 (Svelte 5 Runes)
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { zoomLevel, zoomIn, zoomOut, resetZoom, rotationAngle, viewMode } from '$lib/stores';
	import {
		keyBindings,
		generateKeyCombo,
		findCommandByKeys
	} from '$lib/stores/keyboard.svelte';
	import { loadImage } from '$lib/api/fs';
	import { loadImageFromArchive } from '$lib/api/filesystem';
	import { FileSystemAPI } from '$lib/api';
	import { decodeImage, createThumbnail, isFormatSupported } from '$lib/decoders';
	import { decoderSettings } from '$lib/stores/decoder.svelte';


	let imageData = $state<string | null>(null);
	let imageData2 = $state<string | null>(null); // 双页模式的第二张图
	let loading = $state(false);
	let error = $state<string | null>(null);
	let decodeProgress = $state<number>(0);
	let useFrontendDecode = $state(decoderSettings.useFrontendDecode); // 是否使用前端解码

	// 监听当前页面变化
	$effect(() => {
		const currentPage = bookStore.currentPage;
		if (currentPage) {
			loadCurrentImage();
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
		decodeProgress = 0;

		try {
			// 加载当前页
			let rawData: ArrayBuffer;
			if (currentBook.type === 'archive') {
				console.log('Loading image from archive:', currentPage.path);
				rawData = await loadImageFromArchive(currentBook.path, currentPage.path);
			} else {
				console.log('Loading image from file system:', currentPage.path);
				rawData = await loadImage(currentBook.path);
			}

			// 检查文件扩展名，决定是否使用前端解码
			const extension = currentPage.path.split('.').pop()?.toLowerCase() || '';
			const needsFrontendDecode = ['avif', 'heif', 'heic', 'webp', 'jxl'].includes(extension);

			if (useFrontendDecode && needsFrontendDecode) {
				// 使用前端解码
				console.log('Decoding image with frontend decoder:', extension);
				imageData = await decodeImage(rawData, { format: extension });
			} else {
				// 使用后端解码（转换为 base64）
				const base64 = btoa(String.fromCharCode(...new Uint8Array(rawData)));
				const mimeType = getMimeType(extension);
				imageData = `data:${mimeType};base64,${base64}`;
			}

			// 双页模式：加载下一页
			if (viewMode === 'double' && bookStore.canNextPage) {
				const nextPage = bookStore.currentPageIndex + 1;
				const nextPageInfo = currentBook.pages[nextPage];
				
				if (nextPageInfo) {
					let rawData2: ArrayBuffer;
					if (currentBook.type === 'archive') {
						rawData2 = await loadImageFromArchive(currentBook.path, nextPageInfo.path);
					} else {
						rawData2 = await loadImage(nextPageInfo.path);
					}

					const extension2 = nextPageInfo.path.split('.').pop()?.toLowerCase() || '';
					const needsFrontendDecode2 = ['avif', 'heif', 'heic', 'webp', 'jxl'].includes(extension2);

					if (useFrontendDecode && needsFrontendDecode2) {
						imageData2 = await decodeImage(rawData2, { format: extension2 });
					} else {
						const base64 = btoa(String.fromCharCode(...new Uint8Array(rawData2)));
						const mimeType = getMimeType(extension2);
						imageData2 = `data:${mimeType};base64,${base64}`;
					}
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load image';
			console.error('Failed to load image:', err);
		} finally {
			loading = false;
			decodeProgress = 0;
		}
	}

	// 获取 MIME 类型
	function getMimeType(extension: string): string {
		const mimeMap: Record<string, string> = {
			'avif': 'image/avif',
			'heif': 'image/heif',
			'heic': 'image/heic',
			'webp': 'image/webp',
			'jxl': 'image/jxl',
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'bmp': 'image/bmp',
			'svg': 'image/svg+xml'
		};
		return mimeMap[extension.toLowerCase()] || 'image/jpeg';
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		try {
			// 双页模式：跳过两页
			if ($viewMode === 'double') {
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
			if ($viewMode === 'double') {
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

	// 监听视图模式变化，重新加载页面
	$effect(() => {
		const mode = $viewMode;
		if (mode) loadCurrentImage();
	});

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

<div class="image-viewer-container h-full w-full flex flex-col bg-black" data-viewer="true">
	<!-- 图像显示区域 -->
	<div class="image-container flex-1 flex items-center justify-center overflow-auto" data-viewer="true">
		{#if loading}
			<div class="text-white">
				{#if decodeProgress > 0}
					<div class="mb-2">Decoding: {Math.round(decodeProgress)}%</div>
					<div class="w-64 bg-gray-700 rounded-full h-2">
						<div class="bg-blue-500 h-2 rounded-full transition-all" style="width: {decodeProgress}%"></div>
					</div>
				{:else}
					Loading...
				{/if}
			</div>
		{:else if error}
			<div class="text-red-500">Error: {error}</div>
		{:else if imageData}
			<!-- 单页模式 -->
			{#if $viewMode === 'single'}
				<img
					src={imageData}
					alt="Current page"
					class="max-w-full max-h-full object-contain"
					style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg); transition: transform 0.2s;"
				/>
			<!-- 双页模式 -->
			{:else if $viewMode === 'double'}
				<div class="flex gap-4 items-center justify-center">
					<img
						src={imageData}
						alt="Current page"
						class="max-w-[45%] max-h-full object-contain"
						style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg); transition: transform 0.2s;"
					/>
					{#if imageData2}
						<img
							src={imageData2}
							alt="Next page"
							class="max-w-[45%] max-h-full object-contain"
							style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg); transition: transform 0.2s;"
						/>
					{/if}
				</div>
			<!-- 全景模式 -->
			{:else if $viewMode === 'panorama'}
				<img
					src={imageData}
					alt="Current page"
					class="w-full h-full object-contain"
					style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg); transition: transform 0.2s;"
				/>
			{/if}
		{:else}
			<div class="text-white/50">No image to display</div>
		{/if}
	</div>
</div>
