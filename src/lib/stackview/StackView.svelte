<!--
  StackView - 层叠式图片查看器（独立模式）
  
  使用 imageStore 管理图片加载，复用现有手势和缩放
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		BackgroundLayer,
		CurrentFrameLayer,
		InfoLayer,
		GestureLayer,
		UpscaleLayer,
		ImageInfoLayer,
		ProgressBarLayer,
		SidebarControlLayer
	} from './layers';
	import HoverScrollLayer from './layers/HoverScrollLayer.svelte';
	import PanoramaFrameLayer from './layers/PanoramaFrameLayer.svelte';
	import {
		isLandscape,
		buildFrameImages,
		getPageStep,
		shouldSplitPage,
		type FrameBuildConfig,
		type PageData
	} from './utils/viewMode';
	import { createZoomModeManager, type ViewportSize } from './utils/zoomModeHandler';
	import {
		calculateTargetScale,
		prepareTransition,
		completeTransition,
		checkDimensionsMatch,
		getBestAvailableDimensions,
		type TransitionState
	} from './utils/imageTransitionManager';
	import type { ZoomMode } from '$lib/settings/settingsManager';
	import { applyZoomModeEventName, type ApplyZoomModeDetail } from '$lib/utils/zoomMode';
	import type { Frame, FrameLayout, FrameImage } from './types/frame';
	import { emptyFrame } from './types/frame';
	import { getImageStore } from './stores/imageStore.svelte';
	import { getPanoramaStore } from './stores/panoramaStore.svelte';
	import { createCursorAutoHide, type CursorAutoHideController } from '$lib/utils/cursorAutoHide';

	// 导入外部 stores
	import {
		viewMode as legacyViewMode,
		orientation as legacyOrientation,
		zoomLevel,
		rotationAngle,
		setZoomLevel,
		viewerPageInfoVisible,
		currentPageShouldSplit,
		subPageIndex,
		pageLeft,
		pageRight
	} from '$lib/stores';
	import { bookContextManager, type BookContext } from '$lib/stores/bookContext.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import VideoContainer from '$lib/components/viewer/VideoContainer.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { upscaleStore } from './stores/upscaleStore.svelte';
	import SlideshowControl from '$lib/components/viewer/SlideshowControl.svelte';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';
	import { showInfoToast } from '$lib/utils/toast';

	// ============================================================================
	// Props
	// ============================================================================

	let {
		backgroundColor = 'var(--background)',
		showPageInfo = true,
		showProgress = true,
		showLoading = true
	}: {
		backgroundColor?: string;
		showPageInfo?: boolean;
		showProgress?: boolean;
		showLoading?: boolean;
	} = $props();

	// ============================================================================
	// 状态
	// ============================================================================

	const imageStore = getImageStore();
	const panoramaStore = getPanoramaStore();
	const zoomModeManager = createZoomModeManager();

	let containerRef: HTMLDivElement | null = $state(null);
	let viewportSize = $state<ViewportSize>({ width: 0, height: 0 });
	let cursorAutoHide: CursorAutoHideController | null = null;

	// 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 DOM
	// 不再使用 Svelte 响应式状态，避免高频更新触发重渲染

	// 通过 onImageLoad 获取的图片尺寸（用于自动旋转等功能）
	let loadedImageSize = $state<{ width: number; height: number } | null>(null);

	// 图片尺寸：从多个来源获取，确保第一张图也有尺寸
	let hoverImageSize = $derived.by(() => {
		if (loadedImageSize?.width && loadedImageSize?.height) {
			return { width: loadedImageSize.width, height: loadedImageSize.height };
		}
		const dims = imageStore.state.dimensions;
		if (dims?.width && dims?.height) {
			return { width: dims.width, height: dims.height };
		}
		const page = bookStore.currentPage;
		if (page?.width && page?.height) {
			return { width: page.width, height: page.height };
		}
		return { width: 0, height: 0 };
	});

	// 追踪上一个页面索引，用于检测页面切换
	let lastPageIndex = $state<number>(-1);

	// 【修复】图片过渡状态管理 - 解决横竖图片切换时的视觉跳动
	let transitionState = $state<TransitionState | null>(null);

	// 【修复】页面切换时使用预缓存尺寸计算目标缩放，而不是立即清空 loadedImageSize
	// 这样可以避免中间状态导致的视觉跳动
	$effect.pre(() => {
		const pageIndex = bookStore.currentPageIndex;
		if (pageIndex !== lastPageIndex) {
			// 【优化】优先从 imagePool 获取预加载的尺寸（更准确）
			// 然后从 bookStore.currentPage 获取元数据尺寸（更快可用）
			const newPage = bookStore.currentBook?.pages?.[pageIndex];
			
			// 尝试从 imageStore 获取已加载的尺寸
			const storeDims = imageStore.state.dimensions;
			const storePageIndex = bookStore.currentPageIndex;
			
			// 优先级：imageStore（如果是当前页）> bookStore.currentPage
			let preCachedDims: { width: number; height: number } | null = null;
			
			if (storeDims?.width && storeDims?.height && storePageIndex === pageIndex) {
				// imageStore 已有当前页的尺寸
				preCachedDims = { width: storeDims.width, height: storeDims.height };
			} else if (newPage?.width && newPage?.height) {
				// 使用 bookStore 的元数据尺寸
				preCachedDims = { width: newPage.width, height: newPage.height };
			}
			
			// 准备过渡状态，使用预缓存尺寸计算目标缩放
			if (preCachedDims && viewportSize.width > 0 && viewportSize.height > 0) {
				transitionState = prepareTransition(
					pageIndex,
					preCachedDims,
					viewportSize,
					currentZoomMode
				);
			}
			
			// 延迟清空 loadedImageSize，等新图片开始加载时再清空
			// 这样在过渡期间可以使用预计算的缩放值
			lastPageIndex = pageIndex;
		}
	});

	// 【修复】主动获取图片尺寸，使用 $effect.pre 确保在渲染前更新
	$effect.pre(() => {
		const url = imageStore.state.currentUrl;
		const pageIndex = bookStore.currentPageIndex;
		if (!url) {
			loadedImageSize = null;
			// 清空过渡状态
			if (transitionState) {
				transitionState = null;
			}
			return;
		}

		// 当 URL 变化时（新图片开始加载），清空旧的 loadedImageSize
		// 但保留 transitionState 以使用预计算的缩放值
		loadedImageSize = null;

		// 创建临时 Image 对象获取精确尺寸
		const img = new Image();
		const capturedPageIndex = pageIndex;
		img.onload = () => {
			// 确保这是当前页面的图片（页面索引匹配）
			if (capturedPageIndex === bookStore.currentPageIndex && img.naturalWidth && img.naturalHeight) {
				const newWidth = img.naturalWidth;
				const newHeight = img.naturalHeight;
				const actualDims = { width: newWidth, height: newHeight };
				
				// 更新加载后的尺寸
				if (loadedImageSize?.width !== newWidth || loadedImageSize?.height !== newHeight) {
					loadedImageSize = actualDims;
				}
				
				// 图片加载完成，完成过渡
				if (transitionState && transitionState.targetPageIndex === capturedPageIndex) {
					// 【修复】检查预缓存尺寸与实际尺寸是否匹配
					const dimensionsMatch = checkDimensionsMatch(
						transitionState.preCachedDimensions,
						actualDims,
						0.05 // 5% 阈值
					);
					
					if (!dimensionsMatch && transitionState.preCachedDimensions) {
						// 尺寸不匹配，记录日志（实际缩放会自动通过 loadedImageSize 更新）
						console.log('📐 图片尺寸不匹配，自动调整缩放:', {
							preCached: transitionState.preCachedDimensions,
							actual: actualDims
						});
					}
					
					transitionState = completeTransition(transitionState);
					// 短暂延迟后清空过渡状态
					setTimeout(() => {
						if (transitionState && !transitionState.isTransitioning) {
							transitionState = null;
						}
					}, 50);
				}
			}
		};
		img.src = url;
	});

	// ============================================================================
	// 真实缩放逻辑（完全独立管理）
	// ============================================================================

	// 当前缩放模式
	let currentZoomMode = $state<ZoomMode>(
		settingsManager.getSettings().view.defaultZoomMode ?? 'fit'
	);

	// 用户手动缩放倍数（基于 zoomMode 的额外缩放，1.0 = 无额外缩放）
	let manualScale = $state(1.0);

	// 旋转角度
	let rotation = $state(0);

	// 根据 zoomMode 计算的基础缩放
	// 【修复】在过渡期间使用预计算的缩放值，避免横竖图片切换时的视觉跳动
	let modeScale = $derived.by(() => {
		// 【关键修复】如果正在过渡中且有预计算的缩放值，直接使用它
		// 这样可以避免在图片加载完成前使用错误的尺寸计算缩放
		if (transitionState?.isTransitioning && transitionState.targetScale > 0) {
			return transitionState.targetScale;
		}

		// 优先级：loadedImageSize > imageStore.dimensions > bookStore.currentPage
		const page = bookStore.currentPage;
		const storeDims = imageStore.state.dimensions;
		
		// 使用最准确的尺寸源（加载后的尺寸最准确，但页面元数据尺寸最快可用）
		const iw = loadedImageSize?.width ?? storeDims?.width ?? page?.width ?? 0;
		const ih = loadedImageSize?.height ?? storeDims?.height ?? page?.height ?? 0;
		
		if (!iw || !ih || !viewportSize.width || !viewportSize.height) {
			return 1;
		}

		// 使用统一的缩放计算函数
		return calculateTargetScale(
			{ width: iw, height: ih },
			viewportSize,
			currentZoomMode
		);
	});

	// 最终缩放 = modeScale * manualScale
	let effectiveScale = $derived(modeScale * manualScale);

	// 缩放后的实际显示尺寸
	// 【性能优化】使用与 modeScale 相同的尺寸优先级
	let displaySize = $derived.by(() => {
		const page = bookStore.currentPage;
		const storeDims = imageStore.state.dimensions;
		const w = loadedImageSize?.width ?? storeDims?.width ?? page?.width ?? 0;
		const h = loadedImageSize?.height ?? storeDims?.height ?? page?.height ?? 0;
		
		if (!w || !h) {
			return { width: 0, height: 0 };
		}

		return {
			width: w * effectiveScale,
			height: h * effectiveScale
		};
	});

	// 对齐模式：根据 zoomMode 决定图片对齐方式
	let alignMode = $derived.by((): 'center' | 'left' | 'right' => {
		switch (currentZoomMode) {
			case 'fitLeftAlign':
				return 'left';
			case 'fitRightAlign':
				return 'right';
			default:
				return 'center';
		}
	});

	// 同步缩放到老 viewer 的 store（用于顶栏显示）
	$effect(() => {
		// effectiveScale 变化时，更新 zoomLevel store
		// 这里用 manualScale 作为 zoomLevel，因为顶栏控制的是手动缩放
		setZoomLevel(manualScale);
	});

	// 监听老 viewer store 的缩放变化（顶栏按钮触发）
	$effect(() => {
		const storeZoom = $zoomLevel;
		// 只有当 store 值与 manualScale 不同时才更新，避免循环
		if (Math.abs(storeZoom - manualScale) > 0.001) {
			manualScale = storeZoom;
		}
	});

	// 监听老 viewer store 的旋转变化
	$effect(() => {
		rotation = $rotationAngle;
	});

	// 当前书本上下文
	let bookContext = $state<BookContext | null>(null);

	// 追踪上一次非全景时的 pageMode（用于全景模式保持双页状态）
	let lastNonPanoramaPageMode = $state<'single' | 'double'>('single');
	let wasInPanorama = $state(false);

	// 同步旧版 viewMode 到 BookContext（桥接）
	$effect(() => {
		const ctx = bookContext;
		if (!ctx) return;

		const mode = $legacyViewMode as 'single' | 'double' | 'panorama';
		const orient = $legacyOrientation as 'horizontal' | 'vertical';

		console.log(
			`🔄 StackView: viewMode=${mode}, wasInPanorama=${wasInPanorama}, lastNonPanoramaPageMode=${lastNonPanoramaPageMode}, currentPageMode=${ctx.pageMode}`
		);

		// 根据旧模式设置 BookContext
		if (mode === 'panorama') {
			ctx.setPanoramaEnabled(true);
			// 进入全景模式时，使用之前的 pageMode
			if (!wasInPanorama) {
				console.log(`🔄 StackView: 进入全景，保持 pageMode=${ctx.pageMode}`);
				wasInPanorama = true;
			}
			// 全景模式中保持当前 pageMode 不变
		} else {
			// 从全景退出时，保持之前的 pageMode
			if (wasInPanorama) {
				console.log(`🔄 StackView: 退出全景，保持 pageMode=${ctx.pageMode}`);
				ctx.setPanoramaEnabled(false);
				wasInPanorama = false;
				// 不设置 pageMode，保持全景期间的状态
			} else {
				// 普通模式切换（不是从全景退出）
				ctx.setPanoramaEnabled(false);
				ctx.setPageMode(mode);
				lastNonPanoramaPageMode = mode;
				console.log(`🔄 StackView: 非全景模式，设置 pageMode=${mode}`);
			}
		}
		ctx.setOrientation(orient);
	});

	// 从 BookContext 获取视图状态
	let pageMode = $derived.by(() => {
		const mode = bookContext?.pageMode ?? 'single';
		console.log(`📖 StackView: 派生 pageMode=${mode}, isPanorama=${bookContext?.panoramaEnabled}`);
		return mode;
	});
	let isPanorama = $derived(bookContext?.panoramaEnabled ?? false);
	let orientation = $derived(bookContext?.orientation ?? 'horizontal');

	// 设置
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((s) => {
		settings = s;
	});

	// 切换页面模式（单页/双页）
	function togglePageMode() {
		bookContext?.togglePageMode();
	}

	// 切换全景模式
	function togglePanorama() {
		bookContext?.togglePanorama();
	}

	// 从设置获取配置
	let direction = $derived<'ltr' | 'rtl'>(
		settings.book.readingDirection === 'right-to-left' ? 'rtl' : 'ltr'
	);
	let treatHorizontalAsDoublePage = $derived(
		settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false
	);
	let autoRotateMode = $derived(settings.view.autoRotate?.mode ?? 'none');

	// 横向页面分割设置
	let splitHorizontalPages = $derived(
		settings.view.pageLayout?.splitHorizontalPages ?? false
	);

	// 分割状态：当前显示的半边（仅在单页模式下启用分割时有效）
	let currentSplitHalf = $state<'left' | 'right' | null>(null);


	// 是否为视频
	let isVideoMode = $derived.by(() => {
		const page = bookStore.currentPage;
		if (!page) return false;
		// 优先检查 name，然后检查 innerPath（压缩包内文件），最后检查 path
		const filename = page.name || page.innerPath || '';
		if (!filename) return false;
		return isVideoFile(filename);
	});

	// 视频容器引用
	let videoContainerRef: any = null;

	// 幻灯片模式
	let slideshowVisible = $state(false);


	// ============================================================================
	// 帧配置（使用方案 B 的 pageMode）
	// ============================================================================

	// 计算帧布局：根据 pageMode 和 isPanorama
	let frameLayout = $derived<FrameLayout>(isPanorama ? 'panorama' : pageMode);

	// 首页/尾页单独显示设置
	// 使用 BookSettingSelectMode 解析逻辑（简化版：default = true for first, false for last）
	let singleFirstPage = $derived(
		settings.view.pageLayout?.singleFirstPageMode === 'default' ? true :
		settings.view.pageLayout?.singleFirstPageMode === 'continue' ? false : true
	);
	let singleLastPage = $derived(
		settings.view.pageLayout?.singleLastPageMode === 'default' ? false :
		settings.view.pageLayout?.singleLastPageMode === 'continue' ? true : false
	);

	// 宽页拉伸模式（双页模式下的对齐方式）
	let widePageStretch = $derived(
		settings.view.pageLayout?.widePageStretch ?? 'uniformHeight'
	);

	let frameConfig = $derived.by(
		(): FrameBuildConfig => ({
			layout: pageMode,
			orientation: orientation,
			direction: direction,
			divideLandscape: splitHorizontalPages && pageMode === 'single',
			treatHorizontalAsDoublePage: treatHorizontalAsDoublePage,
			autoRotate: autoRotateMode,
			// 首页/尾页单独显示（参考 NeeView）
			singleFirstPage: singleFirstPage,
			singleLastPage: singleLastPage,
			totalPages: bookStore.totalPages,
			// 宽页拉伸模式
			widePageStretch: widePageStretch
		})
	);

	// ============================================================================
	// 帧数据
	// ============================================================================

	// 获取页面数据的辅助函数
	// 对于当前页面，优先使用 loadedImageSize（图片加载后的实际尺寸）
	function getPageData(index: number): PageData | null {
		const book = bookStore.currentBook;
		if (!book || !book.pages || index < 0 || index >= book.pages.length) {
			return null;
		}
		const page = book.pages[index];
		
		// 如果是当前页面，优先使用加载后的实际尺寸
		let width = page?.width ?? 0;
		let height = page?.height ?? 0;
		
		if (index === bookStore.currentPageIndex) {
			// 优先使用 loadedImageSize
			if (loadedImageSize?.width && loadedImageSize?.height) {
				width = loadedImageSize.width;
				height = loadedImageSize.height;
			} else {
				// 其次使用 imageStore 的尺寸
				const dims = imageStore.state.dimensions;
				if (dims?.width && dims?.height) {
					width = dims.width;
					height = dims.height;
				}
			}
		}
		
		console.log(`📊 getPageData(${index}): width=${width}, height=${height}, isLandscape=${width > height}`);
		
		return {
			url: '',
			pageIndex: index,
			width,
			height
		};
	}

	// 判断当前页是否为分割页
	// 优先使用 loadedImageSize（图片加载后的实际尺寸），其次使用页面元数据
	let isCurrentPageSplit = $derived.by(() => {
		if (pageMode !== 'single' || !splitHorizontalPages) return false;
		
		// 优先使用加载后的实际尺寸
		if (loadedImageSize?.width && loadedImageSize?.height) {
			return loadedImageSize.width > loadedImageSize.height;
		}
		
		// 其次使用 imageStore 的尺寸
		const dims = imageStore.state.dimensions;
		if (dims?.width && dims?.height) {
			return dims.width > dims.height;
		}
		
		// 最后使用页面元数据
		const pageData = getPageData(bookStore.currentPageIndex);
		return pageData ? shouldSplitPage(pageData, true) : false;
	});

	// ============================================================================
	// 分割状态同步 - 统一翻页模型
	// ============================================================================
	// 
	// 数据流：
	// 1. isCurrentPageSplit (StackView) → currentPageShouldSplit (ui.svelte.ts)
	//    让 ui.svelte.ts 知道当前页是否应该分割
	// 
	// 2. subPageIndex (ui.svelte.ts) → currentSplitHalf (StackView)
	//    让 StackView 知道应该渲染哪一半
	// 
	// 3. 当页面变化且是分割页时，ui.svelte.ts 的 pageRight/pageLeft 会正确设置 subPageIndex

	// 【同步1】isCurrentPageSplit → currentPageShouldSplit
	$effect(() => {
		const isSplit = isCurrentPageSplit;
		currentPageShouldSplit.set(isSplit);
		console.log(`🔄 Sync currentPageShouldSplit: ${isSplit}`);
	});

	// 【同步2】subPageIndex → currentSplitHalf
	$effect(() => {
		const sub = $subPageIndex;
		const isSplit = isCurrentPageSplit;
		
		if (isSplit) {
			// subPageIndex: 0 = 第一半, 1 = 第二半
			// LTR: 第一半 = left, 第二半 = right
			// RTL: 第一半 = right, 第二半 = left
			const firstHalf: 'left' | 'right' = direction === 'ltr' ? 'left' : 'right';
			const secondHalf: 'left' | 'right' = direction === 'ltr' ? 'right' : 'left';
			const newHalf = sub === 0 ? firstHalf : secondHalf;
			
			console.log(`🔄 Sync from subPageIndex: ${sub} -> currentSplitHalf: ${newHalf}`);
			currentSplitHalf = newHalf;
		} else {
			// 非分割页面
			if (currentSplitHalf !== null) {
				console.log(`🔄 Reset currentSplitHalf to null (not split page)`);
				currentSplitHalf = null;
			}
		}
	});

	let currentFrameData = $derived.by((): Frame => {
		const { currentUrl, secondUrl, dimensions } = imageStore.state;

		// 全景模式时不使用此组件，由 PanoramaFrameLayer 处理
		if (isPanorama) {
			return emptyFrame;
		}

		if (!currentUrl) return emptyFrame;

		// 获取尺寸：优先从 loadedImageSize（onload后获取），然后 imageStore，最后 bookStore.currentPage
		const page = bookStore.currentPage;
		const width = loadedImageSize?.width ?? dimensions?.width ?? page?.width ?? 0;
		const height = loadedImageSize?.height ?? dimensions?.height ?? page?.height ?? 0;

		// 构建当前页数据
		const currentPage: PageData = {
			url: currentUrl,
			pageIndex: bookStore.currentPageIndex,
			width,
			height
		};

		// 构建下一页数据（双页模式需要）
		// 需要包含尺寸信息，以便 buildFrameImages 判断横竖方向
		const nextPageIndex = bookStore.currentPageIndex + 1;
		const nextBookPage = bookStore.currentBook?.pages?.[nextPageIndex];
		const { secondDimensions } = imageStore.state;
		const nextPage: PageData | null = secondUrl
			? {
					url: secondUrl,
					pageIndex: nextPageIndex,
					width: secondDimensions?.width ?? nextBookPage?.width ?? 0,
					height: secondDimensions?.height ?? nextBookPage?.height ?? 0
				}
			: null;

		// 构建分割状态（单页分割模式）
		const splitState = (pageMode === 'single' && splitHorizontalPages && currentSplitHalf)
			? { pageIndex: bookStore.currentPageIndex, half: currentSplitHalf }
			: null;

		// 使用 buildFrameImages 构建图片列表
		const images = buildFrameImages(currentPage, nextPage, frameConfig, splitState);

		return { id: `frame-${bookStore.currentPageIndex}-${currentSplitHalf ?? 'full'}`, images, layout: pageMode };
	});

	// 实际显示模式：当双页模式下只有一张图时（横向图独占），使用 single 布局
	// 这样图片可以占满视口宽度，而不是被限制在 50%
	let effectivePageMode = $derived.by((): 'single' | 'double' => {
		if (pageMode !== 'double') return pageMode;
		// 双页模式下，如果实际只显示一张图，使用 single 布局
		if (currentFrameData.images.length === 1) {
			return 'single';
		}
		return 'double';
	});

	let upscaledFrameData = $derived.by((): Frame => {
		const url = bookStore.upscaledImageData;
		if (!url) return emptyFrame;
		return {
			id: 'upscaled',
			images: [{ url, physicalIndex: bookStore.currentPageIndex, virtualIndex: 0 }],
			layout: 'single'
		};
	});

	// ============================================================================
	// 方法
	// ============================================================================

	// 【性能优化】重置滚动位置到中心
	function resetScrollPosition() {
		const containers = document.querySelectorAll('.scroll-frame-container');
		for (const el of containers) {
			const container = el as HTMLElement;
			// 计算中心位置
			const centerX = (container.scrollWidth - container.clientWidth) / 2;
			const centerY = (container.scrollHeight - container.clientHeight) / 2;
			container.scrollLeft = centerX;
			container.scrollTop = centerY;
		}
	}

	function resetView() {
		manualScale = 1.0;
		rotation = 0;
		resetScrollPosition();
	}

	// 图片加载完成回调 - 更新尺寸并触发自动旋转重计算
	function handleImageLoad(e: Event, _index: number) {
		const img = e.target as HTMLImageElement;
		if (img && img.naturalWidth && img.naturalHeight) {
			const newWidth = img.naturalWidth;
			const newHeight = img.naturalHeight;
			if (loadedImageSize?.width !== newWidth || loadedImageSize?.height !== newHeight) {
				loadedImageSize = { width: newWidth, height: newHeight };
			}

			// 更新 MetadataService 中的尺寸信息
			updateMetadataDimensions(newWidth, newHeight);
		}
	}

	// 更新图像尺寸到 MetadataService 和 bookStore
	async function updateMetadataDimensions(width: number, height: number) {
		const book = bookStore.currentBook;
		const page = bookStore.currentPage;
		const pageIndex = bookStore.currentPageIndex;
		if (!book || !page) return;

		// 【关键修复】同时更新 bookStore.pages 中的尺寸
		// 这样 getPageStep 可以正确判断页面是否为横向
		bookStore.updatePageDimensions(pageIndex, { width, height });

		try {
			const { metadataService } = await import('$lib/services/metadataService');
			const isArchive = book.type === 'archive';
			const path = isArchive ? book.path : page.path;
			const innerPath = isArchive ? page.innerPath : undefined;

			metadataService.updateDimensions(path, width, height, innerPath);
		} catch (error) {
			console.warn('[StackView] 更新元数据尺寸失败:', error);
		}
	}

	// 计算翻页步进：根据当前/下一页的横竖状态动态计算
	// 只有两张竖屏图片才能拼成双页，横向图必须单独显示
	let pageStep = $derived.by(() => {
		if (pageMode !== 'double' || !treatHorizontalAsDoublePage) {
			// 未开启"横向视为双页"时，使用固定步进
			return pageMode === 'double' ? 2 : 1;
		}

		// 双页模式 + 开启"横向视为双页"：动态计算
		const book = bookStore.currentBook;
		if (!book || !book.pages) return 2;

		const currentIndex = bookStore.currentPageIndex;
		const currentPage = book.pages[currentIndex];
		if (!currentPage) return 1;

		// 构建页面数据
		const currentPageData: PageData = {
			url: '',
			pageIndex: currentIndex,
			width: currentPage.width ?? 0,
			height: currentPage.height ?? 0
		};

		// 获取下一页
		const nextIndex = currentIndex + 1;
		let nextPageData: PageData | null = null;
		if (nextIndex < book.pages.length) {
			const nextPage = book.pages[nextIndex];
			if (nextPage) {
				nextPageData = {
					url: '',
					pageIndex: nextIndex,
					width: nextPage.width ?? 0,
					height: nextPage.height ?? 0
				};
			}
		}

		return getPageStep(currentPageData, nextPageData, frameConfig);
	});

	// ============================================================================
	// 翻页函数 - 统一使用 ui.svelte.ts 的 pageLeft/pageRight
	// ============================================================================
	// 
	// 翻页模型统一说明：
	// - 单一数据源：ui.svelte.ts 的 subPageIndex (0=第一半, 1=第二半)
	// - 分割判断：ui.svelte.ts 的 currentPageShouldSplit（由 StackView 同步）
	// - 渲染：StackView 监听 subPageIndex，转换为 currentSplitHalf 用于渲染
	// 
	// 所有翻页入口最终都调用 pageLeft/pageRight，确保逻辑一致

	function handlePrevPage() {
		console.log(`⬅️ handlePrevPage: 委托给 pageLeft()`);
		resetScrollPosition();
		void pageLeft();
	}

	function handleNextPage() {
		console.log(`➡️ handleNextPage: 委托给 pageRight()`);
		resetScrollPosition();
		void pageRight();
	}

	// 处理全景模式滚动事件 - 触发预加载
	function handlePanoramaScroll(e: Event) {
		// 检查是否是自定义事件
		if (e instanceof CustomEvent && e.detail?.visiblePageIndex !== undefined) {
			const { visiblePageIndex, nearEnd, nearStart } = e.detail;
			console.log(`🔄 全景滚动预加载: pageIndex=${visiblePageIndex}, nearEnd=${nearEnd}, nearStart=${nearStart}`);
			// 触发预加载：以目标页为中心预加载
			panoramaStore.loadPanorama(visiblePageIndex, pageMode);
		}
	}

	// 悬停滚动状态
	let hoverScrollEnabled = $derived(settings.image?.hoverScrollEnabled ?? false);

	// 幻灯片控制
	function toggleSlideshow() {
		if (slideshowVisible) {
			slideshowStore.stop();
			slideshowVisible = false;
		} else {
			slideshowVisible = true;
			slideshowStore.play();
		}
	}

	function handleSlideshowNextPage() {
		handleNextPage();
		// 重置幻灯片计时器（用户手动翻页后重新计时）
		slideshowStore.resetOnUserAction();
	}

	function handleSlideshowRandomPage(index: number) {
		bookStore.navigateToPage(index);
	}

	function getSlideshowTotalPages(): number {
		return bookStore.totalPages;
	}

	function getSlideshowCurrentIndex(): number {
		return bookStore.currentPageIndex;
	}

	// 缩放控制
	function zoomIn() {
		manualScale = Math.min(manualScale * 1.25, 10);
	}

	function zoomOut() {
		manualScale = Math.max(manualScale / 1.25, 0.1);
	}

	// ============================================================================
	// Effects
	// ============================================================================

	// 书籍变化时初始化 BookContext
	$effect(() => {
		const book = bookStore.currentBook;
		const currentPath = book?.path ?? null;

		if (currentPath) {
			// 获取或创建书本上下文
			const ctx = bookContextManager.setCurrent(currentPath, book?.pages?.length ?? 0);

			// 如果是新书本，重置状态（imagePool 会自动处理缓存）
			if (bookContext?.path !== currentPath) {
				imageStore.reset();
				panoramaStore.reset();
				zoomModeManager.reset();
				resetScrollPosition();
				loadedImageSize = null; // 重置尺寸，等待新书第一页加载

				// 通知 upscaleStore 书籍切换
				upscaleStore.setCurrentBook(currentPath);
			}

			bookContext = ctx;
		} else {
			bookContextManager.clearCurrent();
			bookContext = null;
		}
	});

	// 追踪上一次的状态，用于检测变化
	let lastPageMode = $state<'single' | 'double' | null>(null);
	let lastPanorama = $state<boolean>(false);

	// 页面或模式变化时加载图片
	$effect(() => {
		const pageIndex = bookStore.currentPageIndex;
		const book = bookStore.currentBook;
		const page = bookStore.currentPage;
		const currentPageMode = pageMode;
		const currentPanorama = isPanorama;

		console.log(
			`🔁 StackView effect: pageIndex=${pageIndex}, pageMode=${currentPageMode}, isPanorama=${currentPanorama}, lastPageMode=${lastPageMode}`
		);

		if (book && page) {
			// 检测模式是否变化
			const modeChanged = currentPageMode !== lastPageMode || currentPanorama !== lastPanorama;
			console.log(
				`🔁 StackView: modeChanged=${modeChanged}, currentPageMode=${currentPageMode}, lastPageMode=${lastPageMode}`
			);
			lastPageMode = currentPageMode;
			lastPanorama = currentPanorama;

			// 通知 upscaleStore 页面切换，触发超分
			upscaleStore.setCurrentPage(pageIndex);
			upscaleStore.triggerCurrentPageUpscale();

			// 根据模式加载
			if (currentPanorama) {
				// 全景模式：使用全景 store
				console.log(
					`🔁 StackView: 全景模式加载 pageIndex=${pageIndex}, pageMode=${currentPageMode}`
				);
				panoramaStore.setEnabled(true);
				panoramaStore.loadPanorama(pageIndex, currentPageMode);
			} else {
				// 普通模式：使用图片 store
				panoramaStore.setEnabled(false);
				imageStore.loadCurrentPage(currentPageMode, modeChanged);
			}
		}
	});

	// 更新视口尺寸
	function updateViewportSize() {
		if (containerRef) {
			const rect = containerRef.getBoundingClientRect();
			if (rect.width !== viewportSize.width || rect.height !== viewportSize.height) {
				viewportSize = { width: rect.width, height: rect.height };
			}
		}
	}

	// 当设置的 defaultZoomMode 变化时，同步到 currentZoomMode
	// 这样用户在设置中更改缩放模式会生效
	let lastDefaultZoomMode = $state(settingsManager.getSettings().view.defaultZoomMode ?? 'fit');
	$effect(() => {
		const newDefault = settings.view.defaultZoomMode ?? 'fit';
		if (newDefault !== lastDefaultZoomMode) {
			lastDefaultZoomMode = newDefault;
			currentZoomMode = newDefault as ZoomMode;
		}
	});

	// 应用缩放模式
	$effect(() => {
		const dims = imageStore.state.dimensions;

		if (dims && viewportSize.width > 0 && viewportSize.height > 0) {
			zoomModeManager.apply(currentZoomMode, dims, viewportSize);
		}
	});

	// 监听窗口大小变化
	$effect(() => {
		if (!containerRef) return;

		updateViewportSize();

		const resizeObserver = new ResizeObserver(() => {
			updateViewportSize();
		});
		resizeObserver.observe(containerRef);

		return () => {
			resizeObserver.disconnect();
		};
	});

	// 初始化鼠标自动隐藏
	$effect(() => {
		if (!containerRef) return;

		// 创建鼠标自动隐藏控制器
		cursorAutoHide = createCursorAutoHide({
			target: containerRef,
			hideDelay: 3000,
			enabled: true
		});

		return () => {
			cursorAutoHide?.destroy();
			cursorAutoHide = null;
		};
	});

	// 监听 zoomMode 变化事件
	function handleApplyZoomMode(event: Event) {
		const detail = (event as CustomEvent<ApplyZoomModeDetail>).detail;
		const mode = detail.mode ?? settingsManager.getSettings().view.defaultZoomMode ?? 'fit';
		if (currentZoomMode !== mode) {
			currentZoomMode = mode as ZoomMode;
		}
	}

	// 监听 viewer action 事件（包括幻灯片控制）
	function handleViewerAction(event: Event) {
		const customEvent = event as CustomEvent<{ action: string }>;
		const action = customEvent.detail?.action;
		if (action === 'slideshowToggle') {
			toggleSlideshow();
		}
	}

	onMount(async () => {
		// 初始化超分服务
		await upscaleStore.init();
		// 监听 zoomMode 变化事件
		window.addEventListener(applyZoomModeEventName, handleApplyZoomMode);
		// 监听 viewer action 事件
		window.addEventListener('neoview-viewer-action', handleViewerAction);
	});

	onDestroy(() => {
		imageStore.reset();
		panoramaStore.reset();
		zoomModeManager.reset();
		cursorAutoHide?.destroy();
		upscaleStore.destroy();
		slideshowStore.destroy();
		window.removeEventListener(applyZoomModeEventName, handleApplyZoomMode);
		window.removeEventListener('neoview-viewer-action', handleViewerAction);
	});

	let isRTL = $derived(settings.book.readingDirection === 'right-to-left');

	export { resetView, togglePageMode, togglePanorama, toggleSlideshow, pageMode, isPanorama, bookContext, slideshowVisible };
</script>

<div class="stack-view" bind:this={containerRef}>
	<BackgroundLayer
		color={settings.view.backgroundColor || backgroundColor}
		mode={settings.view.backgroundMode ?? 'solid'}
		imageSrc={imageStore.state.currentUrl ?? ''}
		preloadedColor={imageStore.state.backgroundColor}
	/>

	{#if isVideoMode && bookStore.currentPage}
		<!-- 视频模式：显示视频播放器 -->
		{#key bookStore.currentPage.path}
			<VideoContainer
				bind:this={videoContainerRef}
				page={bookStore.currentPage}
				onEnded={handleNextPage}
				onError={(err) => console.error('Video error:', err)}
			/>
		{/key}
	{:else if isPanorama}
		<!-- 全景模式：显示滚动视图 -->
		<!-- 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 -->
		<PanoramaFrameLayer
			units={panoramaStore.state.units}
			{pageMode}
			{orientation}
			{direction}
			currentPageIndex={bookStore.currentPageIndex}
			{viewportSize}
			{widePageStretch}
			onScroll={handlePanoramaScroll}
		/>
	{:else}
		<!-- 标准模式：显示当前帧 -->
		<!-- 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 -->
		<CurrentFrameLayer
			frame={currentFrameData}
			layout={effectivePageMode}
			{direction}
			{orientation}
			scale={1}
			{rotation}
			{viewportSize}
			imageSize={hoverImageSize}
			{alignMode}
			zoomMode={currentZoomMode}
			onImageLoad={handleImageLoad}
		/>

		{#if upscaledFrameData.images.length > 0}
			<CurrentFrameLayer
				frame={upscaledFrameData}
				layout="single"
				{direction}
				scale={1}
				{rotation}
				{viewportSize}
				imageSize={hoverImageSize}
				{alignMode}
				zoomMode={currentZoomMode}
			/>
		{/if}
	{/if}

	<InfoLayer
		currentIndex={bookStore.currentPageIndex}
		totalPages={bookStore.totalPages}
		isLoading={isPanorama ? panoramaStore.state.loading : imageStore.state.loading}
		isDivided={isCurrentPageSplit}
		splitHalf={currentSplitHalf}
		showPageInfo={$viewerPageInfoVisible && showPageInfo}
		{showLoading}
	/>

	<!-- 超分状态指示器 -->
	<UpscaleLayer
		pageIndex={bookStore.currentPageIndex}
		enabled={upscaleStore.enabled}
		showIndicator={true}
	/>

	<GestureLayer
		{isVideoMode}
		enablePan={false}
		enableTap={false}
		onNextPage={handleNextPage}
		onPrevPage={handlePrevPage}
		onResetZoom={resetView}
	/>

	<!-- 悬停滚动层 -->
	<!-- 【性能优化】原生滚动方案：直接操作 scrollLeft/scrollTop -->
	<HoverScrollLayer
		enabled={hoverScrollEnabled}
		sidebarMargin={20}
		scrollSpeed={settings.image.hoverScrollSpeed ?? 2.0}
		targetSelector=".scroll-frame-container"
	/>

	<!-- 图片信息浮窗 -->
	<ImageInfoLayer />

	<!-- 进度条 -->
	<ProgressBarLayer showProgressBar={showProgress} />

	<!-- 边栏控制浮窗 -->
	<SidebarControlLayer />

	<!-- 幻灯片控制 -->
	<SlideshowControl
		visible={slideshowVisible}
		onNextPage={handleSlideshowNextPage}
		onRandomPage={handleSlideshowRandomPage}
		getTotalPages={getSlideshowTotalPages}
		getCurrentIndex={getSlideshowCurrentIndex}
		onClose={() => {
			slideshowVisible = false;
			slideshowStore.stop();
		}}
	/>
</div>

<style>
	.stack-view {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		isolation: isolate;
		contain: layout style;
	}
</style>
