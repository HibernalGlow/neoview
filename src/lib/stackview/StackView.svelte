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
	import StackViewer from '$lib/viewer/StackViewer.svelte';
	import PanoramaFrameLayer from './layers/PanoramaFrameLayer.svelte';
	import {
		isLandscape,
		getInitialSplitHalf,
		getNextSplitHalf,
		getPrevSplitHalf,
		buildFrameImages,
		type SplitState,
		type FrameBuildConfig,
		type PageData
	} from './utils/viewMode';
	import { createZoomModeManager, type ViewportSize } from './utils/zoomModeHandler';
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
		viewerPageInfoVisible
	} from '$lib/stores';
	import { bookContextManager, type BookContext } from '$lib/stores/bookContext.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import VideoContainer from '$lib/components/viewer/VideoContainer.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { upscaleStore } from './stores/upscaleStore.svelte';

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

	let splitState = $state<SplitState | null>(null);
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

	// 【修复】主动获取图片尺寸，使用 $effect.pre 确保在渲染前更新
	$effect.pre(() => {
		const url = imageStore.state.currentUrl;
		if (!url) {
			loadedImageSize = null;
			return;
		}

		// 创建临时 Image 对象获取尺寸
		const img = new Image();
		img.onload = () => {
			if (img.naturalWidth && img.naturalHeight) {
				const newWidth = img.naturalWidth;
				const newHeight = img.naturalHeight;
				if (loadedImageSize?.width !== newWidth || loadedImageSize?.height !== newHeight) {
					loadedImageSize = { width: newWidth, height: newHeight };
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
	let modeScale = $derived.by(() => {
		const dims = imageStore.state.dimensions;
		if (!dims?.width || !dims?.height || !viewportSize.width || !viewportSize.height) {
			return 1;
		}

		const iw = dims.width;
		const ih = dims.height;
		const vw = viewportSize.width;
		const vh = viewportSize.height;

		const ratioW = vw / iw;
		const ratioH = vh / ih;

		switch (currentZoomMode) {
			case 'original':
				return 1; // 原始大小
			case 'fit':
			case 'fitLeftAlign':
			case 'fitRightAlign':
				return Math.min(ratioW, ratioH); // 适应窗口（居左/居右使用相同缩放，只是对齐不同）
			case 'fill':
				return Math.max(ratioW, ratioH); // 填充窗口
			case 'fitWidth':
				return ratioW; // 适应宽度
			case 'fitHeight':
				return ratioH; // 适应高度
			default:
				return Math.min(ratioW, ratioH);
		}
	});

	// 最终缩放 = modeScale * manualScale
	let effectiveScale = $derived(modeScale * manualScale);

	// 缩放后的实际显示尺寸（简化版：直接用原始尺寸 * effectiveScale）
	let displaySize = $derived.by(() => {
		const dims = imageStore.state.dimensions;
		if (!dims?.width || !dims?.height) {
			return { width: 0, height: 0 };
		}

		return {
			width: dims.width * effectiveScale,
			height: dims.height * effectiveScale
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
	let divideLandscape = $derived(settings.view.pageLayout?.splitHorizontalPages ?? false);
	let treatHorizontalAsDoublePage = $derived(
		settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false
	);
	let autoRotateMode = $derived(settings.view.autoRotate?.mode ?? 'none');

	// 判断当前图是否横向
	let isCurrentLandscape = $derived(
		imageStore.state.dimensions ? isLandscape(imageStore.state.dimensions) : false
	);

	// 是否为视频
	let isVideoMode = $derived.by(() => {
		const page = bookStore.currentPage;
		if (!page) return false;
		// 优先检查 name，然后检查 innerPath（压缩包内文件），最后检查 path
		const filename = page.name || page.innerPath || '';
		if (!filename) return false;
		return isVideoFile(filename);
	});

	// 渲染器模式
	let useStackRenderer = $derived((settings.view.renderer?.mode ?? 'stack') === 'stack');

	// StackViewer 组件引用
	let stackViewerRef: StackViewer | null = null;

	// 视频容器引用
	let videoContainerRef: any = null;

	// 是否处于分割模式
	let isInSplitMode = $derived(
		divideLandscape && isCurrentLandscape && pageMode === 'single' && !isPanorama && !isVideoMode
	);

	// ============================================================================
	// 帧配置（使用方案 B 的 pageMode）
	// ============================================================================

	// 计算帧布局：根据 pageMode 和 isPanorama
	let frameLayout = $derived<FrameLayout>(isPanorama ? 'panorama' : pageMode);

	let frameConfig = $derived.by(
		(): FrameBuildConfig => ({
			layout: pageMode, // 使用 pageMode 而不是 layout
			orientation: orientation,
			direction: direction,
			divideLandscape: divideLandscape,
			treatHorizontalAsDoublePage: treatHorizontalAsDoublePage,
			autoRotate: autoRotateMode
		})
	);

	// ============================================================================
	// 帧数据
	// ============================================================================

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
		const nextPage: PageData | null = secondUrl
			? {
					url: secondUrl,
					pageIndex: bookStore.currentPageIndex + 1
				}
			: null;

		// 使用 buildFrameImages 构建图片列表
		const images = buildFrameImages(currentPage, nextPage, frameConfig, splitState);

		return { id: `frame-${bookStore.currentPageIndex}`, images, layout: pageMode };
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
		splitState = null;
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
		}
	}

	// 计算翻页步进：双页模式翻 2 页，单页模式翻 1 页
	let pageStep = $derived(pageMode === 'double' ? 2 : 1);

	function handlePrevPage() {
		console.log(
			`⬅️ handlePrevPage: pageMode=${pageMode}, pageStep=${pageStep}, currentIndex=${bookStore.currentPageIndex}`
		);
		resetScrollPosition();

		// 处理横向分割模式
		if (isInSplitMode && splitState) {
			const prevHalf = getPrevSplitHalf(splitState.half, direction);
			if (prevHalf !== 'prev') {
				splitState = { pageIndex: splitState.pageIndex, half: prevHalf };
				return;
			}
		}
		splitState = null;

		// 直接使用 pageStep 翻页
		const targetIndex = Math.max(0, bookStore.currentPageIndex - pageStep);
		console.log(`⬅️ handlePrevPage: targetIndex=${targetIndex}`);
		bookStore.navigateToPage(targetIndex);
	}

	function handleNextPage() {
		console.log(
			`➡️ handleNextPage: pageMode=${pageMode}, pageStep=${pageStep}, currentIndex=${bookStore.currentPageIndex}`
		);
		resetScrollPosition();

		// 处理横向分割模式
		if (isInSplitMode) {
			if (!splitState) {
				splitState = {
					pageIndex: bookStore.currentPageIndex,
					half: getInitialSplitHalf(direction)
				};
				return;
			}
			const nextHalf = getNextSplitHalf(splitState.half, direction);
			if (nextHalf !== 'next') {
				splitState = { pageIndex: splitState.pageIndex, half: nextHalf };
				return;
			}
		}
		splitState = null;

		// 直接使用 pageStep 翻页
		const targetIndex = Math.min(bookStore.totalPages - 1, bookStore.currentPageIndex + pageStep);
		console.log(`➡️ handleNextPage: targetIndex=${targetIndex}`);
		bookStore.navigateToPage(targetIndex);
	}

	// 悬停滚动状态
	let hoverScrollEnabled = $derived(settings.image?.hoverScrollEnabled ?? false);

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
				splitState = null;
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

		if (splitState && splitState.pageIndex !== pageIndex) {
			splitState = null;
		}

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
		console.log('[StackView] 收到 zoomMode 事件:', mode, '当前:', currentZoomMode);
		if (currentZoomMode !== mode) {
			currentZoomMode = mode as ZoomMode;
			console.log('[StackView] 更新 currentZoomMode 为:', currentZoomMode);
		}
	}

	onMount(async () => {
		// 初始化超分服务
		await upscaleStore.init();
		// 监听 zoomMode 变化事件
		window.addEventListener(applyZoomModeEventName, handleApplyZoomMode);
	});

	onDestroy(() => {
		imageStore.reset();
		panoramaStore.reset();
		zoomModeManager.reset();
		cursorAutoHide?.destroy();
		upscaleStore.destroy();
		window.removeEventListener(applyZoomModeEventName, handleApplyZoomMode);
	});

	let isRTL = $derived(settings.book.readingDirection === 'right-to-left');

	export { resetView, togglePageMode, togglePanorama, pageMode, isPanorama, bookContext };
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
		/>
	{:else if useStackRenderer}
		<!-- 层叠渲染模式：使用 StackViewer（支持双页） -->
		<!-- 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 -->
		<StackViewer
			bind:this={stackViewerRef}
			showUpscale={true}
			transitionDuration={150}
			scale={manualScale}
			{rotation}
			{viewportSize}
			useCanvas={false}
			{pageMode}
			{direction}
			{alignMode}
			onImageLoad={handleImageLoad}
		/>
	{:else}
		<!-- 标准模式：显示当前帧 -->
		<!-- 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 -->
		<CurrentFrameLayer
			frame={currentFrameData}
			layout={pageMode}
			{direction}
			{orientation}
			scale={1}
			{rotation}
			{viewportSize}
			imageSize={imageStore.state.dimensions ?? { width: 0, height: 0 }}
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
				imageSize={imageStore.state.dimensions ?? { width: 0, height: 0 }}
				{alignMode}
				zoomMode={currentZoomMode}
			/>
		{/if}
	{/if}

	<InfoLayer
		currentIndex={bookStore.currentPageIndex}
		totalPages={bookStore.totalPages}
		isLoading={isPanorama ? panoramaStore.state.loading : imageStore.state.loading}
		isDivided={isInSplitMode}
		splitHalf={splitState?.half ?? null}
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
