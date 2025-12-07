<!--
  保留旧的 StackViewer，用于兼容 默认使用FrameImage
  StackViewer - 层叠式图片渲染器
  
  核心设计：
  - 维护三个帧槽（prev/current/next），每个槽包含一个预加载的 img
  - 翻页时轮转槽位，而非替换 img.src，避免重解码卡顿
  - 可选超分层覆盖在 current 上方
  
  参考：docs/VIEWER_ARCHITECTURE_COMPARISON.md 方案 A
-->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { settingsManager } from '$lib/settings/settingsManager';
	import { imagePool } from '$lib/stackview/stores/imagePool.svelte';
	import { pipelineLatencyStore } from '$lib/stores/pipelineLatency.svelte';
	import CanvasFrame from './components/CanvasFrame.svelte';
	import { type FrameSlot, type SlotImage, createEmptySlot, SlotZIndex } from './types/frameSlot';
	import { subPageIndex } from '$lib/stores/ui.svelte';
	import { getClipPath, getSplitTransform } from '$lib/stackview/utils/transform';

	// ============================================================================
	// Props
	// ============================================================================

	let {
		showUpscale = true,
		transitionDuration = 150,
		scale = 1,
		rotation = 0,
		viewportSize = { width: 0, height: 0 },
		useCanvas = false, // 使用 Canvas 预渲染模式
		pageMode = 'single', // 页面模式：单页/双页
		direction = 'ltr', // 阅读方向
		alignMode = 'center', // 对齐模式：center/left/right
		onPageChange,
		onImageLoad
	}: {
		showUpscale?: boolean;
		transitionDuration?: number;
		scale?: number;
		rotation?: number;
		viewportSize?: { width: number; height: number };
		useCanvas?: boolean;
		pageMode?: 'single' | 'double';
		direction?: 'ltr' | 'rtl';
		alignMode?: 'center' | 'left' | 'right';
		onPageChange?: (pageIndex: number) => void;
		onImageLoad?: (e: Event, index: number) => void;
	} = $props();

	// ============================================================================
	// 状态
	// ============================================================================

	// 三个帧槽
	let prevSlot = $state<FrameSlot>(createEmptySlot('prev'));
	let currentSlot = $state<FrameSlot>(createEmptySlot('current'));
	let nextSlot = $state<FrameSlot>(createEmptySlot('next'));

	// 超分层
	let upscaleUrl = $state<string | null>(null);

	// 当前显示的页面索引
	let displayedPageIndex = $state(-1);

	// 是否正在过渡动画中
	let isTransitioning = $state(false);

	// 设置
	let settings = $state(settingsManager.getSettings());
	settingsManager.addListener((s) => {
		settings = s;
	});

	// 阅读方向
	let isRTL = $derived(settings.book.readingDirection === 'right-to-left');

	// 当前书本路径（用于检测书本切换）
	let currentBookPath = $state<string | null>(null);

	// 上一次的页面模式（用于检测模式变化）
	let lastPageMode = $state<'single' | 'double'>('single');

	// 【性能优化】transform-origin 通过 CSS 变量由 HoverLayer 直接操作 DOM
	// 不再在模板中设置，避免 Svelte 渲染覆盖

	// 当前图片（用于计算分割状态）
	let currentImage = $derived(currentSlot.images[0]);

	// 计算分割状态
	let isSplit = $derived.by(() => {
		if (pageMode !== 'single') return false;
		if (!settings.view.pageLayout.splitHorizontalPages) return false;
		if (!currentImage?.dimensions) return false;
		return currentImage.dimensions.width > currentImage.dimensions.height;
	});

	// 当前显示的分割部分
	// ui.svelte.ts 中 subPageIndex 0 是 First Part, 1 是 Second Part.
	let splitHalf = $derived(isSplit ? ($subPageIndex === 1 ? 'second' : 'first') : null);

	// 视觉上的分割部分 (Left / Right)
	let visualSplitHalf: 'left' | 'right' | null = $derived.by(() => {
		if (!isSplit) return null;
		const sub = $subPageIndex;
		// 如果是 RTL: First Part(0) 是右边, Second Part(1) 是左边
		if (isRTL) {
			return sub === 0 ? 'right' : 'left';
		} else {
			// LTR: First Part(0) 是左边, Second Part(1) 是右边
			return sub === 0 ? 'left' : 'right';
		}
	});

	// 计算 Transform 和 ClipPath
	// getSplitTransform/getClipPath 接受 'left' | 'right'
	type SplitHalf = 'left' | 'right' | null;
	let clipStyle = $derived(getClipPath(visualSplitHalf as SplitHalf));

	// 计算 transform（包含 scale、rotation 和 split）
	let transformStyle = $derived.by(() => {
		const parts: string[] = [];
		// Split shift - 注意顺序，先 scale 再 translate 可能更符合直觉？或者反过来
		// getSplitTransform 返回 translate(25%) 等。百分比是相对于元素自身的。
		const splitTr = getSplitTransform(visualSplitHalf as SplitHalf);

		if (scale !== 1) parts.push(`scale(${scale})`);
		if (splitTr) parts.push(splitTr);
		if (rotation !== 0) parts.push(`rotate(${rotation}deg)`);

		return parts.length > 0 ? parts.join(' ') : 'none';
	});

	/**
	 * 预计算图片的 CSS 缩放比例
	 * 基于当前视口尺寸，计算适应模式下的缩放值
	 */
	function computeScale(imgWidth: number, imgHeight: number): number {
		if (!viewportSize.width || !viewportSize.height) return 1;

		// 计算适应视口的缩放（contain 模式）
		const scaleX = viewportSize.width / imgWidth;
		const scaleY = viewportSize.height / imgHeight;
		return Math.min(scaleX, scaleY);
	}

	// ============================================================================
	// 核心方法
	// ============================================================================

	/**
	 * 加载单张图片（内部辅助函数）
	 */
	async function loadSingleImage(pageIndex: number): Promise<SlotImage | null> {
		if (pageIndex < 0 || pageIndex >= bookStore.totalPages) {
			return null;
		}

		// 先尝试同步获取缓存
		const cached = imagePool.getSync(pageIndex);
		if (cached) {
			await preDecodeImage(cached.url);
			return {
				url: cached.url,
				blob: cached.blob ?? null,
				dimensions:
					cached.width && cached.height ? { width: cached.width, height: cached.height } : null,
				pageIndex
			};
		}

		// 异步加载
		try {
			const image = await imagePool.get(pageIndex);
			if (image) {
				await preDecodeImage(image.url);
				return {
					url: image.url,
					blob: image.blob ?? null,
					dimensions:
						image.width && image.height ? { width: image.width, height: image.height } : null,
					pageIndex
				};
			}
		} catch (err) {
			console.warn(`StackViewer: 加载页面 ${pageIndex} 失败:`, err);
		}

		return null;
	}

	/**
	 * 加载单个槽位的图片（支持双页模式）
	 */
	async function loadSlot(slot: FrameSlot, pageIndex: number): Promise<FrameSlot> {
		if (pageIndex < 0 || pageIndex >= bookStore.totalPages) {
			return createEmptySlot(slot.position);
		}

		const startTime = performance.now();
		const images: SlotImage[] = [];

		// 加载第一张图片
		const firstImage = await loadSingleImage(pageIndex);
		if (firstImage) {
			images.push(firstImage);
		}

		// 双页模式：加载第二张图片
		if (pageMode === 'double' && firstImage) {
			const secondIndex = pageIndex + 1;
			if (secondIndex < bookStore.totalPages) {
				const secondImage = await loadSingleImage(secondIndex);
				if (secondImage) {
					images.push(secondImage);
				}
			}
		}

		if (images.length === 0) {
			return createEmptySlot(slot.position);
		}

		// 记录槽位加载
		const totalMs = performance.now() - startTime;
		pipelineLatencyStore.record({
			timestamp: Date.now(),
			pageIndex,
			traceId: `slot-${slot.position}-${pageIndex}`,
			bookSyncMs: 0,
			backendLoadMs: totalMs,
			ipcTransferMs: 0,
			blobCreateMs: 0,
			totalMs,
			dataSize: images.reduce((sum, img) => sum + (img.blob?.size ?? 0), 0),
			cacheHit: false,
			isCurrentPage: slot.position === 'current',
			source: slot.position === 'current' ? 'current' : 'preload',
			slot: slot.position
		});

		// 计算整体尺寸（双页模式为两图宽度之和）
		const firstDims = images[0].dimensions;
		let totalWidth = firstDims?.width ?? 0;
		let maxHeight = firstDims?.height ?? 0;
		if (images.length > 1 && images[1].dimensions) {
			totalWidth += images[1].dimensions.width;
			maxHeight = Math.max(maxHeight, images[1].dimensions.height);
		}

		return {
			position: slot.position,
			pageIndex,
			images,
			loading: false,
			backgroundColor: imagePool.getBackgroundColor(pageIndex) ?? null,
			precomputedScale: totalWidth > 0 && maxHeight > 0 ? computeScale(totalWidth, maxHeight) : null
		};
	}

	/**
	 * 预解码图片（使用 Image.decode() API）
	 */
	async function preDecodeImage(url: string): Promise<void> {
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			console.log(`✅ 预解码完成: ${url.slice(0, 50)}...`);
		} catch (err) {
			console.warn('预解码失败:', err);
		}
	}

	/**
	 * 初始化三个槽位（书本切换或首次加载时）
	 */
	async function initializeSlots(centerIndex: number) {
		const book = bookStore.currentBook;
		if (!book) {
			prevSlot = createEmptySlot('prev');
			currentSlot = createEmptySlot('current');
			nextSlot = createEmptySlot('next');
			displayedPageIndex = -1;
			return;
		}

		// 设置当前书本
		if (currentBookPath !== book.path) {
			currentBookPath = book.path;
			imagePool.setCurrentBook(book.path);
		}

		console.log(`📚 StackViewer: 初始化槽位，中心页 ${centerIndex + 1}，模式 ${pageMode}`);

		// 预加载槽位使用固定步进 1（前后各一页），不依赖 pageMode
		// 实际内容是否显示双页由 loadSlot 内部根据 pageMode 处理
		const prevIndex = centerIndex - 1;
		const nextIndex = centerIndex + 1;

		// 并行加载三个槽位
		const [prev, current, next] = await Promise.all([
			prevIndex >= 0
				? loadSlot(createEmptySlot('prev'), prevIndex)
				: Promise.resolve(createEmptySlot('prev')),
			loadSlot(createEmptySlot('current'), centerIndex),
			nextIndex < book.pages.length
				? loadSlot(createEmptySlot('next'), nextIndex)
				: Promise.resolve(createEmptySlot('next'))
		]);

		prevSlot = prev;
		currentSlot = current;
		nextSlot = next;
		displayedPageIndex = centerIndex;

		// 触发预加载更远的页面
		imagePool.preloadRange(centerIndex, 5);

		console.log(`✅ StackViewer: 槽位初始化完成`, {
			prev: prev.pageIndex,
			current: current.pageIndex,
			next: next.pageIndex
		});
	}

	/**
	 * 跳转到指定页面（直接重新初始化槽位）
	 * 不再自己计算翻页步进，完全由外部（StackView）控制
	 */
	async function navigateToPage(pageIndex: number) {
		if (pageIndex === displayedPageIndex) return;
		if (pageIndex < 0 || pageIndex >= bookStore.totalPages) return;

		console.log(`🔄 StackViewer: 跳转到 page ${pageIndex + 1}，重新初始化槽位`);
		isTransitioning = true;
		await initializeSlots(pageIndex);
		onPageChange?.(pageIndex);

		setTimeout(() => {
			isTransitioning = false;
		}, transitionDuration);
	}

	/**
	 * 设置超分图片
	 */
	function setUpscaleUrl(url: string | null) {
		upscaleUrl = url;
	}

	// ============================================================================
	// Effects
	// ============================================================================

	// 监听 bookStore 页面变化
	$effect(() => {
		const book = bookStore.currentBook;
		const pageIndex = bookStore.currentPageIndex;

		if (!book) {
			prevSlot = createEmptySlot('prev');
			currentSlot = createEmptySlot('current');
			nextSlot = createEmptySlot('next');
			displayedPageIndex = -1;
			currentBookPath = null;
			upscaleUrl = null;
			return;
		}

		// 书本切换：完全重新初始化
		if (book.path !== currentBookPath) {
			void initializeSlots(pageIndex);
			return;
		}

		// 同一本书内页面切换（使用槽位轮转，无需等待）
		// 注意：不在这里重置 subPageIndex，因为 pageLeft/pageRight 已经正确设置了它
		if (pageIndex !== displayedPageIndex) {
			void navigateToPage(pageIndex);
		}
	});

	// 监听 bookStore 的超分图片
	$effect(() => {
		const url = bookStore.upscaledImageData;
		if (showUpscale && url) {
			upscaleUrl = url;
		} else {
			upscaleUrl = null;
		}
	});

	// 监听 pageMode 变化，重新初始化槽位
	$effect(() => {
		const currentMode = pageMode;
		if (currentMode !== lastPageMode && displayedPageIndex >= 0) {
			lastPageMode = currentMode;
			console.log(`🔄 StackViewer: 页面模式变化为 ${currentMode}，重新初始化槽位`);
			void initializeSlots(displayedPageIndex);
		}
	});

	// 清理
	onDestroy(() => {
		prevSlot = createEmptySlot('prev');
		currentSlot = createEmptySlot('current');
		nextSlot = createEmptySlot('next');
		upscaleUrl = null;
	});

	// ============================================================================
	// 导出 API
	// ============================================================================

	// 当前图片尺寸（用于外部计算悬停滚动等）
	// 如果由于分割导致显示区域变只有一半，我们应该通知外部缩小了宽度，
	// 这样外部的 Fit Width 计算会自动增大 Scale。
	let currentDimensions = $derived.by(() => {
		const raw = currentImage?.dimensions ?? null;
		if (!raw) return null;
		if (visualSplitHalf) {
			return { width: raw.width / 2, height: raw.height };
		}
		return raw;
	});

	// 布局类名
	let layoutClass = $derived.by(() => {
		if (pageMode === 'double') {
			return direction === 'rtl' ? 'frame-double frame-rtl' : 'frame-double';
		}

		// 单页模式
		const classes = ['frame-single'];
		if (alignMode === 'left') {
			classes.push('frame-align-left');
		} else if (alignMode === 'right') {
			classes.push('frame-align-right');
		}
		return classes.join(' ');
	});

	export { navigateToPage, setUpscaleUrl, displayedPageIndex, currentDimensions };
</script>

<div class="stack-viewer">
	<!-- 前页层（隐藏，预加载用） -->
	{#if prevSlot.images.length > 0}
		{#if useCanvas}
			<CanvasFrame
				imageUrl={prevSlot.images[0].url}
				imageBlob={prevSlot.images[0].blob}
				targetWidth={viewportSize.width}
				targetHeight={viewportSize.height}
				opacity={0}
				zIndex={SlotZIndex.PREV}
			/>
		{:else}
			<div
				class="frame-layer prev-layer {layoutClass}"
				style:z-index={SlotZIndex.PREV}
				style:opacity={0}
				data-page-index={prevSlot.pageIndex}
			>
				{#each prevSlot.images as img, i (img.pageIndex)}
					<img src={img.url} alt="Previous page {i}" class="frame-image" draggable="false" />
				{/each}
			</div>
		{/if}
	{/if}

	<!-- 当前页层 -->
	{#if currentSlot.images.length > 0}
		{#if useCanvas}
			<!-- Canvas 预渲染模式（暂不支持双页/分割） -->
			<CanvasFrame
				imageUrl={currentSlot.images[0].url}
				imageBlob={currentSlot.images[0].blob}
				targetWidth={viewportSize.width}
				targetHeight={viewportSize.height}
				{scale}
				{rotation}
				opacity={1}
				zIndex={SlotZIndex.CURRENT}
			/>
		{:else}
			<!-- 传统 img 模式（支持双页） -->
			<div
				class="frame-layer current-layer {layoutClass}"
				style:z-index={SlotZIndex.CURRENT}
				style:opacity={1}
				style:transition={`opacity ${transitionDuration}ms ease`}
				style:transform={transformStyle}
				data-page-index={currentSlot.pageIndex}
			>
				{#each currentSlot.images as img, i (img.pageIndex)}
					<img
						src={img.url}
						alt="Current page {i}"
						class="frame-image"
						style:clip-path={clipStyle}
						draggable="false"
						onload={(e) => onImageLoad?.(e, i)}
					/>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="frame-layer empty-layer" style:z-index={SlotZIndex.CURRENT}>
			<span class="text-muted-foreground">暂无图片</span>
		</div>
	{/if}

	<!-- 后页层（隐藏，预加载用） -->
	{#if nextSlot.images.length > 0}
		{#if useCanvas}
			<CanvasFrame
				imageUrl={nextSlot.images[0].url}
				imageBlob={nextSlot.images[0].blob}
				targetWidth={viewportSize.width}
				targetHeight={viewportSize.height}
				opacity={0}
				zIndex={SlotZIndex.NEXT}
			/>
		{:else}
			<div
				class="frame-layer next-layer {layoutClass}"
				style:z-index={SlotZIndex.NEXT}
				style:opacity={0}
				data-page-index={nextSlot.pageIndex}
			>
				{#each nextSlot.images as img, i (img.pageIndex)}
					<img src={img.url} alt="Next page {i}" class="frame-image" draggable="false" />
				{/each}
			</div>
		{/if}
	{/if}

	<!-- 超分层 -->
	{#if showUpscale && upscaleUrl}
		<div
			class="frame-layer upscale-layer"
			style:z-index={SlotZIndex.UPSCALE}
			style:opacity={1}
			style:transition={`opacity ${transitionDuration}ms ease`}
			style:transform={transformStyle}
		>
			<img src={upscaleUrl} alt="Upscaled" class="frame-image" draggable="false" />
		</div>
	{/if}
</div>

<style>
	.stack-viewer {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		/* 创建层叠上下文 */
		isolation: isolate;
		/* GPU 加速 */
		contain: layout style;
	}

	.frame-layer {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* GPU 加速 + CSS 变量方式减少 DOM 操作 */
		will-change: transform, opacity;
		transform: translateZ(0);
		transform-origin: var(--view-x, 50%) var(--view-y, 50%);
		backface-visibility: hidden;
		pointer-events: none;
		/* 减少重绘 */
		contain: layout style paint;
	}

	.frame-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
		/* 强制完整解码，避免渐进式渲染导致的跳帧 */
		image-rendering: -webkit-optimize-contrast;
		content-visibility: visible;
		/* 图片本身也启用 GPU 加速 */
		will-change: transform;
		transform: translateZ(0);
	}

	/* 隐藏层（保持在 DOM 中但不可见） */
	.prev-layer,
	.next-layer {
		visibility: hidden;
	}

	.current-layer,
	.upscale-layer {
		visibility: visible;
	}

	.empty-layer {
		color: var(--muted-foreground, #888);
	}

	/* 单页模式 */
	.frame-single {
		justify-content: center;
	}

	/* 单页模式 - 居左对齐 */
	.frame-single.frame-align-left {
		justify-content: flex-start;
	}

	/* 单页模式 - 居右对齐 */
	.frame-single.frame-align-right {
		justify-content: flex-end;
	}

	/* 双页模式 - 水平排列 */
	.frame-double {
		flex-direction: row;
		gap: 0;
	}

	.frame-double.frame-rtl {
		flex-direction: row-reverse;
	}

	/* 双页模式下每张图占50%宽度 */
	.frame-double .frame-image {
		max-width: calc(50% - 2px);
		max-height: 100%;
	}
</style>
