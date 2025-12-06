<script lang="ts">
	/**
	 * Top Toolbar Component
	 * 顶部工具栏 - 自动隐藏，包含标题栏、面包屑和图片操作按钮
	 */
	import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
	import { Button } from '$lib/components/ui/button';
	import TitleBarSection from './TitleBarSection.svelte';
	import * as Separator from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	// Progress component removed — not used in this toolbar

	import { loadModeStore } from '$lib/stores/loadModeStore.svelte';
	import { Zap, HardDrive, Image, PaintbrushVertical, Layers, Square } from '@lucide/svelte';

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
		toggleLayoutSwitchMode
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
		Scan,
		StretchHorizontal,
		StretchVertical,
		Expand,
		LayoutGrid,
		SplitSquareHorizontal,
		Rows2
	} from '@lucide/svelte';

	import { showToast } from '$lib/utils/toast';

	import { settingsManager } from '$lib/settings/settingsManager';
	import type { ZoomMode } from '$lib/settings/settingsManager';
	import { dispatchApplyZoomMode } from '$lib/utils/zoomMode';
	import type { PageSortMode } from '$lib/types/book';

	const appWindow = getCurrentWebviewWindow();

	function createAppStateStore<T>(selector: StateSelector<T>) {
		const initial = selector(appState.getSnapshot());
		return readable(initial, (set) => appState.subscribe(selector, (value) => set(value)));
	}

	const viewerState = createAppStateStore((state) => state.viewer);
const sortModeOptions: { value: PageSortMode; label: string; description: string }[] = [
	{ value: 'fileName', label: '文件名 ↑', description: '按文件名升序排序' },
	{ value: 'fileNameDescending', label: '文件名 ↓', description: '按文件名降序排序' },
	{ value: 'fileSize', label: '文件大小 ↑', description: '按文件大小升序排序' },
	{ value: 'fileSizeDescending', label: '文件大小 ↓', description: '按文件大小降序排序' },
	{ value: 'timeStamp', label: '修改时间 ↑', description: '按修改时间从旧到新' },
	{ value: 'timeStampDescending', label: '修改时间 ↓', description: '按修改时间从新到旧' },
	{ value: 'entry', label: 'Entry 顺序 ↑', description: '按原始读取顺序' },
	{ value: 'entryDescending', label: 'Entry 顺序 ↓', description: '原始顺序反向' },
	{ value: 'random', label: '随机顺序', description: '随机排列所有页面' }
];

const zoomModeOptions: { mode: ZoomMode; label: string }[] = [
	{ mode: 'fit', label: '适应窗口' },
	{ mode: 'fill', label: '铺满整个窗口' },
	{ mode: 'fitWidth', label: '适应宽度' },
	{ mode: 'fitHeight', label: '适应高度' },
	{ mode: 'original', label: '原始大小' }
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
	let autoHideTiming = $derived(settings.panels?.autoHideTiming ?? { showDelaySec: 0, hideDelaySec: 0 });
	let defaultZoomMode: ZoomMode = $derived(settings.view.defaultZoomMode);
	let currentZoomDisplayMode: ZoomMode = $derived($viewerState.lockedZoomMode ?? $viewerState.currentZoomMode ?? defaultZoomMode);
	
	// 页面布局和自动旋转设置
	let splitHorizontalPages = $derived(settings.view.pageLayout?.splitHorizontalPages ?? false);
	let treatHorizontalAsDoublePage = $derived(settings.view.pageLayout?.treatHorizontalAsDoublePage ?? false);
	let autoRotateMode = $derived(settings.view.autoRotate?.mode ?? 'none');
	
	// 顶部工具栏透明度和模糊
	let topToolbarOpacity = $derived(settings.panels?.topToolbarOpacity ?? 85);
	let topToolbarBlur = $derived(settings.panels?.topToolbarBlur ?? 12);
	
	// 渲染器模式
	let rendererMode = $derived(settings.view.renderer?.mode ?? 'stack');

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
	
	
	function getAutoRotateLabel(mode: string): string {
		switch (mode) {
			case 'left': return '纵向左旋';
			case 'right': return '纵向右旋';
			case 'horizontalLeft': return '横屏左旋';
			case 'horizontalRight': return '横屏右旋';
			case 'forcedLeft': return '始终左旋';
			case 'forcedRight': return '始终右旋';
			default: return '关闭';
		}
	}

	function getZoomModeLabel(mode: ZoomMode): string {
		if (mode === 'fit') return '适应窗口';
		if (mode === 'fill') return '铺满整个窗口';
		if (mode === 'fitWidth') return '适应宽度';
		if (mode === 'fitHeight') return '适应高度';
		return '原始大小';
	}

	const zoomModeIconMap = {
		fit: Maximize,
		fill: Expand,
		fitWidth: StretchHorizontal,
		fitHeight: StretchVertical,
		original: Frame
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

	function handleZoomReset() {
		dispatchApplyZoomMode();
	}

	function toggleHoverScroll() {
		const next = !(settings.image.hoverScrollEnabled ?? true);
		settingsManager.updateNestedSettings('image', { hoverScrollEnabled: next });
	}
	
	// 切换渲染器模式
	function toggleRendererMode() {
		const newMode = rendererMode === 'stack' ? 'standard' : 'stack';
		settingsManager.updateNestedSettings('view', {
			renderer: {
				...settings.view.renderer,
				mode: newMode
			}
		});
		showToast({
			title: '渲染模式',
			description: newMode === 'stack' 
				? '已切换到 StackViewer（槽位系统）' 
				: '已切换到 Layer 系统（标准模式）',
			variant: 'info',
			duration: 2000
		});
	}

	let isVisible = $state(false);
	let hideTimeout: number | undefined;
	let showTimeout: number | undefined;
	let isResizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;
	let hoverCount = $state(0); // 追踪悬停区域的计数

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
		console.log('TopToolbar handleMouseEnter, hoverCount:', hoverCount);
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
		try {
			if ($viewerState.viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.max(currentIndex - 2, 0);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.previousPage();
			}
		} catch (err) {
			console.error('Failed to navigate to previous page:', err);
		}
	}

	async function handleNextPage() {
		if (!bookStore.canNextPage) return;
		try {
			if ($viewerState.viewMode === 'double') {
				const currentIndex = bookStore.currentPageIndex;
				const targetIndex = Math.min(currentIndex + 2, bookStore.totalPages - 1);
				await bookStore.navigateToPage(targetIndex);
			} else {
				await bookStore.nextPage();
			}
		} catch (err) {
			console.error('Failed to navigate to next page:', err);
		}
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
	class="absolute left-0 right-0 top-0 z-58 transition-transform duration-300 {isVisible
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
		class="border-b shadow-lg"
		style="min-height: {$topToolbarHeight}px; background-color: color-mix(in oklch, var(--sidebar) {topToolbarOpacity}%, transparent); color: var(--sidebar-foreground); backdrop-filter: blur({topToolbarBlur}px);"
	>
		<div class="mx-auto w-full max-w-[1280px] flex flex-col gap-1 px-2 py-1">
			<!-- 第一行：关闭按钮 + 面包屑导航 + 页码信息（窄屏时独占一行） -->
			<div class="flex min-w-0 items-center gap-2 justify-start md:justify-center">
				<Button variant="ghost" size="icon" class="h-8 w-8 shrink-0" onclick={handleClose}>
					<X class="h-4 w-4" />
				</Button>

				{#if bookStore.currentBook}
					<div class="min-w-0 flex-1 md:flex-none md:max-w-[60%]">
						<PathBar
							currentPath={bookStore.currentBook.path}
							isArchive={bookStore.currentBook.type === 'archive'}
						/>
					</div>
				{/if}

				<!-- 页码信息（窄屏时在面包屑旁边） -->
				{#if bookStore.currentBook}
					<div class="text-muted-foreground flex shrink-0 items-center gap-2 whitespace-nowrap text-sm">
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
			<div class="flex flex-wrap items-center gap-1 justify-start md:justify-center">
				<!-- 排序下拉框 -->
				<div class="flex items-center gap-1">
					<DropdownMenu.Root>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<DropdownMenu.Trigger>
									<Button
										variant="ghost"
										size="icon"
										class="h-8 w-8"
										style="pointer-events: auto;"
									>
										<ArrowDownUp class="h-3.5 w-3.5" />
									</Button>
								</DropdownMenu.Trigger>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>页面排序：{currentSortModeLabel}</p>
							</Tooltip.Content>
						</Tooltip.Root>
						<DropdownMenu.Content
							side="right"
							align="start"
							class="z-60 w-60"
							onmouseenter={handleMouseEnter}
							onmouseleave={handleMouseLeave}
						>
							<DropdownMenu.Label>页面排序</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#each sortModeOptions as option}
								<DropdownMenu.Item
									class={bookStore.currentBook?.sortMode === option.value ? 'bg-accent' : ''}
									onclick={() => handleSortModeChange(option.value)}
								>
									<div class="flex flex-col gap-0.5 text-left">
										<div class="flex items-center gap-2">
											<div class="flex h-4 w-4 items-center justify-center">
												{#if bookStore.currentBook?.sortMode === option.value}
													<Check class="h-3 w-3" />
												{/if}
											</div>
											<span class="text-xs font-medium">{option.label}</span>
										</div>
										<span class="text-[10px] text-muted-foreground">{option.description}</span>
									</div>
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>

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
				<DropdownMenu.Root>
					{@const CurrentZoomIcon = getZoomModeIcon(currentZoomDisplayMode)}
					<Tooltip.Root>
						<Tooltip.Trigger>
							<DropdownMenu.Trigger>
								<Button
									variant="ghost"
									size="icon"
									class={`h-8 w-8 ${$viewerState.lockedZoomMode ? 'rounded-full ring-2 ring-primary bg-primary/10 text-primary' : ''}`}
									style="pointer-events: auto;"
									oncontextmenu={(event) => {
										event.preventDefault();
										toggleZoomModeLock(currentZoomDisplayMode);
									}}
								>
									<CurrentZoomIcon class="h-4 w-4" />
								</Button>
							</DropdownMenu.Trigger>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>
								缩放模式：{getZoomModeLabel(currentZoomDisplayMode)}
								{$viewerState.lockedZoomMode ? '（已锁定）' : ''}
							</p>
						</Tooltip.Content>
					</Tooltip.Root>

					<DropdownMenu.Content
						side="right"
						align="start"
						class="z-60 w-56"
						onmouseenter={handleMouseEnter}
						onmouseleave={handleMouseLeave}
					>
						<DropdownMenu.Label>缩放模式</DropdownMenu.Label>
						<DropdownMenu.Separator />
						{#each zoomModeOptions as { mode, label }}
							{@const ZoomIcon = getZoomModeIcon(mode)}
							<DropdownMenu.Item onclick={() => handleZoomModeChange(mode)}>
								<div class="flex items-center gap-2">
									<div class="flex h-4 w-4 items-center justify-center">
										{#if currentZoomDisplayMode === mode}
											<Check class="h-3 w-3" />
										{/if}
									</div>
									<ZoomIcon class="h-3.5 w-3.5 text-muted-foreground" />
									<span class="text-xs">
										{label}
										{$viewerState.lockedZoomMode === mode ? '（锁定）' : ''}
									</span>
								</div>
							</DropdownMenu.Item>
						{/each}
						
						<DropdownMenu.Separator />
						<DropdownMenu.Label>页面布局</DropdownMenu.Label>
						
						<!-- 自动分割横向页 -->
						<DropdownMenu.Item onclick={toggleSplitHorizontalPages}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if splitHorizontalPages}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<SplitSquareHorizontal class="h-3.5 w-3.5 text-muted-foreground" />
								<span class="text-xs">自动分割横向页</span>
							</div>
						</DropdownMenu.Item>
						
						<!-- 横向页视为双页 -->
						<DropdownMenu.Item onclick={toggleTreatHorizontalAsDoublePage}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if treatHorizontalAsDoublePage}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<Rows2 class="h-3.5 w-3.5 text-muted-foreground" />
								<span class="text-xs">横向页视为双页</span>
							</div>
						</DropdownMenu.Item>
						
					</DropdownMenu.Content>
				</DropdownMenu.Root>

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
									oncontextmenu={(event) => {
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
									oncontextmenu={(event) => {
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
							class={`h-8 w-8 ${$lockedReadingDirection ? 'ring-2 ring-primary bg-primary/20 text-primary rounded-full' : ''}`}
							onclick={toggleReadingDirection}
							oncontextmenu={(event) => {
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

				<!-- 加载模式切换 -->
				<div class="flex items-center">
					<div class="bg-muted/60 inline-flex items-center rounded-full p-0.5 shadow-inner">
						<!-- 数据源切换: Blob / Tempfile -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={loadModeStore.isBlobMode ? 'default' : 'ghost'}
									size="icon"
									class="h-8 w-8 rounded-full"
									onclick={() => loadModeStore.toggleDataSource()}
								>
									{#if loadModeStore.isBlobMode}
										<Zap class="h-4 w-4" />
									{:else}
										<HardDrive class="h-4 w-4" />
									{/if}
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>数据源: {loadModeStore.isBlobMode ? 'Blob (IPC)' : 'Tempfile'}</p>
							</Tooltip.Content>
						</Tooltip.Root>

						<!-- 渲染模式切换: img / canvas -->
						<Tooltip.Root>
							<Tooltip.Trigger>
								<Button
									variant={loadModeStore.isImgMode ? 'default' : 'ghost'}
									size="icon"
									class="h-8 w-8 rounded-full"
									onclick={() => loadModeStore.toggleRenderMode()}
								>
									{#if loadModeStore.isImgMode}
										<Image class="h-4 w-4" />
									{:else}
										<PaintbrushVertical class="h-4 w-4" />
									{/if}
								</Button>
							</Tooltip.Trigger>
							<Tooltip.Content>
								<p>渲染: {loadModeStore.isImgMode ? 'img 元素' : 'canvas'}</p>
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</div>

				<!-- 分隔线 -->
				<Separator.Root orientation="vertical" class="mx-1 h-6" />

				<!-- 旋转下拉菜单 -->
				<DropdownMenu.Root>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<DropdownMenu.Trigger>
								<Button
									variant={autoRotateMode !== 'none' ? 'default' : 'ghost'}
									size="icon"
									class="h-8 w-8"
									style="pointer-events: auto;"
								>
									<RotateCw class="h-4 w-4" />
								</Button>
							</DropdownMenu.Trigger>
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>旋转{autoRotateMode !== 'none' ? `（自动：${getAutoRotateLabel(autoRotateMode)}）` : ''}</p>
						</Tooltip.Content>
					</Tooltip.Root>
					
					<DropdownMenu.Content
						side="right"
						align="start"
						class="z-60 w-48"
						onmouseenter={handleMouseEnter}
						onmouseleave={handleMouseLeave}
					>
						<DropdownMenu.Label>手动旋转</DropdownMenu.Label>
						<DropdownMenu.Item onclick={rotateClockwise}>
							<div class="flex items-center gap-2">
								<RotateCw class="h-3.5 w-3.5 text-muted-foreground" />
								<span class="text-xs">顺时针旋转 90°</span>
							</div>
						</DropdownMenu.Item>
						
						<DropdownMenu.Separator />
						<DropdownMenu.Label>自动旋转</DropdownMenu.Label>
						
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'none' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'none'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">关闭</span>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'left' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'left'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">纵向左旋</span>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'right' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'right'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">纵向右旋</span>
							</div>
						</DropdownMenu.Item>
						
						<DropdownMenu.Separator />
						<DropdownMenu.Label>横屏图片自动旋转</DropdownMenu.Label>
						
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'horizontalLeft' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'horizontalLeft'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">横屏左旋 90°</span>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'horizontalRight' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'horizontalRight'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">横屏右旋 90°</span>
							</div>
						</DropdownMenu.Item>
						
						<DropdownMenu.Separator />
						<DropdownMenu.Label>强制旋转</DropdownMenu.Label>
						
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'forcedLeft' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'forcedLeft'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">始终左旋 90°</span>
							</div>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => settingsManager.updateNestedSettings('view', { autoRotate: { mode: 'forcedRight' } })}>
							<div class="flex items-center gap-2">
								<div class="flex h-4 w-4 items-center justify-center">
									{#if autoRotateMode === 'forcedRight'}
										<Check class="h-3 w-3" />
									{/if}
								</div>
								<span class="text-xs">始终右旋 90°</span>
							</div>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						<Button
							variant={hoverScrollEnabled ? 'default' : 'ghost'}
							size="icon"
							class="h-8 w-8"
							onclick={toggleHoverScroll}
						>
							<Scan class="h-4 w-4" />
						</Button>
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{hoverScrollEnabled ? '悬停滚动：开' : '悬停滚动：关'}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</div>
			{/if}
		</div>

		<!-- 拖拽手柄 -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<button
			type="button"
			class="text-muted-foreground hover:bg-accent absolute bottom-0 left-1/2 z-50 -translate-x-1/2 cursor-ns-resize rounded-md p-1 transition-colors"
			onmousedown={handleResizeStart}
			aria-label="拖拽调整工具栏高度"
		>
			<GripHorizontal class="h-4 w-4" />
		</button>
	</div>
</div>

<!-- 触发区域（独立于工具栏，始终存在） -->
<div
	class="fixed left-0 right-0 top-0 z-57"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	role="presentation"
	aria-label="顶部工具栏触发区域"
	style={`height: ${hoverAreas?.topTriggerHeight ?? 4}px;`}
></div>
