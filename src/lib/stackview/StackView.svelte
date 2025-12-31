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
	import { calculateTargetScale } from './utils/imageTransitionManager';
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

	// 【修复】图片尺寸：使用索引化缓存，避免切换时的空档期
	// 通过 imageStore.getDimensionsForPage() 按索引读取，不再使用单一变量
	let hoverImageSize = $derived.by(() => {
		const pageIndex = bookStore.currentPageIndex;
		// 优先从缓存读取当前页尺寸
		const dims = imageStore.getDimensionsForPage(pageIndex);
		if (dims?.width && dims?.height) {
			return { width: dims.width, height: dims.height };
		}
		// 降级：从 bookStore 元数据读取
		const page = bookStore.currentPage;
		if (page?.width && page?.height) {
			return { width: page.width, height: page.height };
		}
		return { width: 0, height: 0 };
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
	// 【修复】使用索引化缓存和预计算缩放，避免切换时的视觉跳动
	let modeScale = $derived.by(() => {
		const pageIndex = bookStore.currentPageIndex;
		
		// 1. 优先使用预计算的缩放值（从缓存读取）
		if (viewportSize.width > 0 && viewportSize.height > 0) {
			const cachedScale = imageStore.getScaleForPage(pageIndex, currentZoomMode, viewportSize);
			if (cachedScale > 0) {
				return cachedScale;
			}
		}
		
		// 2. 降级：使用尺寸实时计算
		const dims = imageStore.getDimensionsForPage(pageIndex);
		if (dims && viewportSize.width > 0 && viewportSize.height > 0) {
			return calculateTargetScale(dims, viewportSize, currentZoomMode);
		}
		
		// 3. 最终降级：使用 bookStore 元数据
		const page = bookStore.currentPage;
		if (page?.width && page?.height && viewportSize.width > 0 && viewportSize.height > 0) {
			return calculateTargetScale(
				{ width: page.width, height: page.height },
				viewportSize,
				currentZoomMode
			);
		}
		
		return 1;
	});

	// 最终缩放 = modeScale * manualScale
	let effectiveScale = $derived(modeScale * manualScale);

	// 缩放后的实际显示尺寸
	// 【性能优化】使用索引化缓存获取尺寸
	let displaySize = $derived.by(() => {
		const pageIndex = bookStore.currentPageIndex;
		const dims = imageStore.getDimensionsForPage(pageIndex);
		const w = dims?.width ?? 0;
		const h = dims?.height ?? 0;
		
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

		// 根据旧模式设置 BookContext
		if (mode === 'panorama') {
			ctx.setPanoramaEnabled(true);
			// 进入全景模式时，使用之前的 pageMode
			if (!wasInPanorama) {
				wasInPanorama = true;
			}
			// 全景模式中保持当前 pageMode 不变
		} else {
			// 从全景退出时，保持之前的 pageMode
			if (wasInPanorama) {
				ctx.setPanoramaEnabled(false);
				wasInPanorama = false;
				// 不设置 pageMode，保持全景期间的状态
			} else {
				// 普通模式切换（不是从全景退出）
				ctx.setPanoramaEnabled(false);
				ctx.setPageMode(mode);
				lastNonPanoramaPageMode = mode;
			}
		}
		ctx.setOrientation(orient);
	});

	// 从 BookContext 获取视图状态
	let pageMode = $derived.by(() => {
		const mode = bookContext?.pageMode ?? 'single';
		// 移除 $derived.by 内的日志，避免频繁计算时的性能损耗
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
	// 【修复】使用索引化缓存获取尺寸
	function getPageData(index: number): PageData | null {
		const book = bookStore.currentBook;
		if (!book || !book.pages || index < 0 || index >= book.pages.length) {
			return null;
		}
		
		// 使用索引化缓存获取尺寸
		const dims = imageStore.getDimensionsForPage(index);
		const width = dims?.width ?? book.pages[index]?.width ?? 0;
		const height = dims?.height ?? book.pages[index]?.height ?? 0;
		
		return {
			url: '',
			pageIndex: index,
			width,
			height
		};
	}

	// 判断当前页是否为分割页
	// 【修复】使用索引化缓存获取尺寸
	let isCurrentPageSplit = $derived.by(() => {
		if (pageMode !== 'single' || !splitHorizontalPages) return false;
		
		// 使用索引化缓存获取尺寸
		const pageIndex = bookStore.currentPageIndex;
		const dims = imageStore.getDimensionsForPage(pageIndex);
		if (dims?.width && dims?.height) {
			return dims.width > dims.height;
		}
		
		// 降级：使用页面元数据
		const pageData = getPageData(pageIndex);
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
		// 日志已移除，避免频繁触发时的性能损耗
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
			
			// 日志已移除，避免频繁触发时的性能损耗
			currentSplitHalf = newHalf;
		} else {
			// 非分割页面
			if (currentSplitHalf !== null) {
				// 日志已移除
				currentSplitHalf = null;
			}
		}
	});

	let currentFrameData = $derived.by((): Frame => {
		const { currentUrl, secondUrl } = imageStore.state;

		// 全景模式时不使用此组件，由 PanoramaFrameLayer 处理
		if (isPanorama) {
			return emptyFrame;
		}

		if (!currentUrl) return emptyFrame;

		// 【修复】使用索引化缓存获取尺寸
		const pageIndex = bookStore.currentPageIndex;
		const dims = imageStore.getDimensionsForPage(pageIndex);
		const width = dims?.width ?? bookStore.currentPage?.width ?? 0;
		const height = dims?.height ?? bookStore.currentPage?.height ?? 0;

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

	// 图片加载完成回调 - 更新尺寸到缓存和元数据
	// 【修复】不再使用单一变量，尺寸由 stackImageLoader 缓存管理
	function handleImageLoad(e: Event, _index: number) {
		const img = e.target as HTMLImageElement;
		if (img && img.naturalWidth && img.naturalHeight) {
			const newWidth = img.naturalWidth;
			const newHeight = img.naturalHeight;

			// 更新 MetadataService 和 bookStore 中的尺寸信息
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
		// 日志已移除
		resetScrollPosition();
		void pageLeft();
	}

	function handleNextPage() {
		// 日志已移除
		resetScrollPosition();
		void pageRight();
	}

	// 处理全景模式滚动事件 - 触发预加载
	function handlePanoramaScroll(e: Event) {
		// 检查是否是自定义事件
		if (e instanceof CustomEvent && e.detail?.visiblePageIndex !== undefined) {
			const { visiblePageIndex } = e.detail;
			// 日志已移除，避免滚动时的性能损耗
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
				console.log('📚 [StackView] 书籍切换:', { oldPath: bookContext?.path, newPath: currentPath });
				imageStore.reset();
				panoramaStore.reset();
				zoomModeManager.reset();
				resetScrollPosition();

				// 通知 upscaleStore 书籍切换
				console.log('📚 [StackView] 调用 upscaleStore.setCurrentBook:', currentPath);
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

		// 日志已移除，避免频繁触发时的性能损耗

		if (book && page) {
			// 检测模式是否变化
			const modeChanged = currentPageMode !== lastPageMode || currentPanorama !== lastPanorama;
			lastPageMode = currentPageMode;
			lastPanorama = currentPanorama;

			// 通知 upscaleStore 页面切换，触发超分
			upscaleStore.setCurrentPage(pageIndex);
			upscaleStore.triggerCurrentPageUpscale();

			// 根据模式加载
			if (currentPanorama) {
				// 全景模式：使用全景 store
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
				// 【新增】同步视口尺寸到 imageStore，用于预计算缩放
				imageStore.setViewportSize(rect.width, rect.height);
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

		// 从设置中读取鼠标光标配置
		const mouseCursorSettings = settingsManager.getSettings().view.mouseCursor;
		const autoHideEnabled = mouseCursorSettings?.autoHide ?? true;
		const hideDelayMs = (mouseCursorSettings?.hideDelay ?? 1.0) * 1000; // 转换为毫秒

		// 创建鼠标自动隐藏控制器
		cursorAutoHide = createCursorAutoHide({
			target: containerRef,
			hideDelay: hideDelayMs,
			enabled: autoHideEnabled
		});

		// 监听设置变化
		const handleSettingsChange = (s: typeof settingsManager extends { getSettings: () => infer T } ? T : never) => {
			const newAutoHide = s.view.mouseCursor?.autoHide ?? true;
			const newHideDelay = (s.view.mouseCursor?.hideDelay ?? 1.0) * 1000;
			
			if (cursorAutoHide) {
				if (newAutoHide) {
					cursorAutoHide.enable();
				} else {
					cursorAutoHide.disable();
				}
			}
		};
		settingsManager.addListener(handleSettingsChange);

		return () => {
			settingsManager.removeListener(handleSettingsChange);
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
		ambientSpeed={settings.view.ambient?.speed ?? 8}
		ambientBlur={settings.view.ambient?.blur ?? 80}
		ambientOpacity={settings.view.ambient?.opacity ?? 0.8}
		ambientStyle={settings.view.ambient?.style ?? 'vibrant'}
		auroraShowRadialGradient={settings.view.aurora?.showRadialGradient ?? true}
		spotlightColor={settings.view.spotlight?.color ?? 'white'}
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
			{hoverScrollEnabled}
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
				{hoverScrollEnabled}
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
