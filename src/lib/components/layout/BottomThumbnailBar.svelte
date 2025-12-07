<script lang="ts">
	/**
	 * Bottom Thumbnail Bar
	 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
	 */
	import { onDestroy, onMount } from 'svelte';
	import { readable } from 'svelte/store';
	import { bookStore } from '$lib/stores/book.svelte';
	import { thumbnailCacheStore, type ThumbnailEntry } from '$lib/stores/thumbnailCache.svelte';
	import { loadImage } from '$lib/api/fs';
	import { loadImageFromArchive, generateVideoThumbnail } from '$lib/api/filesystem';
	import {
		bottomThumbnailBarPinned,
		bottomBarLockState,
		bottomBarOpen,
		bottomThumbnailBarHeight,
		viewerPageInfoVisible,
		jumpToPage
	} from '$lib/stores';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { Button } from '$lib/components/ui/button';

	import HorizontalListSlider from '$lib/components/panels/file/components/HorizontalListSlider.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Image as ImageIcon, Pin, PinOff, GripHorizontal, Target, Hash } from '@lucide/svelte';
	import { thumbnailService } from '$lib/services/thumbnailService';
	import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import { isVideoFile } from '$lib/utils/videoUtils';

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	// 阅读方向状态
	let settings = $state(settingsManager.getSettings());
	let readingDirection = $derived(settings.book.readingDirection);
	let hoverAreas = $derived(settings.panels?.hoverAreas);
	let autoHideTiming = $derived(
		settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 }
	);
	let bottomBarOpacity = $derived(settings.panels?.bottomBarOpacity ?? 85);
	let bottomBarBlur = $derived(settings.panels?.bottomBarBlur ?? 12);
	let lastReadingDirection = $state<'left-to-right' | 'right-to-left' | null>(null);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	const LOCAL_MIN_THUMBNAILS = 6;
	const ARCHIVE_MIN_THUMBNAILS = 3;

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let showTimeout: number | undefined;
	// 全局缩略图缓存快照
	let thumbnailSnapshot = $state<Map<number, ThumbnailEntry>>(new Map());
	let unsubscribeThumbnailCache: (() => void) | null = null;
	let thumbnailScrollContainer = $state<HTMLDivElement | null>(null);
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;

	let showPageNumbers = $state(true); // 显示底栏页码标签
	let hoverCount = $state(0); // 追踪悬停区域的计数
	let showAreaOverlay = $state(false); // 显示区域覆盖层
	let showHoverAreasOverlay = $state(false); // 显示边栏悬停触发区域覆盖层
	const showDebugInfo = false; // 底栏调试信息开关

	// 缩略图列表滚动进度（用于 HorizontalListSlider）
	let thumbnailScrollProgress = $state(0);

	// 从全局缓存获取缩略图
	function getThumbnailFromCache(pageIndex: number): ThumbnailEntry | null {
		return thumbnailSnapshot.get(pageIndex) ?? null;
	}

	// 响应钉住状态、锁定状态和 open 状态
	$effect(() => {
		// 锁定隐藏时，强制隐藏
		if ($bottomBarLockState === false) {
			isVisible = false;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
			return;
		}
		// 锁定显示或钉住时，强制显示
		if ($bottomThumbnailBarPinned || $bottomBarLockState === true) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
			return;
		}
		// 响应 open 状态
		if ($bottomBarOpen) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
			scheduleLoadVisibleThumbnails(true);
		} else {
			isVisible = false;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
		}
	});

	// 初始化时同步进度条状态
	// Removed global progressBarStateChange initialization effect

	const THUMBNAIL_DEBOUNCE_MS = 250;
	let loadThumbnailsDebounce: number | null = null;
	let lastThumbnailRange: { start: number; end: number } | null = null;
	const noThumbnailPaths = new Set<string>();

	function scheduleLoadVisibleThumbnails(immediate = false) {
		if (immediate) {
			if (loadThumbnailsDebounce) {
				clearTimeout(loadThumbnailsDebounce);
				loadThumbnailsDebounce = null;
			}
			void loadVisibleThumbnails();
			return;
		}
		if (loadThumbnailsDebounce) return;
		loadThumbnailsDebounce = window.setTimeout(() => {
			loadThumbnailsDebounce = null;
			void loadVisibleThumbnails();
		}, THUMBNAIL_DEBOUNCE_MS);
	}

	function showThumbnails() {
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
		scheduleLoadVisibleThumbnails(true);
		// 不要在这里设置定时器，让 handleMouseLeave 来处理
	}

	function handleMouseEnter() {
		hoverCount++;
		// 锁定隐藏时，不响应悬停
		if ($bottomBarLockState === false) return;
		if ($bottomThumbnailBarPinned || $bottomBarLockState === true) {
			showThumbnails();
			return;
		}
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		const showDelayMs = (autoHideTiming?.showDelaySec ?? 0) * 1000;
		if (showDelayMs > 0) {
			showTimeout = setTimeout(() => {
				if (hoverCount > 0 && !$bottomThumbnailBarPinned) {
					showThumbnails();
				}
			}, showDelayMs) as unknown as number;
		} else {
			showThumbnails();
		}
	}

	function handleMouseLeave() {
		hoverCount--;
		if ($bottomThumbnailBarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		// 只有当计数为0时（即鼠标离开了所有相关区域）才开始延迟隐藏
		if (hoverCount <= 0) {
			const hideDelayMs = (autoHideTiming?.hideDelaySec ?? 0) * 1000;
			hideTimeout = setTimeout(() => {
				if (hoverCount <= 0) {
					isVisible = false;
				}
			}, hideDelayMs) as unknown as number;
		}
	}

	function togglePin() {
		bottomThumbnailBarPinned.update((p) => !p);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		bottomThumbnailBarPinned.set(false);
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		hoverCount = 0;
		isVisible = false;
	}

	function toggleAreaOverlay() {
		showAreaOverlay = !showAreaOverlay;
		// 通知主窗口显示/隐藏区域覆盖层
		window.dispatchEvent(
			new CustomEvent('areaOverlayToggle', {
				detail: { show: showAreaOverlay }
			})
		);
	}

	function toggleHoverAreasOverlay() {
		showHoverAreasOverlay = !showHoverAreasOverlay;
		window.dispatchEvent(
			new CustomEvent('hoverAreasOverlayToggle', {
				detail: { show: showHoverAreasOverlay }
			})
		);
	}

	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = $bottomThumbnailBarHeight;
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaY = resizeStartY - e.clientY; // 反向，因为是从底部拖拽
		const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
		bottomThumbnailBarHeight.set(newHeight);
	}

	function handleResizeEnd() {
		isResizing = false;
	}

	$effect(() => {
		if (isResizing) {
			window.addEventListener('mousemove', handleResizeMove);
			window.addEventListener('mouseup', handleResizeEnd);
			return () => {
				window.removeEventListener('mousemove', handleResizeMove);
				window.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	});

	function getMinVisibleThumbnails(): number {
		const bookType = bookStore.currentBook?.type;
		return bookType === 'archive' ? ARCHIVE_MIN_THUMBNAILS : LOCAL_MIN_THUMBNAILS;
	}

	function ensureMinimumSpan(
		start: number,
		end: number,
		totalPages: number,
		targetLength: number
	): { start: number; end: number } {
		let newStart = start;
		let newEnd = end;
		const currentSpan = newEnd - newStart + 1;
		if (currentSpan >= targetLength) {
			return { start: newStart, end: newEnd };
		}

		let deficit = targetLength - currentSpan;
		while (deficit > 0 && (newStart > 0 || newEnd < totalPages - 1)) {
			if (newStart > 0) {
				newStart -= 1;
				deficit -= 1;
			}
			if (deficit > 0 && newEnd < totalPages - 1) {
				newEnd += 1;
				deficit -= 1;
			}
		}

		return { start: newStart, end: newEnd };
	}

	function getWindowRange(totalPages: number): { start: number; end: number } {
		const windowState = $viewerState.pageWindow;
		const minVisible = getMinVisibleThumbnails();
		const fallbackRadius = Math.max(minVisible, Math.floor(($bottomThumbnailBarHeight - 40) / 60));

		if (!windowState || windowState.stale) {
			const start = Math.max(0, bookStore.currentPageIndex - fallbackRadius);
			const end = Math.min(totalPages - 1, bookStore.currentPageIndex + fallbackRadius);
			return ensureMinimumSpan(start, end, totalPages, minVisible);
		}

		let minIndex = windowState.center;
		let maxIndex = windowState.center;
		if (windowState.backward.length) {
			minIndex = Math.min(minIndex, ...windowState.backward);
		}
		if (windowState.forward.length) {
			maxIndex = Math.max(maxIndex, ...windowState.forward);
		}
		minIndex = Math.max(0, minIndex);
		maxIndex = Math.min(totalPages - 1, maxIndex);

		const currentSpan = maxIndex - minIndex + 1;
		if (currentSpan <= minVisible) {
			return ensureMinimumSpan(minIndex, maxIndex, totalPages, minVisible);
		}

		const center = windowState.center;
		const half = Math.floor((minVisible - 1) / 2);
		let start = Math.max(minIndex, center - half);
		let end = start + minVisible - 1;
		if (end > maxIndex) {
			end = maxIndex;
			start = Math.max(minIndex, end - minVisible + 1);
		}
		if (end >= totalPages) {
			end = totalPages - 1;
			start = Math.max(0, end - minVisible + 1);
		}

		return { start, end };
	}

	function windowBadgeLabel(index: number): string | null {
		const windowState = $viewerState.pageWindow;
		if (!windowState || windowState.stale) return null;
		if (index === windowState.center) return 'C';
		if (windowState.forward.includes(index)) return '+';
		if (windowState.backward.includes(index)) return '-';
		return null;
	}

	function windowBadgeClass(index: number): string {
		const windowState = $viewerState.pageWindow;
		if (!windowState || windowState.stale) return '';
		if (index === windowState.center) return 'bg-primary/80';
		if (windowState.forward.includes(index)) return 'bg-accent/80';
		if (windowState.backward.includes(index)) return 'bg-secondary/80';
		return '';
	}

	const PRELOAD_RANGE = 5; // 前后各预加载 20 页

	/**
	 * 触发缩略图加载（使用 thumbnailService）
	 */
	function loadVisibleThumbnails() {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		const centerIndex = bookStore.currentPageIndex;
		thumbnailService.loadThumbnails(centerIndex);
	}

	/**
	 * 从 data URL 获取图片尺寸（不再重新压缩，后端已返回正确尺寸的 webp）
	 */
	function getThumbnailDimensions(
		dataUrl: string
	): Promise<{ url: string; width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				// 直接使用原始数据，不再 canvas 重绘
				resolve({
					url: dataUrl,
					width: img.naturalWidth,
					height: img.naturalHeight
				});
			};
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = dataUrl;
		});
	}

	let loadingIndices = new Set<number>();
	const THUMBNAIL_HEIGHT = 120;

	/**
	 * 从视频 Blob 创建缩略图 Data URL（使用 video 元素和 canvas）
	 */
	async function createThumbnailFromVideoBlob(
		blob: Blob
	): Promise<{ url: string; width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const objectUrl = URL.createObjectURL(blob);
			const video = document.createElement('video');
			video.muted = true;
			video.preload = 'metadata';

			video.onloadedmetadata = () => {
				// 跳转到视频开头一点的位置以获取更好的帧
				video.currentTime = Math.min(1, video.duration * 0.1);
			};

			video.onseeked = () => {
				URL.revokeObjectURL(objectUrl);

				// 计算缩放尺寸
				const scale = THUMBNAIL_HEIGHT / video.videoHeight;
				const thumbWidth = Math.round(video.videoWidth * scale);
				const thumbHeight = THUMBNAIL_HEIGHT;

				// 使用 canvas 绘制视频帧
				const canvas = document.createElement('canvas');
				canvas.width = thumbWidth;
				canvas.height = thumbHeight;

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Failed to get canvas context'));
					return;
				}

				ctx.drawImage(video, 0, 0, thumbWidth, thumbHeight);

				// 转换为 data URL（使用 webp 格式以获得更好的压缩）
				const dataUrl = canvas.toDataURL('image/webp', 0.8);
				resolve({ url: dataUrl, width: thumbWidth, height: thumbHeight });
			};

			video.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				reject(new Error('Failed to load video'));
			};

			video.src = objectUrl;
		});
	}

	/**
	 * 检查 Blob 是否为视频类型
	 */
	function isVideoBlobType(blob: Blob): boolean {
		return blob.type.startsWith('video/');
	}

	/**
	 * 从 Blob 创建缩略图 Data URL（canvas 缩放）
	 * 自动检测 Blob 类型，对图片使用 img 元素，对视频使用 video 元素
	 */
	async function createThumbnailFromBlob(
		blob: Blob
	): Promise<{ url: string; width: number; height: number }> {
		// 如果是视频 Blob，使用视频专用的缩略图生成函数
		if (isVideoBlobType(blob)) {
			return createThumbnailFromVideoBlob(blob);
		}

		return new Promise((resolve, reject) => {
			const objectUrl = URL.createObjectURL(blob);
			const img = new Image();

			img.onload = () => {
				URL.revokeObjectURL(objectUrl);

				// 计算缩放尺寸
				const scale = THUMBNAIL_HEIGHT / img.naturalHeight;
				const thumbWidth = Math.round(img.naturalWidth * scale);
				const thumbHeight = THUMBNAIL_HEIGHT;

				// 使用 canvas 缩放
				const canvas = document.createElement('canvas');
				canvas.width = thumbWidth;
				canvas.height = thumbHeight;

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Failed to get canvas context'));
					return;
				}

				ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

				// 转换为 data URL（使用 webp 格式以获得更好的压缩）
				const dataUrl = canvas.toDataURL('image/webp', 0.8);
				resolve({ url: dataUrl, width: thumbWidth, height: thumbHeight });
			};

			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				reject(new Error('Failed to load image'));
			};

			img.src = objectUrl;
		});
	}

	async function loadThumbnail(pageIndex: number) {
		if (loadingIndices.has(pageIndex)) return;

		const currentBook = bookStore.currentBook;
		// 【关键】验证页面索引有效性，防止切书后加载不存在的页面
		if (!currentBook || pageIndex < 0 || pageIndex >= currentBook.pages.length) {
			return;
		}
		const page = currentBook.pages[pageIndex];
		const pathKey = page ? `${currentBook.path}::${page.path}` : null;

		if (pathKey && noThumbnailPaths.has(pathKey)) {
			return;
		}

		// 视频页面：使用视频缩略图 API
		const isVideoPage =
			!!currentBook && !!page && (isVideoFile(page.name || '') || isVideoFile(page.path || ''));

		if (isVideoPage) {
			// 压缩包中的视频暂时不生成独立缩略图
			if (currentBook.type === 'archive') {
				if (pathKey) {
					noThumbnailPaths.add(pathKey);
				}
				return;
			}

			loadingIndices.add(pageIndex);
			try {
				const videoThumbDataUrl = await generateVideoThumbnail(page.path);
				const thumb = await getThumbnailDimensions(videoThumbDataUrl);
				thumbnailCacheStore.setThumbnail(pageIndex, thumb.url, thumb.width, thumb.height);
				if (pathKey) {
					noThumbnailPaths.delete(pathKey);
				}
			} catch (videoErr) {
				console.error(`Failed to generate video thumbnail for page ${pageIndex}:`, videoErr);
				if (pathKey) {
					noThumbnailPaths.add(pathKey);
				}
			} finally {
				loadingIndices.delete(pageIndex);
			}
			return;
		}

		loadingIndices.add(pageIndex);
		try {
			// 优先从 imagePool 缓存获取 Blob
			const cached = imagePool.getSync(pageIndex);
			if (cached?.blob) {
				// 缓存命中：直接用 canvas 缩放生成缩略图
				const thumb = await createThumbnailFromBlob(cached.blob);
				thumbnailCacheStore.setThumbnail(pageIndex, thumb.url, thumb.width, thumb.height);
				if (pathKey) {
					noThumbnailPaths.delete(pathKey);
				}
				return;
			}

			// 缓存未命中：异步加载
			const pooled = await imagePool.get(pageIndex);
			if (pooled?.blob) {
				const thumb = await createThumbnailFromBlob(pooled.blob);
				thumbnailCacheStore.setThumbnail(pageIndex, thumb.url, thumb.width, thumb.height);
				if (pathKey) {
					noThumbnailPaths.delete(pathKey);
				}
				return;
			}

			// imagePool 加载失败，使用 fallback
			throw new Error('imagePool load failed');
		} catch (err) {
			console.debug(`imagePool load failed for page ${pageIndex}, using fallback`);
			if (!currentBook || !page) return;

			try {
				let imageDataUrl: string;

				if (currentBook.type === 'archive') {
					imageDataUrl = await loadImageFromArchive(currentBook.path, page.path);
				} else {
					imageDataUrl = await loadImage(page.path);
				}

				const thumbnail = await getThumbnailDimensions(imageDataUrl);
				thumbnailCacheStore.setThumbnail(
					pageIndex,
					thumbnail.url,
					thumbnail.width,
					thumbnail.height
				);
				noThumbnailPaths.delete(pathKey!);
			} catch (fallbackErr) {
				console.error(`Fallback also failed for page ${pageIndex}:`, fallbackErr);
				if (pathKey) {
					noThumbnailPaths.add(pathKey);
				}
			}
		} finally {
			loadingIndices.delete(pageIndex);
		}
	}

	// 滚动处理防抖
	let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	function handleScroll(e: Event) {
		const container = e.target as HTMLElement;

		// 更新滚动进度（用于 HorizontalListSlider）
		const maxScroll = container.scrollWidth - container.clientWidth;
		const rawProgress = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
		// 右开模式下反转进度（因为缩略图列表已经反转，滚动到最右边=第1页=进度0）
		thumbnailScrollProgress = readingDirection === 'right-to-left' ? 1 - rawProgress : rawProgress;

		// 防抖处理滚动加载，避免滚动时大量重复请求
		if (scrollDebounceTimer) {
			clearTimeout(scrollDebounceTimer);
		}
		scrollDebounceTimer = setTimeout(() => {
			loadVisibleThumbnailsOnScroll(container);
		}, 100); // 100ms 防抖
	}

	// 滚动时高效加载可见缩略图
	function loadVisibleThumbnailsOnScroll(container: HTMLElement) {
		const currentBook = bookStore.currentBook;
		if (!currentBook) return;

		const containerRect = container.getBoundingClientRect();
		const buffer = 300; // 300px 缓冲区
		const thumbnailWidth = 80; // 估算缩略图宽度

		// 根据滚动位置计算可见范围（避免遍历所有 DOM）
		const scrollLeft = container.scrollLeft;
		const visibleWidth = containerRect.width + buffer * 2;
		const startIdx = Math.max(0, Math.floor((scrollLeft - buffer) / thumbnailWidth));
		const endIdx = Math.min(
			currentBook.pages.length - 1,
			Math.ceil((scrollLeft + visibleWidth) / thumbnailWidth)
		);

		// 限制单次加载数量，避免阻塞
		const maxLoad = 10;
		let loadCount = 0;

		for (let i = startIdx; i <= endIdx && loadCount < maxLoad; i++) {
			if (!thumbnailCacheStore.hasThumbnail(i) && !loadingIndices.has(i)) {
				void loadThumbnail(i);
				loadCount++;
			}
		}
	}

	function scrollCurrentThumbnailIntoCenter() {
		if (!thumbnailScrollContainer) return;
		const currentIndex = bookStore.currentPageIndex;
		const currentButton = thumbnailScrollContainer.querySelector<HTMLButtonElement>(
			`[data-page-index="${currentIndex}"]`
		);
		if (!currentButton) return;
		const containerRect = thumbnailScrollContainer.getBoundingClientRect();
		const itemRect = currentButton.getBoundingClientRect();
		const offset = itemRect.left - containerRect.left;
		const itemCenter = offset + itemRect.width / 2;
		const targetScrollLeft =
			thumbnailScrollContainer.scrollLeft + itemCenter - containerRect.width / 2;
		thumbnailScrollContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
	}

	function getThumbnailStyle(pageIndex: number): string {
		const containerHeight = Math.max(40, $bottomThumbnailBarHeight - 40);
		const minWidth = 32;
		const thumb = getThumbnailFromCache(pageIndex);
		if (!thumb) {
			const placeholderWidth = Math.max(containerHeight * 0.6, minWidth);
			return `height:${containerHeight}px;min-width:${placeholderWidth}px;`;
		}
		const aspect = thumb.height > 0 ? thumb.width / thumb.height : 1;
		let width = containerHeight * aspect;
		if (width < minWidth) width = minWidth;
		return `height:${containerHeight}px;width:${width}px;min-width:${width}px;`;
	}

	onMount(async () => {
		// 初始化缩略图服务（设置 Tauri 事件监听）
		// 必须先等待事件监听器设置完成，再触发加载
		await thumbnailService.init();

		// 订阅全局缩略图缓存
		unsubscribeThumbnailCache = thumbnailCacheStore.subscribe(() => {
			thumbnailSnapshot = thumbnailCacheStore.getAllThumbnails();
		});
		thumbnailSnapshot = thumbnailCacheStore.getAllThumbnails();

		// 初始化时触发缩略图加载
		scheduleLoadVisibleThumbnails();
	});

	onDestroy(() => {
		// 销毁缩略图服务
		thumbnailService.destroy();

		if (unsubscribeThumbnailCache) {
			unsubscribeThumbnailCache();
			unsubscribeThumbnailCache = null;
		}
		if (loadThumbnailsDebounce) {
			clearTimeout(loadThumbnailsDebounce);
			loadThumbnailsDebounce = null;
		}
		if (scrollDebounceTimer) {
			clearTimeout(scrollDebounceTimer);
			scrollDebounceTimer = null;
		}
	});

	$effect(() => {
		const windowState = $viewerState.pageWindow;
		if (!bookStore.currentBook || !windowState) return;
		scheduleLoadVisibleThumbnails();
	});

	// 根据阅读方向获取排序后的页面
	function getOrderedPages() {
		if (!bookStore.currentBook) return [];

		const pages = bookStore.currentBook.pages;
		if (readingDirection === 'right-to-left') {
			// 右开阅读：反向排列
			return pages.map((page, index) => ({ ...page, originalIndex: index })).reverse();
		} else {
			// 左开阅读：正常排列
			return pages.map((page, index) => ({ ...page, originalIndex: index }));
		}
	}

	// 书籍变化时重置本地状态并触发重新加载
	let lastBookPath: string | null = null;
	$effect(() => {
		const currentBook = bookStore.currentBook;
		if (currentBook && currentBook.path !== lastBookPath) {
			lastBookPath = currentBook.path;
			lastThumbnailRange = null;
			// 【关键】清空加载状态，防止旧任务继续执行
			loadingIndices.clear();
			noThumbnailPaths.clear();
			// 清空上一本书的缩略图缓存
			thumbnailCacheStore.setBook(currentBook.path);
			// 设置 imagePool 当前书籍
			imagePool.setCurrentBook(currentBook.path);
			// 触发重新加载缩略图
			scheduleLoadVisibleThumbnails();
		}
	});

	// 当高度变化时重新加载可见缩略图
	$effect(() => {
		const currentBook = bookStore.currentBook;
		if (currentBook && thumbnailSnapshot.size > 0) {
			// 重新加载当前可见的缩略图以适应新高度
			scheduleLoadVisibleThumbnails();
		}
	});

	$effect(() => {
		const _currentIndex = bookStore.currentPageIndex;
		if (!bookStore.currentBook) return;
		if (!isVisible) return;
		scrollCurrentThumbnailIntoCenter();
	});

	$effect(() => {
		const dir = readingDirection;
		if (!bookStore.currentBook) return;
		if (!isVisible) return;
		if (lastReadingDirection && lastReadingDirection !== dir) {
			scrollCurrentThumbnailIntoCenter();
		}
		lastReadingDirection = dir;
	});
</script>

{#if bookStore.currentBook && bookStore.currentBook.pages.length > 0}
	<!-- 缩略图栏触发区域（独立） -->
	<div
		class="fixed right-0 bottom-0 left-0 z-[57]"
		style={`height: ${hoverAreas?.bottomTriggerHeight ?? 4}px;`}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="presentation"
		aria-label="底部缩略图栏触发区域"
	></div>

	<!-- 缩略图栏内容 -->
	<div
		data-bottom-bar="true"
		class="absolute right-0 bottom-0 left-0 z-[58] transition-transform duration-300 {isVisible
			? 'translate-y-0'
			: 'translate-y-full'}"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="application"
		aria-label="底部缩略图栏"
	>
		<div
			class="relative border-t shadow-lg"
			style="height: {$bottomThumbnailBarHeight}px; background-color: color-mix(in oklch, var(--sidebar) {bottomBarOpacity}%, transparent); color: var(--sidebar-foreground); backdrop-filter: blur({bottomBarBlur}px);"
		>
			<!-- 拖拽手柄 -->

			<button
				type="button"
				class="text-muted-foreground hover:bg-accent absolute top-0 left-1/2 z-50 -translate-x-1/2 cursor-ns-resize rounded-md p-1 transition-colors"
				onmousedown={handleResizeStart}
				oncontextmenu={handlePinContextMenu}
				aria-label="拖拽调整缩略图栏高度"
			>
				<GripHorizontal class="h-4 w-4" />
			</button>

			<!-- 控制按钮 -->
			<div class="flex justify-center gap-2 px-2 pt-3 pb-1">
				<Button
					variant={$bottomThumbnailBarPinned ? 'default' : 'ghost'}
					size="sm"
					class="h-6"
					onclick={togglePin}
					oncontextmenu={handlePinContextMenu}
				>
					{#if $bottomThumbnailBarPinned}
						<Pin class="mr-1 h-3 w-3" />
					{:else}
						<PinOff class="mr-1 h-3 w-3" />
					{/if}
					<span class="text-xs">{$bottomThumbnailBarPinned ? '已钉住' : '钉住'}</span>
				</Button>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={$viewerPageInfoVisible ? 'default' : 'ghost'}
							size="sm"
							class="h-6"
							onclick={() => viewerPageInfoVisible.update((v) => !v)}
						>
							<Hash class="mr-1 h-3 w-3" />
							<span class="text-xs">页码</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>显示/隐藏 Viewer 右下角页码信息</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={showAreaOverlay ? 'default' : 'ghost'}
							size="sm"
							class="h-6"
							onclick={toggleAreaOverlay}
						>
							<Target class="mr-1 h-3 w-3" />
							<span class="text-xs">区域</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>显示/隐藏 9 区域点击测试</p>
					</Tooltip.Content>
				</Tooltip.Root>
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={showHoverAreasOverlay ? 'default' : 'ghost'}
							size="sm"
							class="h-6"
							onclick={toggleHoverAreasOverlay}
						>
							<Target class="mr-1 h-3 w-3" />
							<span class="text-xs">边栏</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>显示/隐藏 上下左右边栏悬停触发区域</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>

			{#if showDebugInfo && $viewerState.pageWindow && !$viewerState.pageWindow.stale}
				<div class="text-muted-foreground flex flex-wrap gap-3 px-3 pb-1 text-[11px]">
					<span>窗口中心：{$viewerState.pageWindow.center + 1}</span>
					<span>前向覆盖：{$viewerState.pageWindow.forward.length} 页</span>
					<span>后向覆盖：{$viewerState.pageWindow.backward.length} 页</span>
				</div>
			{/if}

			{#if showDebugInfo && $viewerState.taskCursor}
				<div class="text-muted-foreground flex flex-wrap gap-3 px-3 pb-1 text-[11px]">
					<span>任务：{$viewerState.taskCursor.running}/{$viewerState.taskCursor.concurrency}</span>
					<span>Current {$viewerState.taskCursor.activeBuckets.current}</span>
					<span>Forward {$viewerState.taskCursor.activeBuckets.forward}</span>
					<span>Backward {$viewerState.taskCursor.activeBuckets.backward}</span>
					<span>Background {$viewerState.taskCursor.activeBuckets.background}</span>
				</div>
			{/if}

			<div class="h-[calc(100%-theme(spacing.12))] overflow-hidden px-2 pb-2">
				<div
					class="flex h-full items-center gap-2 overflow-x-auto pb-1"
					onscroll={handleScroll}
					bind:this={thumbnailScrollContainer}
				>
					{#each getOrderedPages() as page, index (page.path)}
						{@const originalIndex = page.originalIndex}
						{@const status = bookStore.getPageUpscaleStatus(originalIndex)}
						<Tooltip.Root>
							<Tooltip.Trigger>
								<button
									class="border-border group relative flex-shrink-0 overflow-hidden rounded border-2 transition-colors
										{originalIndex === bookStore.currentPageIndex ? 'outline-sidebar-ring outline outline-2' : ''}
										{status === 'preupscaled' ? 'ring-accent ring-2' : ''}
										{status === 'done' ? 'ring-primary ring-2' : ''}
										{status === 'failed' ? 'ring-destructive ring-2' : ''}
										hover:border-primary/50"
									style={getThumbnailStyle(originalIndex)}
									onclick={() => jumpToPage(originalIndex)}
									data-page-index={originalIndex}
								>
									{#if getThumbnailFromCache(originalIndex)}
										<img
											src={getThumbnailFromCache(originalIndex)?.url}
											alt="Page {originalIndex + 1}"
											class="h-full w-full object-contain"
											style="object-position: center;"
										/>
									{:else}
										<div
											class="bg-muted text-muted-foreground flex h-full w-full flex-col items-center justify-center text-xs"
											style="min-width: 60px; max-width: 120px;"
										>
											<ImageIcon class="mb-1 h-6 w-6" />
											<span class="font-mono">{originalIndex + 1}</span>
										</div>
									{/if}

									{#if windowBadgeLabel(originalIndex)}
										<div
											class={`absolute top-0 right-0 px-1 py-[1px] font-mono text-[10px] text-white ${windowBadgeClass(originalIndex)}`}
										>
											{windowBadgeLabel(originalIndex)}
										</div>
									{/if}

									<!-- 页码标签 -->
									{#if showPageNumbers}
										<div
											class="bg-primary/90 text-primary-foreground absolute right-0 bottom-0 left-0 py-0.5 text-center font-mono text-[10px] font-medium"
										>
											{originalIndex + 1}
										</div>
									{/if}

									<!-- 状态角标 -->
									{#if status === 'done'}
										<span class="bg-primary absolute top-1 right-1 h-2 w-2 rounded-full"></span>
									{:else if status === 'preupscaled'}
										<span class="bg-accent absolute top-1 right-1 h-2 w-2 rounded-full"></span>
									{:else if status === 'failed'}
										<span class="bg-destructive absolute top-1 right-1 h-2 w-2 rounded-full"></span>
									{/if}
								</button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>
									第 {originalIndex + 1} 页
									{#if status === 'done'}
										· 已超分{/if}
									{#if status === 'preupscaled'}
										· 已预超分{/if}
									{#if status === 'failed'}
										· 超分失败{/if}
								</p>
							</Tooltip.Content>
						</Tooltip.Root>
					{/each}
				</div>
			</div>
			<!-- 底部进度滑块（可交互） -->
			<div class="absolute right-0 bottom-0 left-0 z-60">
				<HorizontalListSlider
					totalItems={bookStore.currentBook.pages.length}
					currentIndex={bookStore.currentPageIndex}
					progress={thumbnailScrollProgress}
					{readingDirection}
					onScrollToProgress={(progress) => {
						if (thumbnailScrollContainer) {
							const maxScroll =
								thumbnailScrollContainer.scrollWidth - thumbnailScrollContainer.clientWidth;
							// 右开模式下反转进度
							const scrollProgress = readingDirection === 'right-to-left' ? 1 - progress : progress;
							thumbnailScrollContainer.scrollLeft = scrollProgress * maxScroll;
						}
					}}
					showIndexInput={false}
				/>
			</div>
		</div>
	</div>
{/if}
