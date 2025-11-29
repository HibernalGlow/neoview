<script lang="ts">
	/**
	 * NeoView - Image Viewer Component
	 * 图像查看器主组件 (Svelte 5 Runes)
	 */
	import {
		bookStore,
		zoomIn,
		zoomOut,
		resetZoom,
		rotationAngle,
		toggleFullscreen,
		setZoomLevel,
		useStackViewer,
		zoomLevel
	} from '$lib/stores';
	import { generateKeyCombo } from '$lib/stores/keyboard.svelte';
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { settingsManager, performanceSettings } from '$lib/settings/settingsManager';
	import type { ZoomMode } from '$lib/settings/settingsManager';
	import { onDestroy, onMount } from 'svelte';
	import { readable } from 'svelte/store';
	import { computeAutoBackgroundColor } from '$lib/utils/autoBackground';
	import ComparisonViewer from './ComparisonViewer.svelte';
	import ImageViewerDisplay from './flow/ImageViewerDisplay.svelte';
	import { StackView } from '$lib/stackview';
	import ImageViewerProgressBar from './flow/ImageViewerProgressBar.svelte';
	import ImageInfoOverlay from './ImageInfoOverlay.svelte';
	import { infoPanelStore } from '$lib/stores/infoPanel.svelte';
	import { appState, type StateSelector, type AppStateSnapshot } from '$lib/core/state/appState';
	import {
		scheduleComparisonPreview,
		cancelComparisonPreviewTask
	} from '$lib/core/tasks/comparisonTaskService';
	import { scheduleUpscaleCacheCleanup } from '$lib/core/cache/cacheMaintenance';
	import VideoPlayer from './VideoPlayer.svelte';
import { applyZoomModeEventName, type ApplyZoomModeDetail } from '$lib/utils/zoomMode';

	// 新模块导入
	import { createPreloadManager } from './flow/preloadManager.svelte';
	import { setSharedPreloadManager } from './flow/sharedPreloadManager';
	import { loadUpscalePanelSettings } from '$lib/components/panels/UpscalePanel';
	import { idbSet } from '$lib/utils/idb';
	import { getFileMetadata } from '$lib/api/fs';
	import { invoke, convertFileSrc } from '@tauri-apps/api/core';
	import type { BookInfo, Page } from '$lib/types';
	import { createImageTraceId, logImageTrace } from '$lib/utils/imageTrace';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { historyStore } from '$lib/stores/history.svelte';

	// 进度条状态
	let showProgressBar = $state(true);

	// 鼠标光标隐藏相关
	let cursorVisible = $state(true);
	let hideCursorTimeout: ReturnType<typeof window.setTimeout> | null = null;
	let lastMousePosition = $state({ x: 0, y: 0 });
	let settings = $state(settingsManager.getSettings());
	let viewerBackgroundColor = $state(settings.view.backgroundColor || '#000000');
	let lastBackgroundSource = $state<string | null>(null);

	// 对比模式状态
	type ImageDimensions = { width: number; height: number };

	let viewportSize = $state({ width: 0, height: 0 });
	let currentImageDimensions = $state<ImageDimensions | null>(null);
	let lastMeasuredImageSource: string | null = null;
	let containerResizeObserver: ResizeObserver | null = null;
	let lastAppliedZoomContext: { mode: ZoomMode; dimsKey: string; viewportKey: string } | null = null;
	let dimensionMeasureId = 0;
let applyZoomModeListener: ((event: CustomEvent<ApplyZoomModeDetail>) => void) | null = null;

	function calculateZoomScale(mode: ZoomMode, dims: ImageDimensions, viewport: { width: number; height: number }) {
		const iw = Math.max(dims.width || 0, 1);
		const ih = Math.max(dims.height || 0, 1);
		const vw = Math.max(viewport.width || 0, 1);
		const vh = Math.max(viewport.height || 0, 1);
		const ratioW = vw / iw;
		const ratioH = vh / ih;
		const baseScale = Math.min(ratioW, ratioH) || 1;
		let targetScale: number;
		switch (mode) {
			case 'original':
				targetScale = 1;
				break;
			case 'fill':
				targetScale = Math.max(ratioW, ratioH);
				break;
			case 'fitWidth':
				targetScale = ratioW;
				break;
			case 'fitHeight':
				targetScale = ratioH;
				break;
			case 'fit':
			default:
				targetScale = baseScale;
		}
		return targetScale / baseScale;
	}

	function applyCurrentZoomMode(overrideMode?: ZoomMode) {
		if (isCurrentPageVideo) return;
		const dims = currentImageDimensions;
		if (!dims) return;
		const { width: vw, height: vh } = viewportSize;
		if (vw <= 0 || vh <= 0) return;
		const effectiveMode = overrideMode ?? (settings.view.defaultZoomMode as ZoomMode) ?? 'fit';
		const dimsKey = `${dims.width}x${dims.height}`;
		const viewportKey = `${vw}x${vh}`;
		if (
			lastAppliedZoomContext &&
			lastAppliedZoomContext.mode === effectiveMode &&
			lastAppliedZoomContext.dimsKey === dimsKey &&
			lastAppliedZoomContext.viewportKey === viewportKey
		) {
			return;
		}
		const scale = calculateZoomScale(effectiveMode, dims, { width: vw, height: vh });
		setZoomLevel(scale);
		lastAppliedZoomContext = { mode: effectiveMode, dimsKey, viewportKey };
	}

	function updateViewportSize() {
		if (!containerElement) return;
		const width = containerElement.clientWidth;
		const height = containerElement.clientHeight;
		if (viewportSize.width === width && viewportSize.height === height) return;
		viewportSize = { width, height };
		applyCurrentZoomMode();
	}

	function measureImageDimensions(source: string): Promise<ImageDimensions | null> {
		return new Promise((resolve) => {
			if (!source) {
				resolve(null);
				return;
			}
			const img = new Image();
			img.onload = () => {
				resolve({ width: img.naturalWidth, height: img.naturalHeight });
			};
			img.onerror = () => resolve(null);
			img.src = source;
		});
	}

	function getCurrentImageSource(): string | null {
		return derivedUpscaledUrl || imageData || imageData2;
	}

	function clearImageDimensions() {
		dimensionMeasureId++;
		currentImageDimensions = null;
		lastMeasuredImageSource = null;
	}

	async function refreshImageDimensions(force = false) {
		if (isCurrentPageVideo) {
			clearImageDimensions();
			return;
		}
		const page = bookStore.currentPage;
		if (!page) {
			clearImageDimensions();
			return;
		}
		const requestId = ++dimensionMeasureId;
		let dims: ImageDimensions | null = null;
		if (page.width && page.height) {
			dims = { width: page.width, height: page.height };
		}
		if (!dims) {
			const src = getCurrentImageSource();
			if (!src) {
				clearImageDimensions();
				return;
			}
			if (!force && src === lastMeasuredImageSource && currentImageDimensions) {
				applyCurrentZoomMode();
				return;
			}
			const measured = await measureImageDimensions(src);
			if (requestId !== dimensionMeasureId) return;
			if (measured) {
				dims = measured;
				lastMeasuredImageSource = src;
			}
		}
		if (requestId !== dimensionMeasureId) return;
		if (dims) {
			currentImageDimensions = dims;
			applyCurrentZoomMode();
			void updateInfoPanelForCurrentPage(dims);
		} else {
			clearImageDimensions();
		}
	}

	function handleApplyZoomModeEvent(event: CustomEvent<ApplyZoomModeDetail>) {
		applyCurrentZoomMode(event.detail?.mode);
	}

	let originalImageDataForComparison = $state<string>('');
	let upscaledImageDataForComparison = $state<string>('');
	let derivedUpscaledUrl = $state<string | null>(null);
	let lastUpscaledBlob: Blob | null = null;
	let lastUpscaledObjectUrl: string | null = null;
	let lastRequestedPageIndex = -1;
	let lastLoadedPageIndex = -1;
	let lastLoadedHash: string | null = null;
	let lastViewMode: 'single' | 'double' | 'panorama' | null = null;
	let panoramaPagesData = $state<
		Array<{ index: number; data: string | null; position: 'left' | 'center' | 'right' }>
	>([]);

	// 注意：progressColor 和 progressBlinking 现在由 ImageViewerProgressBar 内部管理

	// 预加载管理器
	let preloadManager: ReturnType<typeof createPreloadManager>;

	// 图片数据状态
	let imageData = $state<string | null>(null);
	let imageData2 = $state<string | null>(null); // 双页模式的第二张图
	let loading = $state(false);
	let loadingVisible = $state(false); // 控制loading动画的可见性
	let error = $state<string | null>(null);
	let loadingTimeout: ReturnType<typeof window.setTimeout> | null = null; // 延迟显示loading的定时器

	// 视频相关状态
	let isCurrentPageVideo = $state(false);
	let videoUrl = $state<string | null>(null);
	let currentVideoRequestId = 0;
	let videoUrlRevokeNeeded = false;
	let videoStartTime = $state(0);
	let lastVideoHistoryUpdateAt = 0;
	let videoPlayerRef: any = null;

	type VideoLoopMode = 'none' | 'list' | 'single';
	type VideoPlayerSettings = {
		volume: number;
		muted: boolean;
		playbackRate: number;
		loopMode: VideoLoopMode;
	};

	let videoPlayerSettings = $state<VideoPlayerSettings>({
		volume: 1,
		muted: false,
		playbackRate: 1,
		loopMode: 'list'
	});

	function adjustVideoVolume(direction: 1 | -1) {
		if (!isCurrentPageVideo) return;
		const step = 0.1;
		const next = Math.min(1, Math.max(0, videoPlayerSettings.volume + direction * step));
		videoPlayerSettings = {
			...videoPlayerSettings,
			volume: next,
			muted: next === 0
		};
	}

	function adjustVideoSpeed(direction: 1 | -1) {
		if (!isCurrentPageVideo) return;
		const s = settingsManager.getSettings();
		const min = s.image.videoMinPlaybackRate;
		const max = s.image.videoMaxPlaybackRate;
		const step = s.image.videoPlaybackRateStep;
		const next = Math.min(max, Math.max(min, videoPlayerSettings.playbackRate + direction * step));
		videoPlayerSettings = {
			...videoPlayerSettings,
			playbackRate: next
		};
	}

	function handleViewerAction(action: string) {
		const isVideo = isCurrentPageVideo;
		if (!isVideo && action.startsWith('video')) {
			// 非视频页时忽略所有 video* 操作，保留图片模式行为
			return;
		}

		switch (action) {
			case 'videoPlayPause': {
				if (videoPlayerRef && typeof videoPlayerRef.playPause === 'function') {
					videoPlayerRef.playPause();
				}
				break;
			}
			case 'videoSeekForward': {
				if (videoPlayerRef && typeof videoPlayerRef.seekForward === 'function') {
					videoPlayerRef.seekForward();
				}
				break;
			}
			case 'videoSeekBackward': {
				if (videoPlayerRef && typeof videoPlayerRef.seekBackward === 'function') {
					videoPlayerRef.seekBackward();
				}
				break;
			}
			case 'videoToggleMute': {
				// 通过设置状态驱动 VideoPlayer，同步到 UI
				videoPlayerSettings = {
					...videoPlayerSettings,
					muted: !videoPlayerSettings.muted
				};
				break;
			}
			case 'videoToggleLoopMode': {
				let next: VideoLoopMode;
				if (videoPlayerSettings.loopMode === 'list') {
					next = 'single';
				} else if (videoPlayerSettings.loopMode === 'single') {
					next = 'none';
				} else {
					next = 'list';
				}
				videoPlayerSettings = {
					...videoPlayerSettings,
					loopMode: next
				};
				break;
			}
			case 'videoVolumeUp': {
				adjustVideoVolume(1);
				break;
			}
			case 'videoVolumeDown': {
				adjustVideoVolume(-1);
				break;
			}
			case 'videoSpeedUp': {
				adjustVideoSpeed(1);
				break;
			}
			case 'videoSpeedDown': {
				adjustVideoSpeed(-1);
				break;
			}
		}
	}

	// 预超分进度管理
	let preUpscaleProgress = $state(0); // 预超分进度 (0-100)
	let totalPreUpscalePages = $state(0); // 总预超分页数

	type CachedFileMetadata = {
		size?: number;
		createdAt?: string;
		modifiedAt?: string;
	};

	const fileMetadataCache = new Map<string, CachedFileMetadata>();
	let metadataRequestId = 0;

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => {
			const unsubscribe = appState.subscribe(selector, (value) => {
				set(value);
			});
			return unsubscribe;
		});
	}

	const VIDEO_MIME_TYPES: Record<string, string> = {
		mp4: 'video/mp4',
		webm: 'video/webm',
		ogg: 'video/ogg',
		mov: 'video/quicktime',
		avi: 'video/x-msvideo',
		mkv: 'video/x-matroska',
		m4v: 'video/x-m4v',
		flv: 'video/x-flv',
		wmv: 'video/x-ms-wmv'
	};

	function getVideoMimeType(name?: string): string | undefined {
		if (!name) return undefined;
		const ext = name.split('.').pop()?.toLowerCase();
		if (!ext) return undefined;
		return VIDEO_MIME_TYPES[ext];
	}

	function isVideoPage(page: Page): boolean {
		return Boolean(page && (isVideoFile(page.name) || isVideoFile(page.path)));
	}

	function findNextVideoPageIndex(currentIndex: number): number | null {
		const book = bookStore.currentBook;
		const pages = book?.pages;
		if (!book || !pages || pages.length === 0) return null;

		const total = pages.length;
		for (let offset = 1; offset < total; offset++) {
			const index = (currentIndex + offset) % total;
			const page = pages[index];
			if (page && isVideoPage(page)) {
				return index;
			}
		}
		return null;
	}

	async function handleVideoListLoopEnded() {
		const book = bookStore.currentBook;
		if (!book) return;

		const currentIndex = bookStore.currentPageIndex;
		const nextVideoIndex = findNextVideoPageIndex(currentIndex);
		if (nextVideoIndex == null) {
			return;
		}
		try {
			await bookStore.navigateToPage(nextVideoIndex);
		} catch (err) {
			console.error('Failed to navigate to next video page:', err);
		}
	}

	function clearVideoPlaybackState() {
		if (videoUrlRevokeNeeded && videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		videoUrl = null;
		videoUrlRevokeNeeded = false;
	}

	function setVideoUrl(url: string, revokeNeeded: boolean) {
		if (videoUrlRevokeNeeded && videoUrl) {
			URL.revokeObjectURL(videoUrl);
		}
		videoUrl = url;
		videoUrlRevokeNeeded = revokeNeeded;
	}

	function handleVideoProgress(currentTimeSec: number, durationSec: number, ended: boolean) {
		const page = bookStore.currentPage;
		if (!page) return;
		if (!durationSec || !isFinite(durationSec) || durationSec <= 0) return;

		const now = Date.now();
		// 节流：未结束时最多每 5 秒写一次历史
		if (!ended && now - lastVideoHistoryUpdateAt < 5000) {
			return;
		}
		lastVideoHistoryUpdateAt = now;

		const safeDuration = durationSec;
		const clampedTime = Math.max(0, Math.min(currentTimeSec, safeDuration));
		const completed =
			ended || clampedTime >= safeDuration - Math.min(5, safeDuration * 0.05);

		// 映射到进度条字段（沿用 currentPage/totalPages）
		const scale = 1000;
		const ratio = clampedTime / safeDuration;
		let progressPage = Math.floor(ratio * scale);
		const progressTotal = scale;
		if (completed) {
			progressPage = progressTotal;
		}

		try {
			historyStore.updateVideoProgress(
				page.path,
				clampedTime,
				safeDuration,
				completed,
				progressPage,
				progressTotal
			);
		} catch (err) {
			console.error('Failed to update video progress history:', err);
		}
	}

	function prepareVideoStartTimeForPage(page: Page) {
		try {
			const entry = historyStore.findByPath(page.path);
			if (entry && typeof entry.videoPosition === 'number') {
				if (entry.videoCompleted) {
					videoStartTime = 0;
				} else {
					videoStartTime = entry.videoPosition ?? 0;
				}
			} else {
				videoStartTime = 0;
			}
		} catch (err) {
			console.debug('Failed to read video history for start time:', err);
			videoStartTime = 0;
		}
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	function updateViewerState(partial: Partial<AppStateSnapshot['viewer']>) {
		const snapshot = appState.getSnapshot();
		appState.update({
			viewer: {
				...snapshot.viewer,
				...partial
			}
		});
	}

	function buildDisplayPath(book: BookInfo, page: Page): string {
		if (book.type === 'archive' && page.innerPath) {
			return `${book.path}::${page.innerPath}`;
		}
		return page.path;
	}

	function guessFormat(name?: string): string | undefined {
		if (!name) return undefined;
		const dotIndex = name.lastIndexOf('.');
		if (dotIndex === -1) return undefined;
		return name.slice(dotIndex + 1).toUpperCase();
	}

	async function fetchCachedFileMetadata(path: string): Promise<CachedFileMetadata | null> {
		if (fileMetadataCache.has(path)) {
			return fileMetadataCache.get(path)!;
		}
		try {
			const metadata = await getFileMetadata(path);
			const parsed: CachedFileMetadata = {
				size: metadata.size,
				createdAt: metadata.created ? new Date(metadata.created * 1000).toISOString() : undefined,
				modifiedAt: metadata.modified ? new Date(metadata.modified * 1000).toISOString() : undefined
			};
			fileMetadataCache.set(path, parsed);
			return parsed;
		} catch (error) {
			console.warn('获取文件元数据失败:', error);
			return null;
		}
	}

	async function updateInfoPanelForCurrentPage(dimensions?: ImageDimensions | null) {
		const book = bookStore.currentBook;
		const page = bookStore.currentPage;
		if (!book || !page) {
			infoPanelStore.resetImageInfo();
			return;
		}

		const requestId = ++metadataRequestId;
		const widthsKnown = dimensions?.width ?? page.width;
		const heightsKnown = dimensions?.height ?? page.height;

		const baseInfo = {
			path: buildDisplayPath(book, page),
			name: page.name,
			format: guessFormat(page.name),
			width: widthsKnown,
			height: heightsKnown,
			fileSize: page.size,
			colorDepth: undefined,
			createdAt: undefined,
			modifiedAt: undefined
		};

		infoPanelStore.setImageInfo(baseInfo);

		if (book.type === 'folder' || book.type === 'media') {
			const metadata = await fetchCachedFileMetadata(page.path);
			if (metadata && requestId === metadataRequestId) {
				infoPanelStore.setImageInfo({
					...baseInfo,
					fileSize: metadata.size ?? baseInfo.fileSize,
					createdAt: metadata.createdAt ?? baseInfo.createdAt,
					modifiedAt: metadata.modifiedAt ?? baseInfo.modifiedAt
				});
			}
			return;
		}

		if (requestId === metadataRequestId) {
			infoPanelStore.setImageInfo({
				...baseInfo,
				createdAt: book.createdAt ?? baseInfo.createdAt,
				modifiedAt: book.modifiedAt ?? baseInfo.modifiedAt
			});
		}
	}

	async function loadVideoForPage(page: Page) {
		const book = bookStore.currentBook;
		if (!book) {
			return;
		}

		const requestId = ++currentVideoRequestId;
		error = null;

		if (book.type === 'archive') {
			loading = true;
			loadingVisible = true;
			updateViewerState({ loading: true });
		}

		try {
			if (book.type === 'archive') {
				const traceId = createImageTraceId('viewer-video', page.index);
				const binaryData = await invoke<number[]>('load_video_from_archive', {
					archivePath: book.path,
					filePath: page.path,
					traceId,
					pageIndex: page.index
				});
				if (requestId !== currentVideoRequestId) {
					return;
				}
				const mimeType = getVideoMimeType(page.name) ?? 'video/mp4';
				const blob = new Blob([new Uint8Array(binaryData)], { type: mimeType });
				const objectUrl = URL.createObjectURL(blob);
				videoUrl = objectUrl; // 直接赋值
				videoUrlRevokeNeeded = true; // 标记
			} else {
				const fileUrl = convertFileSrc(page.path);
				if (requestId !== currentVideoRequestId) {
					return;
				}
				videoUrl = fileUrl; // 直接赋值
			}
		} catch (err) {
			if (requestId !== currentVideoRequestId) {
				return;
			}
			console.error('加载视频失败:', err);
			if (err instanceof Error) {
				error = err.message;
			} else if (typeof err === 'string') {
				error = err;
			} else {
				error = '加载视频失败';
			}
			clearVideoPlaybackState();
		} finally {
			if (book.type === 'archive' && requestId === currentVideoRequestId) {
				loading = false;
				loadingVisible = false;
				updateViewerState({ loading: false });
			}
		}
	}

	// 监听设置变化
	settingsManager.addListener((s) => {
		settings = s;
		applyCurrentZoomMode();
	});

	$effect(() => {
		const mode = settings.view.backgroundMode ?? 'solid';
		const baseColor = settings.view.backgroundColor || '#000000';
		if (mode === 'solid') {
			viewerBackgroundColor = baseColor;
			lastBackgroundSource = null;
			return;
		}
		const src = derivedUpscaledUrl || imageData || imageData2;
		if (!src) {
			viewerBackgroundColor = baseColor;
			lastBackgroundSource = null;
			return;
		}
		if (src === lastBackgroundSource && viewerBackgroundColor !== baseColor) {
			return;
		}
		lastBackgroundSource = src;
		void (async () => {
			const color = await computeAutoBackgroundColor(src);
			if (lastBackgroundSource !== src) {
				return;
			}
			viewerBackgroundColor = color || baseColor;
		})();
	});

	// 初始化预加载管理器
	onMount(() => {
		containerResizeObserver = new ResizeObserver(() => updateViewportSize());
		if (containerElement) {
			containerResizeObserver.observe(containerElement);
			updateViewportSize();
		}

		const handleResize = () => updateViewportSize();
		window.addEventListener('resize', handleResize);

		applyZoomModeListener = (event) => handleApplyZoomModeEvent(event);
		window.addEventListener(applyZoomModeEventName, applyZoomModeListener as EventListener);

		const panelSettings = loadUpscalePanelSettings();
		const initialPreloadPages =
			(panelSettings as { preloadPages?: number }).preloadPages ?? performanceSettings.preLoadSize;
		const initialMaxThreads =
			(panelSettings as { backgroundConcurrency?: number }).backgroundConcurrency ??
			performanceSettings.maxThreads;

		preloadManager = createPreloadManager({
			initialPreloadPages,
			initialMaxThreads,
			onImageLoaded: (objectUrl, objectUrl2) => {
				const currentPageIndex = bookStore.currentPageIndex;
				const currentStatus = bookStore.getPageUpscaleStatus(currentPageIndex);
				if (currentStatus === 'done' && bookStore.upscaledImageData) {
					console.log('当前页已超分完成，跳过原图加载以避免闪屏');
					return;
				}
				const currentHash = bookStore.getCurrentPageHash() ?? null;
				if (
					lastLoadedPageIndex === currentPageIndex &&
					lastLoadedHash === currentHash &&
					imageData === (objectUrl ?? null) &&
					imageData2 === (objectUrl2 ?? null)
				) {
					return;
				}
				lastLoadedPageIndex = currentPageIndex;
				lastLoadedHash = currentHash;
				imageData = objectUrl ?? null;
				imageData2 = objectUrl2 ?? null;
			},
			onImageMetadataReady: async (metadata) => {
				// 检查当前页是否已经是超分完成状态
				const currentPageIndex = bookStore.currentPageIndex;
				const currentStatus = bookStore.getPageUpscaleStatus(currentPageIndex);

				// 如果当前页已超分完成，不要用原图覆盖
				if (currentStatus === 'done') {
					console.log('当前页已超分完成，跳过原图 bitmap 更新');
					return;
				}
				void updateInfoPanelForCurrentPage(metadata ?? null);
			},
			onLoadingStateChange: (loadingState, visible) => {
				loading = loadingState;
				loadingVisible = visible;
				updateViewerState({ loading: loadingState });
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
				const {
					imageData: upscaledImageData,
					imageBlob,
					originalImageHash,
					background,
					pageIndex,
					writeToMemoryCache
				} = detail;

				// 确定目标页面索引，优先使用事件中的 pageIndex
				const targetIndex = typeof pageIndex === 'number' ? pageIndex : bookStore.currentPageIndex;

				// 🔥 关键修复：验证 hash 是否匹配目标页面的 hash
				const targetPageHash = bookStore.getPageHash(targetIndex);
				if (targetPageHash && originalImageHash !== targetPageHash) {
					console.warn(
						`⚠️ 超分结果 hash 不匹配！目标页 ${targetIndex + 1} 的 hash: ${targetPageHash}, 超分结果的 hash: ${originalImageHash}，忽略此结果`
					);
					return; // 不匹配，直接返回，不更新显示
				}

				const isCurrentPage = targetIndex === bookStore.currentPageIndex;

				// 写入内存缓存（如果请求）
				if (writeToMemoryCache && upscaledImageData && imageBlob && originalImageHash) {
					if (preloadManager) {
						const memCache = preloadManager.getPreloadMemoryCache();
						memCache.set(originalImageHash, { url: upscaledImageData, blob: imageBlob });
						console.log('超分结果已写入内存缓存，hash:', originalImageHash);
					}
				}

				// 非后台任务且是当前页时，才更新显示和状态
				if (!background && isCurrentPage) {
					// 🔥 再次验证：确保当前页的 hash 匹配
					const currentHash = bookStore.getCurrentPageHash();
					if (currentHash && originalImageHash !== currentHash) {
						console.warn(
							`⚠️ 超分结果 hash 与当前页不匹配！当前页 hash: ${currentHash}, 超分结果的 hash: ${originalImageHash}，忽略此结果`
						);
						return;
					}

					// 🔥 额外验证：确保当前页索引仍然匹配（防止翻页后错误替换）
					const currentPageIndexNow = bookStore.currentPageIndex;
					if (currentPageIndexNow !== targetIndex) {
						console.warn(
							`⚠️ 超分结果页面索引不匹配！当前页: ${currentPageIndexNow + 1}, 超分目标页: ${targetIndex + 1}，忽略此结果`
						);
						return;
					}

					// 🔥 再次验证 hash（双重保险）
					const currentHashNow = bookStore.getCurrentPageHash();
					if (currentHashNow && originalImageHash !== currentHashNow) {
						console.warn(
							`⚠️ 超分结果 hash 与当前页不匹配（二次验证）！当前页 hash: ${currentHashNow}, 超分结果的 hash: ${originalImageHash}，忽略此结果`
						);
						return;
					}

					if (imageBlob) {
						bookStore.setUpscaledImageBlob(imageBlob);
					} else if (upscaledImageData) {
						bookStore.setUpscaledImage(upscaledImageData);
					}
					if (upscaledImageData) {
						imageData = upscaledImageData;
						upscaledImageDataForComparison = upscaledImageData;
					}

					// 更新当前页面状态为已完成
					bookStore.setPageUpscaleStatus(targetIndex, 'done');

					console.log(
						'✅ 超分图已匹配当前页面，hash:',
						originalImageHash,
						'已替换，页面状态更新为完成'
					);
				} else if (background) {
					// 后台任务：只更新页面状态，不更新显示
					bookStore.setPageUpscaleStatus(targetIndex, 'preupscaled');
					console.log('后台预超分完成，页码:', targetIndex + 1, 'hash:', originalImageHash);
				} else {
					// 非当前页的超分完成：只更新状态，不更新显示
					bookStore.setPageUpscaleStatus(targetIndex, 'done');
					console.log(
						'其他页超分完成，页码:',
						targetIndex + 1,
						'hash:',
						originalImageHash,
						'（不影响当前显示）'
					);
				}
			},
			onUpscaleSaved: async (detail) => {
				try {
					const { finalHash, savePath } = detail || {};
					if (finalHash && savePath) {
						console.log('后台超分已保存:', finalHash, savePath);
						scheduleUpscaleCacheCleanup('upscale-saved');
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

				// 立即执行，不再添加额外延迟（eventListeners 已经移除了延迟）
				(async () => {
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
				})();
			},
			onResetPreUpscaleProgress: () => {
				preUpscaleProgress = 0;
				totalPreUpscalePages = 0;
			},
			onComparisonModeChanged: async (detail) => {
				const { enabled, mode = 'slider' } = detail;
				const upscaledSource = derivedUpscaledUrl || bookStore.upscaledImageData;
				if (enabled && upscaledSource) {
					try {
						const preview = await scheduleComparisonPreview(
							async () => (preloadManager ? await preloadManager.getCurrentPageBlob() : null),
							bookStore.currentPageIndex
						);
						updateViewerState({ comparisonVisible: true, comparisonMode: mode });
						originalImageDataForComparison = preview;
						upscaledImageDataForComparison = upscaledSource;
					} catch (error) {
						console.error('对比模式：生成原图预览失败:', error);
						updateViewerState({ comparisonVisible: false });
						originalImageDataForComparison = '';
						upscaledImageDataForComparison = '';
					}
				} else {
					cancelComparisonPreviewTask('comparison disabled');
					updateViewerState({ comparisonVisible: false });
				}
			},
			onCacheHit: (detail) => {
				const { imageHash, url, blob, preview } = detail;
				const currentHash = bookStore.getCurrentPageHash();
				console.log('缓存命中，hash:', imageHash, 'preview:', preview, 'currentHash:', currentHash);
				// 仅在需要预览当前页，且 hash 与当前页匹配时才更新显示
				if (!preview) {
					return;
				}
				if (!currentHash || currentHash !== imageHash) {
					console.log('缓存命中但非当前页，忽略更新显示');
					return;
				}
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

		(window as unknown as { preloadManager?: typeof preloadManager }).preloadManager =
			preloadManager;

 		preloadManager.initialize();
		setSharedPreloadManager(preloadManager);

		return () => {
			window.removeEventListener('resize', handleResize);
			if (applyZoomModeListener) {
				window.removeEventListener(
					applyZoomModeEventName,
					applyZoomModeListener as unknown as EventListener
				);
				applyZoomModeListener = null;
			}
		};
	});

	// 组件卸载时清理
	onDestroy(() => {
		if (containerResizeObserver) {
			containerResizeObserver.disconnect();
			containerResizeObserver = null;
		}
		if (preloadManager) {
			preloadManager.cleanup();
			setSharedPreloadManager(null);
		}
		cancelComparisonPreviewTask('viewer destroyed');
		if ((window as { preloadManager?: typeof preloadManager }).preloadManager === preloadManager) {
			delete (window as { preloadManager?: typeof preloadManager }).preloadManager;
		}
		if (lastUpscaledObjectUrl) {
			URL.revokeObjectURL(lastUpscaledObjectUrl);
		}
		derivedUpscaledUrl = null;
		lastUpscaledObjectUrl = null;
		lastUpscaledBlob = null;
	});

	// 监听当前页面变化
	$effect(() => {
		const el = containerElement;
		if (!containerResizeObserver) return;
		containerResizeObserver.disconnect();
		if (el) {
			containerResizeObserver.observe(el);
			updateViewportSize();
		}
	});

	$effect(() => {
		const currentPage = bookStore.currentPage;
		const currentIndex = bookStore.currentPageIndex;
		console.log('📄 页面切换 effect 触发:', {
			pageName: currentPage?.name,
			pageIndex: currentIndex,
			isVideo: currentPage ? isVideoPage(currentPage) : false
		});

		if (currentPage) {
			bookStore.setCurrentImage(currentPage);
			error = null;
			const videoPage = isVideoPage(currentPage);

			if (videoPage) {
				isCurrentPageVideo = true;
				clearVideoPlaybackState();
				imageData = null;
				imageData2 = null;
				derivedUpscaledUrl = null;
				lastRequestedPageIndex = -1;
				lastLoadedPageIndex = -1;
				lastLoadedHash = null;
				prepareVideoStartTimeForPage(currentPage);
				void loadVideoForPage(currentPage);
				clearImageDimensions();
			} else {
				if (isCurrentPageVideo || videoUrl) {
					currentVideoRequestId++;
					clearVideoPlaybackState();
				}
				isCurrentPageVideo = false;
				videoStartTime = 0;
				if (preloadManager && currentIndex !== lastRequestedPageIndex) {
					lastRequestedPageIndex = currentIndex;
					preloadManager.loadCurrentImage();
				}
				void refreshImageDimensions(true);
			}
			void updateInfoPanelForCurrentPage();
		} else {
			currentVideoRequestId++;
			lastRequestedPageIndex = -1;
			lastLoadedPageIndex = -1;
			lastLoadedHash = null;
			clearVideoPlaybackState();
			isCurrentPageVideo = false;
			error = null;
			infoPanelStore.resetImageInfo();
			clearImageDimensions();
		}
	});

	$effect(() => {
		const source = getCurrentImageSource();
		if (!source || isCurrentPageVideo) {
			if (!isCurrentPageVideo) {
				clearImageDimensions();
			}
			return;
		}
		void refreshImageDimensions();
	});

	$effect(() => {
		const viewMode = $viewerState.viewMode;
		lastViewMode = viewMode;
		if (!isCurrentPageVideo) {
			applyCurrentZoomMode();
		}
	});

	// 🔥 修复书籍导航Bug: 监听书籍切换,立即清空显示状态
	let lastBookPath: string | null = null;
	let containerElement = $state<HTMLDivElement | undefined>(undefined);

	// 监听书籍变化，重置状态
	$effect(() => {
		const currentBookPath = bookStore.currentBook?.path;
		const currentBook = bookStore.currentBook;

		// 检测书籍是否真的发生了变化
		if (currentBookPath !== lastBookPath) {
			console.log('📚 书籍切换检测:', { from: lastBookPath, to: currentBookPath });

			// 立即清空所有显示状态,防止显示旧书籍的图片
			imageData = null;
			imageData2 = null;
			derivedUpscaledUrl = null;
			clearVideoPlaybackState();
			isCurrentPageVideo = false;
			currentVideoRequestId++;
			if (lastUpscaledObjectUrl) {
				URL.revokeObjectURL(lastUpscaledObjectUrl);
				lastUpscaledObjectUrl = null;
			}
			lastUpscaledBlob = null;
			lastRequestedPageIndex = -1;
			lastLoadedPageIndex = -1;
			lastLoadedHash = null;
			if (panoramaPagesData.length > 0) {
				for (const page of panoramaPagesData) {
					if (page.data && page.data.startsWith('blob:')) {
						try {
							URL.revokeObjectURL(page.data);
						} catch (e) {}
					}
				}
			}
			panoramaPagesData = [];
			lastPanoramaIndex = -1;

			lastBookPath = currentBookPath ?? null;

			if (!currentBook) {
				console.log('📕 书籍已关闭,所有显示状态已清空');
			} else {
				console.log('📗 切换到新书籍,旧图片已清空,等待新书籍第一页加载');
				// 切换书籍时，让查看器获取焦点，防止键盘事件被文件列表捕获
				if (containerElement) {
					containerElement.focus();
					console.log('🎯 ImageViewer 已获取焦点');
				}
			}
		}
	});

	// 书籍切换现在由 PreloadManager 内部的 setupBookChangeListener 处理
	// 删除了会导致缓存被清空的 $effect

	// 根据 Blob 生成独立的 object URL，避免复用已被释放的 URL
	$effect(() => {
		const blob = bookStore.upscaledImageBlob;
		const currentPageIndex = bookStore.currentPageIndex;
		const currentHash = bookStore.getCurrentPageHash();

		if (blob && blob !== lastUpscaledBlob) {
			// 🔥 验证：确保当前页索引匹配（防止翻页后错误替换）
			if (lastRequestedPageIndex !== -1 && lastRequestedPageIndex !== currentPageIndex) {
				console.warn(
					`⚠️ 超分 blob 页面索引不匹配！当前页: ${currentPageIndex + 1}, 请求页: ${lastRequestedPageIndex + 1}，忽略此结果`
				);
				return;
			}

			// 🔥 验证：确保 hash 匹配（如果可用）
			if (currentHash && lastLoadedHash && currentHash !== lastLoadedHash) {
				console.warn(
					`⚠️ 超分 blob hash 不匹配！当前页 hash: ${currentHash}, 请求页 hash: ${lastLoadedHash}，忽略此结果`
				);
				return;
			}

			try {
				const newUrl = URL.createObjectURL(blob);
				if (lastUpscaledObjectUrl) {
					URL.revokeObjectURL(lastUpscaledObjectUrl);
				}
				derivedUpscaledUrl = newUrl;
				lastUpscaledObjectUrl = newUrl;
				lastUpscaledBlob = blob;

				// 🔥 只在当前页匹配时才更新显示
				if (lastRequestedPageIndex === currentPageIndex || lastRequestedPageIndex === -1) {
					bookStore.setUpscaledImage(newUrl);
					imageData = newUrl;
					upscaledImageDataForComparison = newUrl;
				}
			} catch (error) {
				console.warn('创建超分 object URL 失败:', error);
			}
		} else if (!blob && lastUpscaledObjectUrl) {
			// 🔥 只在当前页匹配时才清除显示
			if (lastRequestedPageIndex === currentPageIndex || lastRequestedPageIndex === -1) {
				URL.revokeObjectURL(lastUpscaledObjectUrl);
				lastUpscaledObjectUrl = null;
				lastUpscaledBlob = null;
				derivedUpscaledUrl = null;
				bookStore.setUpscaledImage(null);
				upscaledImageDataForComparison = '';
			}
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
		if (
			!settings.view.mouseCursor ||
			!settings.view.mouseCursor.autoHide ||
			!settings.view.mouseCursor.showOnButtonClick
		)
			return;
		showCursor();
	}

	// 处理鼠标滚轮事件
	function handleWheel(e: WheelEvent) {
		// 不在输入框时响应
		const target = e.target as HTMLElement;
		if (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.getAttribute('contenteditable') === 'true'
		) {
			return;
		}

		const direction = e.deltaY < 0 ? 'up' : 'down';
		console.log('ImageViewer 鼠标滚轮:', direction); // 调试信息
		const action = keyBindingsStore.findActionByMouseWheel(direction);
		console.log('找到的操作:', action); // 调试信息
		if (action) {
			e.preventDefault();
			// 根据阅读方向执行操作
			const settings = settingsManager.getSettings();
			const readingDirection = settings.book.readingDirection;
			switch (action) {
				case 'nextPage':
					void handleNextPage();
					break;
				case 'prevPage':
					void handlePreviousPage();
					break;
				case 'pageLeft':
					if (readingDirection === 'right-to-left') {
						// 右开模式下，逻辑“向左翻页”对应物理向右翻
						void handlePageRight();
					} else {
						void handlePageLeft();
					}
					break;
				case 'pageRight':
					if (readingDirection === 'right-to-left') {
						// 右开模式下，逻辑“向右翻页”对应物理向左翻
						void handlePageLeft();
					} else {
						void handlePageRight();
					}
					break;
				default:
					console.warn('未实现的滚轮操作：', action);
			}
		}
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		try {
			// 双页模式：按阅读顺序跳过两页（不反转索引）
			if ($viewerState.viewMode === 'double') {
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
			// 双页模式：按阅读顺序后退两页（不反转索引）
			if ($viewerState.viewMode === 'double') {
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

	// 向左翻页（方向性翻页，不受阅读方向影响）
	async function handlePageLeft() {
		try {
			const currentIndex = bookStore.currentPageIndex;
			const step = $viewerState.viewMode === 'double' ? 2 : 1;
			const targetIndex = Math.max(currentIndex - step, 0);
			await bookStore.navigateToPage(targetIndex);
		} catch (err) {
			console.error('Failed to turn page left:', err);
		}
	}

	// 向右翻页（方向性翻页，不受阅读方向影响）
	async function handlePageRight() {
		try {
			const currentIndex = bookStore.currentPageIndex;
			const step = $viewerState.viewMode === 'double' ? 2 : 1;
			const targetIndex = Math.min(currentIndex + step, bookStore.totalPages - 1);
			await bookStore.navigateToPage(targetIndex);
		} catch (err) {
			console.error('Failed to turn page right:', err);
		}
	}

	function handleClose() {
		bookStore.closeBook();
	}

	// 监听视图模式变化，更新 PreloadManager 配置
	$effect(() => {
		const mode = $viewerState.viewMode;
		if (!mode || !preloadManager) {
			return;
		}
		if (lastViewMode === mode) {
			return;
		}
		lastViewMode = mode;
		preloadManager.updateImageLoaderConfigWithViewMode(mode);
		preloadManager.loadCurrentImage();

		// 根据模式加载相应的数据
		if (mode === 'panorama') {
			loadPanoramaPages();
		} else {
			panoramaPagesData = [];
		}
	});

	// 监听当前页变化，在全景模式下更新相邻页数据
	let lastPanoramaIndex = -1;

	$effect(() => {
		const mode = $viewerState.viewMode;
		const currentIndex = bookStore.currentPageIndex;

		if (mode === 'panorama' && currentIndex !== undefined) {
			if (currentIndex !== lastPanoramaIndex) {
				lastPanoramaIndex = currentIndex;
				loadPanoramaPages();
			}
		} else {
			lastPanoramaIndex = -1;
		}
	});

	// 全景模式：加载当前页及相邻页（用于填充边框空隙）
	async function loadPanoramaPages() {
		if (!bookStore.currentBook || !preloadManager) {
			console.warn('全景模式：缺少 book 或 preloadManager');
			return;
		}

		const currentIndex = bookStore.currentPageIndex;
		const totalPages = bookStore.totalPages;

		// 计算需要加载的页面范围（当前页前后各 2 页，自动裁剪到边界）
		const start = Math.max(0, currentIndex - 2);
		const end = Math.min(totalPages - 1, currentIndex + 2);

		console.log(`🖼️ 全景模式：加载页面范围 ${start + 1} - ${end + 1}，当前页 ${currentIndex + 1}`);

		// 构建新的页面数组
		const newPages: Array<{
			index: number;
			data: string | null;
			position: 'left' | 'center' | 'right';
		}> = [];

		for (let i = start; i <= end; i++) {
			let position: 'left' | 'center' | 'right' = 'center';
			if (i < currentIndex) position = 'left';
			else if (i === currentIndex) position = 'center';
			else position = 'right';

			// 复用已加载的数据
			const existing = panoramaPagesData.find((p) => p.index === i);
			newPages.push({
				index: i,
				data: existing?.data || null,
				position
			});
		}

		// 立即更新数组（保留已有数据，避免闪烁）
		panoramaPagesData = newPages;

		// 只加载缺失的图片
		const toLoad = newPages.filter((p) => !p.data);

		if (toLoad.length === 0) {
			// console.log('🎉 全景模式：所有图片已缓存'); // 注释掉这行
			return;
		}

		// 批量加载缺失的图片
		const results = await Promise.all(
			toLoad.map(async (page) => {
				try {
					const blob = await preloadManager.getBlob(page.index);
					if (blob && blob.size > 0) {
						const url = URL.createObjectURL(blob);
						console.log(
							`✅ 全景模式：页面 ${page.index + 1} 加载成功 (${page.position})，大小: ${blob.size} bytes`
						);
						return { index: page.index, url };
					}
				} catch (error) {
					console.warn(`加载全景模式第 ${page.index + 1} 页失败:`, error);
				}
				return null;
			})
		);

		// 更新新加载的图片
		panoramaPagesData = panoramaPagesData.map((p) => {
			const result = results.find((r) => r && r.index === p.index);
			return result ? { ...p, data: result.url } : p;
		});

		console.log('🎉 全景模式：批量加载完成');
	}

	// 执行命令 / 动作（兼容旧命令 ID 与新 action ID）
	function executeCommand(command: string) {
		// 优先处理与阅读方向相关的导航动作
		if (command === 'pageLeft' || command === 'pageRight') {
			const settings = settingsManager.getSettings();
			const readingDirection = settings.book.readingDirection;
			if (command === 'pageLeft') {
				if (readingDirection === 'right-to-left') {
					// 右开模式下，逻辑“向左翻页”对应物理向右翻
					void handlePageRight();
				} else {
					void handlePageLeft();
				}
			} else {
				if (readingDirection === 'right-to-left') {
					// 右开模式下，逻辑“向右翻页”对应物理向左翻
					void handlePageLeft();
				} else {
					void handlePageRight();
				}
			}
			return;
		}

		const commands: Record<string, () => void> = {
			// 旧命令 ID（keyboard.svelte.ts）
			next_page: handleNextPage,
			previous_page: handlePreviousPage,
			zoom_in: zoomIn,
			zoom_out: zoomOut,
			zoom_reset: resetZoom,
			// 新 action ID（keybindings.svelte.ts）
			nextPage: handleNextPage,
			prevPage: handlePreviousPage,
			zoomIn: zoomIn,
			zoomOut: zoomOut,
			zoomReset: resetZoom,
			// 全屏切换
			toggle_fullscreen: toggleFullscreen,
			// 视频相关操作（对当前视频页生效）
			videoVolumeUp: () => adjustVideoVolume(1),
			videoVolumeDown: () => adjustVideoVolume(-1),
			videoSpeedUp: () => adjustVideoSpeed(1),
			videoSpeedDown: () => adjustVideoSpeed(-1)
			// 更多命令/动作可以在这里添加
		};

		const handler = commands[command];
		if (handler) {
			handler();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// 仅在此处理对比模式下的 ESC，其余按键交给 App.svelte 的全局处理
		if ($viewerState.comparisonVisible && e.key === 'Escape') {
			updateViewerState({ comparisonVisible: false });
			return;
		}

		// 生成按键组合
		const keyCombo = generateKeyCombo(e);

		// 1）优先使用统一 keybindings 动作系统（支持 pageLeft/pageRight/nextPage/prevPage 等）
		const action = keyBindingsStore.findActionByKeyCombo(keyCombo);
		if (action) {
			e.preventDefault();
			executeCommand(action);
			return;
		}
	}

	// 关闭对比模式
	function closeComparison() {
		updateViewerState({ comparisonVisible: false });
	}

	// ...
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 中文：该容器需要捕获滚轮、键盘以及鼠标事件以实现自定义阅读交互，因此禁用默认的可访问性 lint -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={containerElement}
	class="image-viewer-container relative flex h-full w-full flex-col"
	style={`background-color: ${viewerBackgroundColor};`}
	data-viewer="true"
	onwheel={handleWheel}
	onmousemove={handleMouseMove}
	onclick={handleMouseClick}
	onkeydown={handleKeydown}
	style:cursor={cursorVisible ? 'default' : 'none'}
	role="application"
	tabindex="-1"
>
	<!-- 图像显示区域 -->
	<div
		class="image-container flex flex-1 items-center justify-center overflow-auto"
		data-viewer="true"
		role="region"
		aria-label="图像显示区域"
	>
		{#if error}
			<div class="text-red-500">Error: {error}</div>
		{:else if isCurrentPageVideo}
			{#if videoUrl}
				<VideoPlayer
					src={videoUrl}
					initialTime={videoStartTime}
					onProgress={handleVideoProgress}
					onEnded={handleVideoListLoopEnded}
					initialVolume={videoPlayerSettings.volume}
					initialMuted={videoPlayerSettings.muted}
					initialPlaybackRate={videoPlayerSettings.playbackRate}
					initialLoopMode={videoPlayerSettings.loopMode}
					onSettingsChange={(settings) => {
						videoPlayerSettings = settings;
					}}
				/>
			{:else}
				<div class="text-white">加载视频中...</div>
			{/if}
		{:else if $useStackViewer}
			<StackView
				currentUrl={imageData}
				currentUrl2={imageData2}
				upscaledUrl={derivedUpscaledUrl || bookStore.upscaledImageData}
				layout={$viewerState.viewMode as 'single' | 'double' | 'panorama'}
				direction={settings.book.readingDirection === 'right-to-left' ? 'rtl' : 'ltr'}
				divideLandscape={settings.view.pageLayout?.splitHorizontalPages ?? false}
				treatHorizontalAsDoublePage={settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false}
				autoRotate={false}
				currentImageSize={currentImageDimensions}
				panoramaPages={panoramaPagesData.map(p => ({ index: p.index, data: p.data }))}
				backgroundColor="rgba(0, 128, 0, 0.3)"
				showPageInfo={true}
				showProgress={true}
			/>
		{:else}
			<ImageViewerDisplay
				{imageData}
				{imageData2}
				upscaledImageData={derivedUpscaledUrl || bookStore.upscaledImageData}
				viewMode={$viewerState.viewMode as 'single' | 'double' | 'panorama'}
				zoomLevel={$viewerState.zoom}
				rotationAngle={$rotationAngle}
				orientation={$viewerState.orientation}
				bind:panoramaPages={panoramaPagesData}
			/>
		{/if}
	</div>

	<ImageInfoOverlay />

	<!-- 对比模式查看器 -->
	<ComparisonViewer
		originalImageData={originalImageDataForComparison}
		upscaledImageData={derivedUpscaledUrl || upscaledImageDataForComparison}
		isVisible={$viewerState.comparisonVisible}
		onClose={closeComparison}
	/>

	<ImageViewerProgressBar
		showProgressBar={showProgressBar && Boolean(bookStore.currentBook)}
		totalPages={bookStore.currentBook?.pages.length ?? 0}
		currentPageIndex={bookStore.currentPageIndex}
		{preUpscaleProgress}
		{totalPreUpscalePages}
	/>
</div>
