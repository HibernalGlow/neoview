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
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { settingsManager, performanceSettings } from '$lib/settings/settingsManager';
	import { onDestroy, onMount } from 'svelte';
	import ComparisonViewer from './ComparisonViewer.svelte';
	import ImageViewerDisplay from './flow/ImageViewerDisplay.svelte';
	import ImageViewerProgressBar from './flow/ImageViewerProgressBar.svelte';
	
	// 新模块导入
	import { createPreloadManager } from './flow/preloadManager';
	import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
	import { idbSet } from '$lib/utils/idb';

	

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

	// 进度条状态（现在由 ImageViewerProgressBar 内部计算）
	let progressColor = $state('#FDFBF7'); // 默认奶白色
	let progressBlinking = $state(false);

	

	// 预加载管理器
	let preloadManager: ReturnType<typeof createPreloadManager>;

	// 图片数据状态
	let imageData = $state<string | null>(null);
	let imageData2 = $state<string | null>(null); // 双页模式的第二张图
	let imageBitmap = $state<ImageBitmap | null>(null);
	let imageBitmap2 = $state<ImageBitmap | null>(null); // 双页模式的第二张图
	let loading = $state(false);
	let loadingVisible = $state(false); // 控制loading动画的可见性
	let error = $state<string | null>(null);
	let loadingTimeout: number | null = null; // 延迟显示loading的定时器
	
	// 预超分进度管理
	let preUpscaleProgress = $state(0); // 预超分进度 (0-100)
	let totalPreUpscalePages = $state(0); // 总预超分页数

	// 订阅设置变化
	settingsManager.addListener((s) => {
		settings = s;
	});

	// 初始化预加载管理器
	onMount(() => {
		const panelSettings = loadUpscalePanelSettings();

		preloadManager = createPreloadManager({
			initialPreloadPages: panelSettings.preloadPages,
			initialMaxThreads: panelSettings.backgroundConcurrency,
			onImageLoaded: (objectUrl, objectUrl2) => {
				imageData = objectUrl;
				imageData2 = objectUrl2;
			},
			onImageBitmapReady: async (bitmap, bitmap2) => {
				imageBitmap = bitmap;
				imageBitmap2 = bitmap2;
				if (bitmap) {
					try {
						originalImageDataForComparison = await bitmapToDataURL(bitmap);
					} catch (error) {
						console.error('转换 ImageBitmap 为 DataURL 失败:', error);
						originalImageDataForComparison = '';
					}
				} else {
					originalImageDataForComparison = '';
				}
			},
			onLoadingStateChange: (loadingState, visible) => {
				loading = loadingState;
				loadingVisible = visible;
			},
			onError: (errorMessage) => {
				error = errorMessage;
			},
			onPreloadProgress: (progress, total) => {
				preUpscaleProgress = progress;
				totalPreUpscalePages = total;
			},
			onUpscaleStart: () => {
				// 超分开始状态现在由 upscaleState 管理，进度条组件会自动响应
				console.log('超分开始事件触发');
			},
			onUpscaleComplete: (detail) => {
				const { imageData: upscaledImageData, imageBlob, originalImageHash } = detail;
				if (upscaledImageData) {
					bookStore.setUpscaledImage(upscaledImageData);
					upscaledImageDataForComparison = upscaledImageData;
				}
				if (imageBlob) {
					bookStore.setUpscaledImageBlob(imageBlob);
				}
				// 更新当前页面状态为已完成
				const currentPageIndex = bookStore.currentPageIndex;
				bookStore.setPageUpscaleStatus(currentPageIndex, 'done');
				console.log('超分图已匹配当前页面，MD5:', originalImageHash, '已替换，页面状态更新为完成');
			},
			onUpscaleSaved: async (detail) => {
				try {
					const { finalHash, savePath } = detail || {};
					if (finalHash && savePath) {
						console.log('后台超分已保存:', finalHash, savePath);
						// 持久化到 IndexedDB（按书）
						try {
							const cb = bookStore.currentBook;
							if (cb && cb.path) {
								const key = `hashPathIndex:${cb.path}`;
								// 从 preloadManager 获取 hashPathIndex 并持久化
								const cacheIndex = preloadManager.getPreloadMemoryCache();
								if (cacheIndex.has(finalHash)) {
									await idbSet(key, Array.from(cacheIndex.entries()));
								}
							}
						} catch (err2) {
							console.warn('持久化 hashPathIndex 到 IndexedDB 失败:', err2);
						}
					}
				} catch (err) {
					console.error('处理 upscale-saved 事件失败:', err);
				}
			},
			onRequestCurrentImageData: (detail) => {
				console.log('ImageViewer: 收到图片数据请求');
				const { callback } = detail;
				
				// 延迟检查，确保图片数据已加载
				setTimeout(async () => {
					if (typeof callback === 'function') {
						// 优先尝试从 ImageLoader 获取当前页面的 Blob
						if (preloadManager) {
							try {
								const blob = await preloadManager.getCurrentPageBlob();
								if (blob && blob.size > 0) {
									const url = URL.createObjectURL(blob);
									console.log('ImageViewer: 返回新的 Blob URL，大小:', blob.size);
									callback(url);
									return; // 成功返回，不执行后续逻辑
								}
							} catch (e) {
								console.warn('从 ImageLoader 获取 Blob 失败:', e);
							}
						}
						
						// 回退到 Object URL（如果可用）
						if (imageData) {
							console.log('ImageViewer: 返回缓存的 Object URL，长度:', imageData.length);
							callback(imageData);
						} else {
							console.log('ImageViewer: 没有可用的图片数据');
						}
					} else {
						console.log('ImageViewer: 回调函数无效');
					}
				}, 100);
			},
			onResetPreUpscaleProgress: () => {
				preUpscaleProgress = 0;
				totalPreUpscalePages = 0;
			},
			onComparisonModeChanged: async (detail) => {
				const { enabled } = detail;
				if (enabled && imageBitmap && bookStore.upscaledImageData) {
					comparisonVisible = true;
					try {
						originalImageDataForComparison = await bitmapToDataURL(imageBitmap);
					} catch (error) {
						console.error('对比模式：转换 ImageBitmap 为 DataURL 失败:', error);
						originalImageDataForComparison = '';
					}
					upscaledImageDataForComparison = bookStore.upscaledImageData;
				} else {
					comparisonVisible = false;
				}
			},
			onCacheHit: (detail) => {
				const { imageHash, url, blob } = detail;
				console.log('缓存命中，hash:', imageHash);
				// 更新 bookStore
				bookStore.setUpscaledImage(url);
				bookStore.setUpscaledImageBlob(blob);
			},
			onCheckPreloadCache: (detail) => {
				const { imageHash, preview } = detail;
				if (preview) {
					// 从内存缓存检查并更新
					const cache = preloadManager.getPreloadMemoryCache();
					if (cache.has(imageHash)) {
						const cached = cache.get(imageHash);
						if (cached) {
							bookStore.setUpscaledImage(cached.url);
							bookStore.setUpscaledImageBlob(cached.blob);
							console.log('从内存预加载缓存命中 upscaled，MD5:', imageHash);
						}
					}
				}
			}
		});

		(window as unknown as { preloadManager?: typeof preloadManager }).preloadManager = preloadManager;

		preloadManager.initialize();
	});

	// 组件卸载时清理
	onDestroy(() => {
		if (preloadManager) {
			preloadManager.cleanup();
		}
		if ((window as { preloadManager?: typeof preloadManager }).preloadManager === preloadManager) {
			delete (window as { preloadManager?: typeof preloadManager }).preloadManager;
		}
	});

	// 监听当前页面变化
	$effect(() => {
		const currentPage = bookStore.currentPage;
		if (currentPage) {
			bookStore.setCurrentImage(currentPage);
			// 使用预加载管理器加载图片
			if (preloadManager) {
				preloadManager.loadCurrentImage();
			}
		}
	});

	// 监听书籍切换：清理预加载管理器的缓存
	$effect(() => {
		const currentBook = bookStore.currentBook;
		if (preloadManager) {
			preloadManager.cleanup();
			preloadManager.initialize();
		}
	});

	

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

	// 监听视图模式变化，更新 PreloadManager 配置
	$effect(() => {
		const mode = $viewMode;
		if (mode && preloadManager) {
			// 更新 ImageLoader 的视图模式配置
			preloadManager.updateImageLoaderConfigWithViewMode(mode);
			// 重新加载当前页面
			preloadManager.loadCurrentImage();
		}
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

	/**
	 * 将 ImageBitmap 转换为 DataURL
	 */
	async function bitmapToDataURL(bitmap: ImageBitmap): Promise<string> {
		try {
			// 检查 ImageBitmap 是否已 detached
			const width = bitmap.width;
			const height = bitmap.height;
			
			if (width === 0 || height === 0) {
				console.warn('bitmapToDataURL: ImageBitmap 尺寸无效，可能已 detached');
				return '';
			}
			
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d')!;
			canvas.width = width;
			canvas.height = height;
			
			// 尝试绘制，如果失败则抛出错误
			ctx.drawImage(bitmap, 0, 0);
			
			return canvas.toDataURL('image/png');
		} catch (error) {
			console.warn('bitmapToDataURL 失败，ImageBitmap 可能已 detached:', error);
			return '';
		}
	}

	// ...
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
		{:else}
			<ImageViewerDisplay
				imageData={imageData}
				imageData2={imageData2}
				imageBitmap={imageBitmap}
				imageBitmap2={imageBitmap2}
				upscaledImageData={bookStore.upscaledImageData}
				viewMode={$viewMode as 'single' | 'double' | 'panorama'}
				zoomLevel={$zoomLevel}
				rotationAngle={$rotationAngle}
			/>
		{/if}
	</div>

	<!-- 对比模式查看器 -->
	<ComparisonViewer
		originalImageData={originalImageDataForComparison}
		upscaledImageData={upscaledImageDataForComparison}
		isVisible={comparisonVisible}
		onClose={closeComparison}
	/>
	
	<ImageViewerProgressBar
		showProgressBar={showProgressBar && Boolean(bookStore.currentBook)}
		totalPages={bookStore.currentBook?.pages.length ?? 0}
		currentPageIndex={bookStore.currentPageIndex}
		preUpscaleProgress={preUpscaleProgress}
		totalPreUpscalePages={totalPreUpscalePages}
		progressBlinking={progressBlinking}
		progressColor={progressColor}
	/>
</div>
