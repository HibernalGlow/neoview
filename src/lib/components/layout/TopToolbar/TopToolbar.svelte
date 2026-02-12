<script lang="ts">
	/**
	 * TopToolbar - 顶部工具栏主组件
	 * 自动隐藏，包含标题栏、面包屑和图片操作按钮
	 * 支持 MagicCard 鼠标跟随光效
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import MagicCard from '$lib/components/ui/MagicCard.svelte';
	import TitleBarSection from '../TitleBarSection.svelte';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { bookStore } from '$lib/stores/book.svelte';
	import {
		zoomIn,
		zoomOut,
		rotateClockwise,
		setViewMode,
		toggleViewModeLock,
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
		pageLeft,
		pageRight
	} from '$lib/stores';
	import { bookContextManager } from '$lib/stores/bookContext.svelte';
	import { readable } from 'svelte/store';
	import { appState, type StateSelector } from '$lib/core/state/appState';
	import PathBar from '../../ui/PathBar.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ZoomIn,
		ZoomOut,
		RotateCw,
		X,
		Folder,
		FileArchive,
		GripHorizontal,
		MousePointer2,
		RectangleVertical,
		Columns2,
		PanelsTopLeft,
		ArrowDownUp,
		ArrowLeftRight,
		ArrowRight,
		ArrowLeft,
		Play,
		Pause
	} from '@lucide/svelte';

	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ZoomMode } from '$lib/settings/settingsManager';
	import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
	import { slideshowStore } from '$lib/stores/slideshow.svelte';

	// 子组件导入
	import ZoomPanel from './ZoomPanel.svelte';
	import RotatePanel from './RotatePanel.svelte';
	import SortPanel from './SortPanel.svelte';
	import SlideshowPanel from './SlideshowPanel.svelte';
	import HoverScrollPanel from './HoverScrollPanel.svelte';
	import { getZoomModeIcon, getZoomModeLabel, getAutoRotateLabel, SORT_CATEGORIES } from './constants';

	const appWindow = getCurrentWebviewWindow();

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);

	// 设置状态
	let settings = $state(settingsManager.getSettings());
	let hoverScrollEnabled = $derived(settings.image.hoverScrollEnabled ?? true);
	let readingDirection = $derived(settings.book.readingDirection);
	let hoverAreas = $derived(settings.panels?.hoverAreas);
	let autoHideTiming = $derived(
		settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 }
	);
	let defaultZoomMode: ZoomMode = $derived(settings.view.defaultZoomMode);
	let currentZoomDisplayMode: ZoomMode = $derived(
		$viewerState.lockedZoomMode ?? $viewerState.currentZoomMode ?? defaultZoomMode
	);
	let autoRotateMode = $derived(settings.view.autoRotate?.mode ?? 'none');
	let topToolbarOpacity = $derived(settings.panels?.topToolbarOpacity ?? 85);
	let topToolbarBlur = $derived(settings.panels?.topToolbarBlur ?? 12);

	// 实际的双页模式状态
	let isDoublePage = $derived.by(() => {
		const viewMode = $viewerState.viewMode;
		if (viewMode === 'panorama') {
			return bookContextManager.current?.pageMode === 'double';
		}
		return viewMode === 'double';
	});

	settingsManager.addListener((newSettings) => {
		settings = newSettings;
	});

	let CurrentZoomIcon = $derived(getZoomModeIcon(currentZoomDisplayMode));

	// 排序模式标签（使用 SORT_CATEGORIES）
	let currentSortModeLabel = $derived.by(() => {
		const sortMode = bookStore.currentBook?.sortMode ?? 'fileName';
		const isDescending = sortMode.endsWith('Descending');
		const baseMode = isDescending ? sortMode.replace('Descending', '') : sortMode;
		const category = SORT_CATEGORIES.find((c) => c.value === baseMode);
		const label = category?.label ?? '文件名';
		return isDescending ? `${label} ↓` : `${label} ↑`;
	});

	// 媒体优先模式标签
	let mediaPriorityLabel = $derived.by(() => {
		const mode = bookStore.currentBook?.mediaPriorityMode ?? 'none';
		if (mode === 'videoFirst') return '视频优先';
		if (mode === 'imageFirst') return '图片优先';
		return '';
	});

	// 锁定的排序模式
	let lockedSortMode = $derived(settings.book?.lockedSortMode ?? null);
	let lockedMediaPriority = $derived(settings.book?.lockedMediaPriority ?? null);
	let isSortLocked = $derived(lockedSortMode !== null || lockedMediaPriority !== null);

	function handleZoomReset() {
		dispatchApplyZoomMode();
	}

	function toggleHoverScroll() {
		const next = !(settings.image.hoverScrollEnabled ?? true);
		settingsManager.updateNestedSettings('image', { hoverScrollEnabled: next });
	}

	// 可见性和悬停状态
	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let showTimeout: number | undefined;
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let hoverCount = $state(0);

	// 展开面板状态
	let sortPanelExpanded = $state(false);
	let zoomPanelExpanded = $state(false);
	let rotatePanelExpanded = $state(false);
	let slideshowPanelExpanded = $state(false);
	let hoverScrollPanelExpanded = $state(false);

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

	// 响应钉住状态、锁定状态和 open 状态
	$effect(() => {
		if ($topToolbarLockState === false) {
			isVisible = false;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
			return;
		}
		if ($topToolbarPinned || $topToolbarLockState === true) {
			isVisible = true;
			if (hideTimeout) clearTimeout(hideTimeout);
			if (showTimeout) clearTimeout(showTimeout);
			return;
		}
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
		isVisible = true;
		if (hideTimeout) clearTimeout(hideTimeout);
	}

	function handleMouseEnter() {
		hoverCount++;
		if ($topToolbarLockState === false) return;
		if ($topToolbarPinned || $topToolbarLockState === true) {
			showToolbar();
			return;
		}
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		const showDelayMs = (autoHideTiming?.showDelaySec ?? 0) * 1000;
		if (showDelayMs > 0) {
			showTimeout = setTimeout(() => {
				if (hoverCount > 0 && !$topToolbarPinned) showToolbar();
			}, showDelayMs) as unknown as number;
		} else {
			showToolbar();
		}
	}

	function handleMouseLeave() {
		hoverCount--;
		if ($topToolbarPinned || isResizing) return;
		if (hideTimeout) clearTimeout(hideTimeout);
		if (showTimeout) clearTimeout(showTimeout);
		if (hoverCount <= 0) {
			const hideDelayMs = (autoHideTiming?.hideDelaySec ?? 0) * 1000;
			hideTimeout = setTimeout(() => {
				if (hoverCount <= 0) isVisible = false;
			}, hideDelayMs) as unknown as number;
		}
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

	<!-- 工具栏主体 -->
	<MagicCard
		class="border-b {isVisible ? 'shadow-lg' : ''}"
		gradientSize={150}
		gradientOpacity={0.35}
	>
		<div
			class="w-full"
			style="min-height: {$topToolbarHeight}px; background-color: color-mix(in oklch, var(--sidebar) {topToolbarOpacity}%, transparent); color: var(--sidebar-foreground); backdrop-filter: blur({topToolbarBlur}px);"
		>
			<div class="mx-auto flex w-full max-w-[1280px] flex-col gap-1 px-2 py-1">
				<!-- 第一行：关闭按钮 + 面包屑导航 + 页码信息 -->
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

					{#if bookStore.currentBook}
						<div class="text-muted-foreground flex shrink-0 items-center gap-2 text-sm whitespace-nowrap">
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

				<!-- 第二行：工具栏按钮 -->
				{#if bookStore.currentBook}
					<div class="flex flex-wrap items-center justify-start gap-1 md:justify-center">
						<!-- 排序切换 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={sortPanelExpanded ? 'default' : 'ghost'}
									size="icon"
									class="h-8 w-8 {isSortLocked ? 'ring-2 ring-primary' : ''}"
									onclick={toggleSortPanel}
								>
									<ArrowDownUp class="h-3.5 w-3.5" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>页面排序：{mediaPriorityLabel ? `${mediaPriorityLabel} + ` : ''}{currentSortModeLabel}{isSortLocked ? '（已锁定）' : ''}</p>
							</Tooltip.Content>
						</Tooltip.Root>

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
							<Tooltip.Content><p>上一页</p></Tooltip.Content>
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
							<Tooltip.Content><p>下一页</p></Tooltip.Content>
						</Tooltip.Root>

						<Separator.Root orientation="vertical" class="mx-1 h-6" />

						<!-- 缩放按钮 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomOut}>
									<ZoomOut class="h-4 w-4" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>缩小</p></Tooltip.Content>
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
							<Tooltip.Content><p>重置缩放</p></Tooltip.Content>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button variant="ghost" size="icon" class="h-8 w-8" onclick={zoomIn}>
									<ZoomIn class="h-4 w-4" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content><p>放大</p></Tooltip.Content>
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

						<Separator.Root orientation="vertical" class="mx-1 h-6" />

						<!-- 视图模式切换 -->
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
												if ($viewerState.viewMode === 'panorama') {
													const ctx = bookContextManager.current;
													if (ctx) ctx.setPageMode(newPageMode as 'single' | 'double');
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

						<!-- 阅读方向切换 -->
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

						<Separator.Root orientation="vertical" class="mx-1 h-6" />

						<!-- 放大镜 -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={$viewerState.magnifier.enabled ? 'default' : 'ghost'}
									size="icon"
									class="h-8 w-8"
									onclick={() => {
										const current = $viewerState.magnifier;
										appState.update({
											viewer: {
												...$viewerState,
												magnifier: {
													...current,
													enabled: !current.enabled
												}
											}
										});
									}}
								>
									<ZoomIn class="h-4 w-4" />
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>{$viewerState.magnifier.enabled ? '放大镜：开' : '放大镜：关'}</p>
							</Tooltip.Content>
						</Tooltip.Root>

						<!-- 悬停滚动 -->
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

				<!-- 展开面板 -->
				<SortPanel expanded={sortPanelExpanded} />
				<ZoomPanel expanded={zoomPanelExpanded} />
				<RotatePanel expanded={rotatePanelExpanded} />
				<HoverScrollPanel expanded={hoverScrollPanelExpanded} />
				<SlideshowPanel expanded={slideshowPanelExpanded} />
			</div>

			<!-- 拖拽手柄 -->
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
	</MagicCard>
</div>

<!-- 触发区域 -->
<div
	class="fixed top-0 right-0 left-0 z-57"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="presentation"
	aria-label="顶部工具栏触发区域"
	style={`height: ${hoverAreas?.topTriggerHeight ?? 4}px;`}
></div>
