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
	import ComparisonViewer from './ComparisonViewer.svelte';
	import { upscaleState, performUpscale, getGlobalUpscaleEnabled } from '$lib/stores/upscale/UpscaleManager.svelte';

	// 进度条状态
	let showProgressBar = $state(true);

	// 鼠标光标隐藏相关
	let cursorVisible = $state(true);
	let hideCursorTimeout: number | null = null;
	let lastMousePosition = $state({ x: 0, y: 0 });
	let settings = $state(settingsManager.getSettings());

	// 对比模式状态
	let comparisonVisible = $state(false);
	let originalImageDataForComparison = $state<string>('');
	let upscaledImageDataForComparison = $state<string>('');

	// 进度条状态
	let progressColor = $state('#FDFBF7'); // 默认奶白色
	let progressBlinking = $state(false);

	// 预加载队列管理
	let preloadQueue = $state<string[]>([]);
	let isPreloading = $state(false);

	// 订阅设置变化
	settingsManager.addListener((s) => {
		settings = s;
	});

	// 订阅超分状态变化
	let upscaleStateUnsubscribe: () => void;
	
	$effect(() => {
		upscaleStateUnsubscribe = upscaleState.subscribe(state => {
			if (state.isUpscaling) {
				// 超分进行中，开始闪烁
				progressBlinking = true;
				progressColor = '#FDFBF7'; // 奶白色
			} else if (state.upscaledImageData && !state.isUpscaling) {
				// 超分完成，停止闪烁，变成绿色
				progressBlinking = false;
				progressColor = '#22c55e'; // 绿色
			} else {
				// 没有超分，恢复默认
				progressBlinking = false;
				progressColor = '#FDFBF7'; // 奶白色
			}
		});
		
		return () => {
			if (upscaleStateUnsubscribe) {
				upscaleStateUnsubscribe();
			}
		};
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
			// 更新对比数据
			upscaledImageDataForComparison = imageData;
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

		// 监听对比模式变化
		const handleComparisonModeChanged = (e: CustomEvent) => {
			const { enabled } = e.detail;
			if (enabled && imageData && bookStore.upscaledImageData) {
				comparisonVisible = true;
				originalImageDataForComparison = imageData;
				upscaledImageDataForComparison = bookStore.upscaledImageData;
			} else {
				comparisonVisible = false;
			}
		};

		window.addEventListener('comparison-mode-changed', handleComparisonModeChanged as EventListener);
		
		return () => {
			window.removeEventListener('upscale-complete', handleUpscaleComplete as EventListener);
			window.removeEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
			window.removeEventListener('comparison-mode-changed', handleComparisonModeChanged as EventListener);
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
			// 更新对比数据
			originalImageDataForComparison = data;

			// 检查是否有对应的超分缓存
			const hasCache = await checkUpscaleCache(data);

			// 如果没有缓存且全局超分开关开启，则自动开始超分
			if (!hasCache) {
				await triggerAutoUpscale(data);
			}

			// 触发预加载后续页面
			// 使用 setTimeout 避免阻塞当前页面加载
			setTimeout(() => {
				preloadNextPages();
			}, 1000);

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
	async function checkUpscaleCache(imageData: string): Promise<boolean> {
		try {
			// 先清除当前的超分结果，避免显示错误的图片
			bookStore.setUpscaledImage(null);
			bookStore.setUpscaledImageBlob(null);
			
			// 计算图片数据的hash
			const imageHash = await invoke<string>('calculate_data_hash', {
				dataUrl: imageData
			});
			
			// 获取当前活动的算法设置
			let currentAlgorithm = 'realcugan'; // 默认值
			try {
				// 从本地设置获取当前算法
				let settings;
				upscaleSettings.subscribe(s => settings = s)();
				currentAlgorithm = settings?.active_algorithm || 'realcugan';
			} catch (e) {
				console.warn('获取当前算法失败，使用默认值:', e);
			}
			
			// 优先检查当前算法的缓存
			const algorithms = [currentAlgorithm, 'realcugan', 'realesrgan', 'waifu2x'];
			
			for (const algorithm of algorithms) {
				try {
					const cacheData = await invoke<string>('check_upscale_cache_for_algorithm', {
						imageHash,
						algorithm,
						thumbnailPath: 'D:\\temp\\neoview_thumbnails_test'
					});
					
					if (cacheData) {
						// 找到缓存，设置超分结果
						const blob = new Blob([new Uint8Array(JSON.parse(cacheData))], { type: 'image/webp' });
						const url = URL.createObjectURL(blob);
						
						bookStore.setUpscaledImage(url);
						bookStore.setUpscaledImageBlob(blob);
						
						console.log(`找到 ${algorithm} 算法的超分缓存`);
						return true;
					}
				} catch (e) {
					// 继续检查下一个算法
					continue;
				}
			}
			
			// 没有找到缓存
			console.log('未找到任何超分缓存');
			return false;
		} catch (error) {
			console.error('检查超分缓存失败:', error);
			bookStore.setUpscaledImage(null);
			bookStore.setUpscaledImageBlob(null);
			return false;
		}
	}

	// 触发自动超分 - 复用 UpscalePanel 的 startUpscale 逻辑
	async function triggerAutoUpscale(imageData: string, isPreload = false) {
		try {
			// 检查全局开关
			const globalEnabled = await getGlobalUpscaleEnabled();
			if (!globalEnabled) {
				console.log('全局超分开关已关闭，跳过自动超分');
				return;
			}

			// 如果是预加载且有其他任务在进行，加入队列
			if (isPreload) {
				const currentState = upscaleState;
				if (currentState.isUpscaling || isPreloading) {
					// 计算图片hash作为唯一标识
					const imageHash = await invoke<string>('calculate_data_hash', {
						dataUrl: imageData
					});
					
					// 检查是否已在队列中
					if (!preloadQueue.includes(imageHash)) {
						preloadQueue = [...preloadQueue, imageHash];
						console.log(`加入预加载队列，队列长度: ${preloadQueue.length}`);
					}
					return;
				}
			} else {
				// 当前页面的超分，检查是否正在超分
				const currentState = upscaleState;
				if (currentState.isUpscaling) {
					console.log('超分正在进行中，跳过自动超分');
					return;
				}
			}

			console.log(isPreload ? '触发预加载超分' : '触发当前页面超分', '图片数据长度:', imageData.length);
			
			// 检查是否是blob URL，如果是则转换为data URL
			if (imageData.startsWith('blob:')) {
				console.log('检测到blob URL，正在转换为data URL...');
				const response = await fetch(imageData);
				const blob = await response.blob();
				
				// 转换为base64
				const reader = new FileReader();
				imageData = await new Promise<string>((resolve, reject) => {
					reader.onload = () => {
						const result = reader.result as string;
						resolve(result);
					};
					reader.onerror = reject;
					reader.readAsDataURL(blob);
				});
				console.log('转换后的data URL长度:', imageData.length);
			}
			
			// 检查图片格式
			const isAvif = imageData.startsWith('data:image/avif');
			const isJxl = imageData.startsWith('data:image/jxl');
			
			// 对于AVIF和JXL，先转换为WebP
			if (isAvif || isJxl) {
				console.log(`转换${isAvif ? 'AVIF' : 'JXL'}为WebP...`);
				imageData = await invoke<string>('convert_data_url_to_webp', {
					dataUrl: imageData
				});
				console.log('转换后的WebP数据长度:', imageData.length);
			}
			
			// 标记预加载状态
			if (isPreload) {
				isPreloading = true;
			}
			
			// 使用新的超分管理器执行超分
			await performUpscale(imageData);
		} catch (error) {
			console.error('自动超分失败:', error);
		} finally {
			// 清理预加载状态
			if (isPreload) {
				isPreloading = false;
				// 处理队列中的下一个任务
				processNextInQueue();
			}
		}
	}

	// 处理预加载队列
	async function processNextInQueue() {
		if (preloadQueue.length === 0) {
			return;
		}

		// 取出队列第一个任务
		const nextHash = preloadQueue[0];
		preloadQueue = preloadQueue.slice(1);

		// 这里需要重新加载图片数据，因为只有hash
		// 暂时跳过，因为需要从页面信息重新加载
		console.log(`处理队列中的下一个任务: ${nextHash}`);
	}

	// 预加载后续页面的超分
	async function preloadNextPages() {
		try {
			// 获取预加载页数设置
			let preloadPages = 3; // 默认值
			try {
				let settings;
				upscaleSettings.subscribe(s => settings = s)();
				preloadPages = settings?.preload_pages || 3;
			} catch (e) {
				console.warn('获取预加载设置失败，使用默认值:', e);
			}

			if (preloadPages <= 0) {
				console.log('预加载页数为0，跳过预加载');
				return;
			}

			const currentBook = bookStore.currentBook;
			if (!currentBook) return;

			const currentIndex = bookStore.currentPageIndex;
			const totalPages = bookStore.totalPages;

			// 预加载后续页面
			for (let i = 1; i <= preloadPages; i++) {
				const targetIndex = currentIndex + i;
				if (targetIndex >= totalPages) break;

				const pageInfo = currentBook.pages[targetIndex];
				if (!pageInfo) continue;

				console.log(`预加载第 ${targetIndex + 1} 页的超分...`);

				// 加载页面图片
				let pageImageData: string;
				try {
					if (currentBook.type === 'archive') {
						pageImageData = await loadImageFromArchive(currentBook.path, pageInfo.path);
					} else {
						pageImageData = await loadImage(pageInfo.path);
					}

					// 检查是否已有缓存
					const hasCache = await checkUpscaleCache(pageImageData);
					if (hasCache) {
						console.log(`第 ${targetIndex + 1} 页已有超分缓存`);
						continue;
					}

					// 没有缓存，触发预加载超分
					await triggerAutoUpscale(pageImageData, true);
				} catch (error) {
					console.error(`预加载第 ${targetIndex + 1} 页失败:`, error);
				}
			}
		} catch (error) {
			console.error('预加载失败:', error);
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
		// 处理对比模式下的 ESC 键
		if (comparisonVisible && e.key === 'Escape') {
			comparisonVisible = false;
			return;
		}

		// 生成按键组合
		const keyCombo = generateKeyCombo(e);

		// 查找对应的命令
		const command = findCommandByKeys(keyCombo, $keyBindings);

		if (command) {
			e.preventDefault();
			executeCommand(command);
		}
	}

	// 关闭对比模式
	function closeComparison() {
		comparisonVisible = false;
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

	<!-- 对比模式查看器 -->
	<ComparisonViewer
		originalImageData={originalImageDataForComparison}
		upscaledImageData={upscaledImageDataForComparison}
		isVisible={comparisonVisible}
		onClose={closeComparison}
	/>
	
	<!-- Viewer底部进度条 -->
	{#if showProgressBar && bookStore.currentBook}
		<div class="absolute bottom-0 left-0 right-0 h-1 pointer-events-none">
			<div 
				class="h-full transition-all duration-300 {progressBlinking ? 'animate-pulse' : ''}" 
				style="width: {((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100}%; background-color: {progressColor}; opacity: 0.7;"
			>
			</div>
		</div>
	{/if}
</div>
