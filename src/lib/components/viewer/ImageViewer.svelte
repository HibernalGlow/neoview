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
	import { 
		performUpscale, 
		checkUpscaleCache, 
		triggerAutoUpscale, 
		getImageDataWithHash,
		type ImageDataWithHash 
	} from './flow/preloadRuntime';
	import { createEventListeners } from './flow/eventListeners';
	import { createPreloadManager } from './flow/preloadManager';

// 预加载任务结果类型
interface PreloadWorkerResult extends PreloadTaskResult {
	upscaledImageData?: string;
	upscaledImageBlob?: Blob;
}

// 执行超分函数的选项
interface PerformUpscaleOptions {
	background?: boolean;
}

// 执行超分函数的结果
interface PerformUpscaleResult {
	upscaledImageData?: string;
	upscaledImageBlob?: Blob;
	success?: boolean;
	error?: string;
}

	import { pyo3UpscaleManager } from '$lib/stores/upscale/PyO3UpscaleManager.svelte';
	import { upscaleState } from '$lib/stores/upscale/upscaleState.svelte';
	import { idbGet, idbSet, idbDelete } from '$lib/utils/idb';
    import { get } from 'svelte/store';

	// 获取全局超分开关状态
	async function getGlobalUpscaleEnabled(): Promise<boolean> {
		try {
			const settings = settingsManager.getSettings();
			return settings.image.enableSuperResolution || false;
		} catch (error) {
			console.warn('获取全局超分开关状态失败:', error);
			return false;
		}
	}

	

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

	// 响应超分状态变化
	$effect(() => {
		if (bookStore.currentPageUpscaled) {
			progressColor = '#10B981'; // 绿色
			progressBlinking = false;
		} else {
			progressColor = '#FDFBF7'; // 奶白色
		}
	});

	// 监听超分开始事件
	$effect(() => {
		const handleUpscaleStart = () => {
			progressColor = '#FCD34D'; // 黄色
			progressBlinking = true;
		};

		window.addEventListener('upscale-start', handleUpscaleStart);
		
		return () => {
			window.removeEventListener('upscale-start', handleUpscaleStart);
		};
	});

	// 预加载管理器
	let preloadManager: ReturnType<typeof createPreloadManager>;

	// 图片数据状态
	let imageData = $state<string | null>(null);
	let imageData2 = $state<string | null>(null); // 双页模式的第二张图
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
		preloadManager = createPreloadManager({
			onImageLoaded: (data, data2) => {
				imageData = data;
				imageData2 = data2;
				originalImageDataForComparison = data;
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
			onUpscaleComplete: (detail) => {
				const { imageData: upscaledImageData, imageBlob, originalImageHash } = detail;
				if (upscaledImageData) {
					bookStore.setUpscaledImage(upscaledImageData);
					upscaledImageDataForComparison = upscaledImageData;
				}
				if (imageBlob) {
					bookStore.setUpscaledImageBlob(imageBlob);
				}
				// 更新进度条外观：停止闪烁并变绿
				progressBlinking = false;
				progressColor = '#22c55e'; // 绿色
			},
			onComparisonModeChanged: (detail) => {
				const { enabled } = detail;
				comparisonVisible = enabled;
			}
		});

		preloadManager.initialize();
	});

	// 组件卸载时清理
	onDestroy(() => {
		if (preloadManager) {
			preloadManager.cleanup();
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

	

	// 监听超分完成事件
	$effect(() => {
		const handleUpscaleComplete = async (e: CustomEvent) => {
			// 为避免与组件中 imageData 变量冲突，这里用 upscaledImageData 表示事件中的数据
			const { imageData: upscaledImageData, imageBlob, originalImageHash } = e.detail;

			if (!upscaledImageData || !originalImageHash) return;

			try {
				// 如果 currentImageHash 还没有（异常情况），使用原始页面数据进行计算
				if (!currentImageHash) {
					if (originalImageDataForComparison) {
						const currentHash = await getImageMd5(originalImageDataForComparison);
						if (currentHash) {
							currentImageHash = currentHash;
						}
					}
				}

				// 只有当超分的是当前页面时才替换图片
				if (originalImageHash === currentImageHash) {
					bookStore.setUpscaledImage(upscaledImageData);
					if (imageBlob) {
						bookStore.setUpscaledImageBlob(imageBlob);
					}
					// 更新对比数据
					upscaledImageDataForComparison = upscaledImageData;
					// 立即更新进度条外观：停止闪烁并变绿——比仅依赖 upscaleState 更可靠，能避免竞态导致不变色的问题
					progressBlinking = false;
					progressColor = '#22c55e'; // 绿色
					console.log('超分图已匹配当前页面，MD5:', originalImageHash, '已替换，进度条设为绿色');
				} else {
					console.log('超分图不属于当前页面，超分MD5:', originalImageHash, '当前MD5:', currentImageHash);
				}
			} catch (error) {
				console.error('处理超分完成事件失败:', error);
			}
		};

		const handleUpscaleSaved = async (e: CustomEvent) => {
			try {
				const { finalHash, savePath } = e.detail || {};
				if (finalHash && savePath) {
					// 更新内存索引，供后续快速命中
					hashPathIndex.set(finalHash, savePath);
					console.log('后台超分已保存，已更新 hashPathIndex:', finalHash, savePath);
					// 持久化到 IndexedDB（按书）
					try {
						const cb = bookStore.currentBook;
						if (cb && cb.path) {
							const key = `hashPathIndex:${cb.path}`;
							await idbSet(key, Array.from(hashPathIndex.entries()));
						}
					} catch (err2) {
						console.warn('持久化 hashPathIndex 到 IndexedDB 失败:', err2);
					}
				}
			} catch (err) {
				console.error('处理 upscale-saved 事件失败:', err);
			}
		};

		// 监听重置预超分进度事件
		const handleResetPreUpscaleProgress = () => {
			resetPreUpscaleProgress();
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
	window.addEventListener('upscale-saved', handleUpscaleSaved as EventListener);
		window.addEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
		window.addEventListener('reset-pre-upscale-progress', handleResetPreUpscaleProgress as EventListener);

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
			window.removeEventListener('upscale-saved', handleUpscaleSaved as EventListener);
			window.removeEventListener('request-current-image-data', handleRequestCurrentImageData as EventListener);
			window.removeEventListener('reset-pre-upscale-progress', handleResetPreUpscaleProgress as EventListener);
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
		if (mode && preloadManager) {
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
