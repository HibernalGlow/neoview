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
	import { upscaleState, performUpscale, getGlobalUpscaleEnabled, upscaleSettings } from '$lib/stores/upscale/UpscaleManager.svelte';
    import { get } from 'svelte/store';

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
	let preloadQueue = $state<ImageDataWithHash[]>([]);
	let isPreloading = $state(false);

	// 预超分进度管理
	let preUpscaleProgress = $state(0); // 预超分进度 (0-100)
	let preUpscaledPages = $state(new Set<number>()); // 已预超分的页面索引
	let totalPreUpscalePages = $state(0); // 总预超分页数

	// 当前页面hash管理
	let currentImageHash = $state<string>(''); // 当前页面的原始图片hash
	
	// MD5缓存管理
	let md5Cache = $state<Map<string, string>>(new Map()); // 缓存图片URL到MD5的映射

	// 本地 hash -> disk path 索引（内存）
	let hashPathIndex = $state<Map<string, string>>(new Map());

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
			// 重置当前页面hash
			currentImageHash = '';
			loadCurrentImage();
		}
	});

	// 监听书籍切换：清理上一本书的内存缓存（但不立即删除磁盘缓存，磁盘缓存由 TTL 管理）
	$effect(() => {
		const currentBook = bookStore.currentBook;
		// 当 currentBook 发生变化时（切书或关闭），清理内存缓存与预加载队列
		// 如果 currentBook 非空，表示打开/切换到新书；我们仍然清理旧的内存缓存以释放资源
		md5Cache = new Map();
		hashPathIndex = new Map();
		preloadQueue = [];
		isPreloading = false;
		bookStore.setUpscaledImage(null);
		bookStore.setUpscaledImageBlob(null);
		resetPreUpscaleProgress();
	});

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
					console.log('超分图已匹配当前页面，MD5:', originalImageHash, '已替换');
				} else {
					console.log('超分图不属于当前页面，超分MD5:', originalImageHash, '当前MD5:', currentImageHash);
				}
			} catch (error) {
				console.error('处理超分完成事件失败:', error);
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

			// 获取带hash的图片数据：优先使用基于路径的稳定hash（archive::innerpath），回退到数据hash
			let imageDataWithHash = null;
			try {
				const book = currentBook;
				if (book) {
					const pageIndex = bookStore.currentPageIndex;
					const pageInfo = book.pages?.[pageIndex];
					if (pageInfo) {
						const pathKey = book.type === 'archive' ? `${book.path}::${pageInfo.path}` : pageInfo.path;
						try {
							const pathHash = await invoke<string>('calculate_path_hash', { path: pathKey });
							imageDataWithHash = { data, hash: pathHash };
						} catch (e) {
							console.warn('调用 calculate_path_hash 失败，回退到数据哈希:', e);
						}
					}
				}
			} catch (e) {
				console.warn('生成路径hash异常，回退到数据哈希:', e);
			}
			if (!imageDataWithHash) {
				imageDataWithHash = await getImageDataWithHash(data);
				if (!imageDataWithHash) {
					console.error('无法获取图片数据及hash');
					return;
				}
			}
		
			// 保存当前页面的hash
			currentImageHash = imageDataWithHash.hash;
			console.log('当前页面hash:', currentImageHash);

			// 检查是否有对应的超分缓存（传入带hash的对象）
			const hasCache = await checkUpscaleCache(imageDataWithHash);

			// 如果没有缓存且全局超分开关开启，则自动开始超分
			if (!hasCache) {
				await triggerAutoUpscale(imageDataWithHash);
			}

			// 触发预加载后续页面
			// 使用 setTimeout 避免阻塞当前页面加载
			setTimeout(() => {
				console.log('准备触发预超分...');
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

	// 检查超分缓存（使用传入的hash）
	async function checkUpscaleCache(imageDataWithHash: ImageDataWithHash): Promise<boolean> {
		try {
			// 先清除当前的超分结果，避免显示错误的图片
			bookStore.setUpscaledImage(null);
			bookStore.setUpscaledImageBlob(null);
			
			const { data: imageData, hash: imageHash } = imageDataWithHash;
			
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

				// 读取 TTL（小时）设置，默认8小时
				let ttlHours = 8;
				try {
					let s; upscaleSettings.subscribe(x => s = x)();
					ttlHours = s?.cache_ttl_hours ?? ttlHours;
				} catch (e) {
					console.warn('读取缓存TTL失败，使用默认值', e);
				}
				const ttlSeconds = ttlHours * 3600;

				for (const algorithm of algorithms) {
					try {
						// 后端现在返回结构化的 metadata（path/mtime/size/algorithm），若未命中会抛出错误
						const meta: any = await invoke('check_upscale_cache_for_algorithm', {
							imageHash,
							algorithm,
							thumbnailPath: 'D:\\temp\\neoview_thumbnails_test',
							max_age_seconds: ttlSeconds
						});

						if (meta && meta.path) {
							try {
								// 懒加载二进制：仅在确认存在缓存时才读取文件字节
								const bytes = await invoke<number[]>('read_binary_file', { filePath: meta.path });
								const arr = new Uint8Array(bytes);
								const blob = new Blob([arr], { type: 'image/webp' });
								const url = URL.createObjectURL(blob);
								bookStore.setUpscaledImage(url);
								bookStore.setUpscaledImageBlob(blob);
								// 更新内存索引，便于后续快速命中
								hashPathIndex.set(imageHash, meta.path);
								console.log(`找到 ${meta.algorithm || algorithm} 算法的超分缓存，path: ${meta.path}`);
								return true;
							} catch (e) {
								console.error('读取缓存文件失败:', e);
								continue;
							}
						}
					} catch (e) {
						// 继续检查下一个算法
						continue;
					}
				}
			
			// 没有找到缓存
			console.log('未找到任何超分缓存，MD5:', imageHash);
			return false;
		} catch (error) {
			console.error('检查超分缓存失败:', error);
			bookStore.setUpscaledImage(null);
			bookStore.setUpscaledImageBlob(null);
			return false;
		}
	}

	// 触发自动超分 - 复用 UpscalePanel 的 startUpscale 逻辑
	async function triggerAutoUpscale(imageDataWithHash: ImageDataWithHash, isPreload = false) {
		try {
			// 验证图片数据
			if (!imageDataWithHash || !imageDataWithHash.data) {
				console.error('自动超分：图片数据为空');
				return;
			}

			// 检查全局开关
			const globalEnabled = await getGlobalUpscaleEnabled();
			if (!globalEnabled) {
				console.log('全局超分开关已关闭，跳过自动超分');
				return;
			}

			// 如果是预加载且有其他任务在进行，加入队列
			if (isPreload) {
				const currentState = get(upscaleState);
				if (currentState?.isUpscaling || isPreloading) {
					// 验证图片数据格式
					if (!imageDataWithHash.data.startsWith('blob:') && !imageDataWithHash.data.startsWith('data:image/')) {
						console.warn('预加载：图片数据格式异常，不加入队列');
						return;
					}
					
					// 检查是否已在队列中
					const exists = preloadQueue.some(item => item.hash === imageDataWithHash.hash);
					if (!exists) {
						// 保存带hash的图片数据到队列
						preloadQueue = [...preloadQueue, imageDataWithHash];
						console.log(`加入预加载队列，MD5: ${imageDataWithHash.hash}, 数据长度: ${imageDataWithHash.data.length}`);
					}
					return;
				}
			} else {
				// 当前页面的超分，检查是否正在超分
				const currentState = get(upscaleState);
				if (currentState?.isUpscaling) {
					console.log('超分正在进行中，跳过自动超分');
					return;
				}
			}

			const { data: imageData, hash: imageHash } = imageDataWithHash;
			console.log(isPreload ? '触发预加载超分' : '触发当前页面超分', 'MD5:', imageHash, '图片数据长度:', imageData.length);
			
			// 检查是否是blob URL，如果是则转换为data URL（保持一致性）
			let processedImageData = imageData;
			if (imageData.startsWith('blob:')) {
				console.log('检测到blob URL，正在转换为data URL...');
				const response = await fetch(imageData);
				const blob = await response.blob();
				
				// 转换为base64
				const reader = new FileReader();
				processedImageData = await new Promise<string>((resolve, reject) => {
					reader.onload = () => {
						const result = reader.result as string;
						resolve(result);
					};
					reader.onerror = reject;
					reader.readAsDataURL(blob);
				});
				console.log('转换后的data URL长度:', processedImageData.length);
			}
			
			// 检查图片格式
			const isAvif = processedImageData.startsWith('data:image/avif');
			const isJxl = processedImageData.startsWith('data:image/jxl');
			
			// 对于AVIF和JXL，先转换为WebP
			if (isAvif || isJxl) {
				console.log(`转换${isAvif ? 'AVIF' : 'JXL'}为WebP...`);
				processedImageData = await invoke<string>('convert_data_url_to_webp', {
					dataUrl: processedImageData
				});
				console.log('转换后的WebP数据长度:', processedImageData.length);
			}
			
			// 标记预加载状态
			if (isPreload) {
				isPreloading = true;
			}
			
			// 使用处理后的图片数据和原始hash执行超分
			await performUpscale(processedImageData, imageHash);
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
		// 如果队列为空，直接返回
		if (preloadQueue.length === 0) return;

		// 如果当前有超分任务在执行，稍后再试（由正在进行的任务在完成时触发 processNextInQueue）
		const currentState = get(upscaleState);
		if (currentState?.isUpscaling || isPreloading) {
			console.log('preload queue: upscale in progress, will try later');
			return;
		}

		// 取出队列第一个任务（按 FIFO）
		const nextTask = preloadQueue[0];
		preloadQueue = preloadQueue.slice(1);

		console.log(`处理队列中的下一个任务: ${nextTask.hash}, 数据长度: ${nextTask.data.length}`);

		// 使用保存的图片数据和hash执行超分
		try {
			await triggerAutoUpscale(nextTask, true);
		} catch (error) {
			console.error('队列任务执行失败:', error);
		}

		// 如果队列还有剩余，则尝试继续（triggerAutoUpscale 的 finally 会再次调用 processNextInQueue
		// 当当前任务完成后；这里做一次主动调用以覆盖没有触发完成路径的情况）
		if (preloadQueue.length > 0) {
			setTimeout(() => processNextInQueue(), 50);
		}
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
				console.log('预加载设置:', { preloadPages, globalEnabled: settings?.global_upscale_enabled });
			} catch (e) {
				console.warn('获取预加载设置失败，使用默认值:', e);
			}

			// 检查全局开关
			const globalEnabled = await getGlobalUpscaleEnabled();
			if (!globalEnabled) {
				console.log('全局超分开关已关闭，跳过预超分');
				return;
			}

			if (preloadPages <= 0) {
				console.log('预加载页数为0，跳过预超分');
				return;
			}

			const currentBook = bookStore.currentBook;
			if (!currentBook) {
				console.log('没有当前书籍，跳过预超分');
				return;
			}

			const currentIndex = bookStore.currentPageIndex;
			const totalPages = bookStore.totalPages;

			// 初始化预超分进度
			totalPreUpscalePages = Math.min(preloadPages, totalPages - currentIndex - 1);
			preUpscaledPages = new Set();
			preUpscaleProgress = 0;

			if (totalPreUpscalePages <= 0) {
				console.log('没有需要预超分的页面');
				return;
			}

			console.log(`开始预超分，共 ${totalPreUpscalePages} 页，当前页: ${currentIndex + 1}/${totalPages}`);

			// 预加载后续页面
			for (let i = 1; i <= preloadPages; i++) {
				const targetIndex = currentIndex + i;
				if (targetIndex >= totalPages) break;

				const pageInfo = currentBook.pages[targetIndex];
				if (!pageInfo) continue;

				console.log(`预超分第 ${targetIndex + 1} 页...`);

				try {
					// 加载页面图片
					let pageImageData: string;
					if (currentBook.type === 'archive') {
						pageImageData = await loadImageFromArchive(currentBook.path, pageInfo.path);
					} else {
						pageImageData = await loadImage(pageInfo.path);
					}

					// 验证图片数据
					if (!pageImageData) {
						console.warn(`第 ${targetIndex + 1} 页图片数据为空，跳过`);
						continue;
					}

					// 获取带hash的图片数据：优先使用基于路径的稳定hash（archive::innerpath），回退到数据哈希
					let imageDataWithHash = null;
					try {
						const pathKey = currentBook.type === 'archive' ? `${currentBook.path}::${pageInfo.path}` : pageInfo.path;
						try {
							const pathHash = await invoke<string>('calculate_path_hash', { path: pathKey });
							imageDataWithHash = { data: pageImageData, hash: pathHash };
						} catch (e) {
							console.warn('为预加载页面获取路径hash失败，回退到数据hash:', e);
						}
					} catch (e) {
						console.warn('生成预加载页面路径hash异常，回退到数据hash:', e);
					}
					if (!imageDataWithHash) {
						const tmp = await getImageDataWithHash(pageImageData);
						if (!tmp) {
							console.warn(`第 ${targetIndex + 1} 页无法获取图片hash，跳过`);
							continue;
						}
						imageDataWithHash = tmp;
					}

					console.log(`第 ${targetIndex + 1} 页图片数据长度: ${imageDataWithHash.data.length}, hash: ${imageDataWithHash.hash}`);

					// 检查是否已有缓存
					const hasCache = await checkUpscaleCache(imageDataWithHash);
					if (hasCache) {
						console.log(`第 ${targetIndex + 1} 页已有超分缓存`);
						// 标记为已预超分
						preUpscaledPages = new Set([...preUpscaledPages, targetIndex]);
						updatePreUpscaleProgress();
						continue;
					}

					// 没有缓存，触发预超分
					await triggerAutoUpscale(imageDataWithHash, true);
					// 标记为已预超分
					preUpscaledPages = new Set([...preUpscaledPages, targetIndex]);
					updatePreUpscaleProgress();
				} catch (error) {
					console.error(`预超分第 ${targetIndex + 1} 页失败:`, error);
				}
			}
		} catch (error) {
			console.error('预超分失败:', error);
		}
	}

	// 更新预超分进度
	function updatePreUpscaleProgress() {
		if (totalPreUpscalePages > 0) {
			preUpscaleProgress = (preUpscaledPages.size / totalPreUpscalePages) * 100;
		}
	}

	// 重置预超分进度（仅在书籍关闭时调用）
	function resetPreUpscaleProgress() {
		preUpscaleProgress = 0;
		preUpscaledPages = new Set();
		totalPreUpscalePages = 0;
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

	// 获取图片的MD5（只计算一次，后续使用缓存）
	async function getImageMd5(imageUrl: string): Promise<string | null> {
		if (!imageUrl) return null;
		
		// 检查缓存
		if (md5Cache.has(imageUrl)) {
			return md5Cache.get(imageUrl) || null;
		}
		
		try {
			// 对于blob URL，需要先转换为data URL
			let dataUrl = imageUrl;
			if (imageUrl.startsWith('blob:')) {
				console.log('getImageMd5: 转换blob URL为data URL...');
				const response = await fetch(imageUrl);
				const blob = await response.blob();
				dataUrl = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => {
						const result = reader.result as string;
						resolve(result);
					};
					reader.onerror = reject;
					reader.readAsDataURL(blob);
				});
				console.log('getImageMd5: 转换完成，data URL长度:', dataUrl.length);
			} else if (!imageUrl.startsWith('data:image/')) {
				console.error('getImageMd5: 无效的图片URL格式:', imageUrl);
				return null;
			}
			
			// 计算MD5
			const md5 = await invoke<string>('calculate_data_hash', {
				dataUrl: dataUrl
			});
			
			// 缓存结果
			md5Cache.set(imageUrl, md5);
			
			return md5;
		} catch (error) {
			console.error('计算MD5失败:', error);
			return null;
		}
	}

	// 创建带有MD5信息的图片数据结构
	interface ImageDataWithHash {
		data: string;
		hash: string;
	}

	// 获取带hash的图片数据
	async function getImageDataWithHash(imageUrl: string): Promise<ImageDataWithHash | null> {
		if (!imageUrl) return null;
		
		// 获取或计算MD5
		const hash = await getImageMd5(imageUrl);
		if (!hash) return null;
		
		return {
			data: imageUrl,
			hash: hash
		};
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
			<!-- 预超分进度条（黄色，底层） -->
			{#if preUpscaleProgress > 0}
				<div 
					class="absolute bottom-0 left-0 h-full transition-all duration-500" 
					style="width: {((bookStore.currentPageIndex + 1 + preUpscaleProgress / 100 * totalPreUpscalePages) / bookStore.currentBook.pages.length) * 100}%; background-color: #FCD34D; opacity: 0.6;"
				>
				</div>
			{/if}
			<!-- 当前页面进度条（奶白色/绿色，叠加在黄色上面） -->
			<div 
				class="absolute bottom-0 left-0 h-full transition-all duration-300 {progressBlinking ? 'animate-pulse' : ''}" 
				style="width: {((bookStore.currentPageIndex + 1) / bookStore.currentBook.pages.length) * 100}%; background-color: {progressColor}; opacity: 0.8;"
			>
			</div>
		</div>
	{/if}
</div>
