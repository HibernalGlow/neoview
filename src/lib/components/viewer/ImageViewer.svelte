<script lang="ts">
	/**
	 * NeoView - Image Viewer Component
	 * 图像查看器主组件 (Svelte 5 Runes)
	 */
	import { bookStore } from '$lib/stores/book.svelte';
	import { zoomIn, zoomOut, resetZoom, rotationAngle } from '$lib/stores';
	import { keyBindings, generateKeyCombo, findCommandByKeys } from '$lib/stores/keyboard.svelte';
	import { keyBindingsStore } from '$lib/stores/keybindings.svelte';
	import { settingsManager, performanceSettings } from '$lib/settings/settingsManager';
	import { onDestroy, onMount } from 'svelte';
	import { emmMetadataStore } from '$lib/stores/emmMetadata.svelte';
	import { readable } from 'svelte/store';
	import ComparisonViewer from './ComparisonViewer.svelte';
	import ImageViewerDisplay from './flow/ImageViewerDisplay.svelte';
	import ImageViewerProgressBar from './flow/ImageViewerProgressBar.svelte';
	import { infoPanelStore } from '$lib/stores/infoPanel.svelte';
	import { appState, type StateSelector, type AppStateSnapshot } from '$lib/core/state/appState';
	import {
		scheduleComparisonPreview,
		cancelComparisonPreviewTask
	} from '$lib/core/tasks/comparisonTaskService';
	import { scheduleUpscaleCacheCleanup } from '$lib/core/cache/cacheMaintenance';
	import VideoPlayer from './VideoPlayer.svelte';

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

	// 进度条状态
	let showProgressBar = $state(true);

	// 鼠标光标隐藏相关
	let cursorVisible = $state(true);
	let hideCursorTimeout: ReturnType<typeof window.setTimeout> | null = null;
	let lastMousePosition = $state({ x: 0, y: 0 });
	let settings = $state(settingsManager.getSettings());

	// 对比模式状态
	type ImageDimensions = { width: number; height: number };

	let originalImageDataForComparison = $state<string>('');
	let upscaledImageDataForComparison = $state<string>('');
	let derivedUpscaledUrl = $state<string | null>(null);
	let lastUpscaledBlob: Blob | null = null;
	let lastUpscaledObjectUrl: string | null = null;
	let lastRequestedPageIndex = -1;
	let lastLoadedPageIndex = -1;
	let lastLoadedHash: string | null = null;
	let lastViewMode: 'single' | 'double' | 'panorama' | 'vertical' | null = null;
	let verticalPagesData = $state<Array<{ index: number; data: string | null }>>([]);
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
				setVideoUrl(objectUrl, true);
			} else {
				const fileUrl = convertFileSrc(page.path);
				if (requestId !== currentVideoRequestId) {
					return;
				}
				setVideoUrl(fileUrl, false);
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

	// 订阅设置变化
	settingsManager.addListener((s) => {
		settings = s;
	});

	// 初始化预加载管理器
	onMount(() => {
		// 初始化 EMM 元数据 store
		emmMetadataStore.initialize();
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
	});

	// 组件卸载时清理
	onDestroy(() => {
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
		const currentPage = bookStore.currentPage;
		const currentIndex = bookStore.currentPageIndex;
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
				void loadVideoForPage(currentPage);
			} else {
				if (isCurrentPageVideo || videoUrl) {
					currentVideoRequestId++;
					clearVideoPlaybackState();
				}
				isCurrentPageVideo = false;
				if (preloadManager && currentIndex !== lastRequestedPageIndex) {
					lastRequestedPageIndex = currentIndex;
					preloadManager.loadCurrentImage();
				}
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
			// 双页模式：后退两页
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
		if (mode === 'vertical') {
			loadVerticalPages();
			panoramaPagesData = [];
		} else if (mode === 'panorama') {
			loadPanoramaPages();
			verticalPagesData = [];
		} else {
			// 切换到其他模式时清空数据
			verticalPagesData = [];
			panoramaPagesData = [];
		}
	});

	// 纵向滚动模式：加载多页数据
	async function loadVerticalPages() {
		if (!bookStore.currentBook || !preloadManager) {
			return;
		}

		const totalPages = bookStore.totalPages;
		const currentIndex = bookStore.currentPageIndex;
		const preloadPages = performanceSettings.preLoadSize;

		// 计算要加载的页面范围（当前页前后各 preloadPages 页）
		const startIndex = Math.max(0, currentIndex - preloadPages);
		const endIndex = Math.min(totalPages - 1, currentIndex + preloadPages);

		// 初始化数组
		const pages: Array<{ index: number; data: string | null }> = [];
		for (let i = startIndex; i <= endIndex; i++) {
			pages.push({ index: i, data: null });
		}
		verticalPagesData = pages;

		// 异步加载每页的图片数据
		for (const page of pages) {
			try {
				// 优先使用 PreloadManager 的 getBlob 方法
				const blob = await preloadManager.getBlob(page.index);
				if (blob && blob.size > 0) {
					const url = URL.createObjectURL(blob);
					page.data = url;
					// 更新数组以触发响应式更新
					verticalPagesData = [...verticalPagesData];
				}
			} catch (error) {
				console.warn(`加载第 ${page.index + 1} 页失败:`, error);
				// 如果 PreloadManager 失败，尝试直接通过 invoke 加载
				const pageInfo = bookStore.currentBook?.pages[page.index];
				if (pageInfo) {
					try {
						const displayPath = buildDisplayPath(bookStore.currentBook!, pageInfo);
						let blob: Blob | null = null;

						const traceId = createImageTraceId('viewer-vertical', page.index);
						logImageTrace(traceId, 'fallback invoke', {
							mode: 'vertical',
							pageIndex: page.index,
							source: bookStore.currentBook!.type
						});

						if (bookStore.currentBook!.type === 'archive') {
							const binaryData = await invoke<number[]>('load_image_from_archive', {
								archivePath: bookStore.currentBook!.path,
								filePath: pageInfo.path,
								traceId,
								pageIndex: page.index
							});
							logImageTrace(traceId, 'fallback archive bytes ready', { bytes: binaryData.length });
							blob = new Blob([new Uint8Array(binaryData)]);
						} else {
							const binaryData = await invoke<number[]>('load_image', {
								path: displayPath,
								traceId,
								pageIndex: page.index
							});
							logImageTrace(traceId, 'fallback file bytes ready', { bytes: binaryData.length });
							blob = new Blob([new Uint8Array(binaryData)]);
						}

						if (blob) {
							logImageTrace(traceId, 'fallback blob created', { size: blob.size });
						}

						if (blob && blob.size > 0) {
							const url = URL.createObjectURL(blob);
							page.data = url;
							// 更新数组以触发响应式更新
							verticalPagesData = [...verticalPagesData];
						}
					} catch (loadError) {
						console.warn(`通过 invoke 加载第 ${page.index + 1} 页失败:`, loadError);
					}
				}
			}
		}
	}

	// 监听当前页变化，在相应模式下更新数据
	$effect(() => {
		const mode = $viewerState.viewMode;
		if (mode === 'vertical' && bookStore.currentPageIndex !== undefined) {
			loadVerticalPages();
		} else if (mode === 'panorama' && bookStore.currentPageIndex !== undefined) {
			loadPanoramaPages();
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

		// 加载当前页及前后各2页
		const range = 2;
		const pages: Array<{
			index: number;
			data: string | null;
			position: 'left' | 'center' | 'right';
		}> = [];

		const start = Math.max(0, currentIndex - range);
		const end = Math.min(totalPages - 1, currentIndex + range);

		console.log(`🖼️ 全景模式：加载页面范围 ${start + 1} - ${end + 1}，当前页 ${currentIndex + 1}`);

		for (let i = start; i <= end; i++) {
			let position: 'left' | 'center' | 'right' = 'center';
			if (i < currentIndex) position = 'left';
			else if (i > currentIndex) position = 'right';

			pages.push({ index: i, data: null, position });
		}

		panoramaPagesData = pages;
		console.log('🖼️ 全景模式：初始化页面数组', pages.length, '页');

		// 异步加载每页的图片数据
		for (const page of pages) {
			try {
				const blob = await preloadManager.getBlob(page.index);
				if (blob && blob.size > 0) {
					const url = URL.createObjectURL(blob);
					page.data = url;
					console.log(
						`✅ 全景模式：页面 ${page.index + 1} 加载成功 (${page.position})，大小: ${blob.size} bytes`
					);
					// 更新数组以触发响应式更新
					panoramaPagesData = [...panoramaPagesData];
				} else {
					console.warn(`⚠️ 全景模式：页面 ${page.index + 1} blob 为空`);
				}
			} catch (error) {
				console.warn(`加载全景模式第 ${page.index + 1} 页失败:`, error);
				// 如果 PreloadManager 失败，尝试直接通过 invoke 加载
				const pageInfo = bookStore.currentBook?.pages[page.index];
				if (pageInfo) {
					try {
						const displayPath = buildDisplayPath(bookStore.currentBook!, pageInfo);
						let blob: Blob | null = null;

						const traceId = createImageTraceId('viewer-panorama', page.index);
						logImageTrace(traceId, 'fallback invoke', {
							mode: 'panorama',
							pageIndex: page.index,
							source: bookStore.currentBook!.type
						});

						if (bookStore.currentBook!.type === 'archive') {
							const binaryData = await invoke<number[]>('load_image_from_archive', {
								archivePath: bookStore.currentBook!.path,
								filePath: pageInfo.path,
								traceId,
								pageIndex: page.index
							});
							logImageTrace(traceId, 'fallback archive bytes ready', { bytes: binaryData.length });
							blob = new Blob([new Uint8Array(binaryData)]);
						} else {
							const binaryData = await invoke<number[]>('load_image', {
								path: displayPath,
								traceId,
								pageIndex: page.index
							});
							logImageTrace(traceId, 'fallback file bytes ready', { bytes: binaryData.length });
							blob = new Blob([new Uint8Array(binaryData)]);
						}

						if (blob) {
							logImageTrace(traceId, 'fallback blob created', { size: blob.size });
						}

						if (blob && blob.size > 0) {
							const url = URL.createObjectURL(blob);
							page.data = url;
							// 更新数组以触发响应式更新
							panoramaPagesData = [...panoramaPagesData];
						}
					} catch (loadError) {
						console.warn(`通过 invoke 加载全景模式第 ${page.index + 1} 页失败:`, loadError);
					}
				}
			}
		}
	}

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
		if ($viewerState.comparisonVisible && e.key === 'Escape') {
			updateViewerState({ comparisonVisible: false });
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
	class="image-viewer-container relative flex h-full w-full flex-col bg-black"
	data-viewer="true"
	onwheel={handleWheel}
	onmousemove={handleMouseMove}
	onclick={handleMouseClick}
	onkeydown={handleKeydown}
	style:cursor={cursorVisible ? 'default' : 'none'}
	role="application"
	aria-label="图像查看器"
	tabindex="-1"
>
	<!-- 图像显示区域 -->
	<div
		class="image-container flex flex-1 items-center justify-center overflow-auto"
		data-viewer="true"
		role="region"
		aria-label="图像显示区域"
	>
		{#if loadingVisible}
			<div class="text-white">Loading...</div>
		{:else if error}
			<div class="text-red-500">Error: {error}</div>
		{:else if isCurrentPageVideo}
			{#if videoUrl}
				<VideoPlayer src={videoUrl} />
			{:else}
				<div class="text-white">加载视频中...</div>
			{/if}
		{:else}
			<ImageViewerDisplay
				{imageData}
				{imageData2}
				upscaledImageData={derivedUpscaledUrl || bookStore.upscaledImageData}
				viewMode={$viewerState.viewMode as 'single' | 'double' | 'panorama' | 'vertical'}
				zoomLevel={$viewerState.zoom}
				rotationAngle={$rotationAngle}
				bind:verticalPages={verticalPagesData}
				bind:panoramaPages={panoramaPagesData}
			/>
		{/if}
	</div>

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
