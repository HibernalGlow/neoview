<script lang="ts">
	/**
	 * Top Toolbar Component
	 * 顶部工具栏 - 自动隐藏，包含标题栏、面包屑和图片操作按钮
	 */
	import { getAppWindow, isRunningInTauri } from '$lib/api/adapter';
	import { Button } from '$lib/components/ui/button';
	import TitleBarSection from './TitleBarSection.svelte';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
		// Progress component removed — not used in this toolbar

	import { bookStore } from '$lib/stores/book.svelte';
	import {
		zoomIn,
		zoomOut,
		resetZoom,
		rotateClockwise,
		rotationAngle,
		setViewMode,
		toggleViewModeLock,
		toggleLeftSidebar,
		toggleReadingDirection,
		toggleReadingDirectionLock,
		lockedReadingDirection,
		toggleOrientation,
		topToolbarPinned,
		topToolbarLockState,
		topToolbarOpen,
		topToolbarHeight,
		toggleZoomModeLock,
		requestZoomMode,
		layoutMode,
		toggleLayoutMode,
		layoutSwitchMode,
		toggleLayoutSwitchMode,
		pageLeft,
		pageRight
	} from '$lib/stores';
	import { bookContextManager } from '$lib/stores/bookContext.svelte';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import PathBar from '../ui/PathBar.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		RotateCw,
		RotateCcw,
		RectangleVertical,
		Columns2,
		PanelsTopLeft,
		ArrowDownUp,
		ArrowLeftRight,
		ArrowRight,
		ArrowLeft,
		X,
		Folder,
		FileArchive,
		Menu,
		Minimize,
		Maximize,
		Settings,
		Pin,
		PinOff,
		GripHorizontal,
		Eye,
		Palette,
		Sun,
		Moon,
		Monitor,
		Check,
		Frame,
		MousePointer2,
		StretchHorizontal,
		StretchVertical,
		Expand,
		LayoutGrid,
		SplitSquareHorizontal,
		Rows2,
		AlignLeft,
		AlignRight,
		Ban,
		Smartphone,
		MonitorSmartphone,
		Play,
		Pause,
		SquareChevronLeft,
		SquareChevronRight,
		ArrowUp,
		ArrowDown,
		Shuffle,
		Clock,
		FileText,
		HardDrive,
		List,
		AlignVerticalSpaceAround,
		AlignHorizontalSpaceAround,
		Equal
	} from '@lucide/svelte';

	import { showToast } from '$lib/utils/toast';

	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ZoomMode, WidePageStretch } from '$lib/settings/settingsManager';
	import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';
	import type { PageSortMode } from '$lib/types/book';

	// 窗口对象（异步获取，浏览器模式下为 mock）
	let appWindow: Awaited<ReturnType<typeof getAppWindow>> | null = null;
	
	// 初始化窗口对象
	if (typeof window !== 'undefined') {
		getAppWindow().then(w => { appWindow = w; });
	}

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);
	const sortCategories = [
		{ value: 'fileName', label: '文件名', icon: FileText },
		{ value: 'fileSize', label: '文件大小', icon: HardDrive },
		{ value: 'timeStamp', label: '修改时间', icon: Clock },
		{ value: 'entry', label: 'Entry 顺序', icon: List },
		{ value: 'random', label: '随机', icon: Shuffle }
	];

	const zoomModeOptions: { mode: ZoomMode; label: string }[] = [
		{ mode: 'fit', label: '适应窗口' },
		{ mode: 'fill', label: '铺满整个窗口' },
		{ mode: 'fitWidth', label: '适应宽度' },
		{ mode: 'fitHeight', label: '适应高度' },
		{ mode: 'original', label: '原始大小' },
		{ mode: 'fitLeftAlign', label: '居左适应窗口' },
		{ mode: 'fitRightAlign', label: '居右适应窗口' }
	];
	let currentSortModeLabel = $derived(
		sortModeOptions.find((o) => o.value === (bookStore.currentBook?.sortMode ?? 'fileName'))
			?.label ?? '文件名 ↑'
	);

	// 阅读方向状态
	let settings = $state(settingsManager.getSettings());
	let hoverScrollEnabled = $derived(settings.image.hoverScrollEnabled ?? true);
	let readingDirection = $derived(settings.book.readingDirection);

	// 实际的双页模式状态（包括全景模式下的情况）
	let isDoublePage = $derived.by(() => {
		const viewMode = $viewerState.viewMode;
		if (viewMode === 'panorama') {
			// 全景模式下从 bookContextManager 获取实际 pageMode
			return bookContextManager.current?.pageMode === 'double';
		}
		return viewMode === 'double';
	});
	let hoverAreas = $derived(settings.panels?.hoverAreas);
	let autoHideTiming = $derived(
		settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 }
	);
	let defaultZoomMode: ZoomMode = $derived(settings.view.defaultZoomMode);
	let currentZoomDisplayMode: ZoomMode = $derived(
		$viewerState.lockedZoomMode ?? $viewerState.currentZoomMode ?? defaultZoomMode
	);
	let CurrentZoomIcon = $derived(getZoomModeIcon(currentZoomDisplayMode));

	// 页面布局和自动旋转设置
	let splitHorizontalPages = $derived(settings.view.pageLayout?.splitHorizontalPages ?? false);
	let treatHorizontalAsDoublePage = $derived(
		settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false
	);
	let autoRotateMode = $derived(settings.view.autoRotate?.mode ?? 'none');
	
	// 首页/尾页独立显示设置
	// 'default' = 首页独立/尾页不独立, 'continue' = 首页不独立/尾页独立, 'restoreOrDefault' = 默认行为
	let singleFirstPageMode = $derived(settings.view.pageLayout?.singleFirstPageMode ?? 'restoreOrDefault');
	let singleLastPageMode = $derived(settings.view.pageLayout?.singleLastPageMode ?? 'restoreOrDefault');
	// 简化为布尔值：是否启用首页/尾页独立显示
	let singleFirstPage = $derived(singleFirstPageMode !== 'continue');
	let singleLastPage = $derived(singleLastPageMode === 'continue');

	// 宽页拉伸模式（双页模式下的对齐方式）
	let widePageStretch = $derived(settings.view.pageLayout?.widePageStretch ?? 'uniformHeight');

	// 顶部工具栏透明度和模糊
	let topToolbarOpacity = $derived(settings.panels?.topToolbarOpacity ?? 85);
	let topToolbarBlur = $derived(settings.panels?.topToolbarBlur ?? 12);

	// 监听设置变化
	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	// 切换自动分割横向页
	function toggleSplitHorizontalPages() {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				splitHorizontalPages: !splitHorizontalPages
			}
		});
	}

	// 切换横向页视为双页
	function toggleTreatHorizontalAsDoublePage() {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				treatHorizontalAsDoublePage: !treatHorizontalAsDoublePage
			}
		});
	}

	// 切换首页独立显示
	function toggleSingleFirstPage() {
		// 切换逻辑：当前启用 -> 禁用 (continue), 当前禁用 -> 启用 (default)
		const newMode = singleFirstPage ? 'continue' : 'default';
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				singleFirstPageMode: newMode
			}
		});
	}

	// 切换尾页独立显示
	function toggleSingleLastPage() {
		// 切换逻辑：当前启用 -> 禁用 (default), 当前禁用 -> 启用 (continue)
		const newMode = singleLastPage ? 'default' : 'continue';
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				singleLastPageMode: newMode
			}
		});
	}

	// 设置宽页拉伸模式
	function setWidePageStretch(mode: WidePageStretch) {
		settingsManager.updateNestedSettings('view', {
			pageLayout: {
				...settings.view.pageLayout,
				widePageStretch: mode
			}
		});
	}

	// 获取宽页拉伸模式标签
	function getWidePageStretchLabel(mode: WidePageStretch): string {
		switch (mode) {
			case 'none': return '无对齐';
			case 'uniformHeight': return '高度对齐';
			case 'uniformWidth': return '宽度对齐';
			default: return '高度对齐';
		}
	}

	function getAutoRotateLabel(mode: string): string {
		switch (mode) {
			case 'left':
				return '纵向左旋';
			case 'right':
				return '纵向右旋';
			case 'horizontalLeft':
				return '横屏左旋';
			case 'horizontalRight':
				return '横屏右旋';
			case 'forcedLeft':
				return '始终左旋';
			case 'forcedRight':
				return '始终右旋';
			default:
				return '关闭';
		}
	}

	function getZoomModeLabel(mode: ZoomMode): string {
		if (mode === 'fit') return '适应窗口';
		if (mode === 'fill') return '铺满整个窗口';
		if (mode === 'fitWidth') return '适应宽度';
		if (mode === 'fitHeight') return '适应高度';
		if (mode === 'fitLeftAlign') return '居左适应窗口';
		if (mode === 'fitRightAlign') return '居右适应窗口';
		return '原始大小';
	}

	const zoomModeIconMap = {
		fit: Maximize,
		fill: Expand,
		fitWidth: StretchHorizontal,
		fitHeight: StretchVertical,
		original: Frame,
		fitLeftAlign: AlignLeft,
		fitRightAlign: AlignRight
	} as const satisfies Record<ZoomMode, typeof Maximize>;

	function getZoomModeIcon(mode: ZoomMode) {
		return zoomModeIconMap[mode] ?? Frame;
	}

	function handleZoomModeChange(mode: ZoomMode) {
		const applied = requestZoomMode(mode);
		if (!applied) return;
		if (settings.view.defaultZoomMode === mode) return;
		settingsManager.updateNestedSettings('view', { defaultZoomMode: mode });
	}

	async function handleSortModeChange(mode: PageSortMode) {
		if (!bookStore.currentBook || bookStore.currentBook.sortMode === mode) return;
		await bookStore.setSortMode(mode);
	}

	function toggleSortDirection(categoryValue: string) {
		const currentMode = bookStore.currentBook?.sortMode;
		if (!currentMode) return;
		
		// 如果当前不是这个分类，切换到这个分类的升序
		if (!currentMode.startsWith(categoryValue)) {
			handleSortModeChange(categoryValue as PageSortMode);
		} else {
			// 如果是当前分类，切换升降序
			const isDescending = currentMode.includes('Descending');
			const newMode = isDescending 
				? (categoryValue as PageSortMode) 
				: (`${categoryValue}Descending` as PageSortMode);
			handleSortModeChange(newMode);
		}
	}

	function getCurrentSortCategory(): string {
		const currentMode = bookStore.currentBook?.sortMode;
		if (!currentMode) return 'fileName';
		
		// 移除 Descending 后缀获取分类
		return currentMode.replace('Descending', '');
	}

	function isCurrentSortDescending(): boolean {
		return bookStore.currentBook?.sortMode?.includes('Descending') ?? false;
	}

	function handleZoomReset() {
		dispatchApplyZoomMode();
	}

	function toggleHoverScroll() {
		const next = !(settings.image.hoverScrollEnabled ?? true);
		settingsManager.updateNestedSettings('image', { hoverScrollEnabled: next });
	}

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let showTimeout: number | undefined;
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let hoverCount = $state(0); // 追踪悬停区域的计数

	// 展开面板状态
	let sortPanelExpanded = $state(false);
	let zoomPanelExpanded = $state(false);
	let rotatePanelExpanded = $state(false);
	let slideshowPanelExpanded = $state(false);
	let hoverScrollPanelExpanded = $state(false);
	let slideshowInterval = $state(slideshowStore.interval);
	
	// 悬停滚动速度（本地状态，用于滑块）
	let hoverScrollSpeed = $derived(settings.image.hoverScrollSpeed ?? 2.0);

	function closePanels() {
		sortPanelExpanded = false;
		zoomPanelExpanded = false;
		rotatePanelExpanded = false;
		slideshowPanelExpanded = false;
		hoverScrollPanelExpanded = false;
	}

	function toggleSortPanel() {
		const wasExpanded = sortPanelExpanded;
		closePanels();
		sortPanelExpanded = !wasExpanded;
	}

	function toggleZoomPanel() {
		const wasExpanded = zoomPanelExpanded;
		closePanels();
		zoomPanelExpanded = !wasExpanded;
	}

	function toggleRotatePanel() {
		const wasExpanded = rotatePanelExpanded;
		closePanels();
		rotatePanelExpanded = !wasExpanded;
	}

	function toggleSlideshowPanel() {
		const wasExpanded = slideshowPanelExpanded;
		closePanels();
		slideshowPanelExpanded = !wasExpanded;
	}

	function toggleHoverScrollPanel() {
		const wasExpanded = hoverScrollPanelExpanded;
		closePanels();
		hoverScrollPanelExpanded = !wasExpanded;
	}

	function handleHoverScrollSpeedChange(value: number) {
		const clamped = Math.max(0.5, Math.min(value, 10));
		settingsManager.updateNestedSettings('image', { hoverScrollSpeed: clamped });
	}

	function handleSlideshowIntervalChange() {
		slideshowStore.setInterval(slideshowInterval);
	}

	function startSlideshow() {
		window.dispatchEvent(
			new CustomEvent('neoview-viewer-action', {
				detail: { action: 'slideshowToggle' }
			})
		);
	}

	function setAutoRotateMode(mode: 'none' | 'left' | 'right' | 'horizontalLeft' | 'horizontalRight' | 'forcedLeft' | 'forcedRight') {
		settingsManager.updateNestedSettings('view', { autoRotate: { mode } });
	}

	// 响应钉住状态、锁定状态和 open 状态
	$effect(() => {
		// 锁定隐藏时，强制隐藏
		if ($topToolbarLockState === false) {
			isVisible = false;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
			return;
		}
		// 锁定显示或钉住时，强制显示
		if ($topToolbarPinned || $topToolbarLockState === true) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
			return;
		}
		// 响应 open 状态
		if ($topToolbarOpen) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
		} else {
			isVisible = false;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
		}
	});

	function showToolbar() {
		console.log('showToolbar called, setting isVisible to true');
		isVisible = true;
		if (hideTimeout) {
			console.log('Clearing existing hide timeout');
			clearTimeout(hideTimeout);
		}
	}

	function handleMouseEnter() {
		hoverCount++;
		// console.log('TopToolbar handleMouseEnter, hoverCount:', hoverCount);
		// 锁定隐藏时，不响应悬停
		if ($topToolbarLockState === false) return;
		if ($topToolbarPinned || $topToolbarLockState === true) {
			showToolbar();
			return;
		}
		if (hideTimeout) {
			clearTimeout(hideTimeout);
		}
		if (showTimeout) {
			clearTimeout(showTimeout);
		}
		const showDelayMs = (autoHideTiming?.showDelaySec ?? 0) * 1000;
		if (showDelayMs > 0) {
			showTimeout = setTimeout(() => {
				if (hoverCount > 0 && !$topToolbarPinned) {
					showToolbar();
				}
			}, showDelayMs) as unknown as number;
		} else {
			showToolbar();
		}
	}

	function handleMouseLeave() {
		hoverCount--;
		console.log('TopToolbar handleMouseLeave, hoverCount:', hoverCount);
		if ($topToolbarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		// 只有当计数为0时（即鼠标离开了所有相关区域）才开始延迟隐藏
		if (hoverCount <= 0) {
			console.log('Setting hide timeout for TopToolbar');
			const hideDelayMs = (autoHideTiming?.hideDelaySec ?? 0) * 1000;
			hideTimeout = setTimeout(() => {
				console.log('Timeout triggered, hoverCount:', hoverCount);
				if (hoverCount <= 0) {
					isVisible = false;
				}
			}, hideDelayMs) as unknown as number;
		}
	}

	function togglePin() {
		topToolbarPinned.update((p) => !p);
	}

	function handlePinContextMenu(e: MouseEvent) {
		e.preventDefault();
		topToolbarPinned.set(false);
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		hoverCount = 0;
		isVisible = false;
	}

	function handleResizeStart(e: MouseEvent) {
		isResizing = true;
		resizeStartY = e.clientY;
		resizeStartHeight = $topToolbarHeight;
		e.preventDefault();
	}

	function handleResizeMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaY = e.clientY - resizeStartY;
		const newHeight = Math.max(80, Math.min(400, resizeStartHeight + deltaY));
		topToolbarHeight.set(newHeight);
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

	async function handlePreviousPage() {
		if (!bookStore.canPreviousPage) return;
		await pageLeft();
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		await pageRight();
	}

	function handleClose() {
		bookStore.closeBook();
	}

	async function minimizeWindow() {
		await appWindow.minimize();
	}

	async function maximizeWindow() {
		await appWindow.toggleMaximize();
	}

	async function closeWindow() {
		await appWindow.close();
	}

	function toggleComparisonMode() {
		const nextEnabled = !$viewerState.comparisonVisible;
		const mode = $viewerState.comparisonMode ?? 'slider';
		window.dispatchEvent(
			new CustomEvent('comparison-mode-changed', {
				detail: { enabled: nextEnabled, mode }
			})
		);
	}
</script>

<div
	data-top-toolbar="true"
	class="absolute top-0 right-0 left-0 z-58 transition-transform duration-300 {isVisible
		? 'translate-y-0'
		: '-translate-y-full'}"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="complementary"
	aria-label="顶部工具栏"
	tabindex="-1"
>
	<!-- 标题栏 -->
	<TitleBarSection
		opacity={topToolbarOpacity}
		blur={topToolbarBlur}
		onMouseEnter={handleMouseEnter}
		onMouseLeave={handleMouseLeave}
		onPinContextMenu={handlePinContextMenu}
	/>

	<!-- 工具栏（图片操作） - 响应式布局：宽度不够时面包屏在上，工具栏在下 -->
	<div
		class="border-b {isVisible ? 'shadow-lg' : ''}"
		style="min-height: {$topToolbarHeight}px; background-color: color-mix(in oklch, var(--sidebar) {topToolbarOpacity}%, transparent); color: var(--sidebar-foreground); backdrop-filter: blur({topToolbarBlur}px);"
	>
		<div class="mx-auto flex w-full max-w-[1280px] flex-col gap-1 px-2 py-1">
			<!-- 第一行：关闭按钮 + 面包屑导航 + 页码信息（窄屏时独占一行） -->
			<div class="flex min-w-0 items-center justify-start gap-2 md:justify-center">
				<Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={handleClose}>
					<X class="h-4 w-4" />
				</Button>

				{#if bookStore.currentBook}
					<div class="min-w-0 flex-1 md:max-w-[60%] md:flex-none">
						<PathBar
							currentPath={bookStore.currentBook.path}
							isArchive={bookStore.currentBook.type === 'archive'}
						/>
					</div>
				{/if}

				<!-- 页码信息（窄屏时在面包屑旁边） -->
				{#if bookStore.currentBook}
					<div
						class="text-muted-foreground flex shrink-0 items-center gap-2 text-sm whitespace-nowrap"
					>
						{#if bookStore.currentBook.type === 'archive'}
							<FileArchive class="h-3 w-3" />
						{:else}
							<Folder class="h-3 w-3" />
						{/if}
						<span class="font-mono text-xs">
							{bookStore.currentPageIndex + 1} / {bookStore.totalPages}
						</span>
					</div>
				{/if}
			</div>

			<!-- 第二行：排序下拉框 + 工具栏按钮（自动换行） -->
			{#if bookStore.currentBook}
				<div class="flex flex-wrap items-center justify-start gap-1 md:justify-center">
					<!-- 排序切换 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={sortPanelExpanded ? 'default' : 'ghost'}
								size="icon"
								class="h-8 w-8"
								onclick={toggleSortPanel}
							>
								<ArrowDownUp class="h-3.5 w-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>页面排序：{currentSortModeLabel}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 分隔线 -->
					<Separator.Root orientation="vertical" class="mx-1 h-6" />
					<!-- 导航按钮 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8"
								onclick={handlePreviousPage}
								disabled={!bookStore.canPreviousPage}
							>
								<ChevronLeft class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>上一页</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8"
								onclick={handleNextPage}
								disabled={!bookStore.canNextPage}
							>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>下一页</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 分隔线 -->
					<Separator.Root orientation="vertical" class="mx-1 h-6" />

					<!-- 缩放按钮 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomOut}>
								<ZoomOut class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>缩小</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant="ghost"
								size="sm"
								class="h-8 px-2 font-mono text-xs"
								onclick={handleZoomReset}
							>
								{($viewerState.zoom * 100).toFixed(0)}%
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>重置缩放</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomIn}>
								<ZoomIn class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>放大</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 缩放模式切换 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={zoomPanelExpanded ? 'default' : 'ghost'}
								size="icon"
								class={`h-8 w-8 ${$viewerState.lockedZoomMode ? 'ring-primary bg-primary/10 text-primary rounded-full ring-2' : ''}`}
								onclick={toggleZoomPanel}
								oncontextmenu={(e: MouseEvent) => {
									e.preventDefault();
									toggleZoomModeLock(currentZoomDisplayMode);
								}}
							>
								<CurrentZoomIcon class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>
								缩放模式：{getZoomModeLabel(currentZoomDisplayMode)}
								{$viewerState.lockedZoomMode ? '（已锁定）' : ''}
							</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 分隔线 -->
					<Separator.Root orientation="vertical" class="mx-1 h-6" />

					<!-- 视图模式切换 - 图标列 -->
					<div class="flex items-center">
						<div class="bg-muted/60 inline-flex items-center rounded-full p-0.5 shadow-inner">
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={$viewerState.viewMode === 'panorama' ? 'default' : 'ghost'}
										size="icon"
										class={`h-8 w-8 rounded-full ${$viewerState.lockedViewMode === 'panorama' ? 'ring-primary bg-primary/20 text-primary ring-2' : ''}`}
										onclick={() => {
											if ($viewerState.viewMode === 'panorama') {
												// 退出全景时恢复之前的 pageMode
												const pageMode = bookContextManager.current?.pageMode ?? 'single';
												setViewMode(pageMode);
											} else {
												setViewMode('panorama');
											}
										}}
										oncontextmenu={(event: MouseEvent) => {
											event.preventDefault();
											toggleViewModeLock('panorama');
										}}
									>
										<PanelsTopLeft class="h-4 w-4" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>全景模式{$viewerState.lockedViewMode === 'panorama' ? '（已锁定）' : ''}</p>
								</Tooltip.Content>
							</Tooltip.Root>

							<!-- 视图方向切换（横/竖），主要影响全景模式的填充方向 -->
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={$viewerState.orientation === 'vertical' ? 'default' : 'ghost'}
										size="icon"
										class="ml-1 h-8 w-8 rounded-full"
										onclick={toggleOrientation}
									>
										{#if $viewerState.orientation === 'horizontal'}
											<ArrowLeftRight class="h-4 w-4" />
										{:else}
											<ArrowDownUp class="h-4 w-4" />
										{/if}
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>
										{$viewerState.orientation === 'horizontal'
											? '横向布局（点击切换为纵向）'
											: '纵向布局（点击切换为横向）'}
									</p>
								</Tooltip.Content>
							</Tooltip.Root>

							<!-- 视图模式切换按钮 -->
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={isDoublePage ? 'default' : 'ghost'}
										size="icon"
										class={`h-8 w-8 rounded-full ${
											$viewerState.lockedViewMode === 'double' ||
											$viewerState.lockedViewMode === 'single'
												? 'ring-primary bg-primary/20 text-primary ring-2'
												: ''
										}`}
										onclick={() => {
											const newPageMode = isDoublePage ? 'single' : 'double';
											// 在全景模式下，只改变 pageMode 不退出全景
											if ($viewerState.viewMode === 'panorama') {
												const ctx = bookContextManager.current;
												if (ctx) {
													ctx.setPageMode(newPageMode as 'single' | 'double');
												}
											} else {
												setViewMode(newPageMode);
											}
										}}
										oncontextmenu={(event: MouseEvent) => {
											event.preventDefault();
											const mode = isDoublePage ? 'double' : 'single';
											toggleViewModeLock(mode);
										}}
									>
										{#if isDoublePage}
											<Columns2 class="h-4 w-4" />
										{:else}
											<RectangleVertical class="h-4 w-4" />
										{/if}
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>
										{isDoublePage
											? $viewerState.lockedViewMode === 'double'
												? '双页模式（已锁定）'
												: '双页模式（点击切换为单页）'
											: $viewerState.lockedViewMode === 'single'
												? '单页模式（已锁定）'
												: '单页模式（点击切换为双页）'}
									</p>
								</Tooltip.Content>
							</Tooltip.Root>
						</div>
					</div>

					<!-- 阅读方向切换按钮 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant="ghost"
								size="icon"
								class={`h-8 w-8 ${$lockedReadingDirection ? 'ring-primary bg-primary/20 text-primary rounded-full ring-2' : ''}`}
								onclick={toggleReadingDirection}
								oncontextmenu={(event: MouseEvent) => {
									event.preventDefault();
									toggleReadingDirectionLock(readingDirection);
								}}
							>
								{#if readingDirection === 'left-to-right'}
									<ArrowRight class="h-4 w-4" />
								{:else}
									<ArrowLeft class="h-4 w-4" />
								{/if}
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>
								{readingDirection === 'left-to-right'
									? $lockedReadingDirection === 'left-to-right'
										? '左开模式（已锁定，右键解锁）'
										: '左开模式（点击切换，右键锁定）'
									: $lockedReadingDirection === 'right-to-left'
										? '右开模式（已锁定，右键解锁）'
										: '右开模式（点击切换，右键锁定）'}
							</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 分隔线 -->
					<Separator.Root orientation="vertical" class="mx-1 h-6" />

					<!-- 旋转设置 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={rotatePanelExpanded || autoRotateMode !== 'none' ? 'default' : 'ghost'}
								size="icon"
								class="h-8 w-8"
								onclick={toggleRotatePanel}
							>
								<RotateCw class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>
								旋转{autoRotateMode !== 'none'
									? `（自动：${getAutoRotateLabel(autoRotateMode)}）`
									: ''}
							</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={hoverScrollEnabled || hoverScrollPanelExpanded ? 'default' : 'ghost'}
								size="icon"
								class="h-8 w-8"
								onclick={toggleHoverScroll}
								oncontextmenu={(e) => {
									e.preventDefault();
									toggleHoverScrollPanel();
								}}
							>
								<MousePointer2 class="h-4 w-4" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>{hoverScrollEnabled ? '悬停滚动：开' : '悬停滚动：关'}（右键设置）</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 幻灯片模式 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={slideshowPanelExpanded || slideshowStore.isPlaying ? 'default' : 'ghost'}
								size="icon"
								class="h-8 w-8"
								onclick={toggleSlideshowPanel}
							>
								{#if slideshowStore.isPlaying}
									<Pause class="h-4 w-4" />
								{:else}
									<Play class="h-4 w-4" />
								{/if}
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>{slideshowStore.isPlaying ? '幻灯片播放中' : '幻灯片设置'}</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</div>
			{/if}

			<!-- 排序展开面板 -->
			{#if sortPanelExpanded && bookStore.currentBook}
				<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
					
					<!-- 合并的排序图标行 -->
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						{#each sortCategories as category}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={getCurrentSortCategory() === category.value ? 'default' : 'ghost'}
										size="sm"
										class="h-7 w-7 rounded-full p-0 relative"
										onclick={() => toggleSortDirection(category.value)}
									>
										<svelte:component this={category.icon} class="h-3 w-3" />
										{#if getCurrentSortCategory() === category.value && category.value !== 'random'}
											{#if isCurrentSortDescending()}
												<ArrowDown class="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
											{:else}
												<ArrowUp class="h-2 w-2 absolute -bottom-0.5 -right-0.5 text-primary" />
											{/if}
										{/if}
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p class="font-medium">{category.label}</p>
									{#if getCurrentSortCategory() === category.value && category.value !== 'random'}
										<p class="text-xs text-muted-foreground">
											{isCurrentSortDescending() ? '降序' : '升序'} - 点击切换
										</p>
									{:else}
										<p class="text-xs text-muted-foreground">点击切换排序</p>
									{/if}
								</Tooltip.Content>
							</Tooltip.Root>
						{/each}
						
						<!-- 分隔符 -->
						<div class="w-px h-4 bg-border/50 mx-1"></div>
						
						<!-- 独立的升序降序按钮 -->
						{#if getCurrentSortCategory() !== 'random'}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={!isCurrentSortDescending() ? 'default' : 'ghost'}
										size="sm"
										class="h-6 w-6 rounded-full p-0"
										onclick={() => handleSortModeChange(getCurrentSortCategory() as PageSortMode)}
									>
										<ArrowUp class="h-3 w-3" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>升序</p>
								</Tooltip.Content>
							</Tooltip.Root>
							
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={isCurrentSortDescending() ? 'default' : 'ghost'}
										size="sm"
										class="h-6 w-6 rounded-full p-0"
										onclick={() => handleSortModeChange(`${getCurrentSortCategory()}Descending` as PageSortMode)}
									>
										<ArrowDown class="h-3 w-3" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>降序</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/if}
					</div>
				</div>
			{/if}

			<!-- 缩放模式展开面板 -->
			{#if zoomPanelExpanded && bookStore.currentBook}
				<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
					<span class="text-muted-foreground mr-2 text-xs">缩放模式</span>
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						{#each zoomModeOptions as { mode, label }}
							{@const ZoomIcon = getZoomModeIcon(mode)}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant={currentZoomDisplayMode === mode ? 'default' : 'ghost'}
										size="icon"
										class={`h-7 w-7 rounded-full ${$viewerState.lockedZoomMode === mode ? 'ring-primary ring-2' : ''}`}
										onclick={() => handleZoomModeChange(mode)}
									>
										<ZoomIcon class="h-3.5 w-3.5" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>
									<p>{label}{$viewerState.lockedZoomMode === mode ? '（锁定）' : ''}</p>
								</Tooltip.Content>
							</Tooltip.Root>
						{/each}
					</div>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<span class="text-muted-foreground mr-2 text-xs">页面布局</span>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={splitHorizontalPages ? 'default' : 'ghost'}
								size="icon"
								class="h-7 w-7"
								onclick={toggleSplitHorizontalPages}
							>
								<SplitSquareHorizontal class="h-3.5 w-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>自动分割横向页{splitHorizontalPages ? '（开）' : '（关）'}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={treatHorizontalAsDoublePage ? 'default' : 'ghost'}
								size="icon"
								class="h-7 w-7"
								onclick={toggleTreatHorizontalAsDoublePage}
							>
								<Rows2 class="h-3.5 w-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>横向页视为双页{treatHorizontalAsDoublePage ? '（开）' : '（关）'}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<span class="text-muted-foreground mr-2 text-xs">双页独立</span>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={singleFirstPage ? 'default' : 'ghost'}
								size="icon"
								class="h-7 w-7"
								onclick={toggleSingleFirstPage}
							>
								<SquareChevronLeft class="h-3.5 w-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>首页独立显示{singleFirstPage ? '（开）' : '（关）'}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={singleLastPage ? 'default' : 'ghost'}
								size="icon"
								class="h-7 w-7"
								onclick={toggleSingleLastPage}
							>
								<SquareChevronRight class="h-3.5 w-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>尾页独立显示{singleLastPage ? '（开）' : '（关）'}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<span class="text-muted-foreground mr-2 text-xs">宽页拉伸</span>
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={widePageStretch === 'none' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setWidePageStretch('none')}
								>
									<Equal class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>无对齐（保持原始比例）</p>
							</Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={widePageStretch === 'uniformHeight' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setWidePageStretch('uniformHeight')}
								>
									<AlignVerticalSpaceAround class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>高度对齐（双页高度统一）</p>
							</Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={widePageStretch === 'uniformWidth' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setWidePageStretch('uniformWidth')}
								>
									<AlignHorizontalSpaceAround class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>宽度对齐（双页宽度统一）</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>
			{/if}

			<!-- 旋转设置展开面板 -->
			{#if rotatePanelExpanded && bookStore.currentBook}
				<div class="flex flex-wrap items-center justify-center gap-1 border-t border-border/50 pt-1">
					<span class="text-muted-foreground mr-2 text-xs">手动旋转</span>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button variant="ghost" size="icon" class="h-7 w-7" onclick={rotateClockwise}>
								<RotateCw class="h-3.5 w-3.5" />
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>顺时针旋转 90°</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<span class="text-muted-foreground mr-2 text-xs">自动旋转</span>
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'none' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('none')}
								>
									<Ban class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>关闭自动旋转</p></Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'left' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('left')}
								>
									<RotateCcw class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>纵向左旋</p></Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'right' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('right')}
								>
									<RotateCw class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>纵向右旋</p></Tooltip.Content>
						</Tooltip.Root>
					</div>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<span class="text-muted-foreground mr-2 text-xs">横屏</span>
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'horizontalLeft' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('horizontalLeft')}
								>
									<Smartphone class="h-3.5 w-3.5 -rotate-90" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>横屏左旋 90°</p></Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'horizontalRight' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('horizontalRight')}
								>
									<Smartphone class="h-3.5 w-3.5 rotate-90" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>横屏右旋 90°</p></Tooltip.Content>
						</Tooltip.Root>
					</div>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<span class="text-muted-foreground mr-2 text-xs">强制</span>
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'forcedLeft' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('forcedLeft')}
								>
									<RotateCcw class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>始终左旋 90°</p></Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={autoRotateMode === 'forcedRight' ? 'default' : 'ghost'}
									size="icon"
									class="h-7 w-7 rounded-full"
									onclick={() => setAutoRotateMode('forcedRight')}
								>
									<RotateCw class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>始终右旋 90°</p></Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>
			{/if}

			<!-- 悬停滚动设置展开面板 -->
			{#if hoverScrollPanelExpanded && bookStore.currentBook}
				<div class="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-1">
					<span class="text-muted-foreground mr-2 text-xs">悬停滚动</span>
					
					<!-- 开关按钮 -->
					<Button
						variant={hoverScrollEnabled ? 'default' : 'outline'}
						size="sm"
						class="h-7 px-3"
						onclick={toggleHoverScroll}
					>
						{hoverScrollEnabled ? '已启用' : '已禁用'}
					</Button>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<!-- 滚动倍率 -->
					<span class="text-muted-foreground text-xs">倍率</span>
					<div class="flex items-center gap-1">
						<input
							type="range"
							min="0.5"
							max="10"
							step="0.5"
							value={hoverScrollSpeed}
							oninput={(e) => handleHoverScrollSpeedChange(parseFloat((e.target as HTMLInputElement).value))}
							class="h-1 w-20 cursor-pointer appearance-none rounded-full bg-muted"
						/>
						<span class="w-10 text-center text-xs">{hoverScrollSpeed.toFixed(1)}x</span>
					</div>
				</div>
			{/if}

			<!-- 幻灯片设置展开面板 -->
			{#if slideshowPanelExpanded && bookStore.currentBook}
				<div class="flex flex-wrap items-center justify-center gap-2 border-t border-border/50 pt-1">
					<span class="text-muted-foreground mr-2 text-xs">幻灯片</span>
					
					<!-- 播放/暂停按钮 -->
					<Button
						variant={slideshowStore.isPlaying ? 'default' : 'outline'}
						size="sm"
						class="h-7 px-3"
						onclick={startSlideshow}
					>
						{#if slideshowStore.isPlaying}
							<Pause class="mr-1 h-3 w-3" />
							暂停
						{:else}
							<Play class="mr-1 h-3 w-3" />
							开始
						{/if}
					</Button>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<!-- 间隔时间 -->
					<span class="text-muted-foreground text-xs">间隔</span>
					<div class="flex items-center gap-1">
						<input
							type="range"
							min="1"
							max="30"
							step="1"
							bind:value={slideshowInterval}
							oninput={handleSlideshowIntervalChange}
							class="h-1 w-20 cursor-pointer appearance-none rounded-full bg-muted"
						/>
						<span class="w-8 text-center text-xs">{slideshowInterval}s</span>
					</div>

					<!-- 快速设置 -->
					<div class="bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 shadow-inner">
						{#each [3, 5, 10, 15] as sec}
							<Button
								variant={slideshowInterval === sec ? 'default' : 'ghost'}
								size="sm"
								class="h-6 w-8 rounded-full px-1 text-xs"
								onclick={() => {
									slideshowInterval = sec;
									slideshowStore.setInterval(sec);
								}}
							>
								{sec}s
							</Button>
						{/each}
					</div>

					<Separator.Root orientation="vertical" class="mx-2 h-5" />

					<!-- 循环模式 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={slideshowStore.loop ? 'default' : 'ghost'}
								size="icon"
								class="h-7 w-7"
								onclick={() => slideshowStore.setLoop(!slideshowStore.loop)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>循环播放{slideshowStore.loop ? '（开）' : '（关）'}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 随机模式 -->
					<Tooltip.Root>
						<Tooltip.Trigger>
							<Button
								variant={slideshowStore.random ? 'default' : 'ghost'}
								size="icon"
								class="h-7 w-7"
								onclick={() => slideshowStore.setRandom(!slideshowStore.random)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>随机播放{slideshowStore.random ? '（开）' : '（关）'}</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<!-- 进度显示 -->
					{#if slideshowStore.isPlaying}
						<Separator.Root orientation="vertical" class="mx-2 h-5" />
						<div class="flex items-center gap-1">
							<div class="relative h-6 w-6">
								<svg class="h-6 w-6 -rotate-90 transform" viewBox="0 0 36 36">
									<circle
										cx="18"
										cy="18"
										r="15"
										fill="none"
										stroke="currentColor"
										stroke-opacity="0.2"
										stroke-width="3"
									/>
									<circle
										cx="18"
										cy="18"
										r="15"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-dasharray="94.2"
										stroke-dashoffset={94.2 - (slideshowStore.progress / 100) * 94.2}
										stroke-linecap="round"
										class="text-primary transition-all duration-200"
									/>
								</svg>
							</div>
							<span class="text-xs">{Math.ceil(slideshowStore.remainingTime)}s</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- 拖拽手柄 -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<button
			type="button"
			class="text-muted-foreground hover:bg-accent absolute bottom-0 left-1/2 z-50 -translate-x-1/2 cursor-ns-resize rounded-md p-1 opacity-0 transition-all hover:opacity-100"
			onmousedown={handleResizeStart}
			oncontextmenu={handlePinContextMenu}
			aria-label="拖拽调整工具栏高度"
		>
			<GripHorizontal class="h-4 w-4" />
		</button>
	</div>
</div>

<!-- 触发区域（独立于工具栏，始终存在） -->
<div
	class="fixed top-0 right-0 left-0 z-57"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="presentation"
	aria-label="顶部工具栏触发区域"
	style={`height: ${hoverAreas?.topTriggerHeight ?? 4}px;`}
></div>
