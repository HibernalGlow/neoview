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
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { invoke } from '@tauri-apps/api/core';

	// 进度条状态
	let showProgressBar = $state(true);

	// 鼠标光标隐藏相关
	let cursorVisible = $state(true);
	let hideCursorTimeout: number | null = null;
	let lastMousePosition = $state({ x: 0, y: 0 });
	let settings = $state(settingsManager.getSettings());

	// 订阅设置变化
	settingsManager.addListener((s) => {
		settings = s;
	});

	let imageData = $state<string | null>(null);
	let imageData2 = $state<string | null>(null); // 双页模式的第二张图
	let loading = $state(false);
	let loadingVisible = $state(false); // 控制loading动画的可见性
	let error = $state<string | null>(null);
	let loadingTimeout: number | null = null; // 延迟显示loading的定时器

	// 鼠标光标隐藏功能
	function showCursor() {
		if (!settings.view.mouseCursor || !settings.view.mouseCursor.autoHide) return;
		
		cursorVisible = true;
		if (hideCursorTimeout) {
			clearTimeout(hideCursorTimeout);
			hideCursorTimeout = null;
		}
		
		// 设置新的隐藏定时器
		hideCursorTimeout = setTimeout(() => {
			cursorVisible = false;
		}, settings.view.mouseCursor.hideDelay * 1000);
	}

	function handleMouseMove(e: MouseEvent) {
		if (!settings.view.mouseCursor || !settings.view.mouseCursor.autoHide) return;
		
		const currentX = e.clientX;
		const currentY = e.clientY;
		
		// 检查移动距离是否超过阈值
		const deltaX = Math.abs(currentX - lastMousePosition.x);
		const deltaY = Math.abs(currentY - lastMousePosition.y);
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		
		if (distance >= settings.view.mouseCursor.showMovementThreshold) {
			lastMousePosition = { x: currentX, y: currentY };
			showCursor();
		}
	}

	function handleMouseClick() {
		if (!settings.view.mouseCursor || !settings.view.mouseCursor.autoHide || !settings.view.mouseCursor.showOnButtonClick) return;
		showCursor();
	}

	// 监听当前页面变化
	$effect(() => {
		const currentPage = bookStore.currentPage;
		if (currentPage) {
			bookStore.setCurrentImage(currentPage);
			loadCurrentImage();
		}
	});

	// 监听超分完成事件
	$effect(() => {
		const handleUpscaleComplete = (e: CustomEvent) => {
			const { imageData, imageBlob } = e.detail;
			bookStore.setUpscaledImage(imageData);
			if (imageBlob) {
				bookStore.setUpscaledImageBlob(imageBlob);
			}
		};

		// 监听超分面板请求当前图片数据
		const handleRequestCurrentImageData = (e: CustomEvent) => {
			console.log('ImageViewer: 收到图片数据请求');
			const { callback } = e.detail;
			
			// 延迟检查，确保图片数据已加载
			setTimeout(() => {
				if (imageData && typeof callback === 'function') {
					console.log('ImageViewer: 返回图片数据，长度:', imageData.length);
					console.log('ImageViewer: 图片数据前缀:', imageData.substring(0, 50));
					callback(imageData);
				} else {
					console.log('ImageViewer: 没有图片数据或回调无效');
					console.log('ImageViewer: imageData存在:', !!imageData);
					console.log('ImageViewer: callback是函数:', typeof callback === 'function');
				}
			}, 100);
		};

		window.addEventListener('upscale-complete', handleUpscaleComplete as EventListener);
		window.addEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
		
		return () => {
			window.removeEventListener('upscale-complete', handleUpscaleComplete as EventListener);
			window.removeEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
		};
	});

	// 处理鼠标滚轮事件
	function handleWheel(e: WheelEvent) {
		// 不在输入框时响应
		const target = e.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true') {
			return;
		}

		const direction = e.deltaY < 0 ? 'up' : 'down';
		console.log('ImageViewer 鼠标滚轮:', direction); // 调试信息
		const action = keyBindingsStore.findActionByMouseWheel(direction);
		console.log('找到的操作:', action); // 调试信息
		if (action) {
			e.preventDefault();
			// 执行操作
			switch (action) {
				case 'nextPage':
					bookStore.nextPage();
					break;
				case 'prevPage':
					bookStore.previousPage();
					break;
				default:
					console.warn('未实现的滚轮操作：', action);
			}
		}
	}

	// 监听进度条状态变化
	$effect(() => {
		const handleProgressBarState = (e: CustomEvent) => {
			showProgressBar = e.detail.show;
		};
		
		window.addEventListener('progressBarStateChange', handleProgressBarState as EventListener);
		return () => {
			window.removeEventListener('progressBarStateChange', handleProgressBarState as EventListener);
		};
	});

	async function loadCurrentImage() {
		const currentPage = bookStore.currentPage;
		const currentBook = bookStore.currentBook;
		if (!currentPage || !currentBook) return;

		loading = true;
		loadingVisible = false; // 初始不显示loading
		error = null;
		// 不清空imageData，保持显示上一张图片直到新图加载完成

		// 设置1秒后显示loading动画
		loadingTimeout = setTimeout(() => {
			if (loading) {
				loadingVisible = true;
			}
		}, 1000);

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

			// 检查是否有对应的超分缓存
			await checkUpscaleCache(data);

			// 双页模式：加载下一页
			if ($viewMode === 'double' && bookStore.canNextPage) {
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
			loadingVisible = false;
			// 清除延迟显示loading的定时器
			if (loadingTimeout) {
				clearTimeout(loadingTimeout);
				loadingTimeout = null;
			}
		}
	}

	// 检查超分缓存
	async function checkUpscaleCache(imageData: string) {
		try {
			// 计算图片数据的hash
			const imageHash = await invoke<string>('calculate_data_hash', {
				dataUrl: imageData
			});
			
			// 检查所有算法的缓存
			const algorithms = ['realcugan', 'realesrgan', 'waifu2x'];
			
			for (const algorithm of algorithms) {
				try {
					const cacheData = await invoke<string>('check_upscale_cache_for_algorithm', {
						imageHash,
						algorithm
					});
					
					if (cacheData) {
						// 找到缓存，设置超分结果
						const blob = new Blob([new Uint8Array(JSON.parse(cacheData))], { type: 'image/webp' });
						const url = URL.createObjectURL(blob);
						
						bookStore.setUpscaledImage(url);
						bookStore.setUpscaledImageBlob(blob);
						
						console.log(`找到 ${algorithm} 算法的超分缓存`);
						return;
					}
				} catch (e) {
					// 继续检查下一个算法
					continue;
				}
			}
			
			// 没有找到缓存，清除超分结果
			bookStore.setUpscaledImage(null);
			bookStore.setUpscaledImageBlob(null);
		} catch (error) {
			console.error('检查超分缓存失败:', error);
		}
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

<div 
		class="image-viewer-container h-full w-full flex flex-col bg-black relative" 
		data-viewer="true" 
		onwheel={handleWheel}
		onmousemove={handleMouseMove}
		onclick={handleMouseClick}
		style:cursor={cursorVisible ? 'default' : 'none'}
	>
	<!-- 图像显示区域 -->
	<div class="image-container flex-1 flex items-center justify-center overflow-auto" data-viewer="true">
		{#if loadingVisible}
			<div class="text-white">Loading...</div>
		{:else if error}
			<div class="text-red-500">Error: {error}</div>
		{:else if imageData}
			<!-- 单页模式 -->
			{#if $viewMode === 'single'}
				<img
					src={bookStore.upscaledImageData || imageData}
					alt="Current page"
					class="max-w-full max-h-full object-contain"
					style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg); transition: transform 0.2s;"
				/>
			<!-- 双页模式 -->
			{:else if $viewMode === 'double'}
				<div class="flex gap-4 items-center justify-center">
					<img
						src={bookStore.upscaledImageData || imageData}
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
					src={bookStore.upscaledImageData || imageData}
					alt="Current page"
					class="w-full h-full object-contain"
					style="transform: scale({$zoomLevel}) rotate({$rotationAngle}deg); transition: transform 0.2s;"
				/>
			{/if}
		{/if}
	</div>
	
	<!-- Viewer底部进度条 -->
	{#if showProgressBar && bookStore.currentBook}
		<div class="absolute bottom-0 left-0 right-0 h-1 pointer-events-none">
			<div class="h-full transition-all duration-300 opacity-70" 
					 style="width: {((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100}%; background-color: #FDFBF7;">
			</div>
		</div>
	{/if}
</div>
