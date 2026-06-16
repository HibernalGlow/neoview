<script lang="ts">
	/**
	 * Bottom Thumbnail Bar
	 * 底部缩略图栏 - 自动隐藏，鼠标悬停显示
	 */
	import { onDestroy, onMount } from 'svelte';
	import { readable } from 'svelte/store';
	import { bookStore } from '$lib/stores/book.svelte';
	import { unifiedThumbnailStore, generateThumbKey, type ThumbnailSource, type ThumbnailEntry } from '$lib/stores/unifiedThumbnailStore.svelte';
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
	import { Image as ImageIcon, Pin, PinOff, GripHorizontal, Target, Hash, Grid3X3, Sparkles } from '@lucide/svelte';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import MagicCard from '../ui/MagicCard.svelte';
	import {
		THUMBNAIL_DEBOUNCE_MS,
		ensureMinimumSpan,
		windowBadgeLabel as getWindowBadgeLabel,
		windowBadgeClass as getWindowBadgeClass,
		getMinVisibleThumbnails,
		getWindowRange as computeWindowRange,
		calculateScrollProgress
	} from './thumbnailBarUtils';

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
	let progressBarGlow = $derived(settings.panels?.progressBarGlow ?? false);
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

	// 从统一缩略图缓存获取缩略图
	function getThumbnailForPage(pageIndex: number, pagePath: string): ThumbnailEntry | null {
		const book = bookStore.currentBook;
		if (!book) return null;

		const source: ThumbnailSource = {
			kind: 'bookPage',
			bookPath: book.path,
			pageIndex,
			pagePath,
			fileSize: book.pages[pageIndex]?.size ?? 0,
		};
		const key = generateThumbKey(source, 256);
		const entry = unifiedThumbnailStore.getEntry(key);
		return entry && entry.status === 'ready' ? entry : null;
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

	let loadThumbnailsDebounce: number | null = null;
	let lastThumbnailRange: { start: number; end: number } | null = null;
	const noThumbnailPaths = new Set<string>();
	const loadingIndices = new Set<number>();

	/**
	 * 调度缩略图加载（带防抖）
	 * 优化：使用 thumbnailLoadController 的中央优先策略
	 */
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

	function toggleProgressBarGlow() {
		settingsManager.updateNestedSettings('panels', { progressBarGlow: !progressBarGlow });
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

	function getWindowRange(totalPages: number): { start: number; end: number } {
		const windowState = $viewerState.pageWindow;
		const bookType = bookStore.currentBook?.type === 'archive' ? 'archive' : undefined;
		return computeWindowRange(
			totalPages,
			windowState,
			bookStore.currentPageIndex,
			$bottomThumbnailBarHeight,
			bookType
		);
	}

	function windowBadgeLabel(index: number): string | null {
		return getWindowBadgeLabel(index, $viewerState.pageWindow);
	}

	function windowBadgeClass(index: number): string {
		return getWindowBadgeClass(index, $viewerState.pageWindow);
	}

	// 预加载范围
	const PRELOAD_RANGE = 20;

	/**
	 * 触发缩略图加载（使用 unifiedThumbnailStore）
	 */
	function loadVisibleThumbnails() {
		const book = bookStore.currentBook;
		if (!book) return;

		const centerIndex = bookStore.currentPageIndex;
		const totalPages = book.pages.length;
		const start = Math.max(0, centerIndex - PRELOAD_RANGE);
		const end = Math.min(totalPages - 1, centerIndex + PRELOAD_RANGE);
		const visibleIndices: number[] = [];
		for (let i = start; i <= end; i++) {
			visibleIndices.push(i);
		}

		// 构建请求项
		const items = [];
		for (const idx of visibleIndices) {
			const page = book.pages[idx];
			if (!page) continue;
			const source: ThumbnailSource = {
				kind: 'bookPage',
				bookPath: book.path,
				pageIndex: idx,
				pagePath: page.innerPath || page.path,
				fileSize: page.size ?? 0,
			};
			const key = generateThumbKey(source, 256);
			if (!unifiedThumbnailStore.hasThumbnail(key)) {
				items.push({ key, source, maxSize: 256 });
			}
		}
		if (items.length > 0) {
			unifiedThumbnailStore.requestThumbnails(items, `reader-bar-${book.path}`, 'reader-visible', centerIndex);
		}
	}

	// 滚动处理防抖
	let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * 滚动事件处理
	 */
	function handleScroll(e: Event) {
		const container = e.target as HTMLElement;

		// 更新滚动进度（用于 HorizontalListSlider）
		thumbnailScrollProgress = calculateScrollProgress(container, readingDirection);

		// 防抖处理滚动加载
		if (scrollDebounceTimer) {
			clearTimeout(scrollDebounceTimer);
		}
		scrollDebounceTimer = setTimeout(() => {
			loadVisibleThumbnailsOnScroll(container);
		}, 100); // 100ms 防抖
	}

	/**
	 * 滚动时加载可见缩略图
	 */
	function loadVisibleThumbnailsOnScroll(container: HTMLElement) {
		const book = bookStore.currentBook;
		if (!book) return;

		const containerRect = container.getBoundingClientRect();
		const thumbnailWidth = 80; // 估算缩略图宽度

		// 根据滚动位置计算可见范围中心
		const scrollLeft = container.scrollLeft;
		const visibleWidth = containerRect.width;
		const centerScrollPos = scrollLeft + visibleWidth / 2;
		const centerIdx = Math.floor(centerScrollPos / thumbnailWidth);

		// 限制在有效范围内
		const totalPages = book.pages.length;
		const safeCenter = Math.max(0, Math.min(totalPages - 1, centerIdx));

		// 构建请求项
		const start = Math.max(0, safeCenter - PRELOAD_RANGE);
		const end = Math.min(totalPages - 1, safeCenter + PRELOAD_RANGE);
		const items = [];
		for (let idx = start; idx <= end; idx++) {
			const page = book.pages[idx];
			if (!page) continue;
			const source: ThumbnailSource = {
				kind: 'bookPage',
				bookPath: book.path,
				pageIndex: idx,
				pagePath: page.innerPath || page.path,
				fileSize: page.size ?? 0,
			};
			const key = generateThumbKey(source, 256);
			if (!unifiedThumbnailStore.hasThumbnail(key)) {
				items.push({ key, source, maxSize: 256 });
			}
		}
		if (items.length > 0) {
			unifiedThumbnailStore.requestThumbnails(items, `reader-bar-${book.path}`, 'reader-visible', safeCenter);
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

	function getThumbnailStyle(pageIndex: number, pagePath: string): string {
		const containerHeight = Math.max(40, $bottomThumbnailBarHeight - 40);
		const minWidth = 32;
		const thumb = getThumbnailForPage(pageIndex, pagePath);
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
		// 初始化统一缩略图服务
		await unifiedThumbnailStore.init();

		// 初始化时触发缩略图加载
		scheduleLoadVisibleThumbnails();
	});

	onDestroy(() => {
		if (loadThumbnailsDebounce) {
			clearTimeout(loadThumbnailsDebounce);
			loadThumbnailsDebounce = null;
		}
		if (scrollDebounceTimer) {
			clearTimeout(scrollDebounceTimer);
			scrollDebounceTimer = null;
		}
		// 【修复内存泄漏】清理显示/隐藏定时器
		if (hideTimeout) {
			clearTimeout(hideTimeout);
			hideTimeout = undefined;
		}
		if (showTimeout) {
			clearTimeout(showTimeout);
			showTimeout = undefined;
		}
	});

	$effect(() => {
		const windowState = $viewerState.pageWindow;
		if (!bookStore.currentBook || !windowState) return;
		// 【优化】只在底栏可见时才触发加载，避免不必要的请求
		if (isVisible) {
			scheduleLoadVisibleThumbnails();
		}
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
			const previousBookPath = lastBookPath;
			lastBookPath = currentBook.path;
			lastThumbnailRange = null;
			// 【关键】清空加载状态，防止旧任务继续执行
			loadingIndices.clear();
			noThumbnailPaths.clear();
			// 取消旧书籍的缩略图请求上下文
			if (previousBookPath) {
				unifiedThumbnailStore.cancelContext(`reader-bar-${previousBookPath}`);
			}
		}
	});

	// 【修复】移除高度变化时的重新加载逻辑
	// 原来的代码会因为 thumbnailSnapshot.size 变化而形成循环触发
	// 高度变化只影响显示样式，不需要重新加载缩略图数据
	let lastBarHeight = $state($bottomThumbnailBarHeight);
	$effect(() => {
		const newHeight = $bottomThumbnailBarHeight;
		// 只在高度真正变化时触发（用户拖拽调整），而不是每次 snapshot 变化
		if (newHeight !== lastBarHeight) {
			lastBarHeight = newHeight;
			// 高度变化不需要重新加载缩略图，样式会自动适应
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
		class="fixed right-0 bottom-0 left-0 z-57"
		style={`height: ${hoverAreas?.bottomTriggerHeight ?? 4}px;`}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="presentation"
		aria-label="底部缩略图栏触发区域"
	></div>

	<!-- 缩略图栏内容 -->
	<div
		data-bottom-bar="true"
		class="absolute right-0 bottom-0 left-0 z-58 transition-transform duration-300 {isVisible
			? 'translate-y-0'
			: 'translate-y-full'}"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="application"
		aria-label="底部缩略图栏"
	>
		<MagicCard
			gradientOpacity={0.4}
			class="relative border-t shadow-lg"
			style="height: {$bottomThumbnailBarHeight}px; background-color: color-mix(in oklch, var(--sidebar) {bottomBarOpacity}%, transparent); color: var(--sidebar-foreground); backdrop-filter: blur({bottomBarBlur}px);"
		>
			<!-- 拖拽手柄 -->

			<button
				type="button"
				class="text-muted-foreground hover:bg-accent absolute top-0 left-1/2 z-50 -translate-x-1/2 cursor-ns-resize rounded-md p-1 opacity-0 transition-all hover:opacity-100"
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
							<Grid3X3 class="mr-1 h-3 w-3" />
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
				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={progressBarGlow ? 'default' : 'ghost'}
							size="sm"
							class="h-6"
							onclick={toggleProgressBarGlow}
						>
							<Sparkles class="mr-1 h-3 w-3" />
							<span class="text-xs">荧光</span>
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>进度条缓慢荧光闪烁（避免画面完全静止）</p>
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

			<div class="h-[calc(100%-(--spacing(12)))] overflow-hidden px-2 pb-2">
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
									class="border-border group relative shrink-0 overflow-hidden rounded border-2 transition-colors
										{originalIndex === bookStore.currentPageIndex ? 'outline-sidebar-ring outline-2' : ''}
										{status === 'preupscaled' ? 'ring-accent ring-2' : ''}
										{status === 'done' ? 'ring-primary ring-2' : ''}
										{status === 'failed' ? 'ring-destructive ring-2' : ''}
										hover:border-primary/50"
									style={getThumbnailStyle(originalIndex, page.path)}
									onclick={() => jumpToPage(originalIndex)}
									data-page-index={originalIndex}
								>
									{#if getThumbnailForPage(originalIndex, page.path)}
										<img
											src={getThumbnailForPage(originalIndex, page.path)?.url}
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
											class={`absolute top-0 right-0 px-1 py-px font-mono text-[10px] text-white ${windowBadgeClass(originalIndex)}`}
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
		</MagicCard>
	</div>
{/if}
