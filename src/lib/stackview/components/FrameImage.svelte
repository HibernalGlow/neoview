<!--
  FrameImage - 统一的图片渲染组件
  所有 Layer（单页/双页/全景）都用它
  自动处理：
  - 超分图替换
  - GPU 加速
  - 样式统一
  - 根据 loadModeStore 切换 img/canvas 渲染
  - 颜色滤镜应用（支持仅黑白模式）
  - 图像裁剪（四边百分比裁剪 + 自动去黑边/白边）
-->
<script lang="ts">
	import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
	import { bookStore } from '$lib/stores/book.svelte';
	import { filterStore, type FilterSettings } from '$lib/stores/filterStore.svelte';
	import { generateCssFilter } from '$lib/utils/colorFilters';
	import {
		imageTrimStore,
		trimToClipPath,
		mergeClipPaths,
		type ImageTrimSettings
	} from '$lib/stores/imageTrimStore.svelte';
	import CanvasImage from './CanvasImage.svelte';
	import { getBitmapCacheEntry, preloadBitmap } from '../utils/bitmapPreloader';
	import { getDecodedImageEntry, predecodeImage } from '../utils/imageDecodePreloader';
	import { getDisplayProxyCandidate, readCssPixelValue } from '../utils/displayProxyUrl';

	interface Props {
		pageIndex: number;
		url: string;
		alt?: string;
		transform?: string;
		clipPath?: string;
		style?: string;
		class?: string;
		sourceWidth?: number;
		sourceHeight?: number;
		onload?: (e: Event) => void;
	}

	let {
		pageIndex,
		url,
		alt = '',
		transform = '',
		clipPath = '',
		style = '',
		class: className = '',
		sourceWidth = 0,
		sourceHeight = 0,
		onload
	}: Props = $props();

	const DISPLAY_PROXY_GROW_RATIO = 1.2;
	const DISPLAY_PROXY_SHRINK_PIXEL_RATIO = 0.65;

	interface DisplayProxySelection {
		sourceUrl: string;
		width: number;
		height: number;
		url: string;
	}

	let displayProxySelection: DisplayProxySelection | null = null;

	function resetDisplayProxySelection(value: string): void {
		if (!displayProxySelection || displayProxySelection.sourceUrl === value) {
			displayProxySelection = null;
		}
	}

	function shouldReuseDisplayProxySelection(value: string, width: number, height: number): boolean {
		const current = displayProxySelection;
		if (!current || current.sourceUrl !== value) return false;
		if (current.width === width && current.height === height) return true;

		const needsLarger =
			width > current.width * DISPLAY_PROXY_GROW_RATIO ||
			height > current.height * DISPLAY_PROXY_GROW_RATIO;
		if (needsLarger) return false;

		const currentPixels = current.width * current.height;
		const targetPixels = width * height;
		const canDownshift =
			width <= current.width &&
			height <= current.height &&
			targetPixels < currentPixels * DISPLAY_PROXY_SHRINK_PIXEL_RATIO;
		return !canDownshift;
	}

	function getDisplayProxyUrl(value: string, cssText: string): string {
		if (!value || loadModeStore.isCanvasMode) {
			resetDisplayProxySelection(value);
			return value;
		}

		const cssWidth = readCssPixelValue(cssText, 'width');
		const cssHeight = readCssPixelValue(cssText, 'height');
		const dpr = typeof window === 'undefined' ? undefined : window.devicePixelRatio || 1;
		const candidate = getDisplayProxyCandidate({
			url: value,
			sourceWidth,
			sourceHeight,
			cssWidth,
			cssHeight,
			dpr
		});
		if (!candidate) {
			resetDisplayProxySelection(value);
			return value;
		}

		if (shouldReuseDisplayProxySelection(value, candidate.width, candidate.height)) {
			return displayProxySelection?.url ?? candidate.url;
		}

		displayProxySelection = {
			sourceUrl: value,
			width: candidate.width,
			height: candidate.height,
			url: candidate.url
		};
		return candidate.url;
	}

	// 滤镜设置
	let filterSettings = $state<FilterSettings | null>(null);
	// 当前图像是否为黑白
	let isBlackAndWhite = $state(false);
	// 上一次检测的 URL
	let lastCheckedUrl = '';
	let blackAndWhiteCheckToken = 0;
	// 图像裁剪设置
	let trimSettings = $state<ImageTrimSettings | null>(null);

	$effect(() => {
		const unsubscribe = filterStore.subscribe((s) => {
			filterSettings = s;
		});
		return unsubscribe;
	});

	// 订阅裁剪设置
	$effect(() => {
		const unsubscribe = imageTrimStore.subscribe((s) => {
			trimSettings = s;
		});
		return unsubscribe;
	});

	// 检测图像是否为黑白（仅在启用「仅黑白」时）
	$effect(() => {
		const checkUrl = displayUrl;
		if (!filterSettings?.colorizeEnabled || !filterSettings?.onlyBlackAndWhite || !checkUrl) {
			blackAndWhiteCheckToken++;
			lastCheckedUrl = '';
			isBlackAndWhite = false;
			return;
		}

		if (checkUrl === lastCheckedUrl) {
			return;
		}

		lastCheckedUrl = checkUrl;
		const token = ++blackAndWhiteCheckToken;
		filterStore
			.checkIsBlackAndWhite(checkUrl)
			.then((result) => {
				if (token === blackAndWhiteCheckToken && displayUrl === checkUrl) {
					isBlackAndWhite = result;
				}
			})
			.catch(() => {
				if (token === blackAndWhiteCheckToken && displayUrl === checkUrl) {
					isBlackAndWhite = false;
				}
			});
	});

	// 计算实际的滤镜 CSS
	let filterCss = $derived.by(() => {
		if (!filterSettings) return '';

		// 如果启用「仅黑白」且当前图像不是黑白，则跳过上色滤镜
		if (filterSettings.colorizeEnabled && filterSettings.onlyBlackAndWhite && !isBlackAndWhite) {
			// 创建一个临时设置，禁用上色
			const tempSettings = { ...filterSettings, colorizeEnabled: false };
			return generateCssFilter(tempSettings);
		}

		return filterStore.getCssFilter();
	});

	// 【后端主导架构】显示 URL 直接使用 prop 传入的 URL
	// 不再查询 imagePool/stackImageLoader，图片资源由后端 protocol 提供
	let displayUrl = $derived.by(() => getDisplayProxyUrl(url, style));

	// 当页内缩放变化时立即更新；翻页(url 变化)时，等新图 ready 再一起提交 URL 和样式，
	// 避免旧图短暂套用新页尺寸而出现“缩放一下”的错觉。
	let settledUrl = $state('');
	let settledTransform = $state('');
	let settledClipPath = $state('');
	let settledStyle = $state('');
	let settledNaturalWidth = $state(0);
	let settledNaturalHeight = $state(0);
	let settledSourceUrl = $state('');
	let pendingSwapToken = 0;
	let lastDimensionReportKey = '';

	function commitSettledRender(
		nextUrl: string,
		nextTransform: string,
		nextClipPath: string,
		nextStyle: string,
		width = 0,
		height = 0,
		nextSourceUrl = url
	) {
		settledUrl = nextUrl;
		settledTransform = nextTransform;
		settledClipPath = nextClipPath;
		settledStyle = nextStyle;
		settledNaturalWidth = width;
		settledNaturalHeight = height;
		settledSourceUrl = nextSourceUrl;
	}

	function emitPreloadedDimensions(
		width: number,
		height: number,
		sourceKey = settledSourceUrl || url
	) {
		if (!onload || !width || !height) return;
		const reportedWidth = sourceWidth || width;
		const reportedHeight = sourceHeight || height;
		const reportKey = `${sourceKey}|${reportedWidth}x${reportedHeight}`;
		if (reportKey === lastDimensionReportKey) return;
		lastDimensionReportKey = reportKey;

		const preloadEvent = new Event('load');
		Object.defineProperty(preloadEvent, 'target', {
			value: {
				naturalWidth: reportedWidth,
				naturalHeight: reportedHeight,
				width: reportedWidth,
				height: reportedHeight
			},
			writable: false
		});
		onload(preloadEvent);
	}

	$effect(() => {
		const targetUrl = displayUrl;
		const targetTransform = transform;
		const targetClipPath = effectiveClipPath;
		const targetStyle = combinedStyle;
		const targetSourceUrl = url;

		if (!targetUrl) {
			pendingSwapToken++;
			commitSettledRender('', targetTransform, targetClipPath, targetStyle, 0, 0, targetSourceUrl);
			return;
		}

		if (!settledUrl) {
			commitSettledRender(
				targetUrl,
				targetTransform,
				targetClipPath,
				targetStyle,
				0,
				0,
				targetSourceUrl
			);
			return;
		}

		if (targetUrl === settledUrl) {
			settledTransform = targetTransform;
			settledClipPath = targetClipPath;
			settledStyle = targetStyle;
			return;
		}

		if (targetSourceUrl === settledSourceUrl) {
			settledTransform = targetTransform;
			settledClipPath = targetClipPath;
			settledStyle = targetStyle;
		}

		const swapToken = ++pendingSwapToken;
		const commitIfCurrent = (width: number, height: number) => {
			if (swapToken !== pendingSwapToken) return;
			emitPreloadedDimensions(width, height, targetSourceUrl);
			commitSettledRender(
				targetUrl,
				targetTransform,
				targetClipPath,
				targetStyle,
				width,
				height,
				targetSourceUrl
			);
		};

		if (loadModeStore.isCanvasMode) {
			const bitmapEntry = getBitmapCacheEntry(targetUrl);
			if (bitmapEntry) {
				commitIfCurrent(bitmapEntry.width, bitmapEntry.height);
				return;
			}

			preloadBitmap(targetUrl)
				.then((entry) => {
					commitIfCurrent(entry.width, entry.height);
				})
				.catch(() => {
					commitIfCurrent(0, 0);
				});
			return;
		}

		const decodedEntry = getDecodedImageEntry(targetUrl);
		if (decodedEntry) {
			commitIfCurrent(decodedEntry.width, decodedEntry.height);
			return;
		}

		predecodeImage(targetUrl, { priority: 'high' })
			.then((entry) => {
				commitIfCurrent(entry.width, entry.height);
			})
			.catch(() => {
				if (swapToken !== pendingSwapToken) return;
				const fallback = new Image();
				fallback.decoding = 'async';
				fallback.loading = 'eager';
				(fallback as HTMLImageElement & { fetchPriority?: 'high' }).fetchPriority = 'high';
				fallback.onload = fallback.onerror = () => {
					commitIfCurrent(fallback.naturalWidth, fallback.naturalHeight);
				};
				fallback.src = targetUrl;
			});
	});

	// 【Phase 1 修复】缩略图仅用于冷启动
	// 如果之前已有可显示图（翻页场景），不再显示缩略图占位
	let thumbnailUrl = $derived(bookStore.currentBook?.pages[pageIndex]?.thumbnail || '');
	let showThumbnail = $state(false);
	let hadPreviousSettledUrl = $state(false);
	let hasSettledUrl = $derived(settledUrl.length > 0);

	// 追踪是否曾经有过 settledUrl（区分冷启动 vs 翻页）
	$effect(() => {
		if (settledUrl.length > 0) {
			hadPreviousSettledUrl = true;
		}
	});

	// 当 url prop 变化时（翻页），决定是否显示缩略图
	$effect(() => {
		const _url = url;
		if (hadPreviousSettledUrl) {
			// 翻页场景：不显示缩略图，旧图保持直到新图 ready
			showThumbnail = false;
		} else {
			// 冷启动场景：显示缩略图作为占位
			showThumbnail = true;
		}
	});

	// 当 Full Image 加载完成后隐藏缩略图
	function handleMainImageLoad(e: Event) {
		showThumbnail = false;
		if (!onload) return;
		if (sourceWidth > 0 && sourceHeight > 0) {
			emitPreloadedDimensions(sourceWidth, sourceHeight, settledSourceUrl || url);
			return;
		}
		onload(e);
	}

	// 合成最终 clip-path（裁剪 + 页面分割）
	let effectiveClipPath = $derived.by(() => {
		const trimClip = trimSettings ? trimToClipPath(trimSettings) : '';
		return mergeClipPaths(trimClip, clipPath);
	});

	// 是否使用 Canvas 渲染
	let useCanvas = $derived(loadModeStore.isCanvasMode);

	// 合并样式（包含滤镜）
	let combinedStyle = $derived.by(() => {
		const parts: string[] = [];
		if (style) parts.push(style);
		if (filterCss) parts.push(`filter: ${filterCss}`);
		return parts.join('; ');
	});
</script>

{#if useCanvas}
	<!-- Canvas 渲染模式：Worker 预解码，性能更好 -->
	<div
		class="image-container {className}"
		style:background-image={showThumbnail && thumbnailUrl ? `url(${thumbnailUrl})` : 'none'}
	>
		{#if hasSettledUrl}
			<CanvasImage
				{pageIndex}
				url={settledUrl}
				{alt}
				transform={settledTransform}
				clipPath={settledClipPath}
				style={settledStyle}
				class={settledClipPath && settledClipPath !== 'none' ? 'is-split' : ''}
				onload={handleMainImageLoad}
			/>
		{/if}
	</div>
{:else}
	<!-- img 渲染模式：传统方式 -->
	<div
		class="image-container {className}"
		style:background-image={showThumbnail && thumbnailUrl ? 'url(' + thumbnailUrl + ')' : 'none'}
	>
		{#if hasSettledUrl}
			<img
				src={settledUrl}
				{alt}
				width={settledNaturalWidth || undefined}
				height={settledNaturalHeight || undefined}
				class="frame-image"
				class:is-split={!!settledClipPath && settledClipPath !== 'none'}
				style:transform={settledTransform || undefined}
				style:clip-path={settledClipPath && settledClipPath !== 'none'
					? settledClipPath
					: undefined}
				style:filter={filterCss || undefined}
				style={settledStyle || undefined}
				onload={handleMainImageLoad}
				decoding="async"
				loading="eager"
				fetchpriority="high"
				draggable="false"
			/>
		{/if}
	</div>
{/if}

<style>
	.image-container {
		position: relative;
		width: fit-content;
		height: fit-content;
		max-width: none;
		max-height: none;
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		background-size: cover;
		background-position: center;
		/* 缩略图模糊效果，模拟 BlurHash */
		backdrop-filter: blur(10px);
		overflow: hidden;
	}

	.frame-image {
		/* 默认尺寸限制，可被父组件通过 style prop 覆盖 */
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
		/* 【修复内存泄露】移除 will-change，仅保留基本 GPU 加速 */
		transform: translateZ(0);
		backface-visibility: hidden;
		/* 使用高质量渲染，避免锯齿 */
		image-rendering: auto;
		content-visibility: visible;
		/* 【Phase 1 修复】移除图片级 fade transition，只保留页面层动画 */
	}

	.frame-image.is-split {
		max-width: 200%;
		width: 200%;
	}
</style>
