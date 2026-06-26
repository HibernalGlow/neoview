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

	import { createZoomModeManager, type ViewportSize } from './utils/zoomModeHandler';
	import { calculateTargetScale } from './utils/imageTransitionManager';
	import type { AutoRotateMode, ZoomMode } from '$lib/settings/settingsManager';
	import { applyZoomModeEventName, type ApplyZoomModeDetail } from '$lib/utils/zoomMode';
	import type { Frame, FrameImage } from './types/frame';
	import type { GetFrameSnapshotParams } from '$lib/api/frameApi';
	import { emptyFrame } from './types/frame';
	import { computeAutoRotateAngle, normalizeAngle } from '$lib/utils/pageLayout';
	import { getImageStore } from './stores/imageStore.svelte';
	import { getPanoramaStore, type PanoramaLoadOptions } from './stores/panoramaStore.svelte';
	import { createCursorAutoHide, type CursorAutoHideController } from '$lib/utils/cursorAutoHide';
	import { convertFileSrc, invoke } from '@tauri-apps/api/core';

	// 导入外部 stores
	import {
		viewMode as legacyViewMode,
		orientation as legacyOrientation,
		zoomLevel,
		rotationAngle,
		setZoomLevel,
		pageLeft,
		pageRight,
		viewerPageInfoVisible,
		viewerProgressVisible,
		currentPageShouldSplit,
		subPageIndex
	} from '$lib/stores';
	import { bookContextManager, type BookContext } from '$lib/stores/bookContext.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import VideoContainer from '$lib/components/viewer/VideoContainer.svelte';
	import { isVideoFile } from '$lib/utils/videoUtils';
	import { animatedVideoModeStore } from '$lib/stores/animatedVideoMode.svelte';
	import {
		isAnimatedImageVideoCandidate,
		isAnimatedWebpCandidate
	} from '$lib/utils/animatedVideoModeUtils';
	import { isAnimatedImage } from '$lib/utils/imageUtils';
	import { upscaleStore } from './stores/upscaleStore.svelte';
	import SlideshowControl from '$lib/components/viewer/SlideshowControl.svelte';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';
	import { showInfoToast } from '$lib/utils/toast';
	import Magnifier from '$lib/components/viewer/Magnifier.svelte';
	import { appState } from '$lib/core/state/appState';
	import { readable } from 'svelte/store';
	import type { StateSelector } from '$lib/core/state/appState';

	// Helper for appState subscription
	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

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
	const STACK_VIEW_DEBUG = false;

	function debugStackView(...args: unknown[]): void {
		if (STACK_VIEW_DEBUG) {
			console.debug(...args);
		}
	}

	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((s) => {
		settings = s;
	});

	let containerRef: HTMLDivElement | null = $state(null);
	let viewportSize = $state<ViewportSize>({ width: 0, height: 0 });
	let containerRect = $state<DOMRect | null>(null);
	let cursorAutoHide: CursorAutoHideController | null = null;

	// 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 DOM
	// 不再使用 Svelte 响应式状态，避免高频更新触发重渲染

	// 【后端主导架构】图片尺寸从 imageStore.getMainImageSize() 获取
	let hoverImageSize = $derived.by(() => {
		return imageStore.getMainImageSize();
	});

	// ============================================================================
	// 真实缩放逻辑（完全独立管理）
	// ============================================================================

	// 当前缩放模式
	let currentZoomMode = $state<ZoomMode>(
		settingsManager.getSettings().view.defaultZoomMode ?? 'fit'
	);

	// ============================================================================
	// 缩放架构（两层缩放模型）
	// ============================================================================
	// effectiveScale = modeScale × manualScale
	//
	// modeScale（自动层，$derived）：
	//   由 currentZoomMode 决定，通过 calculateTargetScale() 计算绝对缩放值。
	//   例：fit 模式 = min(视口宽/图片宽, 视口高/图片高)；original 模式 = 1.0
	//   当图片或视口尺寸变化时自动重算。
	//
	// manualScale（手动层，$state，默认 1.0）：
	//   用户在当前 zoomMode 基础上叠加的额外缩放系数（1.0 = 无额外缩放）。
	//   由顶栏 +/- 按钮、滚轮手势修改，与 $zoomLevel store 双向同步。
	//   切换 zoomMode 时由 handleApplyZoomMode 重置为 1.0。
	//
	// ⚠️ 常见错误（已修复）：
	//   不要在 $effect 中调用 zoomModeManager.apply() 并将结果写入 $zoomLevel/manualScale。
	//   zoomModeManager.apply() 计算的是「current_mode_scale / fit_scale」（相对于 fit 的比例），
	//   若写入 manualScale 会造成 modeScale × manualScale 双重叠加：
	//     例：original 模式下 modeScale=1，apply() 写入 1/fit_scale → effectiveScale=1/fit_scale（错误）
	//   正确做法：只让 manualScale 代表用户手势缩放；modeScale 已包含完整模式信息。

	// 用户手动缩放倍数（基于 zoomMode 的额外缩放，1.0 = 无额外缩放）
	let manualScale = $state(1.0);

	// 旋转角度
	let rotation = $state(0);

	let autoRotateMode = $derived<AutoRotateMode>(settings.view.autoRotate?.mode ?? 'none');

	function isQuarterTurn(angle: number): boolean {
		const normalized = normalizeAngle(angle);
		return normalized === 90 || normalized === 270;
	}

	function rotateSizeForAngle(size: { width: number; height: number }, angle: number) {
		if (!size.width || !size.height || !isQuarterTurn(angle)) {
			return size;
		}
		return { width: size.height, height: size.width };
	}

	function getZoomCalculationSize(size: { width: number; height: number }) {
		const autoRotation = computeAutoRotateAngle(autoRotateMode, size) ?? 0;
		return rotateSizeForAngle(size, normalizeAngle(rotation + autoRotation));
	}

	function getFrameImageZoomSize(img: FrameImage): { width: number; height: number } {
		const rawWidth = img.width || hoverImageSize.width || 0;
		const rawHeight = img.height || hoverImageSize.height || 0;
		if (!rawWidth || !rawHeight) {
			return { width: 0, height: 0 };
		}

		const frameScale = img.scale ?? 1.0;
		const splitFactor = img.splitHalf ? 2 : 1;
		const size = {
			width: rawWidth * frameScale * splitFactor,
			height: rawHeight * frameScale
		};
		const autoRotation =
			computeAutoRotateAngle(autoRotateMode, { width: rawWidth, height: rawHeight }) ?? 0;
		const angle = normalizeAngle((img.rotation ?? 0) + rotation + autoRotation);
		return rotateSizeForAngle(size, angle);
	}

	function getCurrentFrameZoomCalculationSize(): { width: number; height: number } {
		const frame = imageStore.getCurrentFrame();
		if (frame.layout !== 'double' || frame.images.length <= 1) {
			return getZoomCalculationSize(hoverImageSize);
		}

		let totalWidth = 0;
		let maxHeight = 0;
		for (const img of frame.images) {
			const size = getFrameImageZoomSize(img);
			totalWidth += size.width;
			maxHeight = Math.max(maxHeight, size.height);
		}

		if (!totalWidth || !maxHeight) {
			return getZoomCalculationSize(hoverImageSize);
		}

		return { width: totalWidth, height: maxHeight };
	}

	// 根据 zoomMode 计算基础缩放；双页按整帧尺寸适配窗口。
	let modeScale = $derived.by(() => {
		const dims = getCurrentFrameZoomCalculationSize();
		if (
			dims &&
			dims.width > 0 &&
			dims.height > 0 &&
			viewportSize.width > 0 &&
			viewportSize.height > 0
		) {
			return calculateTargetScale(dims, viewportSize, currentZoomMode);
		}

		// 降级：使用 bookStore 元数据
		const page = bookStore.currentPage;
		if (page?.width && page?.height && viewportSize.width > 0 && viewportSize.height > 0) {
			const pageSize = getZoomCalculationSize({ width: page.width, height: page.height });
			return calculateTargetScale(pageSize, viewportSize, currentZoomMode);
		}

		return 1;
	});

	// 最终缩放 = modeScale * manualScale
	let effectiveScale = $derived(modeScale * manualScale);

	$effect(() => {
		const scale = effectiveScale;
		const viewportWidth = viewportSize.width;
		const viewportHeight = viewportSize.height;
		const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
		if (viewportWidth >= 0 && viewportHeight >= 0) {
			imageStore.setDisplayPreloadContext({ scale, dpr });
		}
	});

	// 缩放后的实际显示尺寸，和 modeScale 使用同一套帧尺寸。
	let displaySize = $derived.by(() => {
		const dims = getCurrentFrameZoomCalculationSize();
		if (!dims.width || !dims.height) {
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

	// ── 顶栏缩放同步（双向绑定 manualScale ↔ $zoomLevel）──────────────────────────
	// 设计说明：
	//   manualScale = 用户在当前 zoomMode 基础上的额外倍数（1.0 = 无额外缩放）
	//   $zoomLevel  = 全局 store，供顶栏 +/- 按钮、滚轮手势读写
	//   effectiveScale = modeScale × manualScale （modeScale 由 currentZoomMode 计算绝对比例）
	//
	// 注意：$zoomLevel 只代表 manualScale，不代表绝对缩放比例。
	//       切换 zoomMode 时由 handleApplyZoomMode 将 manualScale 重置为 1.0，
	//       而不是通过 setZoomLevel 写入 mode 的绝对比例（那样会导致双重叠加）。

	// 写方向：manualScale 变化 → 同步到 $zoomLevel（顶栏读取显示用）
	$effect(() => {
		setZoomLevel(manualScale);
	});

	// 读方向：顶栏按钮/滚轮修改 $zoomLevel → 同步到 manualScale（避免循环判断差值）
	$effect(() => {
		const storeZoom = $zoomLevel;
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

	// 横向页面分割设置
	let splitHorizontalPages = $derived(settings.view.pageLayout?.splitHorizontalPages ?? false);

	// 分割状态：当前显示的半边（仅在单页模式下启用分割时有效）
	let currentSplitHalf = $state<'left' | 'right' | null>(null);
	let viewportRefreshTimer: ReturnType<typeof setTimeout> | null = null;

	const animatedWebpProbeCache = new Map<string, boolean>();
	let webpAnimatedForCurrentPage = $state(false);
	let webpProbeVersion = 0;

	$effect(() => {
		const page = bookStore.currentPage;
		const filename = page?.name || page?.innerPath || page?.path || '';
		const bookPath = bookStore.currentBook?.path ?? '';
		const probeKey = page ? `${bookPath}::${page.innerPath ?? page.path}` : '';

		webpAnimatedForCurrentPage = false;

		if (!page || !animatedVideoModeStore.canUse || !isAnimatedWebpCandidate(filename)) {
			return;
		}

		const cached = animatedWebpProbeCache.get(probeKey);
		if (cached !== undefined) {
			webpAnimatedForCurrentPage = cached;
			return;
		}

		const probeId = ++webpProbeVersion;

		void (async () => {
			try {
				let probePath = page.path;
				if (page.innerPath && bookStore.currentBook?.type === 'archive') {
					probePath = await invoke<string>('extract_image_to_temp', {
						archivePath: bookStore.currentBook.path,
						filePath: page.innerPath,
						traceId: `animated-webp-probe-${Date.now()}`,
						pageIndex: page.index
					});
				}

				const animated = await isAnimatedImage(convertFileSrc(probePath));
				if (probeId !== webpProbeVersion) return;
				animatedWebpProbeCache.set(probeKey, animated);
				webpAnimatedForCurrentPage = animated;
			} catch (error) {
				if (probeId !== webpProbeVersion) return;
				animatedWebpProbeCache.set(probeKey, false);
				webpAnimatedForCurrentPage = false;
				console.warn('WebP 动图检测失败，按静态图处理:', error);
			}
		})();
	});

	let isAnimatedVideoModePage = $derived.by(() => {
		const page = bookStore.currentPage;
		if (!page || !animatedVideoModeStore.canUse) return false;
		const filename = page.name || page.innerPath || page.path || '';
		if (!filename) return false;
		if (isAnimatedImageVideoCandidate(filename)) return true;
		if (isAnimatedWebpCandidate(filename)) return webpAnimatedForCurrentPage;
		return false;
	});

	// 是否为视频
	let isVideoMode = $derived.by(() => {
		const page = bookStore.currentPage;
		if (!page) return false;
		// 优先检查 name，然后检查 innerPath（压缩包内文件），最后检查 path
		const filename = page.name || page.innerPath || page.path || '';
		if (!filename) return false;
		return isVideoFile(filename) || isAnimatedVideoModePage;
	});

	// 视频 URL（用于背景层提取首帧颜色）
	// 注意：这里只处理文件系统的视频，压缩包内的视频需要先提取
	let videoSrcForBackground = $derived.by(() => {
		if (!isVideoMode) return '';
		const page = bookStore.currentPage;
		if (!page) return '';
		if (isAnimatedVideoModePage) {
			// Animated images are converted in VideoContainer, so we do not have a direct playable video path here.
			return '';
		}
		// 只处理文件系统的视频（非压缩包）
		if (page.innerPath && bookStore.currentBook?.type === 'archive') {
			// 压缩包内的视频暂不支持背景提取（需要先提取到临时文件）
			return '';
		}
		return convertFileSrc(page.path);
	});

	// 视频缓存键（用于背景层缓存）
	let videoCacheKey = $derived(bookStore.currentPage?.path ?? '');

	// 视频容器引用
	let videoContainerRef: any = $state(null);

	// 幻灯片模式
	let slideshowVisible = $state(false);

	// ============================================================================
	// 帧配置（使用方案 B 的 pageMode）
	// ============================================================================

	// 首页/尾页单独显示设置
	// 使用 BookSettingSelectMode 解析逻辑（简化版：default = true for first, false for last）
	let singleFirstPage = $derived(
		settings.view.pageLayout?.singleFirstPageMode === 'default'
			? true
			: settings.view.pageLayout?.singleFirstPageMode === 'continue'
				? false
				: true
	);
	let singleLastPage = $derived(
		settings.view.pageLayout?.singleLastPageMode === 'default'
			? false
			: settings.view.pageLayout?.singleLastPageMode === 'continue'
				? true
				: false
	);

	// 宽页拉伸模式（双页模式下的对齐方式）
	let widePageStretch = $derived(settings.view.pageLayout?.widePageStretch ?? 'uniformHeight');

	// ============================================================================
	// 帧数据
	// ============================================================================

	// 判断当前页是否为分割页
	// 【后端主导架构】从后端帧快照中读取分割状态
	let isCurrentPageSplit = $derived.by(() => {
		const snapshot = imageStore.state.currentFrame;
		if (!snapshot) return false;
		const mainImage = snapshot.images[0];
		return !!mainImage?.cropRect;
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

	let resolvedCurrentFrame = $derived.by((): Frame => {
		// 全景模式时不使用此组件，由 PanoramaFrameLayer 处理
		if (isPanorama) {
			return emptyFrame;
		}

		// 【后端主导架构】直接从 imageStore 获取后端计算的帧
		const frame = imageStore.getCurrentFrame();

		return frame;
	});

	// 【双缓冲】上次非空帧缓存，防止翻页时空帧闪烁
	// 仅在切书/reset/关闭 viewer 时清空
	let lastNonEmptyFrame: Frame | null = $state(null);

	$effect(() => {
		const frame = resolvedCurrentFrame;
		if (frame.images.length > 0) {
			lastNonEmptyFrame = frame;
		}
	});

	let currentFrameData = $derived.by((): Frame => {
		const frame = resolvedCurrentFrame;
		if (frame.images.length > 0) {
			return frame;
		}

		if (bookStore.currentBook && bookStore.currentPage && lastNonEmptyFrame) {
			return lastNonEmptyFrame;
		}

		return emptyFrame;
	});

	let rotatedFrameData = $derived.by((): Frame => {
		const frame = currentFrameData;
		if (autoRotateMode === 'none' || frame.images.length === 0) {
			return frame;
		}

		let hasRotationChange = false;
		const images = frame.images.map((img) => {
			const width = img.width || hoverImageSize.width || 0;
			const height = img.height || hoverImageSize.height || 0;
			const autoRotation = computeAutoRotateAngle(autoRotateMode, { width, height });
			if (autoRotation === null) {
				return img;
			}

			const nextRotation = normalizeAngle((img.rotation ?? 0) + autoRotation);
			if (nextRotation === normalizeAngle(img.rotation ?? 0)) {
				return img;
			}

			hasRotationChange = true;
			return {
				...img,
				rotation: nextRotation
			};
		});

		if (!hasRotationChange) {
			return frame;
		}

		return {
			...frame,
			id: `${frame.id}:auto-rotate:${autoRotateMode}`,
			images
		};
	});

	let displayFrameData = $derived.by((): Frame => {
		void upscaleStore.version;

		const frame = rotatedFrameData;
		if (!upscaleStore.enabled || frame.images.length === 0) {
			return frame;
		}

		let hasReplacement = false;
		const replacedImages = frame.images.map((img) => {
			const upscaledUrl = upscaleStore.getPageUpscaleUrl(img.physicalIndex);
			if (!upscaledUrl || upscaledUrl === img.url) {
				return img;
			}

			hasReplacement = true;
			return {
				...img,
				url: upscaledUrl
			};
		});

		if (!hasReplacement) {
			return frame;
		}

		return {
			...frame,
			id: `${frame.id}:upscaled:${bookStore.currentPageIndex}:${upscaleStore.version}`,
			images: replacedImages
		};
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

	let resetView = $state(() => {});

	resetView = () => {
		manualScale = 1.0;
		rotation = 0;
		resetScrollPosition();
	};

	// 图片加载完成回调 - 更新尺寸到元数据
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
		// 这样后端可以正确判断页面是否为横向
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

	function buildFrameSnapshotParams(): GetFrameSnapshotParams | null {
		if (!bookStore.currentBook || !bookStore.currentPage || isPanorama) {
			return null;
		}

		return {
			pageMode,
			readOrder: direction,
			splitHorizontal: splitHorizontalPages,
			widePage: treatHorizontalAsDoublePage,
			singleFirst: singleFirstPage,
			singleLast: singleLastPage,
			divideRate: 1.0,
			splitHalf: currentSplitHalf ?? undefined
		};
	}

	function buildPanoramaLoadOptions(): PanoramaLoadOptions {
		return {
			pageMode,
			readOrder: direction,
			splitHorizontal: splitHorizontalPages,
			widePage: treatHorizontalAsDoublePage,
			singleFirst: singleFirstPage,
			singleLast: singleLastPage,
			divideRate: 1.0,
			widePageStretch
		};
	}

	function shouldSplitTargetPage(index: number): boolean {
		if (!splitHorizontalPages || pageMode !== 'single') {
			return false;
		}

		const book = bookStore.currentBook;
		const page = book?.pages?.[index];
		if (!book || !page) {
			return false;
		}

		const width = page.width ?? 0;
		const height = page.height ?? 0;
		return width > 0 && height > 0 && width > height;
	}

	function showBoundaryToast(message: string) {
		const enableBoundaryToast = settings.view.switchToast?.enableBoundaryToast ?? true;
		if (enableBoundaryToast) {
			showInfoToast(message);
		}
	}

	async function navigateReader(dir: 'prev' | 'next') {
		const book = bookStore.currentBook;
		const page = bookStore.currentPage;
		if (!book || !page) {
			return;
		}

		const currentIndex = bookStore.currentPageIndex;
		const currentSub = $subPageIndex;
		const snapshot = imageStore.state.currentFrame;
		const splitActive = isCurrentPageSplit;

		if (dir === 'prev' && splitActive && currentSub === 1) {
			subPageIndex.set(0);
			return;
		}

		if (dir === 'next' && splitActive && currentSub === 0) {
			subPageIndex.set(1);
			return;
		}

		const step = Math.max(snapshot?.step ?? pageStep, 1);
		const maxIndex = Math.max(bookStore.totalPages - 1, 0);
		const targetIndex =
			dir === 'next' ? Math.min(currentIndex + step, maxIndex) : Math.max(currentIndex - step, 0);

		const canMove = dir === 'next' ? (snapshot?.canNext ?? true) : (snapshot?.canPrev ?? true);
		if (!canMove || targetIndex === currentIndex) {
			showBoundaryToast(dir === 'next' ? '已经是最后一页' : '已经是第一页');
			return;
		}

		await bookStore.navigateToPage(targetIndex);

		if (dir === 'prev' && shouldSplitTargetPage(targetIndex)) {
			subPageIndex.set(1);
			return;
		}

		subPageIndex.set(0);
	}

	function scheduleViewportFrameRefresh() {
		if (viewportRefreshTimer !== null) {
			clearTimeout(viewportRefreshTimer);
		}

		const params = buildFrameSnapshotParams();
		if (!params) {
			return;
		}

		viewportRefreshTimer = setTimeout(() => {
			viewportRefreshTimer = null;
			void imageStore.loadCurrentPage(params, true);
		}, 80);
	}

	// 计算翻页步进：从后端帧快照中读取
	let pageStep = $derived.by(() => {
		const snapshot = imageStore.state.currentFrame;
		if (snapshot) {
			return snapshot.step;
		}
		// 降级
		return pageMode === 'double' ? 2 : 1;
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
		if (isPanorama) {
			void navigatePanorama('prev');
			return;
		}
		resetScrollPosition();
		void navigateReader('prev');
	}

	function handleNextPage() {
		if (isPanorama) {
			void navigatePanorama('next');
			return;
		}
		resetScrollPosition();
		void navigateReader('next');
	}

	// 处理全景模式滚动事件 - 触发预加载
	function handlePanoramaScroll(e: Event) {
		// 检查是否是自定义事件
		if (e instanceof CustomEvent && e.detail?.visiblePageIndex !== undefined) {
			const { visiblePageIndex, visiblePart, preloadPageIndex } = e.detail as {
				visiblePageIndex: number;
				visiblePart?: number;
				preloadPageIndex?: number;
			};
			if (visiblePart !== undefined && visiblePart !== $subPageIndex) {
				subPageIndex.set(visiblePart);
			}
			// 日志已移除，避免滚动时的性能损耗
			// 触发预加载：以目标页为中心预加载
			panoramaStore.loadPanorama(preloadPageIndex ?? visiblePageIndex, buildPanoramaLoadOptions());
		}
	}

	// 悬停滚动状态
	async function navigatePanorama(dir: 'prev' | 'next') {
		const units = panoramaStore.state.units;
		const currentIndex = bookStore.currentPageIndex;
		const currentPart = $subPageIndex;
		const maxIndex = Math.max(bookStore.totalPages - 1, 0);

		if (units.length === 0) {
			const fallbackIndex =
				dir === 'next' ? Math.min(currentIndex + 1, maxIndex) : Math.max(currentIndex - 1, 0);
			if (fallbackIndex === currentIndex) {
				showBoundaryToast(dir === 'next' ? '已经是最后一页' : '已经是第一页');
				return;
			}
			await bookStore.navigateToPage(fallbackIndex);
			subPageIndex.set(0);
			return;
		}

		const currentUnitIndex = findCurrentPanoramaUnitIndex(currentIndex, currentPart);
		const targetUnitIndex = currentUnitIndex + (dir === 'next' ? 1 : -1);
		const targetUnit = units[targetUnitIndex];

		if (!targetUnit) {
			const edgeFallbackIndex = getPanoramaEdgeFallbackIndex(dir, currentUnitIndex);
			if (edgeFallbackIndex !== null) {
				await bookStore.navigateToPage(edgeFallbackIndex);
				subPageIndex.set(0);
				panoramaStore.loadPanorama(edgeFallbackIndex, buildPanoramaLoadOptions());
				return;
			}
			showBoundaryToast(dir === 'next' ? '已经是最后一页' : '已经是第一页');
			return;
		}

		await bookStore.navigateToPage(targetUnit.startIndex);
		subPageIndex.set(targetUnit.position.part);
		panoramaStore.loadPanorama(targetUnit.startIndex, buildPanoramaLoadOptions());
	}

	function getPanoramaEdgeFallbackIndex(
		dir: 'prev' | 'next',
		currentUnitIndex: number
	): number | null {
		const units = panoramaStore.state.units;
		if (units.length === 0) return null;

		if (dir === 'next' && currentUnitIndex >= units.length - 1) {
			const lastUnit = units[units.length - 1];
			const lastLoadedPage = lastUnit.images.reduce(
				(max, image) => Math.max(max, image.pageIndex),
				lastUnit.startIndex
			);
			const maxIndex = Math.max(bookStore.totalPages - 1, 0);
			return lastLoadedPage < maxIndex ? lastLoadedPage + 1 : null;
		}

		if (dir === 'prev' && currentUnitIndex <= 0) {
			const firstLoadedPage = units[0].startIndex;
			return firstLoadedPage > 0 ? firstLoadedPage - 1 : null;
		}

		return null;
	}

	function findCurrentPanoramaUnitIndex(pageIndex: number, part: number): number {
		const units = panoramaStore.state.units;
		const exactPosition = units.findIndex(
			(unit) => unit.position.index === pageIndex && unit.position.part === part
		);
		if (exactPosition >= 0) return exactPosition;

		const exactPage = units.findIndex(
			(unit) =>
				unit.startIndex === pageIndex || unit.images.some((image) => image.pageIndex === pageIndex)
		);
		if (exactPage >= 0) return exactPage;

		let closestIndex = 0;
		let closestDistance = Infinity;
		units.forEach((unit, index) => {
			const distance = Math.abs(unit.startIndex - pageIndex);
			if (distance < closestDistance) {
				closestDistance = distance;
				closestIndex = index;
			}
		});
		return closestIndex;
	}

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

	async function syncUpscaleForPage(pageIndex: number): Promise<void> {
		try {
			await upscaleStore.setCurrentPage(pageIndex);
			await upscaleStore.triggerCurrentPageUpscale();
		} catch (error) {
			console.error('[StackView] 同步超分页面失败:', error);
		}
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

			// 如果是新书本，重置状态
			if (bookContext?.path !== currentPath) {
				debugStackView('📚 [StackView] 书籍切换:', {
					oldPath: bookContext?.path,
					newPath: currentPath
				});
				imageStore.reset();
				panoramaStore.reset();
				zoomModeManager.reset();
				resetScrollPosition();
				// 【双缓冲】切书时清空旧帧缓存，防止跨书污染
				lastNonEmptyFrame = null;

				// 通知 upscaleStore 书籍切换
				debugStackView('📚 [StackView] 调用 upscaleStore.setCurrentBook:', currentPath);
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

		if (book && page) {
			// 检测模式是否变化
			const modeChanged = currentPageMode !== lastPageMode || currentPanorama !== lastPanorama;
			lastPageMode = currentPageMode;
			lastPanorama = currentPanorama;

			// 通知 upscaleStore 页面切换
			void syncUpscaleForPage(pageIndex);

			// 根据模式加载
			if (currentPanorama) {
				panoramaStore.setEnabled(true);
				panoramaStore.loadPanorama(pageIndex, buildPanoramaLoadOptions());
			} else {
				panoramaStore.setEnabled(false);
				const params = buildFrameSnapshotParams();
				if (params) {
					imageStore.loadCurrentPage(params, modeChanged);
				}
			}
		}
	});

	// 更新视口尺寸
	function updateViewportSize() {
		if (containerRef) {
			const rect = containerRef.getBoundingClientRect();
			containerRect = rect;
			if (rect.width !== viewportSize.width || rect.height !== viewportSize.height) {
				viewportSize = { width: rect.width, height: rect.height };
				// 【后端主导架构】上报视口尺寸到后端
				const dpr = window.devicePixelRatio || 1;
				imageStore.reportViewportSize(
					rect.width,
					rect.height,
					dpr,
					isPanorama ? 'panorama' : pageMode
				);
				scheduleViewportFrameRefresh();
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
			manualScale = 1.0;
		}
	});

	// 【注意】此处不再通过 zoomModeManager.apply() 将 mode-scale 写入 $zoomLevel/manualScale。
	// 原因：modeScale ($derived) 已按 currentZoomMode 计算出正确的绝对缩放比例，
	//       effectiveScale = modeScale × manualScale，若 zoomModeManager 再写入 manualScale
	//       就会造成双重叠加（如 original 模式下显示比例错误）。
	// manualScale 始终代表「用户在当前模式基础上的额外手动缩放系数（默认 1.0）」，
	// 仅由顶栏 +/- 按钮或滚轮手势修改，切换 zoom 模式时重置为 1.0。

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
		const handleSettingsChange = (
			s: typeof settingsManager extends { getSettings: () => infer T } ? T : never
		) => {
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

	// 监听 zoomMode 变化事件（由顶栏/设置面板分发）
	function handleApplyZoomMode(event: Event) {
		const detail = (event as CustomEvent<ApplyZoomModeDetail>).detail;
		const mode = detail.mode ?? settingsManager.getSettings().view.defaultZoomMode ?? 'fit';
		debugStackView('[StackView] handleApplyZoomMode', {
			requestedMode: detail.mode,
			resolvedMode: mode,
			prevMode: currentZoomMode,
			prevManualScale: manualScale
		});
		if (currentZoomMode !== mode) {
			currentZoomMode = mode as ZoomMode;
			// 切换缩放模式时重置手动缩放系数，避免旧的 manualScale 叠加到新模式上
			manualScale = 1.0;
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
		lastNonEmptyFrame = null;
		if (viewportRefreshTimer !== null) {
			clearTimeout(viewportRefreshTimer);
			viewportRefreshTimer = null;
		}
		window.removeEventListener(applyZoomModeEventName, handleApplyZoomMode);
		window.removeEventListener('neoview-viewer-action', handleViewerAction);
	});

	let isRTL = $derived(settings.book.readingDirection === 'right-to-left');

	export {
		resetView,
		togglePageMode,
		togglePanorama,
		toggleSlideshow,
		pageMode,
		isPanorama,
		bookContext,
		slideshowVisible
	};
</script>

<div class="stack-view" bind:this={containerRef}>
	<BackgroundLayer
		color={settings.view.backgroundColor || backgroundColor}
		mode={settings.view.backgroundMode ?? 'solid'}
		imageSrc={displayFrameData.images[0]?.url ?? ''}
		preloadedColor=""
		ambientSpeed={settings.view.ambient?.speed ?? 8}
		ambientBlur={settings.view.ambient?.blur ?? 80}
		ambientOpacity={settings.view.ambient?.opacity ?? 0.8}
		ambientStyle={settings.view.ambient?.style ?? 'vibrant'}
		auroraShowRadialGradient={settings.view.aurora?.showRadialGradient ?? true}
		spotlightColor={settings.view.spotlight?.color ?? 'white'}
		{isVideoMode}
		videoSrc={videoSrcForBackground}
		{videoCacheKey}
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
			currentPart={$subPageIndex}
			{viewportSize}
			{widePageStretch}
			onScroll={handlePanoramaScroll}
		/>
	{:else}
		<!-- 标准模式：显示当前帧 -->
		<!-- 【性能优化】viewPosition 通过 CSS 变量由 HoverLayer 直接操作 -->
		<CurrentFrameLayer
			frame={displayFrameData}
			layout={effectivePageMode}
			{direction}
			{orientation}
			scale={effectiveScale}
			{rotation}
			{viewportSize}
			imageSize={hoverImageSize}
			{alignMode}
			zoomMode={currentZoomMode}
			{hoverScrollEnabled}
			onImageLoad={handleImageLoad}
		/>
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
		onNextPage={() => void pageRight()}
		onPrevPage={() => void pageLeft()}
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
	<ProgressBarLayer showProgressBar={showProgress && $viewerProgressVisible} />

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

<!-- 放大镜层 (Simple Implementation) -->
{#if displayFrameData && displayFrameData.images.length > 0}
	<Magnifier
		imageUrl={displayFrameData.images[0].url}
		{containerRect}
		imageWidth={hoverImageSize.width}
		imageHeight={hoverImageSize.height}
		zoom={settings.view.magnifier?.zoom ?? 2.0}
		size={settings.view.magnifier?.size ?? 200}
		enabled={$viewerState.magnifier.enabled}
	/>
{/if}

<style>
	.stack-view {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		isolation: isolate;
		contain: layout style;
	}

	/* 页面容器：离屏页面跳过绘制 */
	:global(.neoview-page-container) {
		content-visibility: auto;
		contain-intrinsic-size: auto 500px;
	}

	/* 活跃页面：启用 GPU 合成层 */
	:global(.neoview-page-container.active) {
		content-visibility: visible;
		will-change: transform;
	}

	/* 非活跃页面：严格隔离，减少重绘影响 */
	:global(.neoview-page-container.inactive) {
		contain: strict;
		will-change: auto;
	}

	/* 图片元素：避免解码阻塞 */
	:global(.neoview-page-container img) {
		content-visibility: auto;
		contain: paint;
	}
</style>
